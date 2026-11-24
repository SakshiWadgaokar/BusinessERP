import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@erp/shared';
import { CurrentUser, Public } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { getEnv } from '../../common/config/env';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { AuthService } from './auth.service';

const REFRESH_COOKIE_NAME = 'erp_refresh_token';
const CSRF_COOKIE_NAME = 'erp_csrf_token';

@Controller('auth')
export class AuthController {
  private readonly env = getEnv();

  constructor(private readonly authService: AuthService) {}

  private setAuthCookies(res: Response, rawRefreshToken: string, csrfToken: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE_NAME, rawRefreshToken, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body.email, body.password, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, result.rawRefreshToken, result.csrfToken, result.expiresAt);
    return {
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const cookieCsrf = req.cookies?.[CSRF_COOKIE_NAME];
    const headerCsrf = req.headers['x-csrf-token'];

    if (cookieCsrf && headerCsrf !== cookieCsrf) {
      throw new ForbiddenException({
        errorCode: 'CSRF_VALIDATION_FAILED',
        message: 'Invalid CSRF token.',
      });
    }

    const result = await this.authService.refresh(cookieToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, result.rawRefreshToken, result.csrfToken, result.expiresAt);
    return {
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.sessionId, user.userId, user.email, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.clearAuthCookies(res);
    return { message: 'Logged out successfully.' };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(changePasswordSchema))
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { currentPassword: string; newPassword: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(
      user.userId,
      body.currentPassword,
      body.newPassword,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    this.clearAuthCookies(res);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() body: { email: string }, @Req() req: Request) {
    return this.authService.requestPasswordReset(body.email, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  async resetPassword(
    @Body() body: { token: string; newPassword: string },
    @Req() req: Request,
  ) {
    return this.authService.resetPassword(body.token, body.newPassword, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}

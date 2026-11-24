import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PermissionCode, RoleCode, UserStatus } from '@erp/shared';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { getEnv } from '../config/env';
import { AuthenticatedUser } from '../types/auth-user.type';

interface AccessTokenPayload {
  sub: string;
  sid: string;
  email: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly env = getEnv();

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Session has expired or been revoked.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        permissionOverrides: {
          include: { permission: true },
        },
        dealer: { select: { id: true, status: true } },
        employee: { select: { id: true, status: true } },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is inactive or suspended.');
    }

    if (user.dealer && user.dealer.status !== 'ACTIVE') {
      throw new UnauthorizedException('Dealer account is suspended or inactive.');
    }

    const roles = user.userRoles.map((ur) => ur.role.code as RoleCode);
    const permSet = new Set<PermissionCode>();

    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permSet.add(rp.permission.code as PermissionCode);
      }
    }
    for (const ov of user.permissionOverrides) {
      const code = ov.permission.code as PermissionCode;
      if (ov.granted) {
        permSet.add(code);
      } else {
        permSet.delete(code);
      }
    }

    const authUser: AuthenticatedUser = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions: Array.from(permSet),
      dealerId: user.dealer?.id ?? null,
      employeeId: user.employee?.id ?? null,
      sessionId: session.id,
    };

    request.user = authUser;
    return true;
  }
}

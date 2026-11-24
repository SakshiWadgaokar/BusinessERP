import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PermissionCode, RoleCode, UserStatus } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { getEnv } from '../../common/config/env';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

export interface LoginMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly env = getEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  private sha256(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  generateCsrfToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async login(email: string, password: string, meta: LoginMeta) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
        permissionOverrides: { include: { permission: true } },
        dealer: { select: { id: true, status: true, dealerCode: true, businessName: true } },
        employee: { select: { id: true, status: true, employeeCode: true, designation: true } },
      },
    });

    if (!user) {
      await this.auditService.record({
        actorEmail: normalizedEmail,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        afterValue: { reason: 'USER_NOT_FOUND' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException({
        errorCode: 'ACCOUNT_LOCKED',
        message: `Account temporarily locked due to failed login attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is inactive or suspended. Contact administrator.');
    }

    if (user.dealer && user.dealer.status !== 'ACTIVE') {
      throw new ForbiddenException('Dealer account is suspended or inactive.');
    }

    const passwordValid = await this.verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      const nextAttempts = user.failedLoginAttempts + 1;
      const shouldLock = nextAttempts >= this.env.AUTH_LOCKOUT_MAX_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + this.env.AUTH_LOCKOUT_MINUTES * 60 * 1000)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : nextAttempts,
          lockedUntil,
        },
      });

      await this.auditService.record({
        actorUserId: user.id,
        actorEmail: user.email,
        action: shouldLock ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        afterValue: { failedAttempts: nextAttempts, lockedUntil },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      throw new UnauthorizedException('Invalid email or password.');
    }

    // Reset lockout counters and create rotating refresh session
    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = this.sha256(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + this.env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      return tx.userSession.create({
        data: {
          userId: user.id,
          refreshTokenHash,
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent?.slice(0, 300) ?? null,
          expiresAt,
        },
      });
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, sid: session.id, email: user.email },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: this.env.JWT_ACCESS_TTL as any },
    );

    await this.auditService.record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'UserSession',
      entityId: session.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const profile = this.buildUserProfile(user);
    return {
      accessToken,
      rawRefreshToken,
      csrfToken: this.generateCsrfToken(),
      expiresAt,
      user: profile,
    };
  }

  async refresh(rawRefreshToken: string, meta: LoginMeta) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is missing.');
    }

    const tokenHash = this.sha256(rawRefreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: { rolePermissions: { include: { permission: true } } },
                },
              },
            },
            permissionOverrides: { include: { permission: true } },
            dealer: { select: { id: true, status: true, dealerCode: true, businessName: true } },
            employee: { select: { id: true, status: true, employeeCode: true, designation: true } },
          },
        },
      },
    });

    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh session is invalid or expired.');
    }

    if (
      session.user.status !== UserStatus.ACTIVE ||
      (session.user.dealer && session.user.dealer.status !== 'ACTIVE')
    ) {
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Account is inactive or suspended.');
    }

    // Rotate refresh token on every refresh
    const nextRawRefreshToken = crypto.randomBytes(48).toString('hex');
    const nextRefreshHash = this.sha256(nextRawRefreshToken);
    const nextExpiresAt = new Date(
      Date.now() + this.env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const newSession = await this.prisma.$transaction(async (tx) => {
      await tx.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return tx.userSession.create({
        data: {
          userId: session.userId,
          refreshTokenHash: nextRefreshHash,
          ipAddress: meta.ipAddress ?? session.ipAddress,
          userAgent: meta.userAgent?.slice(0, 300) ?? session.userAgent,
          expiresAt: nextExpiresAt,
        },
      });
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: session.userId, sid: newSession.id, email: session.user.email },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: this.env.JWT_ACCESS_TTL as any },
    );

    return {
      accessToken,
      rawRefreshToken: nextRawRefreshToken,
      csrfToken: this.generateCsrfToken(),
      expiresAt: nextExpiresAt,
      user: this.buildUserProfile(session.user),
    };
  }

  async logout(sessionId: string, userId: string, email: string, meta: LoginMeta) {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.record({
      actorUserId: userId,
      actorEmail: email,
      action: 'AUTH_LOGOUT',
      entityType: 'UserSession',
      entityId: sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async getMe(authUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
        permissionOverrides: { include: { permission: true } },
        dealer: { select: { id: true, status: true, dealerCode: true, businessName: true } },
        employee: { select: { id: true, status: true, employeeCode: true, designation: true } },
      },
    });
    return this.buildUserProfile(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, meta: LoginMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await this.verifyPassword(user.passwordHash, currentPassword);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect.');
    }

    const newHash = await this.hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash, passwordChangedAt: new Date() },
      });
      await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditService.record(
        {
          actorUserId: userId,
          actorEmail: user.email,
          action: 'AUTH_PASSWORD_CHANGED',
          entityType: 'User',
          entityId: userId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });

    return { message: 'Password updated successfully. Please sign in again.' };
  }

  async requestPasswordReset(email: string, meta: LoginMeta) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Always return generic success message to prevent email enumeration
    if (!user || user.status !== UserStatus.ACTIVE) {
      return {
        message: 'If an active account exists for this email, password reset instructions have been generated.',
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.auditService.record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      message: 'If an active account exists for this email, password reset instructions have been generated.',
      ...(this.env.NODE_ENV === 'development' || this.env.NODE_ENV === 'test'
        ? { devResetToken: rawToken }
        : {}),
    };
  }

  async resetPassword(rawToken: string, newPassword: string, meta: LoginMeta) {
    const tokenHash = this.sha256(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired.');
    }

    const newHash = await this.hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: newHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          passwordChangedAt: new Date(),
        },
      });
      await tx.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditService.record(
        {
          actorUserId: record.userId,
          actorEmail: record.user.email,
          action: 'AUTH_PASSWORD_RESET_COMPLETED',
          entityType: 'User',
          entityId: record.userId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });

    return { message: 'Password has been reset successfully.' };
  }

  private buildUserProfile(user: any) {
    const roles: RoleCode[] = user.userRoles.map((ur: any) => ur.role.code as RoleCode);
    const permSet = new Set<PermissionCode>();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permSet.add(rp.permission.code as PermissionCode);
      }
    }
    for (const ov of user.permissionOverrides ?? []) {
      if (ov.granted) permSet.add(ov.permission.code as PermissionCode);
      else permSet.delete(ov.permission.code as PermissionCode);
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles,
      permissions: Array.from(permSet),
      dealer: user.dealer ?? null,
      employee: user.employee ?? null,
      lastLoginAt: user.lastLoginAt,
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateUserInput,
  PaginationQuery,
  ROLES,
  UpdateUserInput,
  UserStatus,
} from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: PaginationQuery & { status?: string; role?: string }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.role) {
      where.userRoles = { some: { role: { code: query.role } } };
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: { include: { role: { select: { code: true, name: true } } } },
          dealer: { select: { id: true, dealerCode: true, businessName: true } },
          employee: { select: { id: true, employeeCode: true, designation: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items.map((u) => ({
        ...u,
        roles: u.userRoles.map((ur) => ur.role),
        userRoles: undefined,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        userRoles: { include: { role: { select: { id: true, code: true, name: true } } } },
        permissionOverrides: {
          include: { permission: { select: { code: true, module: true } } },
        },
        dealer: { select: { id: true, dealerCode: true, businessName: true } },
        employee: { select: { id: true, employeeCode: true, designation: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    return {
      ...user,
      roles: user.userRoles.map((ur) => ur.role),
      userRoles: undefined,
    };
  }

  async create(input: CreateUserInput, actor: AuthenticatedUser) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: input.roleCodes } },
    });
    if (roles.length !== input.roleCodes.length) {
      throw new BadRequestException('One or more role codes are invalid.');
    }

    const passwordHash = await this.authService.hashPassword(input.password);

    return this.prisma.runInTransaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: input.fullName,
          email: input.email.toLowerCase(),
          phone: input.phone ?? null,
          passwordHash,
          status: input.status,
          createdById: actor.userId,
          userRoles: {
            create: roles.map((r) => ({ roleId: r.id, assignedBy: actor.userId })),
          },
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          userRoles: { include: { role: { select: { code: true, name: true } } } },
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: created.id,
          afterValue: {
            email: created.email,
            fullName: created.fullName,
            roles: input.roleCodes,
            status: created.status,
          },
        },
        tx,
      );

      return {
        ...created,
        roles: created.userRoles.map((ur) => ur.role),
        userRoles: undefined,
      };
    });
  }

  async update(id: string, input: UpdateUserInput, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!existing) throw new NotFoundException('User not found.');

    if (
      id === actor.userId &&
      input.status &&
      input.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('You cannot deactivate or suspend your own account.');
    }

    return this.prisma.runInTransaction(async (tx) => {
      if (input.roleCodes) {
        const roles = await tx.role.findMany({ where: { code: { in: input.roleCodes } } });
        if (roles.length !== input.roleCodes.length) {
          throw new BadRequestException('Invalid role code supplied.');
        }

        // Prevent removing last SUPER_ADMIN
        const wasSuper = existing.userRoles.some((ur) => ur.role.code === ROLES.SUPER_ADMIN);
        const staysSuper = input.roleCodes.includes(ROLES.SUPER_ADMIN);
        if (wasSuper && !staysSuper) {
          const superCount = await tx.userRole.count({
            where: { role: { code: ROLES.SUPER_ADMIN }, user: { status: UserStatus.ACTIVE } },
          });
          if (superCount <= 1) {
            throw new BadRequestException('At least one active Super Admin must remain.');
          }
        }

        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id, assignedBy: actor.userId })),
        });
      }

      if (input.permissionOverrides) {
        await tx.userPermissionOverride.deleteMany({ where: { userId: id } });
        if (input.permissionOverrides.length > 0) {
          const perms = await tx.permission.findMany({
            where: { code: { in: input.permissionOverrides.map((o) => o.permissionCode) } },
          });
          const permMap = new Map(perms.map((p) => [p.code, p.id]));
          for (const ov of input.permissionOverrides) {
            const permId = permMap.get(ov.permissionCode);
            if (!permId) continue;
            await tx.userPermissionOverride.create({
              data: {
                userId: id,
                permissionId: permId,
                granted: ov.granted,
                updatedById: actor.userId,
              },
            });
          }
        }
      }

      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedById: actor.userId,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          updatedAt: true,
          userRoles: { include: { role: { select: { code: true, name: true } } } },
        },
      });

      // Immediately revoke active sessions if deactivated/suspended/locked
      if (input.status && input.status !== UserStatus.ACTIVE) {
        await tx.userSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          beforeValue: {
            fullName: existing.fullName,
            status: existing.status,
            roles: existing.userRoles.map((ur) => ur.role.code),
          },
          afterValue: {
            fullName: updated.fullName,
            status: updated.status,
            roles: updated.userRoles.map((ur) => ur.role.code),
          },
        },
        tx,
      );

      return {
        ...updated,
        roles: updated.userRoles.map((ur) => ur.role),
        userRoles: undefined,
      };
    });
  }
}

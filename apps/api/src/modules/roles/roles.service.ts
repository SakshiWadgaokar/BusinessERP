import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: {
        rolePermissions: {
          include: { permission: { select: { code: true, module: true, description: true } } },
        },
        _count: { select: { userRoles: true } },
      },
    });

    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.userRoles,
      permissions: r.rolePermissions.map((rp) => rp.permission.code),
    }));
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }

  async updateRolePermissions(
    roleCode: string,
    permissionCodes: string[],
    actor: AuthenticatedUser,
  ) {
    if (roleCode === ROLES.SUPER_ADMIN) {
      throw new BadRequestException('Super Admin permissions cannot be restricted.');
    }

    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    if (permissions.length !== permissionCodes.length) {
      throw new BadRequestException('One or more permission codes are invalid.');
    }

    const beforeCodes = role.rolePermissions.map((rp) => rp.permission.code);

    return this.prisma.runInTransaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'ROLE_PERMISSIONS_UPDATED',
          entityType: 'Role',
          entityId: role.id,
          referenceNo: role.code,
          beforeValue: { permissions: beforeCodes },
          afterValue: { permissions: permissionCodes },
        },
        tx,
      );

      return {
        roleCode: role.code,
        permissions: permissionCodes,
      };
    });
  }
}

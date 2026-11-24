import { Injectable } from '@nestjs/common';
import { UpdateBusinessSettingsInput } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getAll(): Promise<Record<string, any>> {
    const rows = await this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
    const map: Record<string, any> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  async getSetting<T = any>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row ? (row.value as T) : fallback;
  }

  async updateMany(input: UpdateBusinessSettingsInput, actor: AuthenticatedUser) {
    const before = await this.getAll();
    const entries = Object.entries(input).filter(([, v]) => v !== undefined);

    return this.prisma.runInTransaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx.systemSetting.upsert({
          where: { key },
          update: { value: value as any, updatedById: actor.userId },
          create: { key, value: value as any, updatedById: actor.userId },
        });
      }

      const after = { ...before, ...Object.fromEntries(entries) };
      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'SETTINGS_UPDATED',
          entityType: 'SystemSetting',
          beforeValue: before,
          afterValue: after,
        },
        tx,
      );

      return after;
    });
  }
}

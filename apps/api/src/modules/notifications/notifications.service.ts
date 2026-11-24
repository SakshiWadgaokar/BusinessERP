import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface CreateNotificationInput {
  userIds?: string[];
  roleCodes?: string[];
  category: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async notify(input: CreateNotificationInput) {
    const targetUserIds = new Set<string>(input.userIds ?? []);

    if (input.roleCodes && input.roleCodes.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          userRoles: { some: { role: { code: { in: input.roleCodes } } } },
        },
        select: { id: true },
      });
      for (const u of users) targetUserIds.add(u.id);
    }

    if (targetUserIds.size === 0) return;

    const rows = Array.from(targetUserIds).map((userId) => ({
      userId,
      category: input.category,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    }));

    await this.prisma.notification.createMany({ data: rows });

    for (const userId of targetUserIds) {
      this.realtime.emitToUser(userId, 'notification.new', {
        category: input.category,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  async listForUser(userId: string, page = 1, limit = 25, unreadOnly = false) {
    const where: any = { userId };
    if (unreadOnly) where.isRead = false;
    const skip = (page - 1) * limit;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data,
      unreadCount,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: true };
  }
}

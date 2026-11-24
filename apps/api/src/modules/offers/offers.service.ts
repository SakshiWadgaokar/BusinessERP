import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async listAll() {
    return this.prisma.promotionalOffer.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Lists currently active, date-valid promotional offers eligible for the signed-in dealer
   * (or all active offers for admin preview).
   */
  async listActiveForActor(actor: AuthenticatedUser) {
    const now = new Date();
    const where: any = {
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now },
    };

    if (actor.dealerId) {
      where.OR = [{ targetDealerId: null }, { targetDealerId: actor.dealerId }];
    }

    return this.prisma.promotionalOffer.findMany({
      where,
      orderBy: { discountPercent: 'desc' },
    });
  }

  async create(input: any, actor: AuthenticatedUser) {
    const validFrom = new Date(input.validFrom);
    const validTo = new Date(input.validTo);
    if (validTo <= validFrom) {
      throw new BadRequestException('Offer end date must be after the start date.');
    }

    const discountPct = new Decimal(input.discountPercent).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const minAmt = new Decimal(input.minOrderAmount || '0').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const offer = await this.prisma.promotionalOffer.create({
      data: {
        code: input.code.toUpperCase(),
        title: input.title,
        occasion: input.occasion,
        description: input.description ?? null,
        discountPercent: discountPct.toFixed(2),
        minOrderAmount: minAmt.toFixed(2),
        targetDealerId: input.targetDealerId ?? null,
        validFrom,
        validTo,
        isActive: true,
        createdById: actor.userId,
      },
    });

    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'PROMOTIONAL_OFFER_CREATED',
      entityType: 'PromotionalOffer',
      entityId: offer.id,
      referenceNo: offer.code,
      afterValue: {
        title: offer.title,
        occasion: offer.occasion,
        discountPercent: offer.discountPercent.toString(),
        targetDealerId: offer.targetDealerId,
        validFrom,
        validTo,
      },
    });

    // Notify target dealer or all active dealers immediately (in-app DB + real-time WebSocket)
    const msg = `Special ${offer.occasion} Offer: Get ${Number(offer.discountPercent)}% OFF with code ${offer.code} (${offer.title}). Valid till ${validTo.toLocaleDateString('en-IN')}. Place an order now to avail this discount!`;

    if (offer.targetDealerId) {
      const dealer = await this.prisma.dealer.findUnique({
        where: { id: offer.targetDealerId },
        select: { id: true, userId: true },
      });
      if (dealer?.userId) {
        await this.notifications.notify({
          userIds: [dealer.userId],
          category: 'OFFER',
          title: `${offer.occasion} Discount: ${Number(offer.discountPercent)}% OFF (${offer.code})`,
          message: msg,
          entityType: 'PromotionalOffer',
          entityId: offer.id,
        });
        this.realtime.emitToDealer(dealer.id, 'offer.announced', {
          offerId: offer.id,
          code: offer.code,
          title: offer.title,
          occasion: offer.occasion,
          discountPercent: offer.discountPercent.toString(),
        });
      }
    } else {
      await this.notifications.notify({
        roleCodes: [ROLES.DEALER],
        category: 'OFFER',
        title: `${offer.occasion} Discount: ${Number(offer.discountPercent)}% OFF (${offer.code})`,
        message: msg,
        entityType: 'PromotionalOffer',
        entityId: offer.id,
      });
      this.realtime.emitToRoles([ROLES.DEALER], 'offer.announced', {
        offerId: offer.id,
        code: offer.code,
        title: offer.title,
        occasion: offer.occasion,
        discountPercent: offer.discountPercent.toString(),
      });
    }

    return offer;
  }

  async update(id: string, input: any, actor: AuthenticatedUser) {
    const existing = await this.prisma.promotionalOffer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Promotional offer not found.');

    const updated = await this.prisma.promotionalOffer.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.discountPercent !== undefined
          ? { discountPercent: new Decimal(input.discountPercent).toFixed(2) }
          : {}),
        ...(input.validFrom !== undefined ? { validFrom: new Date(input.validFrom) } : {}),
        ...(input.validTo !== undefined ? { validTo: new Date(input.validTo) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'PROMOTIONAL_OFFER_UPDATED',
      entityType: 'PromotionalOffer',
      entityId: id,
      referenceNo: existing.code,
      beforeValue: { isActive: existing.isActive, discountPercent: existing.discountPercent.toString() },
      afterValue: { isActive: updated.isActive, discountPercent: updated.discountPercent.toString() },
    });

    return updated;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, ScrapMovementType, ScrapStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { PaginationQuery, ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class ScrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly inventoryLedger: InventoryLedgerService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(
    query: PaginationQuery & { status?: string; category?: string; jobCardId?: string; employeeId?: string },
    actor: AuthenticatedUser,
  ) {
    const isEmployeeOnly =
      actor.roles.includes(ROLES.EMPLOYEE) &&
      !actor.roles.some((r) =>
        ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER, ROLES.ACCOUNTANT] as string[]).includes(r),
      );

    const where: any = {};
    if (isEmployeeOnly) where.employeeId = actor.employeeId;
    else if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.jobCardId) where.jobCardId = query.jobCardId;
    if (query.search) {
      where.OR = [
        { scrapCode: { contains: query.search, mode: 'insensitive' } },
        { reason: { contains: query.search, mode: 'insensitive' } },
        { item: { name: { contains: query.search, mode: 'insensitive' } } },
        { jobCard: { jobCardNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.recordedAt = {};
      if (query.dateFrom) where.recordedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.recordedAt.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.scrapRecord.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { recordedAt: 'desc' },
        include: {
          item: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          jobCard: { select: { id: true, jobCardNumber: true } },
          location: { select: { id: true, code: true, name: true } },
          disposals: true,
        },
      }),
      this.prisma.scrapRecord.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  /**
   * Records a scrap entry with a unique sequential Scrap ID (e.g., SCRAP-2026-000001).
   */
  async recordScrap(input: any, actor: AuthenticatedUser) {
    const qty = new Decimal(input.quantity);
    if (qty.lessThanOrEqualTo(0)) throw new BadRequestException('Scrap quantity must be positive.');

    const record = await this.prisma.runInTransaction(async (tx) => {
      const scrapCode = await this.sequenceService.next('SCRAP', tx, { yearOnly: true });

      const created = await tx.scrapRecord.create({
        data: {
          scrapCode,
          itemId: input.itemId,
          quantity: qty.toFixed(4),
          remainingQuantity: qty.toFixed(4),
          category: input.category,
          reason: input.reason,
          employeeId: input.employeeId ?? actor.employeeId ?? null,
          jobCardId: input.jobCardId ?? null,
          productionBatch: input.productionBatch ?? null,
          locationId: input.locationId,
          status: ScrapStatus.RECORDED,
          estimatedValue: new Decimal(input.estimatedValue || '0').toDecimalPlaces(2).toFixed(2),
          realizedValue: '0.00',
          notes: input.notes ?? null,
          recordedById: actor.userId,
          movements: {
            create: {
              movementType: ScrapMovementType.RECORDED,
              quantity: qty.toFixed(4),
              performedById: actor.userId,
              notes: input.reason,
            },
          },
        },
        include: { item: true, jobCard: true },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'SCRAP_RECORDED',
          entityType: 'ScrapRecord',
          entityId: created.id,
          referenceNo: scrapCode,
          afterValue: {
            itemId: input.itemId,
            quantity: qty.toFixed(4),
            category: input.category,
            jobCardId: input.jobCardId ?? null,
          },
        },
        tx,
      );

      return created;
    });

    await this.notifications.notify({
      roleCodes: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER],
      category: 'SCRAP',
      title: `Scrap Recorded: ${record.scrapCode}`,
      message: `${record.quantity} of ${record.item.name} recorded as ${record.category}. Pending verification.`,
      entityType: 'ScrapRecord',
      entityId: record.id,
    });

    return record;
  }

  /**
   * Supervisor/Inventory Manager verifies scrap; approved scrap enters Scrap Inventory.
   */
  async verifyScrap(scrapId: string, input: any, actor: AuthenticatedUser) {
    const scrap = await this.prisma.scrapRecord.findUnique({ where: { id: scrapId } });
    if (!scrap) throw new NotFoundException('Scrap record not found.');
    if (scrap.status !== ScrapStatus.RECORDED) {
      throw new BadRequestException(`Scrap record ${scrap.scrapCode} is already ${scrap.status}.`);
    }

    const updated = await this.prisma.runInTransaction(async (tx) => {
      if (!input.approved) {
        const rejected = await tx.scrapRecord.update({
          where: { id: scrapId },
          data: {
            status: ScrapStatus.REJECTED,
            verifiedById: actor.userId,
            verifiedAt: new Date(),
            notes: input.notes ?? scrap.notes,
          },
        });
        await this.auditService.record(
          {
            actorUserId: actor.userId,
            actorEmail: actor.email,
            action: 'SCRAP_REJECTED',
            entityType: 'ScrapRecord',
            entityId: scrapId,
            referenceNo: scrap.scrapCode,
            afterValue: { status: ScrapStatus.REJECTED, notes: input.notes },
          },
          tx,
        );
        return rejected;
      }

      // Resolve scrap storage location (explicit or default SCRAP_STORAGE location)
      let targetLocationId = input.scrapStorageLocationId;
      if (!targetLocationId) {
        const scrapLoc = await tx.stockLocation.findFirst({
          where: { locationType: 'SCRAP_STORAGE', isActive: true },
        });
        targetLocationId = scrapLoc?.id ?? scrap.locationId;
      }

      const estVal = input.estimatedValue
        ? new Decimal(input.estimatedValue).toDecimalPlaces(2)
        : new Decimal(scrap.estimatedValue.toString());
      const qty = new Decimal(scrap.quantity.toString());
      const unitEstCost = qty.greaterThan(0) ? estVal.dividedBy(qty) : new Decimal(0);

      await this.inventoryLedger.recordMovement(tx, {
        itemId: scrap.itemId,
        locationId: targetLocationId,
        destLocationId: targetLocationId,
        transactionType: InventoryTransactionType.SCRAP_GENERATION,
        quantityDelta: qty,
        unitCost: unitEstCost,
        referenceType: 'ScrapRecord',
        referenceId: scrap.id,
        referenceNumber: scrap.scrapCode,
        reason: `Verified scrap ${scrap.scrapCode} (${scrap.category})`,
        performedById: actor.userId,
        approvedById: actor.userId,
      });

      const verified = await tx.scrapRecord.update({
        where: { id: scrapId },
        data: {
          status: ScrapStatus.STORED,
          locationId: targetLocationId,
          estimatedValue: estVal.toFixed(2),
          verifiedById: actor.userId,
          verifiedAt: new Date(),
          notes: input.notes ?? scrap.notes,
          movements: {
            create: {
              movementType: ScrapMovementType.VERIFIED_IN,
              quantity: qty.toFixed(4),
              performedById: actor.userId,
              notes: input.notes ?? 'Verified and stored in scrap inventory',
            },
          },
        },
      });

      if (scrap.jobCardId) {
        const jc = await tx.jobCard.findUnique({ where: { id: scrap.jobCardId } });
        if (jc) {
          await tx.jobCard.update({
            where: { id: jc.id },
            data: { scrapQuantity: new Decimal(jc.scrapQuantity.toString()).plus(qty).toFixed(4) },
          });
        }
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'SCRAP_VERIFIED',
          entityType: 'ScrapRecord',
          entityId: scrapId,
          referenceNo: scrap.scrapCode,
          afterValue: { status: ScrapStatus.STORED, targetLocationId, estimatedValue: estVal.toFixed(2) },
        },
        tx,
      );

      return verified;
    });

    this.realtime.emitToRoles(
      [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER],
      'dashboard.refresh',
      { reason: 'SCRAP_VERIFIED' },
    );

    return updated;
  }

  /**
   * Disposes, reuses, or sells verified scrap and tracks realized recovery separately from estimated value.
   */
  async disposeScrap(scrapId: string, input: any, actor: AuthenticatedUser) {
    const scrap = await this.prisma.scrapRecord.findUnique({ where: { id: scrapId } });
    if (!scrap) throw new NotFoundException('Scrap record not found.');
    if (!([ScrapStatus.VERIFIED, ScrapStatus.STORED] as ScrapStatus[]).includes(scrap.status)) {
      throw new BadRequestException(`Scrap ${scrap.scrapCode} must be verified/stored before disposal.`);
    }

    const qty = new Decimal(input.quantity);
    const remaining = new Decimal(scrap.remainingQuantity.toString());
    if (qty.lessThanOrEqualTo(0) || qty.greaterThan(remaining)) {
      throw new BadRequestException(
        `Invalid disposal quantity. Remaining scrap quantity: ${remaining.toFixed(4)}.`,
      );
    }

    const saleVal = new Decimal(input.saleValue || '0').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return this.prisma.runInTransaction(async (tx) => {
      const disposalNo = await this.sequenceService.next('SCRAP_DISP', tx);

      await this.inventoryLedger.recordMovement(tx, {
        itemId: scrap.itemId,
        locationId: scrap.locationId,
        sourceLocationId: scrap.locationId,
        transactionType: InventoryTransactionType.SCRAP_DISPOSAL,
        quantityDelta: qty.negated(),
        referenceType: 'ScrapDisposal',
        referenceNumber: disposalNo,
        reason: `Scrap ${input.disposalType}: ${scrap.scrapCode}`,
        performedById: actor.userId,
      });

      const disposal = await tx.scrapDisposal.create({
        data: {
          disposalNo,
          scrapRecordId: scrap.id,
          disposalType: input.disposalType,
          quantity: qty.toFixed(4),
          saleValue: saleVal.toFixed(2),
          buyerName: input.buyerName ?? null,
          performedById: actor.userId,
          notes: input.notes ?? null,
        },
      });

      const nextRemaining = remaining.minus(qty);
      const nextRealized = new Decimal(scrap.realizedValue.toString()).plus(saleVal);
      const nextStatus: ScrapStatus = nextRemaining.isZero()
        ? (input.disposalType as ScrapStatus)
        : ScrapStatus.STORED;

      await tx.scrapRecord.update({
        where: { id: scrap.id },
        data: {
          remainingQuantity: nextRemaining.toFixed(4),
          realizedValue: nextRealized.toFixed(2),
          status: nextStatus,
          movements: {
            create: {
              movementType: input.disposalType as ScrapMovementType,
              quantity: qty.toFixed(4),
              performedById: actor.userId,
              notes: input.notes ?? `${input.disposalType} (${disposalNo})`,
            },
          },
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'SCRAP_DISPOSED',
          entityType: 'ScrapDisposal',
          entityId: disposal.id,
          referenceNo: disposalNo,
          afterValue: {
            scrapCode: scrap.scrapCode,
            disposalType: input.disposalType,
            quantity: qty.toFixed(4),
            realizedSaleValue: saleVal.toFixed(2),
          },
        },
        tx,
      );

      return disposal;
    });
  }

  async getSummary(dateFrom?: string, dateTo?: string) {
    const where: any = { status: { not: ScrapStatus.REJECTED } };
    if (dateFrom || dateTo) {
      where.recordedAt = {};
      if (dateFrom) where.recordedAt.gte = new Date(dateFrom);
      if (dateTo) where.recordedAt.lte = new Date(dateTo);
    }

    const records = await this.prisma.scrapRecord.findMany({
      where,
      include: {
        item: { select: { sku: true, name: true } },
        employee: { select: { employeeCode: true, fullName: true } },
        jobCard: { select: { jobCardNumber: true } },
      },
    });

    let totalQty = new Decimal(0);
    let totalEst = new Decimal(0);
    let totalRealized = new Decimal(0);

    const byCategory: Record<string, { quantity: string; estimatedValue: string; count: number }> = {};
    const byEmployee: Record<string, { employeeName: string; quantity: string; count: number }> = {};
    const byMaterial: Record<string, { itemName: string; quantity: string; estimatedValue: string }> = {};

    for (const r of records) {
      const q = new Decimal(r.quantity.toString());
      const ev = new Decimal(r.estimatedValue.toString());
      const rv = new Decimal(r.realizedValue.toString());
      totalQty = totalQty.plus(q);
      totalEst = totalEst.plus(ev);
      totalRealized = totalRealized.plus(rv);

      const c = byCategory[r.category] ?? { quantity: '0', estimatedValue: '0', count: 0 };
      byCategory[r.category] = {
        quantity: new Decimal(c.quantity).plus(q).toFixed(4),
        estimatedValue: new Decimal(c.estimatedValue).plus(ev).toFixed(2),
        count: c.count + 1,
      };

      const empKey = r.employee?.employeeCode ?? 'UNASSIGNED';
      const e = byEmployee[empKey] ?? { employeeName: r.employee?.fullName ?? 'Unassigned', quantity: '0', count: 0 };
      byEmployee[empKey] = {
        employeeName: e.employeeName,
        quantity: new Decimal(e.quantity).plus(q).toFixed(4),
        count: e.count + 1,
      };

      const m = byMaterial[r.item.sku] ?? { itemName: r.item.name, quantity: '0', estimatedValue: '0' };
      byMaterial[r.item.sku] = {
        itemName: m.itemName,
        quantity: new Decimal(m.quantity).plus(q).toFixed(4),
        estimatedValue: new Decimal(m.estimatedValue).plus(ev).toFixed(2),
      };
    }

    return {
      totalRecords: records.length,
      totalScrapQuantity: totalQty.toFixed(4),
      totalEstimatedValue: totalEst.toFixed(2),
      totalRealizedRecoveryValue: totalRealized.toFixed(2),
      byCategory,
      byEmployee,
      byMaterial,
    };
  }
}

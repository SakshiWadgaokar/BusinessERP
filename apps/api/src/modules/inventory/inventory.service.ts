import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, InventoryTransactionType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PaginationQuery, ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { InventoryLedgerService } from './inventory-ledger.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  listUoms() {
    return this.prisma.unitOfMeasurement.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  listCategories(itemType?: string) {
    return this.prisma.itemCategory.findMany({
      where: { isActive: true, ...(itemType ? { itemType: itemType as any } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(input: { name: string; itemType: any; description?: string }, actor: AuthenticatedUser) {
    const cat = await this.prisma.itemCategory.create({
      data: {
        name: input.name,
        itemType: input.itemType,
        description: input.description ?? null,
      },
    });
    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'ITEM_CATEGORY_CREATED',
      entityType: 'ItemCategory',
      entityId: cat.id,
      afterValue: { name: cat.name, itemType: cat.itemType },
    });
    return cat;
  }

  listLocations() {
    return this.prisma.stockLocation.findMany({
      where: { isActive: true },
      orderBy: [{ locationType: 'asc' }, { name: 'asc' }],
    });
  }

  async createLocation(
    input: { code: string; name: string; locationType: any; address?: string | null },
    actor: AuthenticatedUser,
  ) {
    const loc = await this.prisma.stockLocation.create({
      data: {
        code: input.code.toUpperCase(),
        name: input.name,
        locationType: input.locationType,
        address: input.address ?? null,
      },
    });
    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'STOCK_LOCATION_CREATED',
      entityType: 'StockLocation',
      entityId: loc.id,
      referenceNo: loc.code,
      afterValue: loc,
    });
    return loc;
  }

  async listItems(
    query: PaginationQuery & { itemType?: string; activeOnly?: string },
    actor: AuthenticatedUser,
  ) {
    const isDealer =
      actor.roles.includes(ROLES.DEALER) &&
      !actor.roles.some((r) =>
        ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER, ROLES.ACCOUNTANT] as string[]).includes(r),
      );

    const where: any = {};
    if (query.itemType) where.itemType = query.itemType;
    if (query.activeOnly !== 'false') where.isActive = true;
    if (isDealer) where.visibleToDealers = true;
    if (query.search) {
      where.OR = [
        { sku: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    let canViewStockQty = true;
    if (isDealer && actor.dealerId) {
      const credit = await this.prisma.dealerCreditSetting.findUnique({
        where: { dealerId: actor.dealerId },
      });
      if (credit) canViewStockQty = credit.canViewStockQty;
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { name: 'asc' },
        include: {
          uom: { select: { id: true, code: true, name: true } },
          category: { select: { id: true, name: true } },
          inventoryBalances: {
            include: { location: { select: { id: true, code: true, name: true, locationType: true } } },
          },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    const data = items.map((item) => {
      const totalOnHand = item.inventoryBalances.reduce(
        (acc, b) => acc.plus(b.quantityOnHand.toString()),
        new Decimal(0),
      );
      const totalReserved = item.inventoryBalances.reduce(
        (acc, b) => acc.plus(b.quantityReserved.toString()),
        new Decimal(0),
      );
      const available = Decimal.max(totalOnHand.minus(totalReserved), 0);

      if (isDealer) {
        return {
          id: item.id,
          sku: item.sku,
          name: item.name,
          itemType: item.itemType,
          description: item.description,
          uom: item.uom,
          category: item.category,
          standardSellPrice: item.standardSellPrice.toString(),
          defaultTaxRate: item.defaultTaxRate?.toString() ?? null,
          inStock: available.greaterThan(0),
          availableQuantity: canViewStockQty ? available.toFixed(4) : null,
        };
      }

      return {
        ...item,
        totalOnHand: totalOnHand.toFixed(4),
        totalReserved: totalReserved.toFixed(4),
        totalAvailable: available.toFixed(4),
      };
    });

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async createItem(input: any, actor: AuthenticatedUser) {
    const item = await this.prisma.item.create({
      data: {
        sku: input.sku.toUpperCase(),
        name: input.name,
        itemType: input.itemType,
        categoryId: input.categoryId ?? null,
        uomId: input.uomId,
        description: input.description ?? null,
        hsnSacCode: input.hsnSacCode ?? null,
        defaultTaxRate: input.defaultTaxRate ?? null,
        standardSellPrice: input.standardSellPrice ?? '0.00',
        standardCost: input.standardCost ?? '0',
        minStockLevel: input.minStockLevel ?? '0',
        reorderLevel: input.reorderLevel ?? '0',
        preferredSupplierId: input.preferredSupplierId ?? null,
        visibleToDealers: Boolean(input.visibleToDealers),
        createdById: actor.userId,
      },
      include: { uom: true, category: true },
    });

    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'ITEM_CREATED',
      entityType: 'Item',
      entityId: item.id,
      referenceNo: item.sku,
      afterValue: { sku: item.sku, name: item.name, itemType: item.itemType },
    });

    return item;
  }

  async updateItem(id: string, input: any, actor: AuthenticatedUser) {
    const existing = await this.prisma.item.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Item not found.');

    const updated = await this.prisma.item.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.hsnSacCode !== undefined ? { hsnSacCode: input.hsnSacCode } : {}),
        ...(input.defaultTaxRate !== undefined ? { defaultTaxRate: input.defaultTaxRate } : {}),
        ...(input.standardSellPrice !== undefined ? { standardSellPrice: input.standardSellPrice } : {}),
        ...(input.standardCost !== undefined ? { standardCost: input.standardCost } : {}),
        ...(input.minStockLevel !== undefined ? { minStockLevel: input.minStockLevel } : {}),
        ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
        ...(input.preferredSupplierId !== undefined ? { preferredSupplierId: input.preferredSupplierId } : {}),
        ...(input.visibleToDealers !== undefined ? { visibleToDealers: input.visibleToDealers } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedById: actor.userId,
      },
      include: { uom: true, category: true },
    });

    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'ITEM_UPDATED',
      entityType: 'Item',
      entityId: id,
      referenceNo: updated.sku,
      beforeValue: {
        standardSellPrice: existing.standardSellPrice.toString(),
        standardCost: existing.standardCost.toString(),
        defaultTaxRate: existing.defaultTaxRate?.toString() ?? null,
        hsnSacCode: existing.hsnSacCode,
        isActive: existing.isActive,
      },
      afterValue: {
        standardSellPrice: updated.standardSellPrice.toString(),
        standardCost: updated.standardCost.toString(),
        defaultTaxRate: updated.defaultTaxRate?.toString() ?? null,
        hsnSacCode: updated.hsnSacCode,
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  async getBalances(query: { locationId?: string; itemType?: string; search?: string }) {
    const where: any = {};
    if (query.locationId) where.locationId = query.locationId;
    if (query.itemType || query.search) {
      where.item = {};
      if (query.itemType) where.item.itemType = query.itemType;
      if (query.search) {
        where.item.OR = [
          { sku: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ];
      }
    }

    const rows = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        item: { include: { uom: true, category: true } },
        location: true,
      },
      orderBy: [{ location: { name: 'asc' } }, { item: { name: 'asc' } }],
    });

    return rows.map((r) => {
      const onHand = new Decimal(r.quantityOnHand.toString());
      const reserved = new Decimal(r.quantityReserved.toString());
      const available = Decimal.max(onHand.minus(reserved), 0);
      const avgCost = new Decimal(r.averageUnitCost.toString());
      const stockValue = onHand.times(avgCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const minLvl = new Decimal((r.minStockLevel ?? r.item.minStockLevel).toString());

      return {
        ...r,
        availableQuantity: available.toFixed(4),
        stockValue: stockValue.toFixed(2),
        effectiveMinLevel: minLvl.toFixed(4),
        isLowStock: minLvl.greaterThan(0) && onHand.lessThanOrEqualTo(minLvl),
      };
    });
  }

  async getTransactions(
    query: PaginationQuery & {
      itemId?: string;
      locationId?: string;
      transactionType?: string;
    },
  ) {
    const where: any = {};
    if (query.itemId) where.itemId = query.itemId;
    if (query.transactionType) where.transactionType = query.transactionType;
    if (query.locationId) {
      where.OR = [
        { sourceLocationId: query.locationId },
        { destLocationId: query.locationId },
      ];
    }
    if (query.search) {
      where.AND = [
        {
          OR: [
            { transactionNo: { contains: query.search, mode: 'insensitive' } },
            { referenceNumber: { contains: query.search, mode: 'insensitive' } },
            { item: { name: { contains: query.search, mode: 'insensitive' } } },
            { item: { sku: { contains: query.search, mode: 'insensitive' } } },
          ],
        },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.transactionDate = {};
      if (query.dateFrom) where.transactionDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.transactionDate.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { transactionDate: query.sortOrder },
        include: {
          item: { select: { sku: true, name: true, uom: { select: { code: true } } } },
          sourceLocation: { select: { code: true, name: true } },
          destLocation: { select: { code: true, name: true } },
        },
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async recordOpeningStock(
    input: { itemId: string; locationId: string; quantity: string; unitCost: string; reason: string },
    actor: AuthenticatedUser,
  ) {
    return this.prisma.runInTransaction(async (tx) => {
      const result = await this.ledger.recordMovement(tx, {
        itemId: input.itemId,
        locationId: input.locationId,
        destLocationId: input.locationId,
        transactionType: InventoryTransactionType.OPENING_STOCK,
        quantityDelta: input.quantity,
        unitCost: input.unitCost,
        referenceType: 'OpeningStock',
        reason: input.reason,
        performedById: actor.userId,
        approvedById: actor.userId,
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'OPENING_STOCK_RECORDED',
          entityType: 'InventoryTransaction',
          entityId: result.txn.id,
          referenceNo: result.txn.transactionNo,
          afterValue: {
            itemId: input.itemId,
            locationId: input.locationId,
            quantity: input.quantity,
            unitCost: input.unitCost,
            balanceAfter: result.balanceAfter.toFixed(4),
          },
        },
        tx,
      );

      return result.txn;
    });
  }

  async createTransfer(
    input: {
      sourceLocationId: string;
      destLocationId: string;
      reason: string;
      items: Array<{ itemId: string; quantity: string }>;
    },
    actor: AuthenticatedUser,
  ) {
    if (input.sourceLocationId === input.destLocationId) {
      throw new BadRequestException('Source and destination locations must be different.');
    }

    const [srcLoc, dstLoc] = await Promise.all([
      this.prisma.stockLocation.findUnique({ where: { id: input.sourceLocationId } }),
      this.prisma.stockLocation.findUnique({ where: { id: input.destLocationId } }),
    ]);
    if (!srcLoc || !dstLoc) throw new NotFoundException('Stock location not found.');

    const isFactory = dstLoc.locationType === 'FACTORY' || srcLoc.locationType === 'FACTORY';

    return this.prisma.runInTransaction(async (tx) => {
      const transferNo = await this.sequenceService.next('TRANSFER', tx);
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNo,
          sourceLocationId: input.sourceLocationId,
          destLocationId: input.destLocationId,
          reason: input.reason,
          performedById: actor.userId,
          approvedById: actor.userId,
          items: {
            create: input.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
          },
        },
        include: { items: true },
      });

      for (const line of input.items) {
        const qty = new Decimal(line.quantity);
        const outMove = await this.ledger.recordMovement(tx, {
          itemId: line.itemId,
          locationId: input.sourceLocationId,
          sourceLocationId: input.sourceLocationId,
          destLocationId: input.destLocationId,
          transactionType: isFactory
            ? InventoryTransactionType.FACTORY_TRANSFER_OUT
            : InventoryTransactionType.WAREHOUSE_TRANSFER_OUT,
          quantityDelta: qty.negated(),
          referenceType: 'StockTransfer',
          referenceId: transfer.id,
          referenceNumber: transferNo,
          reason: input.reason,
          performedById: actor.userId,
        });

        await this.ledger.recordMovement(tx, {
          itemId: line.itemId,
          locationId: input.destLocationId,
          sourceLocationId: input.sourceLocationId,
          destLocationId: input.destLocationId,
          transactionType: isFactory
            ? InventoryTransactionType.FACTORY_TRANSFER_IN
            : InventoryTransactionType.WAREHOUSE_TRANSFER_IN,
          quantityDelta: qty,
          unitCost: outMove.averageUnitCost,
          referenceType: 'StockTransfer',
          referenceId: transfer.id,
          referenceNumber: transferNo,
          reason: input.reason,
          performedById: actor.userId,
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'STOCK_TRANSFER_COMPLETED',
          entityType: 'StockTransfer',
          entityId: transfer.id,
          referenceNo: transferNo,
          afterValue: {
            from: srcLoc.code,
            to: dstLoc.code,
            itemCount: input.items.length,
          },
        },
        tx,
      );

      return transfer;
    });
  }

  async listAdjustments(query: PaginationQuery & { status?: string }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { code: true, name: true } },
          items: { include: { item: { select: { sku: true, name: true } } } },
        },
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async requestAdjustment(
    input: {
      locationId: string;
      reason: string;
      items: Array<{ itemId: string; quantityDelta: string; unitCost?: string; notes?: string }>;
    },
    actor: AuthenticatedUser,
  ) {
    return this.prisma.runInTransaction(async (tx) => {
      const adjustmentNo = await this.sequenceService.next('ADJUSTMENT', tx);
      const adj = await tx.stockAdjustment.create({
        data: {
          adjustmentNo,
          locationId: input.locationId,
          status: ApprovalStatus.PENDING,
          reason: input.reason,
          requestedById: actor.userId,
          items: {
            create: input.items.map((i) => ({
              itemId: i.itemId,
              quantityDelta: i.quantityDelta,
              unitCost: i.unitCost ?? '0',
              notes: i.notes ?? null,
            })),
          },
        },
        include: { items: true },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'STOCK_ADJUSTMENT_REQUESTED',
          entityType: 'StockAdjustment',
          entityId: adj.id,
          referenceNo: adjustmentNo,
          afterValue: { reason: input.reason, itemCount: input.items.length },
        },
        tx,
      );

      return adj;
    });
  }

  async decideAdjustment(
    adjustmentId: string,
    approve: boolean,
    note: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const adj = await this.prisma.stockAdjustment.findUnique({
      where: { id: adjustmentId },
      include: { items: true },
    });
    if (!adj) throw new NotFoundException('Stock adjustment request not found.');
    if (adj.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(`Adjustment is already ${adj.status}.`);
    }

    return this.prisma.runInTransaction(async (tx) => {
      if (!approve) {
        const rejected = await tx.stockAdjustment.update({
          where: { id: adjustmentId },
          data: {
            status: ApprovalStatus.REJECTED,
            approvedById: actor.userId,
            approvedAt: new Date(),
            rejectionNote: note ?? 'Rejected by approver',
          },
        });
        await this.auditService.record(
          {
            actorUserId: actor.userId,
            actorEmail: actor.email,
            action: 'STOCK_ADJUSTMENT_REJECTED',
            entityType: 'StockAdjustment',
            entityId: adjustmentId,
            referenceNo: adj.adjustmentNo,
            afterValue: { rejectionNote: note },
          },
          tx,
        );
        return rejected;
      }

      for (const line of adj.items) {
        const delta = new Decimal(line.quantityDelta.toString());
        await this.ledger.recordMovement(tx, {
          itemId: line.itemId,
          locationId: adj.locationId,
          transactionType: delta.isPositive()
            ? InventoryTransactionType.STOCK_ADJUSTMENT_IN
            : InventoryTransactionType.STOCK_ADJUSTMENT_OUT,
          quantityDelta: delta,
          unitCost: delta.isPositive() && !new Decimal(line.unitCost.toString()).isZero()
            ? line.unitCost.toString()
            : undefined,
          referenceType: 'StockAdjustment',
          referenceId: adj.id,
          referenceNumber: adj.adjustmentNo,
          reason: adj.reason,
          performedById: adj.requestedById,
          approvedById: actor.userId,
        });
      }

      const approved = await tx.stockAdjustment.update({
        where: { id: adjustmentId },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedById: actor.userId,
          approvedAt: new Date(),
        },
        include: { items: true },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'STOCK_ADJUSTMENT_APPROVED',
          entityType: 'StockAdjustment',
          entityId: adjustmentId,
          referenceNo: adj.adjustmentNo,
          afterValue: { status: ApprovalStatus.APPROVED },
        },
        tx,
      );

      return approved;
    });
  }

  async getLowStockAlerts() {
    const items = await this.prisma.item.findMany({
      where: { isActive: true, minStockLevel: { gt: 0 } },
      include: {
        uom: { select: { code: true } },
        inventoryBalances: { include: { location: { select: { id: true, code: true, name: true } } } },
      },
    });

    const alerts: Array<{
      itemId: string;
      sku: string;
      itemName: string;
      itemType: string;
      uom: string;
      locationName: string;
      availableQuantity: string;
      minStockLevel: string;
      suggestedReplenishmentQty: string;
      unitCostBasis: string;
      costBasisLabel: string;
      estimatedReplenishmentCost: string;
    }> = [];

    for (const item of items) {
      const minLvl = new Decimal(item.minStockLevel.toString());
      const reorderLvl = new Decimal(item.reorderLevel.toString());
      const targetLvl = Decimal.max(reorderLvl, minLvl.times(2));

      if (item.inventoryBalances.length === 0) {
        const stdCost = new Decimal(item.standardCost.toString());
        alerts.push({
          itemId: item.id,
          sku: item.sku,
          itemName: item.name,
          itemType: item.itemType,
          uom: item.uom.code,
          locationName: 'All Locations (No Stock)',
          availableQuantity: '0.0000',
          minStockLevel: minLvl.toFixed(4),
          suggestedReplenishmentQty: targetLvl.toFixed(4),
          unitCostBasis: stdCost.toFixed(4),
          costBasisLabel: stdCost.greaterThan(0) ? 'Standard Cost' : 'Cost Missing',
          estimatedReplenishmentCost: targetLvl.times(stdCost).toDecimalPlaces(2).toFixed(2),
        });
        continue;
      }

      for (const bal of item.inventoryBalances) {
        const available = Decimal.max(
          new Decimal(bal.quantityOnHand.toString()).minus(bal.quantityReserved.toString()),
          0,
        );
        const effMin = bal.minStockLevel ? new Decimal(bal.minStockLevel.toString()) : minLvl;
        if (available.lessThanOrEqualTo(effMin)) {
          const suggested = Decimal.max(targetLvl.minus(available), effMin);
          const avgCost = new Decimal(bal.averageUnitCost.toString());
          const stdCost = new Decimal(item.standardCost.toString());
          const costBasis = avgCost.greaterThan(0) ? avgCost : stdCost;
          const costBasisLabel = avgCost.greaterThan(0)
            ? 'Weighted Average Cost'
            : stdCost.greaterThan(0)
              ? 'Standard Cost'
              : 'Cost Missing';

          alerts.push({
            itemId: item.id,
            sku: item.sku,
            itemName: item.name,
            itemType: item.itemType,
            uom: item.uom.code,
            locationName: bal.location.name,
            availableQuantity: available.toFixed(4),
            minStockLevel: effMin.toFixed(4),
            suggestedReplenishmentQty: suggested.toFixed(4),
            unitCostBasis: costBasis.toFixed(4),
            costBasisLabel,
            estimatedReplenishmentCost: suggested.times(costBasis).toDecimalPlaces(2).toFixed(2),
          });
        }
      }
    }

    const totalEstimatedCost = alerts
      .reduce((acc, a) => acc.plus(a.estimatedReplenishmentCost), new Decimal(0))
      .toFixed(2);

    return {
      count: alerts.length,
      totalEstimatedReplenishmentCost: totalEstimatedCost,
      alerts,
    };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';
import { ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { SettingsService } from '../settings/settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface StockMovementInput {
  itemId: string;
  locationId: string;
  sourceLocationId?: string | null;
  destLocationId?: string | null;
  transactionType: InventoryTransactionType;
  /** Positive for stock-in, negative for stock-out */
  quantityDelta: string | number | Decimal;
  /** Required for inbound costing updates; outbound uses current WAC */
  unitCost?: string | number | Decimal;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  reason?: string;
  performedById: string;
  approvedById?: string | null;
  /** When true, ignores quantityReserved check because caller is simultaneously releasing that reservation (e.g., Dispatch) */
  consumingReservation?: boolean;
}

@Injectable()
export class InventoryLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly settingsService: SettingsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Acquires an exclusive PostgreSQL row lock (`FOR UPDATE`) on `(itemId, locationId)`
   * creating the balance row first if it does not yet exist.
   */
  async lockOrCreateBalance(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
  ) {
    const newId = crypto.randomUUID();
    await tx.$executeRaw`
      INSERT INTO inventory_balances (id, item_id, location_id, quantity_on_hand, quantity_reserved, average_unit_cost, updated_at)
      VALUES (${newId}, ${itemId}, ${locationId}, 0, 0, 0, NOW())
      ON CONFLICT (item_id, location_id) DO NOTHING
    `;

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        item_id: string;
        location_id: string;
        quantity_on_hand: Prisma.Decimal;
        quantity_reserved: Prisma.Decimal;
        average_unit_cost: Prisma.Decimal;
        min_stock_level: Prisma.Decimal | null;
      }>
    >`
      SELECT id, item_id, location_id, quantity_on_hand, quantity_reserved, average_unit_cost, min_stock_level
      FROM inventory_balances
      WHERE item_id = ${itemId} AND location_id = ${locationId}
      FOR UPDATE
    `;

    return rows[0];
  }

  /**
   * Records an immutable inventory transaction and atomically updates the balance projection.
   * Must be executed inside a Prisma transaction (`tx`).
   */
  async recordMovement(tx: Prisma.TransactionClient, input: StockMovementInput) {
    const delta = new Decimal(input.quantityDelta.toString());
    if (delta.isZero()) {
      throw new BadRequestException('Stock movement quantity cannot be zero.');
    }

    const bal = await this.lockOrCreateBalance(tx, input.itemId, input.locationId);
    const currentOnHand = new Decimal(bal.quantity_on_hand.toString());
    const currentReserved = new Decimal(bal.quantity_reserved.toString());
    const currentAvgCost = new Decimal(bal.average_unit_cost.toString());

    const allowNegative = await this.settingsService.getSetting<boolean>('allowNegativeStock', false);
    const nextOnHand = currentOnHand.plus(delta);

    if (delta.isNegative() && !allowNegative) {
      const qtyOut = delta.abs();
      const checkPool = input.consumingReservation
        ? currentOnHand
        : currentOnHand.minus(currentReserved);

      if (qtyOut.greaterThan(checkPool)) {
        throw new BadRequestException({
          errorCode: 'INSUFFICIENT_STOCK',
          message: `Insufficient stock at location. Available: ${checkPool.toFixed(4)}, Requested: ${qtyOut.toFixed(4)}.`,
        });
      }
      if (nextOnHand.isNegative()) {
        throw new BadRequestException({
          errorCode: 'NEGATIVE_STOCK_PROHIBITED',
          message: 'Operation would result in negative stock, which is prohibited.',
        });
      }
    }

    // Weighted Average Cost (WAC) calculation on inbound movements
    let txUnitCost = currentAvgCost;
    let nextAvgCost = currentAvgCost;
    const absQty = delta.abs();

    if (delta.isPositive()) {
      const inboundCost =
        input.unitCost !== undefined ? new Decimal(input.unitCost.toString()) : currentAvgCost;
      txUnitCost = inboundCost;
      if (nextOnHand.greaterThan(0)) {
        const existingValue = currentOnHand.greaterThan(0)
          ? currentOnHand.times(currentAvgCost)
          : new Decimal(0);
        const inboundValue = absQty.times(inboundCost);
        nextAvgCost = existingValue.plus(inboundValue).dividedBy(nextOnHand);
      }
    } else if (input.unitCost !== undefined && currentAvgCost.isZero()) {
      txUnitCost = new Decimal(input.unitCost.toString());
    }

    const totalCost = absQty.times(txUnitCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const transactionNo = await this.sequenceService.next('INV_TXN', tx);

    await tx.inventoryBalance.update({
      where: { id: bal.id },
      data: {
        quantityOnHand: nextOnHand.toFixed(4),
        averageUnitCost: nextAvgCost.toFixed(4),
      },
    });

    const txn = await tx.inventoryTransaction.create({
      data: {
        transactionNo,
        itemId: input.itemId,
        sourceLocationId:
          input.sourceLocationId !== undefined
            ? input.sourceLocationId
            : delta.isNegative()
              ? input.locationId
              : null,
        destLocationId:
          input.destLocationId !== undefined
            ? input.destLocationId
            : delta.isPositive()
              ? input.locationId
              : null,
        transactionType: input.transactionType,
        quantity: absQty.toFixed(4),
        unitCost: txUnitCost.toFixed(4),
        totalCost: totalCost.toFixed(2),
        balanceAfter: nextOnHand.toFixed(4),
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        referenceNumber: input.referenceNumber ?? null,
        reason: input.reason ?? null,
        performedById: input.performedById,
        approvedById: input.approvedById ?? null,
      },
    });

    // Check low-stock alert threshold
    const item = await tx.item.findUnique({
      where: { id: input.itemId },
      select: { name: true, sku: true, minStockLevel: true },
    });
    const minLevel = bal.min_stock_level
      ? new Decimal(bal.min_stock_level.toString())
      : item
        ? new Decimal(item.minStockLevel.toString())
        : new Decimal(0);

    const isLowStock = minLevel.greaterThan(0) && nextOnHand.lessThanOrEqualTo(minLevel);
    if (isLowStock && item) {
      this.realtime.emitToRoles(
        [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER],
        'stock.low',
        {
          itemId: input.itemId,
          sku: item.sku,
          itemName: item.name,
          locationId: input.locationId,
          availableQuantity: nextOnHand.toFixed(4),
          minStockLevel: minLevel.toFixed(4),
        },
      );
    }

    this.realtime.emitToRoles(
      [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER],
      'inventory.updated',
      {
        itemId: input.itemId,
        locationId: input.locationId,
        balanceAfter: nextOnHand.toFixed(4),
        transactionNo,
      },
    );

    return { txn, balanceAfter: nextOnHand, averageUnitCost: nextAvgCost, isLowStock };
  }

  /**
   * Reserves available stock for an approved order inside a transaction.
   */
  async reserveStock(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      orderItemId: string;
      itemId: string;
      locationId: string;
      quantity: string | Decimal;
      createdById: string;
      allowBackorder?: boolean;
    },
  ) {
    const qty = new Decimal(params.quantity.toString());
    if (qty.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Reservation quantity must be positive.');
    }

    const bal = await this.lockOrCreateBalance(tx, params.itemId, params.locationId);
    const onHand = new Decimal(bal.quantity_on_hand.toString());
    const reserved = new Decimal(bal.quantity_reserved.toString());
    const available = onHand.minus(reserved);

    if (qty.greaterThan(available) && !params.allowBackorder) {
      throw new BadRequestException({
        errorCode: 'INSUFFICIENT_AVAILABLE_STOCK',
        message: `Insufficient unreserved stock to approve order. Available: ${available.toFixed(4)}, Required: ${qty.toFixed(4)}.`,
      });
    }

    const reserveNow = qty.greaterThan(available) ? Decimal.max(available, 0) : qty;
    if (reserveNow.isZero()) return null;

    await tx.inventoryBalance.update({
      where: { id: bal.id },
      data: {
        quantityReserved: reserved.plus(reserveNow).toFixed(4),
      },
    });

    return tx.stockReservation.create({
      data: {
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        itemId: params.itemId,
        locationId: params.locationId,
        quantityReserved: reserveNow.toFixed(4),
        createdById: params.createdById,
      },
    });
  }

  /**
   * Releases reserved stock when dispatching or cancelling an order.
   */
  async releaseReservation(
    tx: Prisma.TransactionClient,
    params: {
      orderItemId: string;
      locationId: string;
      quantity: string | Decimal;
      cancel?: boolean;
    },
  ) {
    let remainingToRelease = new Decimal(params.quantity.toString());
    if (remainingToRelease.lessThanOrEqualTo(0)) return;

    const reservations = await tx.stockReservation.findMany({
      where: {
        orderItemId: params.orderItemId,
        locationId: params.locationId,
        status: { in: ['ACTIVE', 'PARTIALLY_RELEASED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const res of reservations) {
      if (remainingToRelease.lessThanOrEqualTo(0)) break;

      const bal = await this.lockOrCreateBalance(tx, res.itemId, res.locationId);
      const resQty = new Decimal(res.quantityReserved.toString());
      const alreadyRel = new Decimal(res.quantityReleased.toString());
      const openQty = resQty.minus(alreadyRel);
      const releaseNow = Decimal.min(openQty, remainingToRelease);

      if (releaseNow.lessThanOrEqualTo(0)) continue;

      const newReleased = alreadyRel.plus(releaseNow);
      const nextStatus = params.cancel
        ? 'CANCELLED'
        : newReleased.greaterThanOrEqualTo(resQty)
          ? 'RELEASED'
          : 'PARTIALLY_RELEASED';

      await tx.stockReservation.update({
        where: { id: res.id },
        data: {
          quantityReleased: newReleased.toFixed(4),
          status: nextStatus,
        },
      });

      const currentReserved = new Decimal(bal.quantity_reserved.toString());
      const nextReserved = Decimal.max(currentReserved.minus(releaseNow), 0);

      await tx.inventoryBalance.update({
        where: { id: bal.id },
        data: { quantityReserved: nextReserved.toFixed(4) },
      });

      remainingToRelease = remainingToRelease.minus(releaseNow);
    }
  }
}

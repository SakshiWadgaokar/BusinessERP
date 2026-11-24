import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, InvoiceStatus, PurchaseOrderStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { PaginationQuery } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly inventoryLedger: InventoryLedgerService,
  ) {}

  async listSuppliers(query: PaginationQuery) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { supplierCode: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { mobile: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { purchaseOrders: true, supplierInvoices: true } } },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async createSupplier(input: any, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const supplierCode = await this.sequenceService.next('SUPPLIER', tx, { useFiscalYear: false });
      const supplier = await tx.supplier.create({
        data: {
          supplierCode,
          name: input.name,
          contactPerson: input.contactPerson ?? null,
          mobile: input.mobile,
          email: input.email || null,
          address: input.address ?? null,
          gstin: input.gstin ?? null,
          paymentTermsDays: input.paymentTermsDays ?? 30,
          createdById: actor.userId,
        },
      });
      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'SUPPLIER_CREATED',
          entityType: 'Supplier',
          entityId: supplier.id,
          referenceNo: supplierCode,
          afterValue: { name: supplier.name },
        },
        tx,
      );
      return supplier;
    });
  }

  async listPurchaseOrders(query: PaginationQuery & { status?: string; supplierId?: string }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.search) {
      where.OR = [
        { poNumber: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { orderDate: 'desc' },
        include: {
          supplier: { select: { id: true, supplierCode: true, name: true } },
          items: { include: { item: { select: { sku: true, name: true, uom: { select: { code: true } } } } } },
          _count: { select: { goodsReceipts: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  /**
   * Creates a Purchase Order. Per Section 10, creating a PO NEVER increases inventory.
   */
  async createPurchaseOrder(input: any, actor: AuthenticatedUser) {
    let subtotal = new Decimal(0);
    let taxAmount = new Decimal(0);

    const lines = input.items.map((i: any) => {
      const qty = new Decimal(i.orderedQuantity);
      const rate = new Decimal(i.unitRate);
      const taxPct = new Decimal(i.taxRate ?? 0);
      const sub = qty.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const tax = sub.times(taxPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const lineTotal = sub.plus(tax);
      subtotal = subtotal.plus(sub);
      taxAmount = taxAmount.plus(tax);
      return {
        itemId: i.itemId,
        orderedQuantity: qty.toFixed(4),
        unitRate: rate.toFixed(4),
        taxRate: taxPct.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      };
    });

    const totalAmount = subtotal.plus(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return this.prisma.runInTransaction(async (tx) => {
      const poNumber = await this.sequenceService.next('PO', tx);
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId: input.supplierId,
          status: PurchaseOrderStatus.ISSUED,
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
          subtotal: subtotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          notes: input.notes ?? null,
          createdById: actor.userId,
          items: { create: lines },
        },
        include: { items: true, supplier: true },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'PURCHASE_ORDER_CREATED',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          referenceNo: poNumber,
          afterValue: { supplierId: input.supplierId, totalAmount: totalAmount.toFixed(2) },
        },
        tx,
      );

      return po;
    });
  }

  /**
   * Records a Goods Receipt Note (GRN) supporting partial deliveries & accepted/rejected splits.
   * Inventory increases ONLY by `acceptedQuantity`.
   */
  async receiveGoods(poId: string, input: any, actor: AuthenticatedUser) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: { include: { item: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    if (po.status === PurchaseOrderStatus.CANCELLED || po.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException(`Cannot receive goods against PO in status ${po.status}.`);
    }

    const poItemMap = new Map(po.items.map((i) => [i.id, i]));

    return this.prisma.runInTransaction(async (tx) => {
      const grnNumber = await this.sequenceService.next('GRN', tx);
      const grnLines: any[] = [];

      for (const line of input.items) {
        const poItem = poItemMap.get(line.purchaseOrderItemId);
        if (!poItem) {
          throw new BadRequestException(`PO item ${line.purchaseOrderItemId} does not belong to this PO.`);
        }

        const received = new Decimal(line.receivedQuantity);
        const accepted = new Decimal(line.acceptedQuantity);
        const rejected = new Decimal(line.rejectedQuantity ?? '0');

        if (!accepted.plus(rejected).equals(received)) {
          throw new BadRequestException(
            `Accepted (${accepted}) + Rejected (${rejected}) must equal Received (${received}) for ${poItem.item.name}.`,
          );
        }

        const remaining = new Decimal(poItem.orderedQuantity.toString()).minus(
          poItem.receivedQuantity.toString(),
        );
        if (accepted.greaterThan(remaining)) {
          throw new BadRequestException(
            `Accepted quantity (${accepted}) exceeds remaining open PO quantity (${remaining}) for ${poItem.item.name}.`,
          );
        }

        if (accepted.greaterThan(0)) {
          await this.inventoryLedger.recordMovement(tx, {
            itemId: poItem.itemId,
            locationId: input.locationId,
            destLocationId: input.locationId,
            transactionType: InventoryTransactionType.PURCHASE_RECEIPT,
            quantityDelta: accepted,
            unitCost: poItem.unitRate.toString(),
            referenceType: 'GoodsReceipt',
            referenceNumber: grnNumber,
            reason: `GRN ${grnNumber} for PO ${po.poNumber}`,
            performedById: actor.userId,
          });
        }

        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            receivedQuantity: new Decimal(poItem.receivedQuantity.toString()).plus(accepted).toFixed(4),
            rejectedQuantity: new Decimal(poItem.rejectedQuantity.toString()).plus(rejected).toFixed(4),
          },
        });

        grnLines.push({
          purchaseOrderItemId: poItem.id,
          itemId: poItem.itemId,
          receivedQuantity: received.toFixed(4),
          acceptedQuantity: accepted.toFixed(4),
          rejectedQuantity: rejected.toFixed(4),
          unitCost: poItem.unitRate.toString(),
          rejectionReason: line.rejectionReason ?? null,
        });
      }

      const grn = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          purchaseOrderId: po.id,
          locationId: input.locationId,
          receivedById: actor.userId,
          challanRef: input.challanRef ?? null,
          notes: input.notes ?? null,
          items: { create: grnLines },
        },
        include: { items: true },
      });

      const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const allReceived = refreshedItems.every((i) =>
        new Decimal(i.receivedQuantity.toString()).greaterThanOrEqualTo(i.orderedQuantity.toString()),
      );
      const nextStatus = allReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: nextStatus },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'GOODS_RECEIPT_RECORDED',
          entityType: 'GoodsReceipt',
          entityId: grn.id,
          referenceNo: grnNumber,
          afterValue: { poNumber: po.poNumber, poStatus: nextStatus },
        },
        tx,
      );

      return { grn, poStatus: nextStatus };
    });
  }

  async recordSupplierInvoice(input: any, actor: AuthenticatedUser) {
    const sub = new Decimal(input.subtotal);
    const tax = new Decimal(input.taxAmount ?? '0');
    const total = sub.plus(tax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const inv = await this.prisma.supplierInvoice.create({
      data: {
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        supplierBillNo: input.supplierBillNo,
        billDate: new Date(input.billDate),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        subtotal: sub.toFixed(2),
        taxAmount: tax.toFixed(2),
        totalAmount: total.toFixed(2),
        status: InvoiceStatus.ISSUED,
        recordedById: actor.userId,
        notes: input.notes ?? null,
      },
    });

    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'SUPPLIER_INVOICE_RECORDED',
      entityType: 'SupplierInvoice',
      entityId: inv.id,
      referenceNo: inv.supplierBillNo,
      afterValue: { totalAmount: total.toFixed(2) },
    });

    return inv;
  }

  async listSupplierInvoices(query: PaginationQuery) {
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        skip,
        take: query.limit,
        orderBy: { billDate: 'desc' },
        include: { supplier: { select: { supplierCode: true, name: true } } },
      }),
      this.prisma.supplierInvoice.count(),
    ]);
    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async recordSupplierPayment(input: any, actor: AuthenticatedUser) {
    const amount = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Supplier payment amount must be positive.');
    }

    return this.prisma.runInTransaction(async (tx) => {
      const paymentNo = await this.sequenceService.next('SUP_PAY', tx);
      const payment = await tx.supplierPayment.create({
        data: {
          paymentNo,
          supplierId: input.supplierId,
          supplierInvoiceId: input.supplierInvoiceId ?? null,
          paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
          amount: amount.toFixed(2),
          paymentMode: input.paymentMode,
          referenceNo: input.referenceNo ?? null,
          recordedById: actor.userId,
          notes: input.notes ?? null,
        },
      });

      if (input.supplierInvoiceId) {
        const inv = await tx.supplierInvoice.findUniqueOrThrow({
          where: { id: input.supplierInvoiceId },
        });
        const newPaid = new Decimal(inv.paidAmount.toString()).plus(amount);
        const total = new Decimal(inv.totalAmount.toString());
        const nextStatus = newPaid.greaterThanOrEqualTo(total)
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;
        await tx.supplierInvoice.update({
          where: { id: inv.id },
          data: { paidAmount: newPaid.toFixed(2), status: nextStatus },
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'SUPPLIER_PAYMENT_RECORDED',
          entityType: 'SupplierPayment',
          entityId: payment.id,
          referenceNo: paymentNo,
          afterValue: { amount: amount.toFixed(2) },
        },
        tx,
      );

      return payment;
    });
  }
}

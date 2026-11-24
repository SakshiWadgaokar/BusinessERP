import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  InventoryTransactionType,
  InvoiceStatus,
  LedgerEntryType,
  OrderStatus,
} from '@prisma/client';
import Decimal from 'decimal.js';
import {
  ApproveOrderInput,
  CreateDealerOrderInput,
  CreateDispatchInput,
  PaginationQuery,
  ROLES,
} from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsService } from '../settings/settings.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { DealerLedgerService } from '../finance/dealer-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly settingsService: SettingsService,
    private readonly inventoryLedger: InventoryLedgerService,
    private readonly dealerLedger: DealerLedgerService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private isDealerOnly(actor: AuthenticatedUser): boolean {
    return (
      actor.roles.includes(ROLES.DEALER) &&
      !actor.roles.some((r) =>
        ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.ACCOUNTANT, ROLES.INVENTORY_MANAGER] as string[]).includes(r),
      )
    );
  }

  async list(
    query: PaginationQuery & { status?: string; dealerId?: string },
    actor: AuthenticatedUser,
  ) {
    const where: any = {};
    if (this.isDealerOnly(actor)) {
      where.dealerId = actor.dealerId;
    } else if (query.dealerId) {
      where.dealerId = query.dealerId;
    }
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { dealer: { businessName: { contains: query.search, mode: 'insensitive' } } },
        { dealer: { dealerCode: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.orderDate = {};
      if (query.dateFrom) where.orderDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.orderDate.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.dealerOrder.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: {
          dealer: { select: { id: true, dealerCode: true, businessName: true, outstandingBalance: true, creditLimit: true } },
          items: {
            include: {
              item: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
            },
          },
          _count: { select: { dispatches: true, invoices: true } },
        },
      }),
      this.prisma.dealerOrder.count({ where }),
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

  async findOne(orderId: string, actor: AuthenticatedUser) {
    const order = await this.prisma.dealerOrder.findUnique({
      where: { id: orderId },
      include: {
        dealer: { include: { addresses: true, creditSettings: true } },
        items: {
          include: {
            item: { include: { uom: true } },
            reservations: { include: { location: { select: { id: true, code: true, name: true } } } },
          },
        },
        dispatches: {
          include: {
            sourceLocation: { select: { id: true, code: true, name: true } },
            items: { include: { item: { select: { sku: true, name: true } } } },
            deliveryConfirmation: true,
            invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } },
          },
        },
        invoices: { select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, outstandingAmount: true, status: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found.');

    if (this.isDealerOnly(actor) && order.dealerId !== actor.dealerId) {
      throw new ForbiddenException('You are not authorized to access another dealer’s order.');
    }
    return order;
  }

  async create(input: CreateDealerOrderInput, actor: AuthenticatedUser) {
    const targetDealerId = this.isDealerOnly(actor) ? actor.dealerId : input.dealerId;
    if (!targetDealerId) {
      throw new BadRequestException('Dealer ID is required to place an order.');
    }

    const dealer = await this.prisma.dealer.findUnique({
      where: { id: targetDealerId },
      include: { creditSettings: true },
    });
    if (!dealer) throw new NotFoundException('Dealer not found.');
    if (dealer.status !== 'ACTIVE') {
      throw new ForbiddenException('Dealer account is not active and cannot place orders.');
    }

    const gstEnabled = await this.settingsService.getSetting<boolean>('gstEnabled', false);
    const globalCreditMode = await this.settingsService.getSetting<string>('creditLimitMode', 'SOFT_BLOCK');
    const globalAllowBackorders = await this.settingsService.getSetting<boolean>('allowBackorders', false);
    const allowBackorders = dealer.creditSettings?.allowBackorders || globalAllowBackorders;

    const itemIds = Array.from(new Set(input.items.map((i) => i.itemId)));
    const dbItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, isActive: true },
      include: { inventoryBalances: true },
    });
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    // Validate optional Promotional Offer strictly on the backend
    let appliedOffer: any = null;
    let discountPercent = new Decimal(0);
    if (input.offerId) {
      const now = new Date();
      appliedOffer = await this.prisma.promotionalOffer.findUnique({
        where: { id: input.offerId },
      });
      if (
        !appliedOffer ||
        !appliedOffer.isActive ||
        appliedOffer.validFrom > now ||
        appliedOffer.validTo < now
      ) {
        throw new BadRequestException('Selected promotional offer is inactive or expired.');
      }
      if (appliedOffer.targetDealerId && appliedOffer.targetDealerId !== dealer.id) {
        throw new ForbiddenException('You are not eligible for this promotional offer.');
      }
      discountPercent = new Decimal(appliedOffer.discountPercent.toString());
    }

    // First compute gross subtotal to check offer minOrderAmount
    let grossSubtotal = new Decimal(0);
    for (const line of input.items) {
      const dbItem = itemMap.get(line.itemId);
      if (!dbItem) throw new BadRequestException(`Item ${line.itemId} is unavailable or inactive.`);
      grossSubtotal = grossSubtotal.plus(
        new Decimal(line.quantity).times(dbItem.standardSellPrice.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      );
    }
    if (
      appliedOffer &&
      grossSubtotal.lessThan(new Decimal(appliedOffer.minOrderAmount.toString()))
    ) {
      throw new BadRequestException(
        `Minimum order amount of ₹${appliedOffer.minOrderAmount.toString()} is required for offer ${appliedOffer.code}.`,
      );
    }

    let subtotal = new Decimal(0);
    let discountAmount = new Decimal(0);
    let taxAmount = new Decimal(0);
    const preparedLines: Array<{
      itemId: string;
      orderedQuantity: string;
      unitRate: string;
      taxRate: string;
      taxAmount: string;
      lineTotal: string;
    }> = [];

    for (const line of input.items) {
      const dbItem = itemMap.get(line.itemId);
      if (!dbItem) {
        throw new BadRequestException(`Item ${line.itemId} is unavailable or inactive.`);
      }
      if (this.isDealerOnly(actor) && !dbItem.visibleToDealers) {
        throw new ForbiddenException(`Item ${dbItem.name} is not available in the dealer catalog.`);
      }

      const qty = new Decimal(line.quantity);
      if (qty.lessThanOrEqualTo(0)) {
        throw new BadRequestException(`Quantity for ${dbItem.name} must be positive.`);
      }

      // Check aggregate available stock across all locations unless backorders enabled
      const totalAvailable = dbItem.inventoryBalances.reduce((acc, b) => {
        const avail = new Decimal(b.quantityOnHand.toString()).minus(b.quantityReserved.toString());
        return acc.plus(Decimal.max(avail, 0));
      }, new Decimal(0));

      if (!allowBackorders && qty.greaterThan(totalAvailable)) {
        throw new BadRequestException({
          errorCode: 'INSUFFICIENT_STOCK',
          message: `Insufficient stock for ${dbItem.name}. Available: ${totalAvailable.toFixed(2)}, Requested: ${qty.toFixed(2)}.`,
        });
      }

      // Backend is the single source of truth for pricing, discount, and GST
      const rate = new Decimal(dbItem.standardSellPrice.toString());
      const lineGross = qty.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const lineDiscount = discountPercent.greaterThan(0)
        ? lineGross.times(discountPercent).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : new Decimal(0);
      const taxableAfterDiscount = lineGross.minus(lineDiscount);
      const taxPct = gstEnabled && dbItem.defaultTaxRate ? new Decimal(dbItem.defaultTaxRate.toString()) : new Decimal(0);
      const lineTax = taxableAfterDiscount.times(taxPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const lineTotal = taxableAfterDiscount.plus(lineTax);

      subtotal = subtotal.plus(lineGross);
      discountAmount = discountAmount.plus(lineDiscount);
      taxAmount = taxAmount.plus(lineTax);

      preparedLines.push({
        itemId: dbItem.id,
        orderedQuantity: qty.toFixed(4),
        unitRate: rate.toFixed(2),
        taxRate: taxPct.toFixed(2),
        taxAmount: lineTax.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      });
    }

    const totalAmount = subtotal.minus(discountAmount).plus(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const projectedBalance = new Decimal(dealer.outstandingBalance.toString()).plus(totalAmount);
    const creditLimit = new Decimal(dealer.creditLimit.toString());
    const creditLimitExceeded = creditLimit.greaterThan(0) && projectedBalance.greaterThan(creditLimit);
    const enforceHardBlock =
      dealer.creditSettings?.enforceHardBlock || globalCreditMode === 'HARD_BLOCK';

    if (creditLimitExceeded && enforceHardBlock) {
      throw new BadRequestException({
        errorCode: 'CREDIT_LIMIT_EXCEEDED',
        message: `Order total exceeds credit limit (${creditLimit.toFixed(2)}). Projected balance: ${projectedBalance.toFixed(2)}.`,
      });
    }

    const order = await this.prisma.runInTransaction(async (tx) => {
      const orderNumber = await this.sequenceService.next('ORDER', tx);
      const status = input.submitImmediately ? OrderStatus.PENDING_APPROVAL : OrderStatus.DRAFT;

      const created = await tx.dealerOrder.create({
        data: {
          orderNumber,
          dealerId: dealer.id,
          status,
          requestedDate: input.requestedDate ? new Date(input.requestedDate) : null,
          creditLimitExceeded,
          subtotal: subtotal.toFixed(2),
          discountPercent: discountPercent.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          appliedOfferId: appliedOffer?.id ?? null,
          appliedOfferCode: appliedOffer?.code ?? null,
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          notes: input.notes ?? null,
          createdById: actor.userId,
          items: { create: preparedLines },
        },
        include: {
          dealer: { select: { id: true, dealerCode: true, businessName: true } },
          items: { include: { item: { select: { sku: true, name: true } } } },
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'ORDER_CREATED',
          entityType: 'DealerOrder',
          entityId: created.id,
          referenceNo: created.orderNumber,
          afterValue: {
            dealerId: dealer.id,
            status: created.status,
            totalAmount: created.totalAmount.toString(),
            creditLimitExceeded,
          },
        },
        tx,
      );

      return created;
    });

    if (order.status === OrderStatus.PENDING_APPROVAL) {
      await this.notifications.notify({
        roleCodes: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER],
        category: 'ORDER',
        title: `New Dealer Order ${order.orderNumber}`,
        message: `${dealer.businessName} submitted order ${order.orderNumber} worth ₹${order.totalAmount.toString()}${creditLimitExceeded ? ' (Credit Limit Exceeded)' : ''}.`,
        entityType: 'DealerOrder',
        entityId: order.id,
      });
      this.realtime.emitToRoles([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER], 'order.submitted', {
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
    }

    return order;
  }

  async submitDraft(orderId: string, actor: AuthenticatedUser) {
    const order = await this.findOne(orderId, actor);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('Only draft orders can be submitted.');
    }

    const updated = await this.prisma.dealerOrder.update({
      where: { id: orderId },
      data: { status: OrderStatus.PENDING_APPROVAL },
    });

    await this.notifications.notify({
      roleCodes: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER],
      category: 'ORDER',
      title: `Order Submitted: ${order.orderNumber}`,
      message: `${order.dealer.businessName} submitted draft order ${order.orderNumber}.`,
      entityType: 'DealerOrder',
      entityId: order.id,
    });

    return updated;
  }

  async approve(orderId: string, input: ApproveOrderInput, actor: AuthenticatedUser) {
    const order = await this.prisma.dealerOrder.findUnique({
      where: { id: orderId },
      include: { dealer: { include: { creditSettings: true } }, items: true },
    });
    if (!order) throw new NotFoundException('Order not found.');

    if (!([OrderStatus.SUBMITTED, OrderStatus.PENDING_APPROVAL] as OrderStatus[]).includes(order.status)) {
      throw new BadRequestException(`Cannot approve order in status ${order.status}.`);
    }

    if (order.creditLimitExceeded && !input.overrideCreditLimit) {
      throw new BadRequestException({
        errorCode: 'CREDIT_OVERRIDE_REQUIRED',
        message: 'Dealer credit limit is exceeded. Explicitly confirm credit override to approve.',
      });
    }

    const globalAllowBackorders = await this.settingsService.getSetting<boolean>('allowBackorders', false);
    const allowBackorder = order.dealer.creditSettings?.allowBackorders || globalAllowBackorders;

    const updated = await this.prisma.runInTransaction(async (tx) => {
      // Reserve stock at the chosen source location (do NOT deduct stock until physical dispatch)
      for (const item of order.items) {
        const reservation = await this.inventoryLedger.reserveStock(tx, {
          orderId: order.id,
          orderItemId: item.id,
          itemId: item.itemId,
          locationId: input.sourceLocationId,
          quantity: item.orderedQuantity.toString(),
          createdById: actor.userId,
          allowBackorder,
        });

        if (reservation) {
          await tx.dealerOrderItem.update({
            where: { id: item.id },
            data: { reservedQuantity: reservation.quantityReserved },
          });
        }
      }

      const approvedOrder = await tx.dealerOrder.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.APPROVED,
          approvedById: actor.userId,
          approvedAt: new Date(),
        },
        include: { items: true, reservations: true },
      });

      await tx.approvalRecord.create({
        data: {
          entityType: 'DealerOrder',
          entityId: orderId,
          status: ApprovalStatus.APPROVED,
          requestedById: order.createdById,
          decidedById: actor.userId,
          comments: input.notes ?? null,
          decidedAt: new Date(),
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'ORDER_APPROVED',
          entityType: 'DealerOrder',
          entityId: orderId,
          referenceNo: order.orderNumber,
          beforeValue: { status: order.status },
          afterValue: {
            status: OrderStatus.APPROVED,
            sourceLocationId: input.sourceLocationId,
            overrideCreditLimit: input.overrideCreditLimit,
          },
        },
        tx,
      );

      return approvedOrder;
    });

    if (order.dealer.userId) {
      await this.notifications.notify({
        userIds: [order.dealer.userId],
        roleCodes: [ROLES.INVENTORY_MANAGER],
        category: 'ORDER',
        title: `Order Approved: ${order.orderNumber}`,
        message: `Order ${order.orderNumber} has been approved and stock has been reserved for dispatch.`,
        entityType: 'DealerOrder',
        entityId: order.id,
      });
    }
    this.realtime.emitToDealer(order.dealerId, 'order.approved', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    return updated;
  }

  async reject(orderId: string, reason: string, actor: AuthenticatedUser) {
    const order = await this.prisma.dealerOrder.findUnique({
      where: { id: orderId },
      include: { dealer: true },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (!([OrderStatus.SUBMITTED, OrderStatus.PENDING_APPROVAL] as OrderStatus[]).includes(order.status)) {
      throw new BadRequestException(`Cannot reject order in status ${order.status}.`);
    }

    const updated = await this.prisma.runInTransaction(async (tx) => {
      const rejected = await tx.dealerOrder.update({
        where: { id: orderId },
        data: { status: OrderStatus.REJECTED, rejectionReason: reason },
      });

      await tx.approvalRecord.create({
        data: {
          entityType: 'DealerOrder',
          entityId: orderId,
          status: ApprovalStatus.REJECTED,
          requestedById: order.createdById,
          decidedById: actor.userId,
          comments: reason,
          decidedAt: new Date(),
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'ORDER_REJECTED',
          entityType: 'DealerOrder',
          entityId: orderId,
          referenceNo: order.orderNumber,
          beforeValue: { status: order.status },
          afterValue: { status: OrderStatus.REJECTED, reason },
        },
        tx,
      );

      return rejected;
    });

    if (order.dealer.userId) {
      await this.notifications.notify({
        userIds: [order.dealer.userId],
        category: 'ORDER',
        title: `Order Rejected: ${order.orderNumber}`,
        message: `Order ${order.orderNumber} was rejected. Reason: ${reason}`,
        entityType: 'DealerOrder',
        entityId: order.id,
      });
    }

    return updated;
  }

  async cancel(orderId: string, reason: string, actor: AuthenticatedUser) {
    const order = await this.prisma.dealerOrder.findUnique({
      where: { id: orderId },
      include: { items: true, reservations: true },
    });
    if (!order) throw new NotFoundException('Order not found.');

    if (this.isDealerOnly(actor) && order.dealerId !== actor.dealerId) {
      throw new ForbiddenException('You cannot cancel another dealer’s order.');
    }

    if (
      ([OrderStatus.PARTIALLY_DISPATCHED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED, OrderStatus.CANCELLED] as OrderStatus[]).includes(
        order.status,
      )
    ) {
      throw new BadRequestException(`Order in status ${order.status} cannot be cancelled.`);
    }

    return this.prisma.runInTransaction(async (tx) => {
      for (const res of order.reservations) {
        const openQty = new Decimal(res.quantityReserved.toString()).minus(res.quantityReleased.toString());
        if (openQty.greaterThan(0)) {
          await this.inventoryLedger.releaseReservation(tx, {
            orderItemId: res.orderItemId,
            locationId: res.locationId,
            quantity: openQty,
            cancel: true,
          });
        }
      }

      const cancelled = await tx.dealerOrder.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED, cancellationReason: reason },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'ORDER_CANCELLED',
          entityType: 'DealerOrder',
          entityId: orderId,
          referenceNo: order.orderNumber,
          beforeValue: { status: order.status },
          afterValue: { status: OrderStatus.CANCELLED, reason },
        },
        tx,
      );

      return cancelled;
    });
  }

  /**
   * Executes a partial or full dispatch against an approved order.
   * Atomically releases reservations, reduces physical inventory via `DISPATCH` transactions,
   * optionally generates the Sales Invoice, and debits the Dealer Ledger.
   */
  async createDispatch(orderId: string, input: CreateDispatchInput, actor: AuthenticatedUser) {
    const order = await this.prisma.dealerOrder.findUnique({
      where: { id: orderId },
      include: {
        dealer: true,
        items: { include: { item: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found.');

    const allowedStatuses: OrderStatus[] = [
      OrderStatus.APPROVED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_DISPATCH,
      OrderStatus.PARTIALLY_DISPATCHED,
    ];
    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException(`Order in status ${order.status} cannot be dispatched.`);
    }

    const orderItemMap = new Map(order.items.map((oi) => [oi.id, oi]));

    const result = await this.prisma.runInTransaction(async (tx) => {
      const dispatchNumber = await this.sequenceService.next('DISPATCH', tx);

      const dispatchLines: Array<{
        orderItemId: string;
        itemId: string;
        dispatchedQuantity: string;
        unitCostAtDispatch: string;
      }> = [];

      const invoiceLines: Array<{
        itemId: string;
        description: string;
        quantity: string;
        unitRate: string;
        taxRate: string;
        taxAmount: string;
        lineTotal: string;
        unitCost: string;
      }> = [];

      let invSubtotal = new Decimal(0);
      let invTax = new Decimal(0);

      for (const line of input.items) {
        const oi = orderItemMap.get(line.orderItemId);
        if (!oi) {
          throw new BadRequestException(`Order item ${line.orderItemId} does not belong to this order.`);
        }

        const qty = new Decimal(line.quantity);
        const alreadyDispatched = new Decimal(oi.dispatchedQuantity.toString());
        const remaining = new Decimal(oi.orderedQuantity.toString()).minus(alreadyDispatched);

        if (qty.lessThanOrEqualTo(0) || qty.greaterThan(remaining)) {
          throw new BadRequestException(
            `Invalid dispatch quantity for ${oi.item.name}. Remaining undispatched quantity: ${remaining.toFixed(4)}.`,
          );
        }

        // Release reservation first, then physically deduct stock via append-only ledger
        await this.inventoryLedger.releaseReservation(tx, {
          orderItemId: oi.id,
          locationId: input.sourceLocationId,
          quantity: qty,
        });

        const movement = await this.inventoryLedger.recordMovement(tx, {
          itemId: oi.itemId,
          locationId: input.sourceLocationId,
          sourceLocationId: input.sourceLocationId,
          transactionType: InventoryTransactionType.DISPATCH,
          quantityDelta: qty.negated(),
          referenceType: 'Dispatch',
          referenceNumber: dispatchNumber,
          reason: `Dispatch for order ${order.orderNumber}`,
          performedById: actor.userId,
          consumingReservation: true,
        });

        await tx.dealerOrderItem.update({
          where: { id: oi.id },
          data: { dispatchedQuantity: alreadyDispatched.plus(qty).toFixed(4) },
        });

        dispatchLines.push({
          orderItemId: oi.id,
          itemId: oi.itemId,
          dispatchedQuantity: qty.toFixed(4),
          unitCostAtDispatch: movement.averageUnitCost.toFixed(4),
        });

        const unitRate = new Decimal(oi.unitRate.toString());
        const orderDiscPct = new Decimal(order.discountPercent.toString());
        const lineGross = qty.times(unitRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const lineDisc = orderDiscPct.greaterThan(0)
          ? lineGross.times(orderDiscPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          : new Decimal(0);
        const lineSub = lineGross.minus(lineDisc);
        const taxRate = new Decimal(oi.taxRate.toString());
        const lineTax = lineSub.times(taxRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const lineTot = lineSub.plus(lineTax);

        invSubtotal = invSubtotal.plus(lineSub);
        invTax = invTax.plus(lineTax);

        invoiceLines.push({
          itemId: oi.itemId,
          description: order.appliedOfferCode
            ? `${oi.item.name} (${order.appliedOfferCode} -${Number(orderDiscPct)}%)`
            : `${oi.item.name} (${oi.item.sku})`,
          quantity: qty.toFixed(4),
          unitRate: unitRate.toFixed(2),
          taxRate: taxRate.toFixed(2),
          taxAmount: lineTax.toFixed(2),
          lineTotal: lineTot.toFixed(2),
          unitCost: movement.averageUnitCost.toFixed(4),
        });
      }

      const dispatch = await tx.dispatch.create({
        data: {
          dispatchNumber,
          orderId: order.id,
          sourceLocationId: input.sourceLocationId,
          vehicleNumber: input.vehicleNumber ?? null,
          transporterName: input.transporterName ?? null,
          notes: input.notes ?? null,
          dispatchedById: actor.userId,
          items: { create: dispatchLines },
        },
        include: { items: true },
      });

      // Determine updated order status (PARTIALLY_DISPATCHED vs DISPATCHED)
      const updatedOrderItems = await tx.dealerOrderItem.findMany({ where: { orderId: order.id } });
      const allDispatched = updatedOrderItems.every((i) =>
        new Decimal(i.dispatchedQuantity.toString()).greaterThanOrEqualTo(i.orderedQuantity.toString()),
      );
      const nextStatus = allDispatched ? OrderStatus.DISPATCHED : OrderStatus.PARTIALLY_DISPATCHED;

      await tx.dealerOrder.update({
        where: { id: order.id },
        data: { status: nextStatus },
      });

      // Optionally generate Sales Invoice and post Dealer Ledger DEBIT atomically
      let invoice: any = null;
      if (input.generateInvoice) {
        const invoiceNumber = await this.sequenceService.next('INVOICE', tx);
        const invTotal = invSubtotal.plus(invTax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const dueDate = new Date(
          Date.now() + (order.dealer.paymentTermsDays || 30) * 24 * 60 * 60 * 1000,
        );

        invoice = await tx.salesInvoice.create({
          data: {
            invoiceNumber,
            dealerId: order.dealerId,
            orderId: order.id,
            dispatchId: dispatch.id,
            dueDate,
            subtotal: invSubtotal.toFixed(2),
            discountPercent: order.discountPercent,
            discountAmount: order.discountAmount,
            appliedOfferCode: order.appliedOfferCode,
            taxAmount: invTax.toFixed(2),
            totalAmount: invTotal.toFixed(2),
            paidAmount: '0.00',
            outstandingAmount: invTotal.toFixed(2),
            status: InvoiceStatus.ISSUED,
            paymentTerms: order.dealer.paymentTermsLabel ?? `Net ${order.dealer.paymentTermsDays} Days`,
            issuedById: actor.userId,
            items: { create: invoiceLines },
          },
          include: { items: true },
        });

        await this.dealerLedger.postEntry(tx, {
          dealerId: order.dealerId,
          entryType: LedgerEntryType.SALES_INVOICE,
          referenceType: 'SalesInvoice',
          referenceId: invoice.id,
          referenceNumber: invoice.invoiceNumber,
          debitAmount: invTotal,
          description: `Sales Invoice ${invoice.invoiceNumber} (Order ${order.orderNumber} / Dispatch ${dispatchNumber})`,
          createdById: actor.userId,
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'ORDER_DISPATCHED',
          entityType: 'Dispatch',
          entityId: dispatch.id,
          referenceNo: dispatchNumber,
          afterValue: {
            orderNumber: order.orderNumber,
            orderStatus: nextStatus,
            invoiceNumber: invoice?.invoiceNumber ?? null,
          },
        },
        tx,
      );

      return { dispatch, invoice, orderStatus: nextStatus };
    });

    if (order.dealer.userId) {
      await this.notifications.notify({
        userIds: [order.dealer.userId],
        roleCodes: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT],
        category: 'DISPATCH',
        title: `Dispatch Completed: ${result.dispatch.dispatchNumber}`,
        message: `Order ${order.orderNumber} dispatched (${result.orderStatus})${result.invoice ? ` — Invoice ${result.invoice.invoiceNumber} generated.` : '.'}`,
        entityType: 'Dispatch',
        entityId: result.dispatch.id,
      });
    }
    this.realtime.emitToDealer(order.dealerId, 'order.dispatched', {
      orderId: order.id,
      dispatchNumber: result.dispatch.dispatchNumber,
      invoiceNumber: result.invoice?.invoiceNumber,
    });
    this.realtime.emitToRoles(
      [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.ACCOUNTANT],
      'dashboard.refresh',
      { reason: 'ORDER_DISPATCHED' },
    );

    return result;
  }

  async confirmDelivery(
    dispatchId: string,
    input: { receivedBy: string; remarks?: string | null },
    actor: AuthenticatedUser,
  ) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: { order: { include: { dispatches: { include: { deliveryConfirmation: true } } } } },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found.');

    if (this.isDealerOnly(actor) && dispatch.order.dealerId !== actor.dealerId) {
      throw new ForbiddenException('You are not authorized to confirm delivery for another dealer.');
    }

    return this.prisma.runInTransaction(async (tx) => {
      const confirmation = await tx.deliveryConfirmation.create({
        data: {
          dispatchId,
          confirmedById: actor.userId,
          receivedBy: input.receivedBy,
          remarks: input.remarks ?? null,
        },
      });

      // Mark order DELIVERED if order is fully dispatched and all dispatches are confirmed
      if (dispatch.order.status === OrderStatus.DISPATCHED) {
        const allOtherConfirmed = dispatch.order.dispatches.every(
          (d) => d.id === dispatchId || d.deliveryConfirmation !== null,
        );
        if (allOtherConfirmed) {
          await tx.dealerOrder.update({
            where: { id: dispatch.orderId },
            data: { status: OrderStatus.DELIVERED },
          });
        }
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'DELIVERY_CONFIRMED',
          entityType: 'Dispatch',
          entityId: dispatchId,
          referenceNo: dispatch.dispatchNumber,
          afterValue: { receivedBy: input.receivedBy },
        },
        tx,
      );

      return confirmation;
    });
  }
}

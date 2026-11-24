import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  LedgerEntryType,
  PaymentVerificationStatus,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PaginationQuery, ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DealerLedgerService } from './dealer-ledger.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly dealerLedger: DealerLedgerService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private isDealerOnly(actor: AuthenticatedUser): boolean {
    return (
      actor.roles.includes(ROLES.DEALER) &&
      !actor.roles.some((r) =>
        ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.ACCOUNTANT] as string[]).includes(r),
      )
    );
  }

  private assertDealerScope(dealerId: string, actor: AuthenticatedUser) {
    if (this.isDealerOnly(actor) && actor.dealerId !== dealerId) {
      throw new ForbiddenException('Access denied to another dealer’s financial records.');
    }
  }

  async listInvoices(
    query: PaginationQuery & { dealerId?: string; status?: string },
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
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { dealer: { businessName: { contains: query.search, mode: 'insensitive' } } },
        { dealer: { dealerCode: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.invoiceDate = {};
      if (query.dateFrom) where.invoiceDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.invoiceDate.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { invoiceDate: 'desc' },
        include: {
          dealer: { select: { id: true, dealerCode: true, businessName: true } },
          order: { select: { id: true, orderNumber: true } },
          dispatch: { select: { id: true, dispatchNumber: true } },
        },
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findInvoice(invoiceId: string, actor: AuthenticatedUser) {
    const inv = await this.prisma.salesInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        dealer: { include: { addresses: { where: { isDefault: true }, take: 1 } } },
        order: { select: { id: true, orderNumber: true } },
        dispatch: { include: { sourceLocation: true } },
        items: { include: { item: { include: { uom: true } } } },
        allocations: { include: { payment: { select: { id: true, paymentNumber: true, receiptNumber: true, paymentDate: true, paymentMode: true, verificationStatus: true } } } },
      },
    });
    if (!inv) throw new NotFoundException('Sales invoice not found.');
    this.assertDealerScope(inv.dealerId, actor);
    return inv;
  }

  async getDealerLedger(dealerId: string, query: PaginationQuery, actor: AuthenticatedUser) {
    const resolvedDealerId = dealerId === 'me' ? actor.dealerId || '' : dealerId;
    this.assertDealerScope(resolvedDealerId, actor);

    const dealer = await this.prisma.dealer.findUnique({
      where: { id: resolvedDealerId },
      select: {
        id: true,
        dealerCode: true,
        businessName: true,
        openingBalance: true,
        outstandingBalance: true,
        creditLimit: true,
        paymentTermsDays: true,
      },
    });
    if (!dealer) throw new NotFoundException('Dealer not found.');

    const where: any = { dealerId: resolvedDealerId };
    if (query.dateFrom || query.dateTo) {
      where.entryDate = {};
      if (query.dateFrom) where.entryDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.entryDate.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [entries, total] = await Promise.all([
      this.prisma.dealerLedgerEntry.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.dealerLedgerEntry.count({ where }),
    ]);

    return {
      dealer,
      data: entries,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async listPayments(
    query: PaginationQuery & { dealerId?: string; status?: string },
    actor: AuthenticatedUser,
  ) {
    const where: any = {};
    if (this.isDealerOnly(actor)) {
      where.dealerId = actor.dealerId;
    } else if (query.dealerId) {
      where.dealerId = query.dealerId;
    }
    if (query.status) where.verificationStatus = query.status;
    if (query.search) {
      where.OR = [
        { paymentNumber: { contains: query.search, mode: 'insensitive' } },
        { receiptNumber: { contains: query.search, mode: 'insensitive' } },
        { transactionRef: { contains: query.search, mode: 'insensitive' } },
        { dealer: { businessName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.paymentDate = {};
      if (query.dateFrom) where.paymentDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.paymentDate.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          dealer: { select: { id: true, dealerCode: true, businessName: true } },
          allocations: {
            include: { invoice: { select: { id: true, invoiceNumber: true } } },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  /**
   * Records a dealer payment with optional multi-invoice allocations or advance unallocated balance.
   * Atomically updates invoice balances, appends DealerLedger CREDIT entry, and notifies dealer/admin.
   */
  async recordPayment(input: any, actor: AuthenticatedUser) {
    const amount = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const allocations: Array<{ invoiceId: string; allocatedAmount: string }> = input.allocations ?? [];
    const totalAllocated = allocations.reduce(
      (acc, a) => acc.plus(new Decimal(a.allocatedAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
      new Decimal(0),
    );
    if (totalAllocated.greaterThan(amount)) {
      throw new BadRequestException(
        `Total allocated amount (${totalAllocated.toFixed(2)}) exceeds payment amount (${amount.toFixed(2)}).`,
      );
    }

    const unallocated = amount.minus(totalAllocated).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const dealer = await this.prisma.dealer.findUnique({ where: { id: input.dealerId } });
    if (!dealer) throw new NotFoundException('Dealer not found.');

    const result = await this.prisma.runInTransaction(async (tx) => {
      const paymentNumber = await this.sequenceService.next('PAYMENT', tx);
      const receiptNumber = await this.sequenceService.next('RECEIPT', tx);

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          receiptNumber,
          dealerId: dealer.id,
          paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
          amount: amount.toFixed(2),
          unallocatedAmount: unallocated.toFixed(2),
          paymentMode: input.paymentMode,
          transactionRef: input.transactionRef ?? null,
          verificationStatus: PaymentVerificationStatus.VERIFIED,
          verifiedById: actor.userId,
          verifiedAt: new Date(),
          recordedById: actor.userId,
          notes: input.notes ?? null,
        },
      });

      for (const alloc of allocations) {
        const allocAmt = new Decimal(alloc.allocatedAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        if (allocAmt.lessThanOrEqualTo(0)) {
          throw new BadRequestException('Allocation amount must be positive.');
        }

        const inv = await tx.salesInvoice.findUnique({ where: { id: alloc.invoiceId } });
        if (!inv || inv.dealerId !== dealer.id) {
          throw new BadRequestException('Allocated invoice does not belong to this dealer.');
        }
        if (inv.status === InvoiceStatus.VOID) {
          throw new BadRequestException(`Cannot allocate payment to void invoice ${inv.invoiceNumber}.`);
        }

        const currentOut = new Decimal(inv.outstandingAmount.toString());
        if (allocAmt.greaterThan(currentOut)) {
          throw new BadRequestException(
            `Allocation (${allocAmt.toFixed(2)}) exceeds outstanding balance (${currentOut.toFixed(2)}) on invoice ${inv.invoiceNumber}.`,
          );
        }

        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: inv.id,
            allocatedAmount: allocAmt.toFixed(2),
          },
        });

        const nextPaid = new Decimal(inv.paidAmount.toString()).plus(allocAmt).toDecimalPlaces(2);
        const nextOut = currentOut.minus(allocAmt).toDecimalPlaces(2);
        const nextStatus = nextOut.isZero() ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: nextPaid.toFixed(2),
            outstandingAmount: nextOut.toFixed(2),
            status: nextStatus,
          },
        });
      }

      const ledgerPost = await this.dealerLedger.postEntry(tx, {
        dealerId: dealer.id,
        entryType: LedgerEntryType.PAYMENT,
        entryDate: payment.paymentDate,
        referenceType: 'Payment',
        referenceId: payment.id,
        referenceNumber: receiptNumber,
        creditAmount: amount,
        description: `Payment received via ${payment.paymentMode}${payment.transactionRef ? ` (Ref: ${payment.transactionRef})` : ''} — Receipt ${receiptNumber}`,
        createdById: actor.userId,
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'PAYMENT_RECORDED',
          entityType: 'Payment',
          entityId: payment.id,
          referenceNo: receiptNumber,
          afterValue: {
            dealerId: dealer.id,
            amount: amount.toFixed(2),
            paymentMode: payment.paymentMode,
            allocationsCount: allocations.length,
            dealerBalanceAfter: ledgerPost.runningBalance.toFixed(2),
          },
        },
        tx,
      );

      return {
        payment,
        dealerOutstandingAfter: ledgerPost.runningBalance.toFixed(2),
      };
    });

    if (dealer.userId) {
      await this.notifications.notify({
        userIds: [dealer.userId],
        roleCodes: [ROLES.SUPER_ADMIN],
        category: 'PAYMENT',
        title: `Payment Recorded: ₹${amount.toFixed(2)}`,
        message: `Receipt ${result.payment.receiptNumber} recorded for ${dealer.businessName}. Updated outstanding balance: ₹${result.dealerOutstandingAfter}.`,
        entityType: 'Payment',
        entityId: result.payment.id,
      });
    }
    this.realtime.emitToDealer(dealer.id, 'payment.recorded', {
      paymentId: result.payment.id,
      receiptNumber: result.payment.receiptNumber,
      outstandingBalance: result.dealerOutstandingAfter,
    });
    this.realtime.emitToRoles(
      [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT],
      'dashboard.refresh',
      { reason: 'PAYMENT_RECORDED' },
    );

    return result;
  }

  /**
   * Reverses a historical payment without deleting or modifying original ledger entries.
   */
  async reversePayment(paymentId: string, reason: string, actor: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: { include: { invoice: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.verificationStatus === PaymentVerificationStatus.REVERSED) {
      throw new BadRequestException('Payment has already been reversed.');
    }

    return this.prisma.runInTransaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          verificationStatus: PaymentVerificationStatus.REVERSED,
          reversedById: actor.userId,
          reversedAt: new Date(),
          reversalReason: reason,
        },
      });

      for (const alloc of payment.allocations) {
        const inv = alloc.invoice;
        const allocAmt = new Decimal(alloc.allocatedAmount.toString());
        const nextPaid = Decimal.max(new Decimal(inv.paidAmount.toString()).minus(allocAmt), 0);
        const nextOut = new Decimal(inv.totalAmount.toString()).minus(nextPaid);
        const nextStatus = nextPaid.isZero()
          ? InvoiceStatus.ISSUED
          : InvoiceStatus.PARTIALLY_PAID;

        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: nextPaid.toFixed(2),
            outstandingAmount: nextOut.toFixed(2),
            status: nextStatus,
          },
        });
      }

      const ledgerPost = await this.dealerLedger.postEntry(tx, {
        dealerId: payment.dealerId,
        entryType: LedgerEntryType.PAYMENT_REVERSAL,
        referenceType: 'Payment',
        referenceId: payment.id,
        referenceNumber: payment.receiptNumber,
        debitAmount: payment.amount.toString(),
        description: `Reversal of Payment ${payment.paymentNumber} (${payment.receiptNumber}): ${reason}`,
        createdById: actor.userId,
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'PAYMENT_REVERSED',
          entityType: 'Payment',
          entityId: paymentId,
          referenceNo: payment.receiptNumber,
          afterValue: { reason, dealerBalanceAfter: ledgerPost.runningBalance.toFixed(2) },
        },
        tx,
      );

      return {
        paymentId,
        status: PaymentVerificationStatus.REVERSED,
        dealerOutstandingAfter: ledgerPost.runningBalance.toFixed(2),
      };
    });
  }

  async createCreditNote(input: any, actor: AuthenticatedUser) {
    const amount = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Credit note amount must be positive.');
    }

    return this.prisma.runInTransaction(async (tx) => {
      const creditNoteNumber = await this.sequenceService.next('CREDIT_NOTE', tx);
      const cn = await tx.creditNote.create({
        data: {
          creditNoteNumber,
          dealerId: input.dealerId,
          invoiceId: input.invoiceId ?? null,
          amount: amount.toFixed(2),
          reason: input.reason,
          issuedById: actor.userId,
        },
      });

      if (input.invoiceId) {
        const inv = await tx.salesInvoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
        const nextOut = Decimal.max(new Decimal(inv.outstandingAmount.toString()).minus(amount), 0);
        const nextPaid = new Decimal(inv.totalAmount.toString()).minus(nextOut);
        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: nextPaid.toFixed(2),
            outstandingAmount: nextOut.toFixed(2),
            status: nextOut.isZero() ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
          },
        });
      }

      await this.dealerLedger.postEntry(tx, {
        dealerId: input.dealerId,
        entryType: LedgerEntryType.CREDIT_NOTE,
        referenceType: 'CreditNote',
        referenceId: cn.id,
        referenceNumber: creditNoteNumber,
        creditAmount: amount,
        description: `Credit Note ${creditNoteNumber}: ${input.reason}`,
        createdById: actor.userId,
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'CREDIT_NOTE_ISSUED',
          entityType: 'CreditNote',
          entityId: cn.id,
          referenceNo: creditNoteNumber,
          afterValue: { amount: amount.toFixed(2), reason: input.reason },
        },
        tx,
      );

      return cn;
    });
  }

  listExpenseCategories() {
    return this.prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async listExpenses(query: PaginationQuery & { categoryId?: string }) {
    const where: any = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      where.OR = [
        { expenseNumber: { contains: query.search, mode: 'insensitive' } },
        { vendorName: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.expenseDate = {};
      if (query.dateFrom) where.expenseDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.expenseDate.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { expenseDate: 'desc' },
        include: { category: { select: { id: true, name: true } } },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async createExpense(input: any, actor: AuthenticatedUser) {
    const amount = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return this.prisma.runInTransaction(async (tx) => {
      const expenseNumber = await this.sequenceService.next('EXPENSE', tx);
      const exp = await tx.expense.create({
        data: {
          expenseNumber,
          categoryId: input.categoryId,
          expenseDate: new Date(input.expenseDate),
          amount: amount.toFixed(2),
          paymentMode: input.paymentMode,
          vendorName: input.vendorName ?? null,
          referenceNo: input.referenceNo ?? null,
          description: input.description,
          recordedById: actor.userId,
          approvedById: actor.userId,
        },
        include: { category: true },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'EXPENSE_RECORDED',
          entityType: 'Expense',
          entityId: exp.id,
          referenceNo: expenseNumber,
          afterValue: { amount: amount.toFixed(2), category: exp.category.name },
        },
        tx,
      );

      return exp;
    });
  }

  async getFinanceSummary(dateFrom?: string, dateTo?: string) {
    const invDateFilter: any = {};
    const payDateFilter: any = {};
    const expDateFilter: any = {};
    if (dateFrom) {
      invDateFilter.gte = new Date(dateFrom);
      payDateFilter.gte = new Date(dateFrom);
      expDateFilter.gte = new Date(dateFrom);
    }
    if (dateTo) {
      invDateFilter.lte = new Date(dateTo);
      payDateFilter.lte = new Date(dateTo);
      expDateFilter.lte = new Date(dateTo);
    }

    const [salesAgg, cashAgg, expAgg, dealerOutAgg, overdueAgg, invoiceItems, topDebtors] =
      await Promise.all([
        this.prisma.salesInvoice.aggregate({
          where: {
            status: { not: 'VOID' },
            ...(dateFrom || dateTo ? { invoiceDate: invDateFilter } : {}),
          },
          _sum: { totalAmount: true, subtotal: true, taxAmount: true },
          _count: true,
        }),
        this.prisma.payment.aggregate({
          where: {
            verificationStatus: { not: 'REVERSED' },
            ...(dateFrom || dateTo ? { paymentDate: payDateFilter } : {}),
          },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.expense.aggregate({
          where: dateFrom || dateTo ? { expenseDate: expDateFilter } : {},
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.dealer.aggregate({
          where: { outstandingBalance: { gt: 0 } },
          _sum: { outstandingBalance: true },
        }),
        this.prisma.salesInvoice.aggregate({
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
            dueDate: { lt: new Date() },
          },
          _sum: { outstandingAmount: true },
          _count: true,
        }),
        this.prisma.salesInvoiceItem.findMany({
          where: {
            invoice: {
              status: { not: 'VOID' },
              ...(dateFrom || dateTo ? { invoiceDate: invDateFilter } : {}),
            },
          },
          select: { quantity: true, unitCost: true },
        }),
        this.prisma.dealer.findMany({
          where: { outstandingBalance: { gt: 0 } },
          orderBy: { outstandingBalance: 'desc' },
          take: 10,
          select: { id: true, dealerCode: true, businessName: true, outstandingBalance: true, creditLimit: true },
        }),
      ]);

    const totalSalesRevenue = new Decimal(salesAgg._sum.totalAmount?.toString() ?? '0');
    const netSalesExTax = new Decimal(salesAgg._sum.subtotal?.toString() ?? '0');
    const cashReceived = new Decimal(cashAgg._sum.amount?.toString() ?? '0');
    const operatingExpenses = new Decimal(expAgg._sum.amount?.toString() ?? '0');
    const pendingReceivables = new Decimal(dealerOutAgg._sum.outstandingBalance?.toString() ?? '0');
    const overdueReceivables = new Decimal(overdueAgg._sum.outstandingAmount?.toString() ?? '0');

    let missingCogsCount = 0;
    const cogs = invoiceItems.reduce((acc, item) => {
      const uc = new Decimal(item.unitCost.toString());
      if (uc.isZero()) missingCogsCount++;
      return acc.plus(new Decimal(item.quantity.toString()).times(uc));
    }, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const grossProfit = netSalesExTax.minus(cogs).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const netProfit = grossProfit.minus(operatingExpenses).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const hasCompleteCostData = missingCogsCount === 0 && expAgg._count > 0;

    return {
      totalSalesRevenue: { value: totalSalesRevenue.toFixed(2), basis: 'ACTUAL_BILLED' },
      cashReceived: { value: cashReceived.toFixed(2), basis: 'ACTUAL_COLLECTED' },
      pendingReceivables: { value: pendingReceivables.toFixed(2), basis: 'ACTUAL_LEDGER' },
      overdueReceivables: {
        value: overdueReceivables.toFixed(2),
        overdueInvoiceCount: overdueAgg._count,
      },
      costOfGoodsSold: {
        value: cogs.toFixed(2),
        isComplete: missingCogsCount === 0,
        missingCostLines: missingCogsCount,
      },
      operatingExpenses: {
        value: operatingExpenses.toFixed(2),
        recordedExpenseCount: expAgg._count,
      },
      estimatedGrossProfit: {
        value: grossProfit.toFixed(2),
        status: missingCogsCount === 0 ? 'ESTIMATED' : 'INCOMPLETE_COST_DATA',
      },
      estimatedNetProfit: {
        value: hasCompleteCostData ? netProfit.toFixed(2) : null,
        projectedValue: netProfit.toFixed(2),
        status: hasCompleteCostData ? 'ESTIMATED' : 'INCOMPLETE_EXPENSE_OR_COST_DATA',
        note: hasCompleteCostData
          ? 'Calculated from invoiced net sales minus COGS and recorded operating expenses.'
          : 'Incomplete cost or operating expense records; net profit is provisional only.',
      },
      topDealerOutstanding: topDebtors,
    };
  }
}

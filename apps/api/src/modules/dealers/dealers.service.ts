import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DealerStatus, LedgerEntryType, UserStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  CreateDealerInput,
  PaginationQuery,
  ROLES,
  UpdateDealerInput,
} from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthService } from '../auth/auth.service';
import { DealerLedgerService } from '../finance/dealer-ledger.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class DealersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    private readonly dealerLedgerService: DealerLedgerService,
  ) {}

  assertDealerAccess(dealerId: string, actor: AuthenticatedUser) {
    const isElevated = actor.roles.some((r) =>
      ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.ACCOUNTANT, ROLES.INVENTORY_MANAGER] as string[]).includes(r),
    );
    if (!isElevated && actor.dealerId !== dealerId) {
      void this.auditService.record({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: 'SECURITY_DEALER_ISOLATION_VIOLATION',
        entityType: 'Dealer',
        entityId: dealerId,
        afterValue: { attemptedDealerId: dealerId, actorDealerId: actor.dealerId },
      });
      throw new ForbiddenException({
        errorCode: 'DEALER_ACCESS_DENIED',
        message: 'You are not authorized to view or access another dealer’s records.',
      });
    }
  }

  async list(query: PaginationQuery & { status?: string }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { dealerCode: { contains: query.search, mode: 'insensitive' } },
        { dealerName: { contains: query.search, mode: 'insensitive' } },
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { mobile: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.dealer.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: {
          addresses: { where: { isDefault: true }, take: 1 },
          creditSettings: true,
          _count: { select: { orders: true, invoices: true, payments: true } },
        },
      }),
      this.prisma.dealer.count({ where }),
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

  async findOne(dealerId: string, actor: AuthenticatedUser) {
    this.assertDealerAccess(dealerId, actor);
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: {
        addresses: true,
        creditSettings: true,
        user: { select: { id: true, email: true, status: true, lastLoginAt: true } },
      },
    });
    if (!dealer) throw new NotFoundException('Dealer not found.');
    return dealer;
  }

  async create(input: CreateDealerInput, actor: AuthenticatedUser) {
    if (input.createPortalLogin && !input.portalPassword) {
      throw new BadRequestException(
        'Portal password is required when creating a dealer login account.',
      );
    }

    const openingBal = new Decimal(input.openingBalance || '0').toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP,
    );
    const creditLimit = new Decimal(input.creditLimit || '0').toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP,
    );

    const passwordHash = input.createPortalLogin && input.portalPassword
      ? await this.authService.hashPassword(input.portalPassword)
      : null;

    return this.prisma.runInTransaction(async (tx) => {
      let userId: string | null = null;
      if (input.createPortalLogin && passwordHash) {
        const dealerRole = await tx.role.findUniqueOrThrow({
          where: { code: ROLES.DEALER },
        });
        const portalUser = await tx.user.create({
          data: {
            fullName: input.dealerName,
            email: input.email.toLowerCase(),
            phone: input.mobile,
            passwordHash,
            status: UserStatus.ACTIVE,
            createdById: actor.userId,
            userRoles: {
              create: { roleId: dealerRole.id, assignedBy: actor.userId },
            },
          },
        });
        userId = portalUser.id;
      }

      const dealerCode = await this.sequenceService.next('DEALER', tx, { useFiscalYear: false });

      const dealer = await tx.dealer.create({
        data: {
          dealerCode,
          userId,
          dealerName: input.dealerName,
          businessName: input.businessName,
          contactPerson: input.contactPerson,
          mobile: input.mobile,
          email: input.email.toLowerCase(),
          gstin: input.gstin ?? null,
          paymentTermsDays: input.paymentTermsDays,
          paymentTermsLabel: input.paymentTermsLabel ?? `Net ${input.paymentTermsDays} Days`,
          creditLimit: creditLimit.toFixed(2),
          openingBalance: openingBal.toFixed(2),
          outstandingBalance: '0.00',
          notes: input.notes ?? null,
          createdById: actor.userId,
          addresses: {
            create: {
              label: 'Primary',
              addressLine1: input.address.addressLine1,
              addressLine2: input.address.addressLine2 ?? null,
              city: input.address.city,
              state: input.address.state,
              postalCode: input.address.postalCode,
              country: input.address.country || 'India',
              isDefault: true,
            },
          },
          creditSettings: {
            create: {
              creditLimit: creditLimit.toFixed(2),
              paymentTermsDays: input.paymentTermsDays,
              enforceHardBlock: input.enforceHardBlock,
              allowBackorders: input.allowBackorders,
              canViewStockQty: input.canViewStockQty,
              updatedById: actor.userId,
            },
          },
        },
        include: { addresses: true, creditSettings: true },
      });

      if (openingBal.greaterThan(0)) {
        await this.dealerLedgerService.postEntry(tx, {
          dealerId: dealer.id,
          entryType: LedgerEntryType.OPENING_BALANCE,
          referenceType: 'Dealer',
          referenceId: dealer.id,
          referenceNumber: dealer.dealerCode,
          debitAmount: openingBal,
          description: 'Opening outstanding balance at registration',
          createdById: actor.userId,
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'DEALER_CREATED',
          entityType: 'Dealer',
          entityId: dealer.id,
          referenceNo: dealer.dealerCode,
          afterValue: {
            dealerCode: dealer.dealerCode,
            businessName: dealer.businessName,
            creditLimit: creditLimit.toFixed(2),
            openingBalance: openingBal.toFixed(2),
            portalLoginCreated: Boolean(userId),
          },
        },
        tx,
      );

      return tx.dealer.findUniqueOrThrow({
        where: { id: dealer.id },
        include: { addresses: true, creditSettings: true },
      });
    });
  }

  async update(dealerId: string, input: UpdateDealerInput, actor: AuthenticatedUser) {
    const existing = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { creditSettings: true },
    });
    if (!existing) throw new NotFoundException('Dealer not found.');

    return this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.dealer.update({
        where: { id: dealerId },
        data: {
          ...(input.dealerName !== undefined ? { dealerName: input.dealerName } : {}),
          ...(input.businessName !== undefined ? { businessName: input.businessName } : {}),
          ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
          ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
          ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
          ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
          ...(input.paymentTermsLabel !== undefined ? { paymentTermsLabel: input.paymentTermsLabel } : {}),
          ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedById: actor.userId,
        },
      });

      if (
        input.creditLimit !== undefined ||
        input.paymentTermsDays !== undefined ||
        input.enforceHardBlock !== undefined ||
        input.allowBackorders !== undefined ||
        input.canViewStockQty !== undefined
      ) {
        await tx.dealerCreditSetting.upsert({
          where: { dealerId },
          update: {
            ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
            ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
            ...(input.enforceHardBlock !== undefined ? { enforceHardBlock: input.enforceHardBlock } : {}),
            ...(input.allowBackorders !== undefined ? { allowBackorders: input.allowBackorders } : {}),
            ...(input.canViewStockQty !== undefined ? { canViewStockQty: input.canViewStockQty } : {}),
            updatedById: actor.userId,
          },
          create: {
            dealerId,
            creditLimit: input.creditLimit ?? existing.creditLimit.toString(),
            paymentTermsDays: input.paymentTermsDays ?? existing.paymentTermsDays,
            enforceHardBlock: input.enforceHardBlock ?? false,
            allowBackorders: input.allowBackorders ?? false,
            canViewStockQty: input.canViewStockQty ?? true,
            updatedById: actor.userId,
          },
        });
      }

      // Immediately revoke dealer portal sessions if suspended or deactivated
      if (input.status && input.status !== DealerStatus.ACTIVE && existing.userId) {
        await tx.userSession.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'DEALER_UPDATED',
          entityType: 'Dealer',
          entityId: dealerId,
          referenceNo: existing.dealerCode,
          beforeValue: {
            status: existing.status,
            creditLimit: existing.creditLimit.toString(),
            paymentTermsDays: existing.paymentTermsDays,
          },
          afterValue: {
            status: updated.status,
            creditLimit: updated.creditLimit.toString(),
            paymentTermsDays: updated.paymentTermsDays,
          },
        },
        tx,
      );

      return tx.dealer.findUniqueOrThrow({
        where: { id: dealerId },
        include: { addresses: true, creditSettings: true },
      });
    });
  }

  async updateOwnProfile(
    actor: AuthenticatedUser,
    input: { contactPerson?: string; mobile?: string; notes?: string | null },
  ) {
    if (!actor.dealerId) {
      throw new ForbiddenException('No dealer profile is linked to your account.');
    }
    const updated = await this.prisma.dealer.update({
      where: { id: actor.dealerId },
      data: {
        ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
        ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedById: actor.userId,
      },
      include: { addresses: true, creditSettings: true },
    });

    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'DEALER_SELF_PROFILE_UPDATED',
      entityType: 'Dealer',
      entityId: actor.dealerId,
      referenceNo: updated.dealerCode,
      afterValue: input,
    });

    return updated;
  }

  async getFinancialSummary(dealerId: string, actor: AuthenticatedUser) {
    this.assertDealerAccess(dealerId, actor);

    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { creditSettings: true },
    });
    if (!dealer) throw new NotFoundException('Dealer not found.');

    const [invoiceAgg, paymentAgg, overdueCount, openOrdersCount] = await Promise.all([
      this.prisma.salesInvoice.aggregate({
        where: { dealerId, status: { not: 'VOID' } },
        _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { dealerId, verificationStatus: { not: 'REVERSED' } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.salesInvoice.count({
        where: {
          dealerId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.dealerOrder.count({
        where: {
          dealerId,
          status: { in: ['SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'PARTIALLY_DISPATCHED'] },
        },
      }),
    ]);

    const totalBilled = new Decimal(invoiceAgg._sum.totalAmount?.toString() ?? '0');
    const totalPaid = new Decimal(paymentAgg._sum.amount?.toString() ?? '0');
    const outstanding = new Decimal(dealer.outstandingBalance.toString());
    const creditLimit = new Decimal(dealer.creditLimit.toString());
    const availableCredit = Decimal.max(creditLimit.minus(outstanding), 0);

    const totalReceivableBasis = totalBilled.plus(new Decimal(dealer.openingBalance.toString()));
    const paymentCompletionPct = totalReceivableBasis.greaterThan(0)
      ? Decimal.min(totalPaid.dividedBy(totalReceivableBasis).times(100), 100).toDecimalPlaces(2)
      : new Decimal(100);

    return {
      dealerId: dealer.id,
      dealerCode: dealer.dealerCode,
      businessName: dealer.businessName,
      status: dealer.status,
      creditLimit: creditLimit.toFixed(2),
      openingBalance: dealer.openingBalance.toString(),
      totalBilled: totalBilled.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      outstandingBalance: outstanding.toFixed(2),
      availableCredit: availableCredit.toFixed(2),
      paymentCompletionPct: paymentCompletionPct.toFixed(2),
      invoiceCount: invoiceAgg._count,
      paymentCount: paymentAgg._count,
      overdueInvoiceCount: overdueCount,
      openOrdersCount,
    };
  }

  async getPurchaseHistory(dealerId: string, actor: AuthenticatedUser, query: PaginationQuery) {
    this.assertDealerAccess(dealerId, actor);
    const skip = (query.page - 1) * query.limit;

    const where: any = { dealerId };
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.invoiceDate = {};
      if (query.dateFrom) where.invoiceDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.invoiceDate.lte = new Date(query.dateTo);
    }

    const [invoices, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { invoiceDate: 'desc' },
        include: {
          order: { select: { id: true, orderNumber: true, status: true } },
          dispatch: {
            select: {
              id: true,
              dispatchNumber: true,
              dispatchedAt: true,
              sourceLocation: { select: { id: true, name: true, code: true } },
            },
          },
          items: {
            include: {
              item: {
                select: {
                  sku: true,
                  name: true,
                  uom: { select: { code: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);

    return {
      data: invoices,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceService } from '../finance/finance.service';

export interface DateWindow {
  from: Date;
  to: Date;
  label: string;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly financeService: FinanceService,
  ) {}

  resolveDateRange(range?: string, dateFrom?: string, dateTo?: string): DateWindow {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (range === 'custom' && dateFrom && dateTo) {
      return { from: new Date(dateFrom), to: new Date(dateTo), label: 'Custom Range' };
    }
    if (range === 'yesterday') {
      const yFrom = new Date(startOfToday);
      yFrom.setDate(yFrom.getDate() - 1);
      const yTo = new Date(endOfToday);
      yTo.setDate(yTo.getDate() - 1);
      return { from: yFrom, to: yTo, label: 'Yesterday' };
    }
    if (range === '7d') {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 6);
      return { from, to: endOfToday, label: 'Last 7 Days' };
    }
    if (range === '30d') {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 29);
      return { from, to: endOfToday, label: 'Last 30 Days' };
    }
    if (range === 'prev_month') {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to, label: 'Previous Month' };
    }
    if (range === 'today') {
      return { from: startOfToday, to: endOfToday, label: 'Today' };
    }
    // Default: This Month
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from, to: endOfToday, label: 'This Month' };
  }

  /**
   * Returns all 19 database-backed Admin Dashboard KPIs plus chart datasets.
   */
  async getAdminDashboard(range?: string, dateFrom?: string, dateTo?: string) {
    const win = this.resolveDateRange(range, dateFrom, dateTo);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const [
      salesTodayAgg,
      salesMonthAgg,
      cashTodayAgg,
      dealerOutAgg,
      dealerTxnCount,
      activeDealersCount,
      rawStockRows,
      fgStockRows,
      lowStock,
      activeEmpActivities,
      jcCreatedToday,
      jcCompletedToday,
      prodTodayAgg,
      scrapTodayAgg,
      mfgCostTodayAgg,
      financeSummary,
    ] = await Promise.all([
      this.prisma.salesInvoice.aggregate({
        where: { status: { not: 'VOID' }, invoiceDate: { gte: startOfToday, lte: endOfToday } },
        _sum: { totalAmount: true },
      }),
      this.prisma.salesInvoice.aggregate({
        where: { status: { not: 'VOID' }, invoiceDate: { gte: startOfMonth, lte: endOfToday } },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          verificationStatus: { not: 'REVERSED' },
          paymentDate: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { amount: true },
      }),
      this.prisma.dealer.aggregate({
        where: { outstandingBalance: { gt: 0 } },
        _sum: { outstandingBalance: true },
      }),
      this.prisma.dealerLedgerEntry.count({
        where: { entryDate: { gte: win.from, lte: win.to } },
      }),
      this.prisma.dealer.count({ where: { status: 'ACTIVE' } }),
      this.prisma.inventoryBalance.findMany({
        where: { item: { itemType: 'RAW_MATERIAL', isActive: true } },
        select: { quantityOnHand: true, averageUnitCost: true },
      }),
      this.prisma.inventoryBalance.findMany({
        where: { item: { itemType: 'FINISHED_GOOD', isActive: true } },
        select: { quantityOnHand: true, averageUnitCost: true },
      }),
      this.inventoryService.getLowStockAlerts(),
      this.prisma.employeeActivity.findMany({
        where: { occurredAt: { gte: startOfToday, lte: endOfToday } },
        distinct: ['employeeId'],
        select: { employeeId: true },
      }),
      this.prisma.jobCard.count({
        where: { createdAt: { gte: startOfToday, lte: endOfToday } },
      }),
      this.prisma.jobCard.count({
        where: { closedAt: { gte: startOfToday, lte: endOfToday } },
      }),
      this.prisma.productionRecord.aggregate({
        where: { recordType: 'OUTPUT', recordedAt: { gte: startOfToday, lte: endOfToday } },
        _sum: { goodQuantity: true },
      }),
      this.prisma.scrapRecord.aggregate({
        where: { status: { not: 'REJECTED' }, recordedAt: { gte: startOfToday, lte: endOfToday } },
        _sum: { quantity: true },
      }),
      this.prisma.productionCost.aggregate({
        where: { recordedAt: { gte: startOfToday, lte: endOfToday } },
        _sum: { amount: true },
      }),
      this.financeService.getFinanceSummary(win.from.toISOString(), win.to.toISOString()),
    ]);

    const totalRawStockQty = rawStockRows.reduce(
      (acc, r) => acc.plus(r.quantityOnHand.toString()),
      new Decimal(0),
    );
    const totalFgStockQty = fgStockRows.reduce(
      (acc, r) => acc.plus(r.quantityOnHand.toString()),
      new Decimal(0),
    );

    const kpis = {
      totalSalesToday: new Decimal(salesTodayAgg._sum.totalAmount?.toString() ?? '0').toFixed(2),
      totalSalesThisMonth: new Decimal(salesMonthAgg._sum.totalAmount?.toString() ?? '0').toFixed(2),
      cashReceivedToday: new Decimal(cashTodayAgg._sum.amount?.toString() ?? '0').toFixed(2),
      outstandingDealerPayments: new Decimal(dealerOutAgg._sum.outstandingBalance?.toString() ?? '0').toFixed(2),
      totalDealerTransactions: dealerTxnCount,
      totalActiveDealers: activeDealersCount,
      totalRawMaterialStock: totalRawStockQty.toFixed(2),
      totalFinishedProductStock: totalFgStockQty.toFixed(2),
      lowStockAlertsCount: lowStock.count,
      estimatedReplenishmentCost: lowStock.totalEstimatedReplenishmentCost,
      employeesActiveToday: activeEmpActivities.length,
      jobCardsCreatedToday: jcCreatedToday,
      jobCardsCompletedToday: jcCompletedToday,
      totalProductionToday: new Decimal(prodTodayAgg._sum.goodQuantity?.toString() ?? '0').toFixed(2),
      totalScrapGeneratedToday: new Decimal(scrapTodayAgg._sum.quantity?.toString() ?? '0').toFixed(2),
      totalManufacturingCostToday: new Decimal(mfgCostTodayAgg._sum.amount?.toString() ?? '0').toFixed(2),
      businessExpenses: financeSummary.operatingExpenses.value,
      estimatedGrossProfit: financeSummary.estimatedGrossProfit,
      estimatedNetProfit: financeSummary.estimatedNetProfit,
    };

    const charts = await this.getDashboardCharts(win);

    return {
      dateRange: { from: win.from.toISOString(), to: win.to.toISOString(), label: win.label },
      kpis,
      financeSummary,
      lowStockAlerts: lowStock.alerts.slice(0, 10),
      charts,
    };
  }

  private async getDashboardCharts(win: DateWindow) {
    const [invoices, payments, production, materialIssues, scrap, balances, dealerSales] =
      await Promise.all([
        this.prisma.salesInvoice.findMany({
          where: { status: { not: 'VOID' }, invoiceDate: { gte: win.from, lte: win.to } },
          select: { invoiceDate: true, totalAmount: true },
          orderBy: { invoiceDate: 'asc' },
        }),
        this.prisma.payment.findMany({
          where: {
            verificationStatus: { not: 'REVERSED' },
            paymentDate: { gte: win.from, lte: win.to },
          },
          select: { paymentDate: true, amount: true },
          orderBy: { paymentDate: 'asc' },
        }),
        this.prisma.productionRecord.findMany({
          where: { recordType: 'OUTPUT', recordedAt: { gte: win.from, lte: win.to } },
          select: { recordedAt: true, goodQuantity: true, rejectedQuantity: true },
          orderBy: { recordedAt: 'asc' },
        }),
        this.prisma.materialIssue.findMany({
          where: { issuedAt: { gte: win.from, lte: win.to } },
          include: { item: { select: { name: true } } },
        }),
        this.prisma.scrapRecord.findMany({
          where: { status: { not: 'REJECTED' }, recordedAt: { gte: win.from, lte: win.to } },
          select: { recordedAt: true, quantity: true, category: true },
          orderBy: { recordedAt: 'asc' },
        }),
        this.prisma.inventoryBalance.findMany({
          include: {
            item: { select: { itemType: true } },
            location: { select: { name: true } },
          },
        }),
        this.prisma.salesInvoice.groupBy({
          by: ['dealerId'],
          where: { status: { not: 'VOID' }, invoiceDate: { gte: win.from, lte: win.to } },
          _sum: { totalAmount: true },
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: 8,
        }),
      ]);

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    const salesByDay = new Map<string, Decimal>();
    for (const inv of invoices) {
      const k = dayKey(inv.invoiceDate);
      salesByDay.set(k, (salesByDay.get(k) ?? new Decimal(0)).plus(inv.totalAmount.toString()));
    }

    const cashByDay = new Map<string, Decimal>();
    for (const pay of payments) {
      const k = dayKey(pay.paymentDate);
      cashByDay.set(k, (cashByDay.get(k) ?? new Decimal(0)).plus(pay.amount.toString()));
    }

    const allDays = Array.from(new Set([...salesByDay.keys(), ...cashByDay.keys()])).sort();
    const salesAndCollection = allDays.map((date) => ({
      date,
      salesRevenue: Number((salesByDay.get(date) ?? new Decimal(0)).toFixed(2)),
      cashCollected: Number((cashByDay.get(date) ?? new Decimal(0)).toFixed(2)),
    }));

    const prodByDay = new Map<string, { good: Decimal; rejected: Decimal }>();
    for (const p of production) {
      const k = dayKey(p.recordedAt);
      const cur = prodByDay.get(k) ?? { good: new Decimal(0), rejected: new Decimal(0) };
      cur.good = cur.good.plus(p.goodQuantity.toString());
      cur.rejected = cur.rejected.plus(p.rejectedQuantity.toString());
      prodByDay.set(k, cur);
    }
    const productionTrend = Array.from(prodByDay.entries()).map(([date, v]) => ({
      date,
      goodQuantity: Number(v.good.toFixed(2)),
      rejectedQuantity: Number(v.rejected.toFixed(2)),
    }));

    const matMap = new Map<string, Decimal>();
    for (const mi of materialIssues) {
      matMap.set(mi.item.name, (matMap.get(mi.item.name) ?? new Decimal(0)).plus(mi.quantity.toString()));
    }
    const rawMaterialConsumption = Array.from(matMap.entries())
      .map(([material, quantity]) => ({ material, quantity: Number(quantity.toFixed(2)) }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    const scrapByDay = new Map<string, Decimal>();
    for (const s of scrap) {
      const k = dayKey(s.recordedAt);
      scrapByDay.set(k, (scrapByDay.get(k) ?? new Decimal(0)).plus(s.quantity.toString()));
    }
    const scrapTrend = Array.from(scrapByDay.entries()).map(([date, qty]) => ({
      date,
      quantity: Number(qty.toFixed(2)),
    }));

    const invByType = new Map<string, Decimal>();
    for (const b of balances) {
      const t = b.item.itemType;
      invByType.set(t, (invByType.get(t) ?? new Decimal(0)).plus(b.quantityOnHand.toString()));
    }
    const inventoryOverview = Array.from(invByType.entries()).map(([type, quantity]) => ({
      type,
      quantity: Number(quantity.toFixed(2)),
    }));

    const dealerIds = dealerSales.map((d) => d.dealerId);
    const dealers = await this.prisma.dealer.findMany({
      where: { id: { in: dealerIds } },
      select: { id: true, businessName: true, outstandingBalance: true },
    });
    const dMap = new Map(dealers.map((d) => [d.id, d]));
    const dealerPerformance = dealerSales.map((ds) => ({
      dealerName: dMap.get(ds.dealerId)?.businessName || 'Unknown',
      salesAmount: Number(new Decimal(ds._sum.totalAmount?.toString() ?? '0').toFixed(2)),
      outstandingAmount: Number(new Decimal(dMap.get(ds.dealerId)?.outstandingBalance?.toString() ?? '0').toFixed(2)),
    }));

    return {
      salesAndCollection,
      productionTrend,
      rawMaterialConsumption,
      scrapTrend,
      inventoryOverview,
      dealerPerformance,
    };
  }
}

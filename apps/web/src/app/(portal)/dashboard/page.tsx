'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PERMISSIONS, ROLES, formatINR } from '@erp/shared';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Factory,
  IndianRupee,
  Package,
  Recycle,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: any;
}) {
  const accent = {
    default: 'text-slate-600 bg-slate-100',
    success: 'text-emerald-700 bg-emerald-50',
    warning: 'text-amber-700 bg-amber-50',
    danger: 'text-red-700 bg-red-50',
    info: 'text-indigo-700 bg-indigo-50',
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          {Icon && (
            <div className={`rounded-lg p-1.5 ${accent}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight text-slate-900">{value}</p>
        {sub && <p className="mt-1 text-[11px] text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const primaryRole = user?.roles[0];

  const [range, setRange] = useState('this_month');
  const [adminData, setAdminData] = useState<any>(null);
  const [dealerSummary, setDealerSummary] = useState<any>(null);
  const [dealerDueInvoices, setDealerDueInvoices] = useState<any[]>([]);
  const [activeOffers, setActiveOffers] = useState<any[]>([]);
  const [empSummary, setEmpSummary] = useState<any>(null);
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [lowStock, setLowStock] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (can(PERMISSIONS.DASHBOARD_ADMIN)) {
        const res = await apiRequest(`/analytics/dashboard?range=${range}`);
        setAdminData(res);
      } else if (primaryRole === ROLES.DEALER) {
        const [res, offersRes, invRes] = await Promise.all([
          apiRequest('/dealers/me/summary'),
          apiRequest<any[]>('/offers/active').catch(() => []),
          apiRequest<{ data: any[] }>('/finance/invoices?limit=20').catch(() => ({ data: [] })),
        ]);
        setDealerSummary(res);
        setActiveOffers(offersRes);
        setDealerDueInvoices(
          (invRes.data || []).filter(
            (i) => i.status !== 'PAID' && i.status !== 'VOID' && Number(i.outstandingAmount) > 0,
          ),
        );
      } else if (primaryRole === ROLES.EMPLOYEE) {
        const res = await apiRequest('/employees/me/dashboard');
        setEmpSummary(res);
      } else if (primaryRole === ROLES.ACCOUNTANT) {
        const res = await apiRequest('/finance/summary');
        setFinanceSummary(res);
      } else if (primaryRole === ROLES.INVENTORY_MANAGER) {
        const res = await apiRequest('/inventory/low-stock');
        setLowStock(res);
      }
    } catch {
      // Errors handled gracefully via empty state
    } finally {
      setLoading(false);
    }
  }, [user, can, primaryRole, range]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!user) return null;

  // 1. DEALER PORTAL DASHBOARD
  if (primaryRole === ROLES.DEALER) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {user.dealer?.businessName || user.fullName}
            </h2>
            <p className="text-sm text-slate-600">
              Dealer Code: {user.dealer?.dealerCode} — Live Order & Account Summary
            </p>
          </div>
          <Link href="/dealer/place-order">
            <Button>
              <ShoppingCart className="h-4 w-4" />
              Place New Order
            </Button>
          </Link>
        </div>

        {/* Action Required: Approved Invoices Awaiting Full or Partial Payment */}
        {dealerDueInvoices.length > 0 && (
          <div className="space-y-2.5">
            {dealerDueInvoices.slice(0, 3).map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">Payment Requested</Badge>
                    <span className="font-mono text-xs font-bold text-slate-800">{inv.invoiceNumber}</span>
                    <Badge variant="warning">{inv.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Amount Due: {formatINR(inv.outstandingAmount)}{' '}
                    <span className="font-normal text-slate-600">
                      (Total {formatINR(inv.totalAmount)} • Due {new Date(inv.dueDate).toLocaleDateString('en-IN')})
                    </span>
                  </p>
                  <p className="text-xs text-slate-600">
                    Your order is approved. Submit full payment or declare a partial payment with your balance plan.
                  </p>
                </div>
                <Link href={`/dealer/invoices?pay=${inv.id}`} className="shrink-0">
                  <Button size="sm">
                    <CreditCard className="h-3.5 w-3.5" /> Pay / Declare Partial
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Active Festive / Promotional Offers announced by Owner */}
        {activeOffers.length > 0 && (
          <div className="space-y-3">
            {activeOffers.map((offer) => (
              <div
                key={offer.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">{offer.occasion} Special</Badge>
                    <Badge variant="success">{Number(offer.discountPercent)}% OFF</Badge>
                    <span className="font-mono text-xs font-bold text-slate-700">Code: {offer.code}</span>
                  </div>
                  <p className="mt-1.5 text-base font-bold text-slate-900">{offer.title}</p>
                  <p className="text-xs text-slate-700">
                    {offer.description || `Avail ${Number(offer.discountPercent)}% discount on your wholesale order.`}
                    {' '}Valid until {new Date(offer.validTo).toLocaleDateString('en-IN')}.
                  </p>
                </div>
                <Link href={`/dealer/place-order?offerId=${offer.id}`} className="shrink-0">
                  <Button size="sm">
                    Avail {Number(offer.discountPercent)}% Offer
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {dealerSummary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total Purchases (Billed)" value={formatINR(dealerSummary.totalBilled)} icon={ClipboardList} tone="info" />
            <KpiCard label="Total Payments Made" value={formatINR(dealerSummary.totalPaid)} sub={`${dealerSummary.paymentCompletionPct}% Paid`} icon={CreditCard} tone="success" />
            <KpiCard label="Outstanding Balance" value={formatINR(dealerSummary.outstandingBalance)} sub="Read-only verified ledger" icon={Wallet} tone={Number(dealerSummary.outstandingBalance) > 0 ? 'warning' : 'success'} />
            <KpiCard label="Available Credit" value={formatINR(dealerSummary.availableCredit)} sub={`Credit Limit: ${formatINR(dealerSummary.creditLimit)}`} icon={IndianRupee} tone="default" />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/dealer/orders">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="font-semibold text-slate-900">My Orders</p>
                  <p className="text-xs text-slate-500">{dealerSummary?.openOrdersCount ?? 0} open order(s)</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/dealer/invoices">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="font-semibold text-slate-900">Invoices & PDFs</p>
                  <p className="text-xs text-slate-500">{dealerSummary?.invoiceCount ?? 0} invoice(s)</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/dealer/ledger">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="font-semibold text-slate-900">Account Statement</p>
                  <p className="text-xs text-slate-500">Full debit/credit ledger</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  // 2. EMPLOYEE / FACTORY PORTAL DASHBOARD
  if (primaryRole === ROLES.EMPLOYEE) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Factory Workspace — {user.fullName}</h2>
            <p className="text-sm text-slate-600">
              {user.employee?.employeeCode} • {user.employee?.designation}
            </p>
          </div>
          <Link href="/employee/job-cards">
            <Button>
              <Wrench className="h-4 w-4" />
              My Assigned Job Cards
            </Button>
          </Link>
        </div>

        {empSummary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Pending Job Cards" value={String(empSummary.stats.pendingTasks)} icon={Wrench} tone="warning" />
            <KpiCard label="Completed Job Cards" value={String(empSummary.stats.completedTasks)} icon={CheckCircle2} tone="success" />
            <KpiCard label="Good Production Output" value={empSummary.stats.totalProductionGoodQty} icon={Factory} tone="info" />
            <KpiCard label="Scrap Records Logged" value={`${empSummary.stats.scrapCount} (${empSummary.stats.totalScrapQty})`} icon={Recycle} tone="danger" />
          </div>
        )}
      </div>
    );
  }

  // 3. ACCOUNTANT DASHBOARD
  if (primaryRole === ROLES.ACCOUNTANT && financeSummary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Finance & Accounting Dashboard</h2>
            <p className="text-sm text-slate-600">Live sales revenue, cash collections, receivables, and expenses</p>
          </div>
          <Button variant="outline" onClick={loadDashboard} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Sales (Billed)" value={formatINR(financeSummary.totalSalesRevenue.value)} sub="Actual invoiced revenue" icon={TrendingUp} tone="info" />
          <KpiCard label="Cash Actually Collected" value={formatINR(financeSummary.cashReceived.value)} sub="Verified payments received" icon={IndianRupee} tone="success" />
          <KpiCard label="Pending Receivables" value={formatINR(financeSummary.pendingReceivables.value)} sub={`${financeSummary.overdueReceivables.overdueInvoiceCount} overdue invoice(s)`} icon={Wallet} tone="warning" />
          <KpiCard label="Operating Expenses" value={formatINR(financeSummary.operatingExpenses.value)} sub={`${financeSummary.operatingExpenses.recordedExpenseCount} entries`} icon={CreditCard} tone="danger" />
        </div>
      </div>
    );
  }

  // 4. INVENTORY MANAGER DASHBOARD
  if (primaryRole === ROLES.INVENTORY_MANAGER) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Inventory & Warehouse Control</h2>
            <p className="text-sm text-slate-600">Multi-location stock accuracy and replenishment alerts</p>
          </div>
          <Link href="/inventory">
            <Button><Boxes className="h-4 w-4" /> Open Stock Overview</Button>
          </Link>
        </div>
        {lowStock && (
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiCard label="Low Stock Alerts" value={String(lowStock.count)} icon={AlertTriangle} tone={lowStock.count > 0 ? 'danger' : 'success'} />
            <KpiCard label="Estimated Replenishment Cost" value={formatINR(lowStock.totalEstimatedReplenishmentCost)} sub="Weighted Avg / Standard cost basis" icon={IndianRupee} tone="warning" />
          </div>
        )}
      </div>
    );
  }

  // 5. SUPER ADMIN / ADMIN EXECUTIVE DASHBOARD (ALL 19 KPIs + CHARTS)
  const k = adminData?.kpis;
  const c = adminData?.charts;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Executive ERP Dashboard
          </h2>
          <p className="text-sm text-slate-600">
            Real-time database-backed sales, collections, inventory, manufacturing, and profitability
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="prev_month">Previous Month</option>
          </select>
          <Button variant="outline" onClick={loadDashboard} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !k ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading live ERP KPIs...</div>
      ) : k ? (
        <>
          {/* 19 Required KPI Cards grouped cleanly */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <KpiCard label="1. Total Sales Today" value={formatINR(k.totalSalesToday)} sub="Billed revenue (not cash)" icon={TrendingUp} tone="info" />
            <KpiCard label="2. Total Sales This Month" value={formatINR(k.totalSalesThisMonth)} sub="Invoiced sales revenue" icon={TrendingUp} tone="info" />
            <KpiCard label="3. Cash Received Today" value={formatINR(k.cashReceivedToday)} sub="Actual cash/UPI/bank received" icon={IndianRupee} tone="success" />
            <KpiCard label="4. Outstanding Dealer Payments" value={formatINR(k.outstandingDealerPayments)} sub="Live receivables ledger" icon={Wallet} tone="warning" />
            <KpiCard label="5. Dealer Transactions" value={String(k.totalDealerTransactions)} sub={`In ${adminData.dateRange.label}`} icon={ClipboardList} />

            <KpiCard label="6. Active Dealers" value={String(k.totalActiveDealers)} icon={Users} tone="info" />
            <KpiCard label="7. Raw Material Stock" value={k.totalRawMaterialStock} sub="Total units on hand" icon={Boxes} />
            <KpiCard label="8. Finished Product Stock" value={k.totalFinishedProductStock} sub="Total units on hand" icon={Package} tone="success" />
            <KpiCard label="9. Low Stock Alerts" value={String(k.lowStockAlertsCount)} icon={AlertTriangle} tone={k.lowStockAlertsCount > 0 ? 'danger' : 'success'} />
            <KpiCard label="10. Est. Replenishment Cost" value={formatINR(k.estimatedReplenishmentCost)} sub="WAC / Standard cost basis" icon={IndianRupee} tone="warning" />

            <KpiCard label="11. Employees Active Today" value={String(k.employeesActiveToday)} icon={Users} />
            <KpiCard label="12. Job Cards Created Today" value={String(k.jobCardsCreatedToday)} icon={Wrench} />
            <KpiCard label="13. Job Cards Completed Today" value={String(k.jobCardsCompletedToday)} icon={CheckCircle2} tone="success" />
            <KpiCard label="14. Total Production Today" value={k.totalProductionToday} sub="Good finished units" icon={Factory} tone="info" />
            <KpiCard label="15. Scrap Generated Today" value={k.totalScrapGeneratedToday} icon={Recycle} tone="danger" />

            <KpiCard label="16. Manufacturing Cost Today" value={formatINR(k.totalManufacturingCostToday)} icon={Factory} />
            <KpiCard label="17. Business Expenses" value={formatINR(k.businessExpenses)} sub={`In ${adminData.dateRange.label}`} icon={CreditCard} tone="warning" />
            <KpiCard
              label="18. Estimated Gross Profit"
              value={formatINR(k.estimatedGrossProfit.value)}
              sub={k.estimatedGrossProfit.status === 'ESTIMATED' ? 'Sales ex-tax minus COGS' : 'Incomplete cost data'}
              tone={k.estimatedGrossProfit.status === 'ESTIMATED' ? 'success' : 'warning'}
            />
            <KpiCard
              label="19. Estimated Net Profit"
              value={k.estimatedNetProfit.value !== null ? formatINR(k.estimatedNetProfit.value) : 'Incomplete Data'}
              sub={k.estimatedNetProfit.note}
              tone={k.estimatedNetProfit.value !== null ? 'success' : 'warning'}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sales Revenue vs. Cash Collected</CardTitle>
                <CardDescription>Daily billed sales compared against actual payments received</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {c?.salesAndCollection?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={c.salesAndCollection}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="salesRevenue" name="Sales Revenue (₹)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cashCollected" name="Cash Collected (₹)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No sales or payment transactions in this period yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Production Output & Scrap Trend</CardTitle>
                <CardDescription>Daily manufactured good quantity vs. rejected units</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {c?.productionTrend?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={c.productionTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="goodQuantity" name="Good Output" stroke="#0ea5e9" strokeWidth={2} />
                      <Line type="monotone" dataKey="rejectedQuantity" name="Rejected" stroke="#ef4444" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No production output recorded in this period yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dealer Performance & Outstanding</CardTitle>
                <CardDescription>Top dealers by billed sales and current receivables</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {c?.dealerPerformance?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={c.dealerPerformance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dealerName" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="salesAmount" name="Sales (₹)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outstandingAmount" name="Outstanding (₹)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No dealer sales data recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Low Stock Alerts ({adminData.lowStockAlerts?.length || 0})</CardTitle>
                <CardDescription>Items at or below configured minimum stock levels</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-4 py-2.5">Location</th>
                        <th className="px-4 py-2.5 text-right">Avail / Min</th>
                        <th className="px-4 py-2.5 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!adminData.lowStockAlerts?.length ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                            All items are above minimum stock thresholds.
                          </td>
                        </tr>
                      ) : (
                        adminData.lowStockAlerts.map((a: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-4 py-2.5 font-medium text-slate-900">{a.itemName}</td>
                            <td className="px-4 py-2.5 text-slate-600">{a.locationName}</td>
                            <td className="px-4 py-2.5 text-right">
                              <Badge variant="danger">
                                {Number(a.availableQuantity).toFixed(1)} / {Number(a.minStockLevel).toFixed(1)} {a.uom}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium">
                              {formatINR(a.estimatedReplenishmentCost)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

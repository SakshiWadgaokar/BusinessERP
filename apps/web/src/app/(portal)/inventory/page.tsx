'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, formatINR } from '@erp/shared';
import { AlertTriangle, Plus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function InventoryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'balances' | 'ledger' | 'low-stock'>('balances');
  const [balances, setBalances] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [showOpening, setShowOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState({ itemId: '', locationId: '', quantity: '', unitCost: '', reason: 'Opening stock balance' });

  const load = useCallback(async () => {
    const [bRes, tRes, lRes, iRes, locRes] = await Promise.all([
      apiRequest<any[]>('/inventory/balances'),
      apiRequest<{ data: any[] }>('/inventory/transactions?limit=50'),
      apiRequest<any>('/inventory/low-stock'),
      apiRequest<{ data: any[] }>('/inventory/items?limit=100'),
      apiRequest<any[]>('/inventory/locations'),
    ]);
    setBalances(bRes);
    setTxns(tRes.data);
    setLowStock(lRes);
    setItems(iRes.data);
    setLocations(locRes);
    if (!openForm.itemId && iRes.data.length > 0) setOpenForm((f) => ({ ...f, itemId: iRes.data[0].id }));
    if (!openForm.locationId && locRes.length > 0) setOpenForm((f) => ({ ...f, locationId: locRes[0].id }));
  }, [openForm.itemId, openForm.locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/inventory/opening-stock', {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify(openForm),
      });
      setShowOpening(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to record opening stock.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory & Movement Ledger</h2>
          <p className="text-sm text-slate-600">
            All stock quantities are derived from append-only movement transactions — never overwritten directly.
          </p>
        </div>
        {can(PERMISSIONS.INVENTORY_RECEIVE) && (
          <Button onClick={() => setShowOpening(true)}>
            <Plus className="h-4 w-4" /> Record Opening Stock
          </Button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <Button size="sm" variant={tab === 'balances' ? 'primary' : 'outline'} onClick={() => setTab('balances')}>
          Current Stock ({balances.length})
        </Button>
        <Button size="sm" variant={tab === 'ledger' ? 'primary' : 'outline'} onClick={() => setTab('ledger')}>
          Movement Ledger ({txns.length})
        </Button>
        <Button size="sm" variant={tab === 'low-stock' ? 'primary' : 'outline'} onClick={() => setTab('low-stock')}>
          <AlertTriangle className="h-3.5 w-3.5" /> Low Stock Alerts ({lowStock?.count ?? 0})
        </Button>
      </div>

      {tab === 'balances' && (
        <Card>
          <CardHeader><CardTitle>Location-Wise Inventory Balances</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3 text-right">On Hand</th>
                    <th className="px-5 py-3 text-right">Reserved</th>
                    <th className="px-5 py-3 text-right">Available</th>
                    <th className="px-5 py-3 text-right">WAC Unit Cost</th>
                    <th className="px-5 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {balances.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{b.item.name}</p>
                        <p className="font-mono text-xs text-slate-500">{b.item.sku}</p>
                      </td>
                      <td className="px-5 py-3 text-xs">{b.location.name}</td>
                      <td className="px-5 py-3 text-right font-medium">{Number(b.quantityOnHand)} {b.item.uom.code}</td>
                      <td className="px-5 py-3 text-right text-amber-700">{Number(b.quantityReserved)}</td>
                      <td className="px-5 py-3 text-right font-semibold">{Number(b.availableQuantity)}</td>
                      <td className="px-5 py-3 text-right">{formatINR(b.averageUnitCost)}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatINR(b.stockValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'ledger' && (
        <Card>
          <CardHeader><CardTitle>Append-Only Stock Transactions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Txn No / Date</th>
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">From → To</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs font-semibold">{t.transactionNo}</p>
                        <p className="text-xs text-slate-500">{new Date(t.transactionDate).toLocaleString('en-IN')}</p>
                      </td>
                      <td className="px-5 py-3 text-xs font-medium">{t.item.name}</td>
                      <td className="px-5 py-3"><Badge>{t.transactionType}</Badge></td>
                      <td className="px-5 py-3 text-xs">{t.sourceLocation?.code || '-'} → {t.destLocation?.code || '-'}</td>
                      <td className="px-5 py-3 text-right font-semibold">{Number(t.quantity)} {t.item.uom.code}</td>
                      <td className="px-5 py-3 text-right">{Number(t.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'low-stock' && lowStock && (
        <Card>
          <CardHeader>
            <CardTitle>
              Low Stock Alerts — Est. Replenishment Cost: {formatINR(lowStock.totalEstimatedReplenishmentCost)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3 text-right">Available</th>
                    <th className="px-5 py-3 text-right">Minimum</th>
                    <th className="px-5 py-3 text-right">Suggested Qty</th>
                    <th className="px-5 py-3">Cost Basis</th>
                    <th className="px-5 py-3 text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStock.alerts.map((a: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-5 py-3 font-medium">{a.itemName}</td>
                      <td className="px-5 py-3 text-xs">{a.locationName}</td>
                      <td className="px-5 py-3 text-right font-semibold text-red-600">{Number(a.availableQuantity)} {a.uom}</td>
                      <td className="px-5 py-3 text-right">{Number(a.minStockLevel)}</td>
                      <td className="px-5 py-3 text-right font-medium">{Number(a.suggestedReplenishmentQty)}</td>
                      <td className="px-5 py-3 text-xs">{a.costBasisLabel}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatINR(a.estimatedReplenishmentCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showOpening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>Record Opening Stock</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submitOpening} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Item *</label>
                  <select value={openForm.itemId} onChange={(e) => setOpenForm({ ...openForm, itemId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Location *</label>
                  <select value={openForm.locationId} onChange={(e) => setOpenForm({ ...openForm, locationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                  </select>
                </div>
                <Input label="Quantity" required value={openForm.quantity} onChange={(e) => setOpenForm({ ...openForm, quantity: e.target.value })} />
                <Input label="Unit Cost (INR)" required value={openForm.unitCost} onChange={(e) => setOpenForm({ ...openForm, unitCost: e.target.value })} />
                <Input label="Reason" required value={openForm.reason} onChange={(e) => setOpenForm({ ...openForm, reason: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowOpening(false)}>Cancel</Button>
                  <Button type="submit">Record Opening Stock</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS } from '@erp/shared';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function StockTransfersAndAdjustmentsPage() {
  const { can } = useAuth();
  const [locations, setLocations] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [trf, setTrf] = useState({ sourceLocationId: '', destLocationId: '', itemId: '', quantity: '', reason: '' });
  const [adj, setAdj] = useState({ locationId: '', itemId: '', quantityDelta: '', reason: '' });

  const load = useCallback(async () => {
    const [locRes, itemRes, adjRes] = await Promise.all([
      apiRequest<any[]>('/inventory/locations'),
      apiRequest<{ data: any[] }>('/inventory/items?limit=100'),
      apiRequest<{ data: any[] }>('/inventory/adjustments?limit=50'),
    ]);
    setLocations(locRes);
    setItems(itemRes.data);
    setAdjustments(adjRes.data);
    if (!trf.sourceLocationId && locRes.length >= 2) {
      setTrf((f) => ({ ...f, sourceLocationId: locRes[0].id, destLocationId: locRes[1].id }));
      setAdj((f) => ({ ...f, locationId: locRes[0].id }));
    }
    if (!trf.itemId && itemRes.data.length > 0) {
      setTrf((f) => ({ ...f, itemId: itemRes.data[0].id }));
      setAdj((f) => ({ ...f, itemId: itemRes.data[0].id }));
    }
  }, [trf.sourceLocationId, trf.itemId]);

  useEffect(() => { void load(); }, [load]);

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<any>('/inventory/transfers', {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          sourceLocationId: trf.sourceLocationId,
          destLocationId: trf.destLocationId,
          reason: trf.reason,
          items: [{ itemId: trf.itemId, quantity: trf.quantity }],
        }),
      });
      setFeedback(`Transfer ${res.transferNo} completed.`);
      setTrf((f) => ({ ...f, quantity: '', reason: '' }));
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Transfer failed.');
    }
  };

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<any>('/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          locationId: adj.locationId,
          reason: adj.reason,
          items: [{ itemId: adj.itemId, quantityDelta: adj.quantityDelta }],
        }),
      });
      setFeedback(`Adjustment request ${res.adjustmentNo} submitted for approval.`);
      setAdj((f) => ({ ...f, quantityDelta: '', reason: '' }));
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Adjustment request failed.');
    }
  };

  const decide = async (id: string, approve: boolean) => {
    await apiRequest(`/inventory/adjustments/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Stock Transfers & Controlled Adjustments</h2>
        <p className="text-sm text-slate-600">Move stock between warehouses/factory or request audited stock adjustments.</p>
      </div>

      {feedback && <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{feedback}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Warehouse / Factory Stock Transfer</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitTransfer} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">From Location</label>
                <select value={trf.sourceLocationId} onChange={(e) => setTrf({ ...trf, sourceLocationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">To Location</label>
                <select value={trf.destLocationId} onChange={(e) => setTrf({ ...trf, destLocationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Item</label>
                <select value={trf.itemId} onChange={(e) => setTrf({ ...trf, itemId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                </select>
              </div>
              <Input label="Quantity" required value={trf.quantity} onChange={(e) => setTrf({ ...trf, quantity: e.target.value })} />
              <Input label="Reason" required value={trf.reason} onChange={(e) => setTrf({ ...trf, reason: e.target.value })} />
              <Button type="submit">Execute Transfer</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Request Controlled Stock Adjustment</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitAdjustment} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Location</label>
                <select value={adj.locationId} onChange={(e) => setAdj({ ...adj, locationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Item</label>
                <select value={adj.itemId} onChange={(e) => setAdj({ ...adj, itemId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                </select>
              </div>
              <Input label="Quantity Delta (+ or -)" required hint="Example: -2.5 for physical count shortage or 5 for excess found" value={adj.quantityDelta} onChange={(e) => setAdj({ ...adj, quantityDelta: e.target.value })} />
              <Input label="Audit Reason" required value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
              <Button type="submit" variant="secondary">Submit for Approval</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Adjustment Requests ({adjustments.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-5 py-3">Adjustment No</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Items</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-3 font-mono font-semibold">{a.adjustmentNo}</td>
                  <td className="px-5 py-3 text-xs">{a.location.name}</td>
                  <td className="px-5 py-3 text-xs">
                    {a.items.map((i: any) => <div key={i.id}>{i.item.name}: {Number(i.quantityDelta)}</div>)}
                  </td>
                  <td className="px-5 py-3 text-xs">{a.reason}</td>
                  <td className="px-5 py-3"><Badge variant={a.status === 'APPROVED' ? 'success' : a.status === 'REJECTED' ? 'danger' : 'warning'}>{a.status}</Badge></td>
                  <td className="px-5 py-3 text-right">
                    {a.status === 'PENDING' && can(PERMISSIONS.INVENTORY_ADJUST_APPROVE) && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" onClick={() => decide(a.id, true)}>Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => decide(a.id, false)}>Reject</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

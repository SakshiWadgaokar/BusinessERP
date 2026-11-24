'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, formatINR } from '@erp/shared';
import { PackageCheck, Plus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PurchasesPage() {
  const { can } = useAuth();
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLoc, setSelectedLoc] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({ supplierId: '', itemId: '', orderedQuantity: '', unitRate: '', taxRate: '0', notes: '' });

  const load = useCallback(async () => {
    const [poRes, supRes, itemRes, locRes] = await Promise.all([
      apiRequest<{ data: any[] }>('/purchasing/purchase-orders?limit=50'),
      apiRequest<{ data: any[] }>('/purchasing/suppliers?limit=100'),
      apiRequest<{ data: any[] }>('/inventory/items?limit=100'),
      apiRequest<any[]>('/inventory/locations'),
    ]);
    setPos(poRes.data);
    setSuppliers(supRes.data);
    setItems(itemRes.data);
    setLocations(locRes);
    if (!selectedLoc && locRes.length > 0) setSelectedLoc(locRes[0].id);
    if (!form.supplierId && supRes.data.length > 0) setForm((f) => ({ ...f, supplierId: supRes.data[0].id }));
    if (!form.itemId && itemRes.data.length > 0) setForm((f) => ({ ...f, itemId: itemRes.data[0].id }));
  }, [selectedLoc, form.supplierId, form.itemId]);

  useEffect(() => { void load(); }, [load]);

  const createPO = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiRequest('/purchasing/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: form.supplierId,
          notes: form.notes,
          items: [{ itemId: form.itemId, orderedQuantity: form.orderedQuantity, unitRate: form.unitRate, taxRate: Number(form.taxRate) }],
        }),
      });
      setShowCreate(false);
      setFeedback('Purchase Order issued (stock updates only on Goods Receipt).');
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Unable to create PO.');
    }
  };

  const receivePO = async (po: any) => {
    if (!selectedLoc) return;
    if (!window.confirm(`Receive remaining accepted quantities for ${po.poNumber} into selected warehouse?`)) return;
    setFeedback(null);
    try {
      const lines = po.items
        .map((i: any) => {
          const rem = Number(i.orderedQuantity) - Number(i.receivedQuantity);
          return rem > 0
            ? { purchaseOrderItemId: i.id, receivedQuantity: String(rem), acceptedQuantity: String(rem), rejectedQuantity: '0' }
            : null;
        })
        .filter(Boolean);
      const res = await apiRequest<any>(`/purchasing/purchase-orders/${po.id}/receipts`, {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ locationId: selectedLoc, items: lines }),
      });
      setFeedback(`Goods Receipt ${res.grn.grnNumber} recorded. Inventory & WAC updated.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'GRN failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Purchase Orders & Goods Receipts (GRN)</h2>
          <p className="text-sm text-slate-600">Inventory increases only when materials are received and accepted via GRN.</p>
        </div>
        <div className="flex gap-2">
          <select value={selectedLoc} onChange={(e) => setSelectedLoc(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {locations.map((l) => <option key={l.id} value={l.id}>Receive Into: {l.name}</option>)}
          </select>
          {can(PERMISSIONS.PURCHASES_MANAGE) && (
            <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New PO</Button>
          )}
        </div>
      </div>

      {feedback && <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{feedback}</div>}

      <Card>
        <CardHeader><CardTitle>Purchase Orders ({pos.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-5 py-3">PO Number</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Items (Recd / Ord)</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pos.map((po) => (
                <tr key={po.id}>
                  <td className="px-5 py-3.5 font-mono font-semibold">{po.poNumber}</td>
                  <td className="px-5 py-3.5">{po.supplier.name}</td>
                  <td className="px-5 py-3.5 text-xs">
                    {po.items.map((i: any) => (
                      <div key={i.id}>{i.item.name}: {Number(i.receivedQuantity)} / {Number(i.orderedQuantity)} {i.item.uom.code}</div>
                    ))}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold">{formatINR(po.totalAmount)}</td>
                  <td className="px-5 py-3.5"><Badge variant={po.status === 'RECEIVED' ? 'success' : 'info'}>{po.status}</Badge></td>
                  <td className="px-5 py-3.5 text-right">
                    {can(PERMISSIONS.GRN_RECEIVE) && ['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
                      <Button size="sm" onClick={() => receivePO(po)}>
                        <PackageCheck className="h-3.5 w-3.5" /> Record GRN
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader><CardTitle>Create Purchase Order</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createPO} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Supplier *</label>
                  <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.supplierCode})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Raw Material / Item *</label>
                  <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Quantity" required value={form.orderedQuantity} onChange={(e) => setForm({ ...form, orderedQuantity: e.target.value })} />
                  <Input label="Unit Rate (INR)" required value={form.unitRate} onChange={(e) => setForm({ ...form, unitRate: e.target.value })} />
                </div>
                <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Issue Purchase Order</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

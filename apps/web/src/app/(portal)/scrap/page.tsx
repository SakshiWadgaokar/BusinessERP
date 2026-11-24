'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, ScrapCategory, formatINR } from '@erp/shared';
import { Check, Plus, Recycle } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ScrapManagementPage() {
  const { can } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    itemId: '',
    quantity: '',
    category: ScrapCategory.PRODUCTION_WASTE,
    reason: '',
    jobCardId: '',
    locationId: '',
    estimatedValue: '0.00',
  });

  const load = useCallback(async () => {
    const [sRes, sumRes, itemRes, locRes, jcRes] = await Promise.all([
      apiRequest<{ data: any[] }>('/scrap?limit=50'),
      apiRequest<any>('/scrap/summary'),
      apiRequest<{ data: any[] }>('/inventory/items?limit=100'),
      apiRequest<any[]>('/inventory/locations'),
      apiRequest<{ data: any[] }>('/job-cards?limit=50').catch(() => ({ data: [] })),
    ]);
    setRecords(sRes.data);
    setSummary(sumRes);
    setItems(itemRes.data);
    setLocations(locRes);
    setJobCards(jcRes.data);

    const scrapLoc = locRes.find((l) => l.locationType === 'SCRAP_STORAGE') || locRes[0];
    setForm((f) => ({
      ...f,
      itemId: f.itemId || itemRes.data[0]?.id || '',
      locationId: f.locationId || scrapLoc?.id || '',
    }));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recordScrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<any>('/scrap', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          jobCardId: form.jobCardId || null,
        }),
      });
      setShowCreate(false);
      setForm((f) => ({ ...f, quantity: '', reason: '', estimatedValue: '0.00' }));
      setFeedback(`Scrap recorded with unique ID: ${res.scrapCode}`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Unable to record scrap.');
    }
  };

  const verifyScrap = async (s: any, approved: boolean) => {
    const scrapLoc = locations.find((l) => l.locationType === 'SCRAP_STORAGE')?.id;
    await apiRequest(`/scrap/${s.id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ approved, scrapStorageLocationId: scrapLoc }),
    });
    setFeedback(approved ? `${s.scrapCode} verified and added to Scrap Inventory.` : `${s.scrapCode} rejected.`);
    await load();
  };

  const disposeScrap = async (s: any) => {
    const type = window.prompt('Disposal type (SOLD, REUSED, or DISPOSED):', 'SOLD')?.toUpperCase();
    if (!type || !['SOLD', 'REUSED', 'DISPOSED'].includes(type)) return;
    const saleVal = type === 'SOLD' ? window.prompt('Realized sale value (INR):', '0.00') || '0.00' : '0.00';
    try {
      await apiRequest(`/scrap/${s.id}/dispose`, {
        method: 'POST',
        body: JSON.stringify({
          disposalType: type,
          quantity: String(s.remainingQuantity),
          saleValue: saleVal,
        }),
      });
      setFeedback(`${s.scrapCode} marked ${type}.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Disposal failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Scrap & Waste Management</h2>
          <p className="text-sm text-slate-600">
            Unique Scrap ID tracking, supervisor verification, Scrap Inventory, and separate realized recovery valuation.
          </p>
        </div>
        {can(PERMISSIONS.SCRAP_RECORD) && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Log Scrap</Button>
        )}
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Total Scrap Records / Qty</p><p className="mt-1 text-xl font-bold">{summary.totalRecords} ({Number(summary.totalScrapQuantity)})</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Estimated Scrap Value</p><p className="mt-1 text-xl font-bold text-amber-700">{formatINR(summary.totalEstimatedValue)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Realized Sale / Recovery Value</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatINR(summary.totalRealizedRecoveryValue)}</p></CardContent></Card>
        </div>
      )}

      {feedback && <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{feedback}</div>}

      <Card>
        <CardHeader><CardTitle>Scrap Registry ({records.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Scrap ID</th>
                  <th className="px-5 py-3">Material & Qty</th>
                  <th className="px-5 py-3">Category / Job Card</th>
                  <th className="px-5 py-3 text-right">Est / Realized</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3.5">
                      <p className="font-mono font-semibold text-slate-900">{s.scrapCode}</p>
                      <p className="text-xs text-slate-500">{new Date(s.recordedAt).toLocaleDateString('en-IN')}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <p className="font-medium text-slate-900">{s.item.name}</p>
                      <p>Total: {Number(s.quantity)} • Rem: {Number(s.remainingQuantity)} {s.item.uom.code}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <Badge>{s.category}</Badge>
                      <p className="mt-1 text-slate-500">{s.jobCard?.jobCardNumber || 'No Job Card'}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs">
                      <p>Est: {formatINR(s.estimatedValue)}</p>
                      <p className="font-semibold text-emerald-700">Real: {formatINR(s.realizedValue)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={s.status === 'STORED' || s.status === 'SOLD' ? 'success' : s.status === 'REJECTED' ? 'danger' : 'warning'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {s.status === 'RECORDED' && can(PERMISSIONS.SCRAP_VERIFY) && (
                          <Button size="sm" onClick={() => verifyScrap(s, true)}>
                            <Check className="h-3.5 w-3.5" /> Verify
                          </Button>
                        )}
                        {['VERIFIED', 'STORED'].includes(s.status) && Number(s.remainingQuantity) > 0 && can(PERMISSIONS.SCRAP_DISPOSE) && (
                          <Button size="sm" variant="secondary" onClick={() => disposeScrap(s)}>
                            <Recycle className="h-3.5 w-3.5" /> Dispose/Sell
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader><CardTitle>Record Scrap / Waste</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={recordScrap} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Material *</label>
                  <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Quantity" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Category *</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as any })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      {Object.values(ScrapCategory).map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Related Job Card (Optional)</label>
                    <select value={form.jobCardId} onChange={(e) => setForm({ ...form, jobCardId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      <option value="">None</option>
                      {jobCards.map((j) => <option key={j.id} value={j.id}>{j.jobCardNumber}</option>)}
                    </select>
                  </div>
                  <Input label="Estimated Value (INR)" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
                </div>
                <Input label="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Generate Scrap ID & Submit</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

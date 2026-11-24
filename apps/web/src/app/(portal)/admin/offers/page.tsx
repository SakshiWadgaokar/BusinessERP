'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, formatINR } from '@erp/shared';
import { BellRing, Plus, Tag } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AdminOffersPage() {
  const { can } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    code: 'DIWALI10',
    title: 'Diwali Festival Special Discount',
    occasion: 'Diwali',
    description: 'Flat 10% discount on dealer wholesale orders to celebrate Diwali.',
    discountPercent: '10',
    minOrderAmount: '0.00',
    targetDealerId: '',
    validFrom: today,
    validTo: nextMonth,
  });

  const load = useCallback(async () => {
    const [oRes, dRes] = await Promise.all([
      apiRequest<any[]>('/offers'),
      apiRequest<{ data: any[] }>('/dealers?limit=100'),
    ]);
    setOffers(oRes);
    setDealers(dRes.data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      const created = await apiRequest<any>('/offers', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          discountPercent: Number(form.discountPercent),
          targetDealerId: form.targetDealerId || null,
          validFrom: `${form.validFrom}T00:00:00.000Z`,
          validTo: `${form.validTo}T23:59:59.999Z`,
        }),
      });
      setShowCreate(false);
      setFeedback(
        `Offer "${created.title}" (${Number(created.discountPercent)}% OFF — Code: ${created.code}) published! Instant notification sent to Dealer Portal.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create offer.');
    }
  };

  const toggleActive = async (offer: any) => {
    await apiRequest(`/offers/${offer.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !offer.isActive }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Festive Offers & Dealer Discounts</h2>
          <p className="text-sm text-slate-600">
            Announce seasonal/occasion discounts (e.g. Diwali 10% OFF). Dealers receive an instant notification and can avail it directly when placing orders.
          </p>
        </div>
        {can(PERMISSIONS.SETTINGS_MANAGE) && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Announce Discount Offer
          </Button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <BellRing className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Configured Promotional Offers ({offers.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Code / Occasion</th>
                  <th className="px-5 py-3">Title & Details</th>
                  <th className="px-5 py-3 text-right">Discount</th>
                  <th className="px-5 py-3">Validity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      No promotional offers announced yet. Click &ldquo;Announce Discount Offer&rdquo; to publish one to all dealers.
                    </td>
                  </tr>
                ) : (
                  offers.map((o) => (
                    <tr key={o.id}>
                      <td className="px-5 py-3.5">
                        <p className="font-mono font-bold text-brand-700">{o.code}</p>
                        <p className="text-xs text-slate-500">{o.occasion}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">{o.title}</p>
                        <p className="text-xs text-slate-500">
                          {o.description || 'Applicable on eligible dealer orders'}
                          {Number(o.minOrderAmount) > 0 ? ` • Min Order: ${formatINR(o.minOrderAmount)}` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Badge variant="success">{Number(o.discountPercent)}% OFF</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {new Date(o.validFrom).toLocaleDateString('en-IN')} – {new Date(o.validTo).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={o.isActive ? 'success' : 'default'}>
                          {o.isActive ? 'Active' : 'Paused'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {can(PERMISSIONS.SETTINGS_MANAGE) && (
                          <Button size="sm" variant="outline" onClick={() => toggleActive(o)}>
                            {o.isActive ? 'Pause' : 'Activate'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-brand-600" />
                Announce Discount Offer to Dealers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
                <Input label="Offer Code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                <Input label="Occasion" required placeholder="Diwali, Holi, Year-End" value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input label="Offer Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <Input label="Discount (%)" type="number" step="0.01" min="0.01" max="100" required value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
                <Input label="Min Order Amount (INR)" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} />
                <Input label="Valid From" type="date" required value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
                <Input label="Valid Until" type="date" required value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Target Audience</label>
                  <select value={form.targetDealerId} onChange={(e) => setForm({ ...form, targetDealerId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">All Active Dealers (Broadcast Notification)</option>
                    {dealers.map((d) => <option key={d.id} value={d.id}>Only: {d.businessName} ({d.dealerCode})</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Input label="Message / Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Publish & Notify Dealers</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

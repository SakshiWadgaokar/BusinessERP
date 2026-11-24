'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EmployeeMaterialRequestsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [jobCardId, setJobCardId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [isReplacement, setIsReplacement] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<{ data: any[] }>('/job-cards?limit=50'),
      apiRequest<{ data: any[] }>('/inventory/items?limit=100'),
    ]).then(([jc, it]) => {
      setCards(jc.data);
      setItems(it.data);
      if (jc.data[0]) setJobCardId(jc.data[0].id);
      if (it.data[0]) setItemId(it.data[0].id);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await apiRequest<any>(`/job-cards/${jobCardId}/material-requests`, {
        method: 'POST',
        body: JSON.stringify({
          isReplacement,
          reason,
          items: [{ itemId, requestedQuantity: qty }],
        }),
      });
      setMessage(`Material request ${res.requestNumber} submitted for approval.`);
      setQty('');
      setReason('');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Unable to submit request.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Material & Replacement Requests</h2>
        <p className="text-sm text-slate-600">Request warehouse raw materials or defective material replacements for your assigned Job Cards.</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader><CardTitle>New Material Request</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {message && <div className="rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-800">{message}</div>}
            <div>
              <label className="block text-sm font-medium text-slate-700">Assigned Job Card *</label>
              <select value={jobCardId} onChange={(e) => setJobCardId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {cards.map((c) => <option key={c.id} value={c.id}>{c.jobCardNumber} — {c.finishedProduct.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Material *</label>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
              </select>
            </div>
            <Input label="Requested Quantity" required value={qty} onChange={(e) => setQty(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isReplacement} onChange={(e) => setIsReplacement(e.target.checked)} />
              This is a replacement request for defective material
            </label>
            <Input label="Reason / Remarks" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button type="submit" disabled={!jobCardId || !itemId}>Submit Request</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

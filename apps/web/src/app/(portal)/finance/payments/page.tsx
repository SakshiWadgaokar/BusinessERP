'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, PaymentMode, formatINR } from '@erp/shared';
import { Download, Plus, RotateCcw } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function FinancePaymentsPage() {
  const { can } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);
  const [dealerInvoices, setDealerInvoices] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    dealerId: '',
    amount: '',
    paymentMode: PaymentMode.UPI,
    transactionRef: '',
    invoiceId: '',
    notes: '',
  });

  const load = useCallback(async () => {
    const [pRes, dRes] = await Promise.all([
      apiRequest<{ data: any[] }>('/finance/payments?limit=50'),
      apiRequest<{ data: any[] }>('/dealers?limit=100'),
    ]);
    setPayments(pRes.data);
    setDealers(dRes.data);
    if (!form.dealerId && dRes.data.length > 0) {
      setForm((f) => ({ ...f, dealerId: dRes.data[0].id }));
    }
  }, [form.dealerId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!form.dealerId) return;
    apiRequest<{ data: any[] }>(`/finance/invoices?dealerId=${form.dealerId}&limit=50`).then((r) => {
      setDealerInvoices(r.data.filter((i) => Number(i.outstandingAmount) > 0 && i.status !== 'VOID'));
    });
  }, [form.dealerId]);

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const allocations = form.invoiceId
        ? [{ invoiceId: form.invoiceId, allocatedAmount: form.amount }]
        : [];
      const res = await apiRequest<any>('/finance/payments', {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          dealerId: form.dealerId,
          amount: form.amount,
          paymentMode: form.paymentMode,
          transactionRef: form.transactionRef || null,
          notes: form.notes || null,
          allocations,
        }),
      });
      setShowCreate(false);
      setForm((f) => ({ ...f, amount: '', transactionRef: '', invoiceId: '', notes: '' }));
      setFeedback(`Receipt ${res.payment.receiptNumber} recorded. Updated dealer balance: ${formatINR(res.dealerOutstandingAfter)}.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Unable to record payment.');
    }
  };

  const reversePayment = async (p: any) => {
    const reason = window.prompt(`Enter audit reason to reverse ${p.receiptNumber}:`);
    if (!reason) return;
    try {
      await apiRequest(`/finance/payments/${p.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setFeedback(`Payment ${p.receiptNumber} reversed with offsetting ledger entry.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Reversal failed.');
    }
  };

  const downloadReceipt = async (paymentId: string) => {
    const res = await apiRequest<{ url: string }>(`/documents/payments/${paymentId}/receipt-pdf`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Payments & Receipts</h2>
          <p className="text-sm text-slate-600">Idempotency-protected dealer payment recording, allocation, and PDF receipts.</p>
        </div>
        {can(PERMISSIONS.PAYMENTS_RECORD) && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Record Payment</Button>
        )}
      </div>

      {feedback && <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{feedback}</div>}

      <Card>
        <CardHeader><CardTitle>Recorded Payments ({payments.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Receipt / Payment No</th>
                  <th className="px-5 py-3">Dealer</th>
                  <th className="px-5 py-3">Mode / Ref</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3.5">
                      <p className="font-mono font-semibold">{p.receiptNumber}</p>
                      <p className="text-xs text-slate-500">{new Date(p.paymentDate).toLocaleDateString('en-IN')}</p>
                    </td>
                    <td className="px-5 py-3.5 font-medium">{p.dealer.businessName}</td>
                    <td className="px-5 py-3.5 text-xs">{p.paymentMode} {p.transactionRef ? `• ${p.transactionRef}` : ''}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-emerald-700">{formatINR(p.amount)}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={p.verificationStatus === 'REVERSED' ? 'danger' : 'success'}>
                        {p.verificationStatus}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => downloadReceipt(p.id)}>
                          <Download className="h-3.5 w-3.5" /> Receipt
                        </Button>
                        {can(PERMISSIONS.PAYMENTS_REVERSE) && p.verificationStatus !== 'REVERSED' && (
                          <Button size="sm" variant="danger" onClick={() => reversePayment(p)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Reverse
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
            <CardHeader><CardTitle>Record Dealer Payment</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={recordPayment} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Dealer *</label>
                  <select value={form.dealerId} onChange={(e) => setForm({ ...form, dealerId: e.target.value, invoiceId: '' })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {dealers.map((d) => <option key={d.id} value={d.id}>{d.businessName} (Out: {formatINR(d.outstandingBalance)})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Allocate to Invoice (Optional — blank for advance/on-account)</label>
                  <select value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Unallocated / On-Account Payment</option>
                    {dealerInvoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} — Due {formatINR(i.outstandingAmount)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Amount (INR)" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Payment Mode *</label>
                    <select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value as any })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      {Object.values(PaymentMode).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <Input label="Transaction Reference / UTR / Cheque No" value={form.transactionRef} onChange={(e) => setForm({ ...form, transactionRef: e.target.value })} />
                <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Save Payment & Issue Receipt</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

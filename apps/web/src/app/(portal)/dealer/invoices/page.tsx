'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PaymentMode, formatINR } from '@erp/shared';
import { AlertCircle, CheckCircle2, CreditCard, Download } from 'lucide-react';
import { ApiError, apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function DealerInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [payForm, setPayForm] = useState({
    paymentType: 'FULL' as 'FULL' | 'PARTIAL',
    amount: '',
    paymentMode: PaymentMode.UPI,
    transactionRef: '',
    partialPaymentReason: '',
    expectedBalanceDate: '',
    notes: '',
  });

  const openPayModal = useCallback((inv: any) => {
    const out = Number(inv.outstandingAmount).toFixed(2);
    setPayingInvoice(inv);
    setPayForm({
      paymentType: 'FULL',
      amount: out,
      paymentMode: PaymentMode.UPI,
      transactionRef: '',
      partialPaymentReason: '',
      expectedBalanceDate: '',
      notes: '',
    });
    setFeedback(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, payRes] = await Promise.all([
        apiRequest<{ data: any[] }>('/finance/invoices?limit=50'),
        apiRequest<{ data: any[] }>('/finance/payments?status=PENDING&limit=50'),
      ]);
      setInvoices(invRes.data);
      setPendingPayments(payRes.data);
      return invRes.data;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().then((loaded) => {
      if (!loaded || typeof window === 'undefined') return;
      const payId = new URLSearchParams(window.location.search).get('pay');
      if (payId) {
        const match = loaded.find(
          (i) => i.id === payId && i.status !== 'PAID' && i.status !== 'VOID' && Number(i.outstandingAmount) > 0,
        );
        if (match) openPayModal(match);
      }
    });
  }, [load, openPayModal]);

  const downloadPdf = async (invoiceId: string) => {
    const res = await apiRequest<{ url: string }>(`/documents/invoices/${invoiceId}/pdf`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  const handlePaymentTypeChange = (type: 'FULL' | 'PARTIAL') => {
    if (!payingInvoice) return;
    const out = Number(payingInvoice.outstandingAmount);
    setPayForm((f) => ({
      ...f,
      paymentType: type,
      amount: type === 'FULL' ? out.toFixed(2) : f.amount === out.toFixed(2) ? (out / 2).toFixed(2) : f.amount,
    }));
  };

  const outstandingNum = payingInvoice ? Number(payingInvoice.outstandingAmount) : 0;
  const enteredNum = Number(payForm.amount || 0);
  const remainingAfter = Math.max(0, outstandingNum - (Number.isFinite(enteredNum) ? enteredNum : 0));
  const isEffectivelyPartial =
    payForm.paymentType === 'PARTIAL' || (Number.isFinite(enteredNum) && enteredNum > 0 && enteredNum < outstandingNum);

  const submitDealerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    if (isEffectivelyPartial && payForm.partialPaymentReason.trim().length < 5) {
      setFeedback({
        type: 'error',
        text: 'Please state your partial payment reason / balance commitment before submitting.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiRequest<any>('/finance/payments/dealer-submit', {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          invoiceId: payingInvoice.id,
          paymentType: isEffectivelyPartial ? 'PARTIAL' : 'FULL',
          amount: Number(payForm.amount).toFixed(2),
          paymentMode: payForm.paymentMode,
          transactionRef: payForm.transactionRef.trim() || null,
          partialPaymentReason: isEffectivelyPartial ? payForm.partialPaymentReason.trim() : null,
          expectedBalanceDate: isEffectivelyPartial ? payForm.expectedBalanceDate.trim() || null : null,
          notes: payForm.notes.trim() || null,
        }),
      });
      setPayingInvoice(null);
      setFeedback({
        type: 'success',
        text: `${res.isPartial ? 'Partial payment' : 'Full payment'} of ${formatINR(res.payment.amount)} submitted (Ref: ${res.payment.receiptNumber}). Owner / Accountant has been notified to verify and issue your official receipt.`,
      });
      await load();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Unable to submit payment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingByInvoice = new Map<string, any[]>();
  for (const p of pendingPayments) {
    for (const a of p.allocations || []) {
      const list = pendingByInvoice.get(a.invoice?.id || a.invoiceId) || [];
      list.push(p);
      pendingByInvoice.set(a.invoice?.id || a.invoiceId, list);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Invoices & Payments</h2>
        <p className="text-sm text-slate-600">
          Download GST invoices and submit full or partial payments for Owner verification.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Invoices ({invoices.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Invoice No</th>
                  <th className="px-5 py-3">Date / Due</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Paid</th>
                  <th className="px-5 py-3 text-right">Outstanding</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">No invoices issued yet.</td></tr>
                ) : (
                  invoices.map((inv) => {
                    const pendingForInv = pendingByInvoice.get(inv.id) || [];
                    const canPay = inv.status !== 'PAID' && inv.status !== 'VOID' && Number(inv.outstandingAmount) > 0;
                    return (
                      <tr key={inv.id}>
                        <td className="px-5 py-3.5">
                          <p className="font-mono font-semibold">{inv.invoiceNumber}</p>
                          {inv.order?.orderNumber && (
                            <p className="text-[11px] text-slate-500">Order {inv.order.orderNumber}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-600">
                          {new Date(inv.invoiceDate).toLocaleDateString('en-IN')} / Due{' '}
                          {new Date(inv.dueDate).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-5 py-3.5 text-right font-medium">{formatINR(inv.totalAmount)}</td>
                        <td className="px-5 py-3.5 text-right text-emerald-700">{formatINR(inv.paidAmount)}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-amber-700">
                          {formatINR(inv.outstandingAmount)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'VOID' ? 'danger' : 'warning'}>
                              {inv.status}
                            </Badge>
                            {pendingForInv.length > 0 && (
                              <span className="text-[11px] font-medium text-indigo-700">
                                {pendingForInv.length} payment pending verification
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            {canPay && (
                              <Button size="sm" onClick={() => openPayModal(inv)}>
                                <CreditCard className="h-3.5 w-3.5" /> Pay Now
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => downloadPdf(inv.id)}>
                              <Download className="h-3.5 w-3.5" /> PDF
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-lg overflow-y-auto">
            <CardHeader>
              <CardTitle>Submit Payment — {payingInvoice.invoiceNumber}</CardTitle>
              <p className="text-xs text-slate-600">
                Invoice Total: <span className="font-semibold">{formatINR(payingInvoice.totalAmount)}</span> • Already Paid:{' '}
                <span className="font-semibold text-emerald-700">{formatINR(payingInvoice.paidAmount)}</span> • Balance Due:{' '}
                <span className="font-semibold text-amber-700">{formatINR(payingInvoice.outstandingAmount)}</span>
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitDealerPayment} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Type *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handlePaymentTypeChange('FULL')}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                        !isEffectivelyPartial
                          ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-600'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Full Payment
                      <span className="block text-[11px] font-normal text-slate-500">
                        Pay full {formatINR(payingInvoice.outstandingAmount)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaymentTypeChange('PARTIAL')}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                        isEffectivelyPartial
                          ? 'border-amber-600 bg-amber-50 font-semibold text-amber-800 ring-1 ring-amber-600'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Partial Payment
                      <span className="block text-[11px] font-normal text-slate-500">
                        Pay part now & state balance plan
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Amount Paying Now (INR) *"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={outstandingNum}
                    required
                    value={payForm.amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = Number(val);
                      setPayForm((f) => ({
                        ...f,
                        amount: val,
                        paymentType: num > 0 && num < outstandingNum ? 'PARTIAL' : 'FULL',
                      }));
                    }}
                  />
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Payment Mode *</label>
                    <select
                      value={payForm.paymentMode}
                      onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value as any })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {Object.values(PaymentMode).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {isEffectivelyPartial && (
                  <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                      <span>Partial Payment Declaration Required</span>
                      <span>Remaining After Payment: {formatINR(remainingAfter)}</span>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-800">
                        State why you are paying partially / balance plan *
                      </label>
                      <textarea
                        required
                        rows={2}
                        placeholder="e.g., Paying 50% advance now via UPI; remaining balance will be cleared upon dispatch/delivery."
                        value={payForm.partialPaymentReason}
                        onChange={(e) => setPayForm({ ...payForm, partialPaymentReason: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <Input
                      label="Expected Date to Pay Remaining Balance"
                      type="date"
                      value={payForm.expectedBalanceDate}
                      onChange={(e) => setPayForm({ ...payForm, expectedBalanceDate: e.target.value })}
                    />
                  </div>
                )}

                <Input
                  label="Transaction Reference / UTR / Cheque No"
                  placeholder="e.g., UPI/432910991234 or NEFT Ref"
                  value={payForm.transactionRef}
                  onChange={(e) => setPayForm({ ...payForm, transactionRef: e.target.value })}
                />

                <Input
                  label="Additional Remarks (Optional)"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setPayingInvoice(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={submitting}>
                    {isEffectivelyPartial ? 'Submit Partial Payment' : 'Submit Full Payment'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

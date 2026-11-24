'use client';

import React, { useEffect, useState } from 'react';
import { formatINR } from '@erp/shared';
import { Download } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function DealerPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ data: any[] }>('/finance/payments?limit=50')
      .then((r) => setPayments(r.data))
      .finally(() => setLoading(false));
  }, []);

  const downloadReceipt = async (paymentId: string) => {
    const res = await apiRequest<{ url: string }>(`/documents/payments/${paymentId}/receipt-pdf`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Payments & Receipts</h2>
        <p className="text-sm text-slate-600">All verified payments recorded against your account.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Payment History ({payments.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Receipt No</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Mode / Ref</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : payments.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">No payments recorded yet.</td></tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3.5 font-mono font-semibold">{p.receiptNumber}</td>
                      <td className="px-5 py-3.5 text-xs">{new Date(p.paymentDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3.5 text-xs">{p.paymentMode} {p.transactionRef ? `• ${p.transactionRef}` : ''}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-emerald-700">{formatINR(p.amount)}</td>
                      <td className="px-5 py-3.5"><Badge variant={p.verificationStatus === 'REVERSED' ? 'danger' : 'success'}>{p.verificationStatus}</Badge></td>
                      <td className="px-5 py-3.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => downloadReceipt(p.id)}>
                          <Download className="h-3.5 w-3.5" /> Receipt
                        </Button>
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
  );
}

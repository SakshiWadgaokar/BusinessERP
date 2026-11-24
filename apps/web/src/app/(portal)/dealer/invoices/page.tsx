'use client';

import React, { useEffect, useState } from 'react';
import { formatINR } from '@erp/shared';
import { Download } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function DealerInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ data: any[] }>('/finance/invoices?limit=50')
      .then((r) => setInvoices(r.data))
      .finally(() => setLoading(false));
  }, []);

  const downloadPdf = async (invoiceId: string) => {
    const res = await apiRequest<{ url: string }>(`/documents/invoices/${invoiceId}/pdf`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Invoices</h2>
        <p className="text-sm text-slate-600">View and securely download your verified sales invoices.</p>
      </div>
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
                  <th className="px-5 py-3 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">No invoices issued yet.</td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-3.5 font-mono font-semibold">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {new Date(inv.invoiceDate).toLocaleDateString('en-IN')} / Due {new Date(inv.dueDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatINR(inv.totalAmount)}</td>
                      <td className="px-5 py-3.5 text-right text-emerald-700">{formatINR(inv.paidAmount)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-amber-700">{formatINR(inv.outstandingAmount)}</td>
                      <td className="px-5 py-3.5"><Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>{inv.status}</Badge></td>
                      <td className="px-5 py-3.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(inv.id)}>
                          <Download className="h-3.5 w-3.5" /> PDF
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

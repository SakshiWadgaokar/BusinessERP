'use client';

import React, { useEffect, useState } from 'react';
import { formatINR } from '@erp/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DealerPurchasesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.dealer?.id) return;
    apiRequest<{ data: any[] }>(`/dealers/${user.dealer.id}/purchases?limit=50`)
      .then((r) => setRows(r.data))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Purchase History</h2>
        <p className="text-sm text-slate-600">Itemized record of all dispatched purchases, invoices, and payment status.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Purchases ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Date / Invoice</th>
                  <th className="px-5 py-3">Order / Source</th>
                  <th className="px-5 py-3">Products</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Outstanding</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">No purchase history yet.</td></tr>
                ) : (
                  rows.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-3.5">
                        <p className="font-mono font-semibold">{inv.invoiceNumber}</p>
                        <p className="text-xs text-slate-500">{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <p>{inv.order?.orderNumber || '-'}</p>
                        <p className="text-slate-500">{inv.dispatch?.sourceLocation?.name || '-'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {inv.items.map((i: any) => (
                          <div key={i.id}>{i.item.name}: {Number(i.quantity)} {i.item.uom.code} @ {formatINR(i.unitRate)}</div>
                        ))}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatINR(inv.totalAmount)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-amber-700">{formatINR(inv.outstandingAmount)}</td>
                      <td className="px-5 py-3.5"><Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>{inv.status}</Badge></td>
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

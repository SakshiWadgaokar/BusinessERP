'use client';

import React, { useEffect, useState } from 'react';
import { formatINR } from '@erp/shared';
import { apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DealerOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ data: any[] }>('/orders?limit=50')
      .then((r) => setOrders(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Orders</h2>
        <p className="text-sm text-slate-600">Track approval, dispatch, and delivery status of your orders.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Order History ({orders.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Order No</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">No orders placed yet.</td></tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-5 py-3.5 font-mono font-semibold">{o.orderNumber}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">{new Date(o.orderDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3.5 text-xs">
                        {o.items.map((i: any) => (
                          <div key={i.id}>{i.item.name} × {Number(i.orderedQuantity)}</div>
                        ))}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">{formatINR(o.totalAmount)}</td>
                      <td className="px-5 py-3.5"><Badge variant="info">{o.status}</Badge></td>
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

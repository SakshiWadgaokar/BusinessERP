'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, formatINR } from '@erp/shared';
import { Check, Truck, X } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function OrdersAdminPage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '50', ...(statusFilter ? { status: statusFilter } : {}) });
      const [ordRes, locRes] = await Promise.all([
        apiRequest<{ data: any[] }>(`/orders?${qs}`),
        apiRequest<any[]>('/inventory/locations'),
      ]);
      setOrders(ordRes.data);
      setLocations(locRes);
      if (!selectedLocation && locRes.length > 0) setSelectedLocation(locRes[0].id);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedLocation]);

  useEffect(() => {
    void load();
  }, [load]);

  const approveOrder = async (order: any) => {
    setFeedback(null);
    if (!selectedLocation) return;
    try {
      await apiRequest(`/orders/${order.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          sourceLocationId: selectedLocation,
          overrideCreditLimit: Boolean(order.creditLimitExceeded),
        }),
      });
      setFeedback(`Order ${order.orderNumber} approved and stock reserved.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Approval failed.');
    }
  };

  const rejectOrder = async (order: any) => {
    const reason = window.prompt(`Enter rejection reason for ${order.orderNumber}:`);
    if (!reason) return;
    await apiRequest(`/orders/${order.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    await load();
  };

  const dispatchOrder = async (order: any) => {
    if (!selectedLocation) return;
    if (!window.confirm(`Dispatch remaining items for ${order.orderNumber} and generate Sales Invoice?`)) return;
    setFeedback(null);
    try {
      const items = order.items
        .map((oi: any) => {
          const rem = Number(oi.orderedQuantity) - Number(oi.dispatchedQuantity);
          return rem > 0 ? { orderItemId: oi.id, quantity: String(rem) } : null;
        })
        .filter(Boolean);
      const res = await apiRequest<any>(`/orders/${order.id}/dispatches`, {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          sourceLocationId: selectedLocation,
          generateInvoice: true,
          items,
        }),
      });
      setFeedback(
        `Dispatched ${res.dispatch.dispatchNumber}${res.invoice ? ` — Invoice ${res.invoice.invoiceNumber} created.` : ''}`,
      );
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Dispatch failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dealer Order Workflow</h2>
          <p className="text-sm text-slate-600">
            Approve dealer orders (reserves stock) and execute dispatches (deducts stock & issues invoice).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                Warehouse: {l.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="PARTIALLY_DISPATCHED">Partially Dispatched</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="DELIVERED">Delivered</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          {feedback}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Orders ({orders.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Order No</th>
                  <th className="px-5 py-3">Dealer</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Workflow Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">Loading orders...</td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No orders found.</td></tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <p className="font-mono font-semibold text-slate-900">{o.orderNumber}</p>
                        <p className="text-xs text-slate-500">{new Date(o.orderDate).toLocaleDateString('en-IN')}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">{o.dealer.businessName}</p>
                        {o.creditLimitExceeded && <Badge variant="warning">Credit Limit Exceeded</Badge>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {o.items.map((i: any) => (
                          <div key={i.id}>
                            {i.item.name}: {Number(i.orderedQuantity)} {i.item.uom.code}
                          </div>
                        ))}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">{formatINR(o.totalAmount)}</td>
                      <td className="px-5 py-3.5">
                        <Badge
                          variant={
                            o.status === 'DISPATCHED' || o.status === 'DELIVERED'
                              ? 'success'
                              : o.status === 'REJECTED' || o.status === 'CANCELLED'
                                ? 'danger'
                                : 'info'
                          }
                        >
                          {o.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          {can(PERMISSIONS.ORDERS_APPROVE) &&
                            ['SUBMITTED', 'PENDING_APPROVAL'].includes(o.status) && (
                              <>
                                <Button size="sm" onClick={() => approveOrder(o)}>
                                  <Check className="h-3.5 w-3.5" /> Approve
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => rejectOrder(o)}>
                                  <X className="h-3.5 w-3.5" /> Reject
                                </Button>
                              </>
                            )}
                          {can(PERMISSIONS.DISPATCHES_CREATE) &&
                            ['APPROVED', 'PROCESSING', 'READY_FOR_DISPATCH', 'PARTIALLY_DISPATCHED'].includes(o.status) && (
                              <Button size="sm" variant="secondary" onClick={() => dispatchOrder(o)}>
                                <Truck className="h-3.5 w-3.5" /> Dispatch & Invoice
                              </Button>
                            )}
                        </div>
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

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, formatINR } from '@erp/shared';
import { Plus, Search } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DealersAdminPage() {
  const { can } = useAuth();
  const [dealers, setDealers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    dealerName: '',
    businessName: '',
    contactPerson: '',
    mobile: '',
    email: '',
    gstin: '',
    paymentTermsDays: '30',
    creditLimit: '50000.00',
    openingBalance: '0.00',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    portalPassword: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '50', ...(search ? { search } : {}) });
      const res = await apiRequest<{ data: any[] }>(`/dealers?${qs}`);
      setDealers(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dealers');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/dealers', {
        method: 'POST',
        body: JSON.stringify({
          dealerName: form.dealerName,
          businessName: form.businessName,
          contactPerson: form.contactPerson,
          mobile: form.mobile,
          email: form.email,
          gstin: form.gstin || null,
          paymentTermsDays: Number(form.paymentTermsDays),
          creditLimit: form.creditLimit,
          openingBalance: form.openingBalance,
          address: {
            addressLine1: form.addressLine1,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
          },
          createPortalLogin: Boolean(form.portalPassword),
          portalPassword: form.portalPassword || undefined,
        }),
      });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create dealer');
    }
  };

  const toggleStatus = async (dealer: any) => {
    const nextStatus = dealer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(`Set ${dealer.businessName} status to ${nextStatus}?`)) return;
    await apiRequest(`/dealers/${dealer.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dealer Management</h2>
          <p className="text-sm text-slate-600">
            Manage registered dealers, credit limits, portal logins, and live outstanding balances.
          </p>
        </div>
        {can(PERMISSIONS.DEALERS_WRITE) && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add Dealer
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Dealers ({dealers.length})</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, business, contact..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Dealer</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3 text-right">Credit Limit</th>
                  <th className="px-5 py-3 text-right">Outstanding</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">Loading dealers...</td></tr>
                ) : dealers.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No dealers registered yet.</td></tr>
                ) : (
                  dealers.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{d.businessName}</p>
                        <p className="text-xs text-slate-500">{d.dealerCode} • {d.dealerName}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <p>{d.contactPerson}</p>
                        <p>{d.mobile} • {d.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatINR(d.creditLimit)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-amber-700">
                        {formatINR(d.outstandingBalance)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={d.status === 'ACTIVE' ? 'success' : 'danger'}>{d.status}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {can(PERMISSIONS.DEALERS_WRITE) && (
                          <Button size="sm" variant="outline" onClick={() => toggleStatus(d)}>
                            {d.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader><CardTitle>Register New Dealer</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
                <Input label="Dealer Name" required value={form.dealerName} onChange={(e) => setForm({ ...form, dealerName: e.target.value })} />
                <Input label="Business Name" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
                <Input label="Contact Person" required value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                <Input label="Mobile" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                <Input label="Email (Portal Login)" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input label="GSTIN (Optional)" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
                <Input label="Credit Limit (INR)" required value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
                <Input label="Opening Balance (INR)" required value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
                <Input label="Address Line 1" required value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
                <Input label="City" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <Input label="State" required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                <Input label="Postal Code" required value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input
                    label="Dealer Portal Password (Optional — creates login)"
                    type="password"
                    hint="Min 10 chars with uppercase, lowercase, digit & symbol"
                    value={form.portalPassword}
                    onChange={(e) => setForm({ ...form, portalPassword: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Register Dealer</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

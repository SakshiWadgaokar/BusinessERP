'use client';

import React, { useEffect, useState } from 'react';
import { PERMISSIONS } from '@erp/shared';
import { Plus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SuppliersPage() {
  const { can } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', mobile: '', email: '', address: '', gstin: '', paymentTermsDays: '30' });

  const load = async () => {
    const res = await apiRequest<{ data: any[] }>('/purchasing/suppliers?limit=100');
    setSuppliers(res.data);
  };

  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/purchasing/suppliers', {
        method: 'POST',
        body: JSON.stringify({ ...form, paymentTermsDays: Number(form.paymentTermsDays) }),
      });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add supplier.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Supplier Management</h2>
          <p className="text-sm text-slate-600">Traceable raw material suppliers, terms, and purchase order history.</p>
        </div>
        {can(PERMISSIONS.SUPPLIERS_MANAGE) && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Supplier</Button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader><CardTitle>Registered Suppliers ({suppliers.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">GSTIN</th>
                <th className="px-5 py-3">Terms</th>
                <th className="px-5 py-3 text-right">POs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="font-mono text-xs text-slate-500">{s.supplierCode}</p>
                  </td>
                  <td className="px-5 py-3.5 text-xs">{s.contactPerson} • {s.mobile}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">{s.gstin || '-'}</td>
                  <td className="px-5 py-3.5 text-xs">Net {s.paymentTermsDays} Days</td>
                  <td className="px-5 py-3.5 text-right font-medium">{s._count.purchaseOrders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader><CardTitle>Register Supplier</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
                <Input label="Supplier Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input label="Contact Person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                <Input label="Mobile" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input label="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
                <Input label="Payment Terms (Days)" type="number" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Save Supplier</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS } from '@erp/shared';
import { Plus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function EmployeesAdminPage() {
  const { can } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    mobile: '',
    email: '',
    designation: 'Factory Operator',
    department: 'Production',
    joiningDate: new Date().toISOString().slice(0, 10),
    assignedLocationId: '',
    hourlyLaborRate: '100.00',
    portalPassword: '',
  });

  const load = useCallback(async () => {
    const [eRes, lRes] = await Promise.all([
      apiRequest<{ data: any[] }>('/employees?limit=100'),
      apiRequest<any[]>('/inventory/locations'),
    ]);
    setEmployees(eRes.data);
    setLocations(lRes);
    if (!form.assignedLocationId && lRes.length > 0) {
      const factory = lRes.find((l) => l.locationType === 'FACTORY') || lRes[0];
      setForm((f) => ({ ...f, assignedLocationId: factory.id }));
    }
  }, [form.assignedLocationId]);

  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/employees', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          createPortalLogin: Boolean(form.portalPassword),
          portalPassword: form.portalPassword || undefined,
        }),
      });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add employee.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Employee & Factory Staff</h2>
          <p className="text-sm text-slate-600">Manage factory operators, supervisors, labor rates, and Job Card assignments.</p>
        </div>
        {can(PERMISSIONS.EMPLOYEES_MANAGE) && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Employee</Button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader><CardTitle>Employees ({employees.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Designation / Dept</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3 text-right">Job Cards</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900">{e.fullName}</p>
                    <p className="text-xs text-slate-500">{e.employeeCode} • {e.email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-xs">{e.designation} • {e.department}</td>
                  <td className="px-5 py-3.5 text-xs">{e.assignedLocation?.name || '-'}</td>
                  <td className="px-5 py-3.5 text-right font-medium">{e._count.jobCardAssignments}</td>
                  <td className="px-5 py-3.5"><Badge variant={e.status === 'ACTIVE' ? 'success' : 'danger'}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader><CardTitle>Add Factory Employee</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
                <Input label="Full Name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                <Input label="Mobile" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input label="Joining Date" type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
                <Input label="Designation" required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                <Input label="Department" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                <div>
                  <label className="block text-sm font-medium text-slate-700">Assigned Location</label>
                  <select value={form.assignedLocationId} onChange={(e) => setForm({ ...form, assignedLocationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <Input label="Hourly Labor Rate (INR)" value={form.hourlyLaborRate} onChange={(e) => setForm({ ...form, hourlyLaborRate: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input label="Employee Portal Password (Optional)" type="password" value={form.portalPassword} onChange={(e) => setForm({ ...form, portalPassword: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Add Employee</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

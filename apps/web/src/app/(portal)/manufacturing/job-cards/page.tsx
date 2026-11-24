'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, formatINR } from '@erp/shared';
import { Lock, Plus, Unlock } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function JobCardsPage() {
  const { can } = useAuth();
  const [cards, setCards] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    finishedProductId: '',
    targetQuantity: '10',
    locationId: '',
    employeeId: '',
    rawMaterialId: '',
    requiredQuantity: '20',
    notes: '',
  });

  const load = useCallback(async () => {
    const [jcRes, itemRes, empRes, locRes] = await Promise.all([
      apiRequest<{ data: any[] }>('/job-cards?limit=50'),
      apiRequest<{ data: any[] }>('/inventory/items?limit=100'),
      apiRequest<{ data: any[] }>('/employees?limit=100').catch(() => ({ data: [] })),
      apiRequest<any[]>('/inventory/locations'),
    ]);
    setCards(jcRes.data);
    setItems(itemRes.data);
    setEmployees(empRes.data);
    setLocations(locRes);

    const fg = itemRes.data.find((i) => i.itemType === 'FINISHED_GOOD') || itemRes.data[0];
    const rm = itemRes.data.find((i) => i.itemType === 'RAW_MATERIAL') || itemRes.data[0];
    const fac = locRes.find((l) => l.locationType === 'FACTORY') || locRes[0];
    setForm((f) => ({
      ...f,
      finishedProductId: f.finishedProductId || fg?.id || '',
      rawMaterialId: f.rawMaterialId || rm?.id || '',
      locationId: f.locationId || fac?.id || '',
      employeeId: f.employeeId || empRes.data[0]?.id || '',
    }));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createJobCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<any>('/job-cards', {
        method: 'POST',
        body: JSON.stringify({
          finishedProductId: form.finishedProductId,
          targetQuantity: form.targetQuantity,
          locationId: form.locationId,
          employeeIds: [form.employeeId],
          materials: [{ itemId: form.rawMaterialId, requiredQuantity: form.requiredQuantity }],
          notes: form.notes || null,
        }),
      });
      setShowCreate(false);
      setFeedback(`Job Card ${res.jobCardNumber} created and assigned.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Unable to create Job Card.');
    }
  };

  const quickIssue = async (jc: any) => {
    const mat = jc.plannedMaterials?.[0];
    const emp = jc.assignments?.[0]?.employee;
    const wh = locations.find((l) => l.locationType === 'MAIN_WAREHOUSE') || locations[0];
    if (!mat || !emp || !wh) return;
    const qty = window.prompt(`Issue quantity of ${mat.item.name} from ${wh.name} to ${emp.fullName}:`, String(mat.requiredQuantity));
    if (!qty) return;
    try {
      const res = await apiRequest<any>(`/job-cards/${jc.id}/issues`, {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ employeeId: emp.id, itemId: mat.item.id, sourceLocationId: wh.id, quantity: qty }),
      });
      setFeedback(`Issued ${qty} ${mat.item.uom.code}. Remaining warehouse balance: ${res.warehouseBalanceAfter}.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Material issue failed.');
    }
  };

  const closeCard = async (jc: any) => {
    if (!window.confirm(`Close Job Card ${jc.jobCardNumber}? Closed Job Cards cannot be silently edited.`)) return;
    await apiRequest(`/job-cards/${jc.id}/close`, { method: 'POST' });
    await load();
  };

  const reopenCard = async (jc: any) => {
    const reason = window.prompt(`Enter audit reason to reopen ${jc.jobCardNumber}:`);
    if (!reason) return;
    await apiRequest(`/job-cards/${jc.id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Job Cards, Production & Costing</h2>
          <p className="text-sm text-slate-600">
            Track material issues, actual consumption, returns, finished goods, and transparent unit costing.
          </p>
        </div>
        {can(PERMISSIONS.JOB_CARDS_CREATE) && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create Job Card</Button>
        )}
      </div>

      {feedback && <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{feedback}</div>}

      <Card>
        <CardHeader><CardTitle>Job Cards ({cards.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Job Card / Product</th>
                  <th className="px-5 py-3">Assigned</th>
                  <th className="px-5 py-3">Output / Target</th>
                  <th className="px-5 py-3 text-right">Cost / Unit</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.map((jc) => (
                  <tr key={jc.id}>
                    <td className="px-5 py-3.5">
                      <p className="font-mono font-semibold text-slate-900">{jc.jobCardNumber}</p>
                      <p className="text-xs text-slate-600">{jc.finishedProduct.name}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {jc.assignments.map((a: any) => a.employee.fullName).join(', ')}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <p className="font-semibold">{Number(jc.finishedQuantity)} / {Number(jc.targetQuantity)} {jc.finishedProduct.uom.code}</p>
                      <p className="text-slate-500">Scrap: {Number(jc.scrapQuantity)}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs">
                      <p className="font-semibold">{jc.costPerUnit ? formatINR(jc.costPerUnit) : 'Pending'}</p>
                      <p className={jc.costingComplete ? 'text-emerald-600' : 'text-amber-600'}>
                        {jc.costingComplete ? 'Complete' : 'Incomplete Cost'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={jc.status === 'CLOSED' ? 'success' : 'info'}>{jc.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {can(PERMISSIONS.INVENTORY_ISSUE) && jc.status !== 'CLOSED' && (
                          <Button size="sm" variant="outline" onClick={() => quickIssue(jc)}>Issue Mat</Button>
                        )}
                        {can(PERMISSIONS.JOB_CARDS_CLOSE) && jc.status !== 'CLOSED' && (
                          <Button size="sm" variant="secondary" onClick={() => closeCard(jc)}>
                            <Lock className="h-3.5 w-3.5" /> Close
                          </Button>
                        )}
                        {can(PERMISSIONS.JOB_CARDS_REOPEN) && jc.status === 'CLOSED' && (
                          <Button size="sm" variant="outline" onClick={() => reopenCard(jc)}>
                            <Unlock className="h-3.5 w-3.5" /> Reopen
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
            <CardHeader><CardTitle>Create Manufacturing Job Card</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createJobCard} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Finished Product *</label>
                  <select value={form.finishedProductId} onChange={(e) => setForm({ ...form, finishedProductId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name} ({i.itemType})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Target Production Qty" required value={form.targetQuantity} onChange={(e) => setForm({ ...form, targetQuantity: e.target.value })} />
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Factory Location *</label>
                    <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Assigned Employee *</label>
                  <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Primary Raw Material *</label>
                    <select value={form.rawMaterialId} onChange={(e) => setForm({ ...form, rawMaterialId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                    </select>
                  </div>
                  <Input label="Required Material Qty" required value={form.requiredQuantity} onChange={(e) => setForm({ ...form, requiredQuantity: e.target.value })} />
                </div>
                <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Create Job Card</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

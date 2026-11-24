'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, PaymentMode, formatINR } from '@erp/shared';
import { Plus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function FinanceExpensesPage() {
  const { can } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    categoryId: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: '',
    paymentMode: PaymentMode.BANK_TRANSFER,
    vendorName: '',
    referenceNo: '',
    description: '',
  });

  const load = useCallback(async () => {
    const [eRes, cRes] = await Promise.all([
      apiRequest<{ data: any[] }>('/finance/expenses?limit=50'),
      apiRequest<any[]>('/finance/expense-categories'),
    ]);
    setExpenses(eRes.data);
    setCategories(cRes);
    if (!form.categoryId && cRes.length > 0) setForm((f) => ({ ...f, categoryId: cRes[0].id }));
  }, [form.categoryId]);

  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/finance/expenses', { method: 'POST', body: JSON.stringify(form) });
      setShowCreate(false);
      setForm((f) => ({ ...f, amount: '', vendorName: '', referenceNo: '', description: '' }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to record expense.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Operating Expenses</h2>
          <p className="text-sm text-slate-600">Record business expenses to support accurate net profitability reporting.</p>
        </div>
        {can(PERMISSIONS.EXPENSES_MANAGE) && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Record Expense</Button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader><CardTitle>Recorded Expenses ({expenses.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-5 py-3">Expense No / Date</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Description / Vendor</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3">
                    <p className="font-mono text-xs font-semibold">{e.expenseNumber}</p>
                    <p className="text-xs text-slate-500">{new Date(e.expenseDate).toLocaleDateString('en-IN')}</p>
                  </td>
                  <td className="px-5 py-3"><Badge>{e.category.name}</Badge></td>
                  <td className="px-5 py-3 text-xs">{e.description}{e.vendorName ? ` (${e.vendorName})` : ''}</td>
                  <td className="px-5 py-3 text-xs">{e.paymentMode}</td>
                  <td className="px-5 py-3 text-right font-semibold">{formatINR(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader><CardTitle>Record Business Expense</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={create} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Category *</label>
                  <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Date" type="date" required value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
                  <Input label="Amount (INR)" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Payment Mode *</label>
                    <select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value as any })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      {Object.values(PaymentMode).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <Input label="Vendor Name" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
                </div>
                <Input label="Description" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Save Expense</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

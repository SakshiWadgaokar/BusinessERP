'use client';

import React, { useEffect, useState } from 'react';
import { PERMISSIONS, StockLocationType } from '@erp/shared';
import { Plus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function WarehousesPage() {
  const { can } = useAuth();
  const [locations, setLocations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', locationType: StockLocationType.WAREHOUSE, address: '' });

  const load = async () => {
    const res = await apiRequest<any[]>('/inventory/locations');
    setLocations(res);
  };

  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/inventory/locations', { method: 'POST', body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({ code: '', name: '', locationType: StockLocationType.WAREHOUSE, address: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add location.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Warehouses & Stock Locations</h2>
          <p className="text-sm text-slate-600">Add and manage Main Warehouse, Factory Floors, additional warehouses, and Scrap Storage Areas.</p>
        </div>
        {can(PERMISSIONS.LOCATIONS_MANAGE) && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Location</Button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <Card key={loc.id}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-slate-500">{loc.code}</span>
                <Badge variant="info">{loc.locationType.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-900">{loc.name}</p>
              <p className="mt-1 text-xs text-slate-500">{loc.address || 'No address specified'}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>Add Stock Location</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={create} className="space-y-4">
                <Input label="Location Code" required placeholder="WH-NORTH" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                <Input label="Location Name" required placeholder="North Distribution Warehouse" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div>
                  <label className="block text-sm font-medium text-slate-700">Type *</label>
                  <select value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value as any })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {Object.values(StockLocationType).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <Input label="Address (Optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit">Save Location</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

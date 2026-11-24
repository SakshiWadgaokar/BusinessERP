'use client';

import React, { useEffect, useState } from 'react';
import { PERMISSIONS } from '@erp/shared';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsAdminPage() {
  const { can } = useAuth();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Record<string, any>>('/settings')
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiRequest<Record<string, any>>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          businessName: settings.businessName,
          businessAddress: settings.businessAddress,
          businessPhone: settings.businessPhone,
          businessEmail: settings.businessEmail,
          gstEnabled: Boolean(settings.gstEnabled),
          gstin: settings.gstin || null,
          costingMethod: settings.costingMethod,
          creditLimitMode: settings.creditLimitMode,
          allowBackorders: Boolean(settings.allowBackorders),
          defaultPaymentTermsDays: Number(settings.defaultPaymentTermsDays ?? 30),
        }),
      });
      setSettings(updated);
      setMessage('Business settings updated and audit logged.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500">Loading business settings...</div>;

  const editable = can(PERMISSIONS.SETTINGS_MANAGE);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Business & ERP Configuration</h2>
        <p className="text-sm text-slate-600">
          Configure company details, optional GST mode, costing policy, and order credit rules.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {message && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            {message}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Company Profile (Printed on Invoices & Receipts)</CardTitle>
            <CardDescription>Displayed on generated PDF invoices, receipts, and delivery challans.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Business Name"
              disabled={!editable}
              value={settings.businessName || ''}
              onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
            />
            <Input
              label="GSTIN (Optional)"
              disabled={!editable}
              value={settings.gstin || ''}
              onChange={(e) => setSettings({ ...settings, gstin: e.target.value })}
            />
            <Input
              label="Business Phone"
              disabled={!editable}
              value={settings.businessPhone || ''}
              onChange={(e) => setSettings({ ...settings, businessPhone: e.target.value })}
            />
            <Input
              label="Business Email"
              type="email"
              disabled={!editable}
              value={settings.businessEmail || ''}
              onChange={(e) => setSettings({ ...settings, businessEmail: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Business Address"
                disabled={!editable}
                value={settings.businessAddress || ''}
                onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounting, Inventory & Order Policies</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Inventory Costing Method</label>
              <select
                disabled={!editable}
                value={settings.costingMethod || 'WEIGHTED_AVERAGE'}
                onChange={(e) => setSettings({ ...settings, costingMethod: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="WEIGHTED_AVERAGE">Weighted Average Cost (WAC)</option>
                <option value="FIFO">First-In First-Out (FIFO)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Credit Limit Enforcement</label>
              <select
                disabled={!editable}
                value={settings.creditLimitMode || 'SOFT_BLOCK'}
                onChange={(e) => setSettings({ ...settings, creditLimitMode: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="SOFT_BLOCK">Soft Block (Flag for Admin Override)</option>
                <option value="HARD_BLOCK">Hard Block (Reject Over-Limit Orders)</option>
              </select>
            </div>

            <Input
              label="Default Payment Terms (Days)"
              type="number"
              min={0}
              max={365}
              disabled={!editable}
              value={settings.defaultPaymentTermsDays ?? 30}
              onChange={(e) =>
                setSettings({ ...settings, defaultPaymentTermsDays: Number(e.target.value) })
              }
            />

            <div className="flex flex-col justify-center gap-3 pt-4">
              <label className="flex items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={Boolean(settings.gstEnabled)}
                  onChange={(e) => setSettings({ ...settings, gstEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                Enable GST tax calculation on invoices
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={Boolean(settings.allowBackorders)}
                  onChange={(e) => setSettings({ ...settings, allowBackorders: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                Allow dealer backorders when stock is insufficient
              </label>
            </div>
          </CardContent>
        </Card>

        {editable && (
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Save Settings
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

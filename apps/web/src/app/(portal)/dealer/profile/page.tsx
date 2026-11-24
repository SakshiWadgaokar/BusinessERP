'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DealerProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<any>('/dealers/me').then((d) => {
      setProfile(d);
      setContactPerson(d.contactPerson || '');
      setMobile(d.mobile || '');
      setNotes(d.notes || '');
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiRequest('/dealers/me', {
        method: 'PATCH',
        body: JSON.stringify({ contactPerson, mobile, notes }),
      });
      setProfile(updated);
      setMessage('Profile updated.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <p className="text-sm text-slate-500">Loading profile...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Dealer Profile</h2>
        <p className="text-sm text-slate-600">
          Contact details may be updated here. Financial terms and balances are managed by administration.
        </p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{profile.businessName} ({profile.dealerCode})</CardTitle>
          <CardDescription>Payment Terms: {profile.paymentTermsLabel} • Status: {profile.status}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            {message && <div className="rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-800">{message}</div>}
            <Input label="Contact Person" required value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            <Input label="Mobile Number" required value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <Input label="Notes / Delivery Preferences" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button type="submit" loading={saving}>Update Contact Info</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

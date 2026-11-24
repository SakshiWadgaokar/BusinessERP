'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function EmployeeWorkHistoryPage() {
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    apiRequest('/employees/me/dashboard').then(setSummary);
  }, []);

  if (!summary) return <p className="text-sm text-slate-500">Loading work history...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Work History</h2>
        <p className="text-sm text-slate-600">Chronological activity log of issued materials, production updates, and job cards.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0">
          {summary.recentActivity.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No recorded activities yet.</p>
          ) : (
            summary.recentActivity.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                <div>
                  <Badge>{a.activityType}</Badge>
                  <p className="mt-1 text-slate-800">{a.summary}</p>
                </div>
                <span className="text-xs text-slate-500">{new Date(a.occurredAt).toLocaleString('en-IN')}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

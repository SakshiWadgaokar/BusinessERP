'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiRequest, getAccessToken } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const REPORT_TYPES = [
  { id: 'sales', label: 'Sales & Invoices' },
  { id: 'payments', label: 'Payment Collections' },
  { id: 'inventory', label: 'Current Stock & Valuation' },
  { id: 'manufacturing', label: 'Manufacturing & Costing' },
  { id: 'scrap', label: 'Scrap & Waste Valuation' },
];

export default function ReportsHubPage() {
  const [type, setType] = useState('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [report, setReport] = useState<{ title: string; columns: string[]; rows: string[][] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
      const res = await apiRequest<any>(`/reports/${type}?${qs}`);
      setReport(res);
    } finally {
      setLoading(false);
    }
  }, [type, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  const exportFile = async (format: 'csv' | 'xlsx' | 'pdf') => {
    const qs = new URLSearchParams({
      format,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
    const token = getAccessToken();
    const res = await fetch(`/api/v1/reports/${type}/export?${qs}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reports & Exports</h2>
          <p className="text-sm text-slate-600">Live PostgreSQL-backed reports with PDF, Excel (.xlsx), and CSV export.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => exportFile('csv')}><Download className="h-3.5 w-3.5" /> CSV</Button>
          <Button size="sm" variant="outline" onClick={() => exportFile('xlsx')}><Download className="h-3.5 w-3.5" /> Excel</Button>
          <Button size="sm" onClick={() => exportFile('pdf')}><Download className="h-3.5 w-3.5" /> PDF</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {REPORT_TYPES.map((rt) => (
          <Button key={rt.id} size="sm" variant={type === rt.id ? 'primary' : 'outline'} onClick={() => setType(rt.id)}>
            {rt.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
          <span className="text-xs text-slate-500">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{report?.title || 'Report'}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-50 uppercase text-slate-600">
                <tr>
                  {report?.columns.map((col, idx) => (
                    <th key={idx} className="whitespace-nowrap px-4 py-3">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={report?.columns.length || 1} className="p-8 text-center text-slate-500">Generating live report...</td></tr>
                ) : !report?.rows.length ? (
                  <tr><td colSpan={report?.columns.length || 1} className="p-8 text-center text-slate-500">No matching records for the selected filters.</td></tr>
                ) : (
                  report.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="whitespace-nowrap px-4 py-2.5 text-slate-800">{cell}</td>
                      ))}
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

'use client';

import React, { useEffect, useState } from 'react';
import { formatINR } from '@erp/shared';
import { apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function FinanceDealerLedgerPage() {
  const [dealers, setDealers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [ledger, setLedger] = useState<any>(null);

  useEffect(() => {
    apiRequest<{ data: any[] }>('/dealers?limit=100').then((r) => {
      setDealers(r.data);
      if (r.data.length > 0) setSelectedId(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    apiRequest(`/finance/ledger/${selectedId}?limit=100`).then(setLedger);
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dealer Ledger Statements</h2>
          <p className="text-sm text-slate-600">Append-only chronological debit/credit ledger per dealer.</p>
        </div>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.businessName} ({d.dealerCode}) — Out: {formatINR(d.outstandingBalance)}
            </option>
          ))}
        </select>
      </div>

      {ledger && (
        <Card>
          <CardHeader>
            <CardTitle>
              {ledger.dealer.businessName} — Outstanding: {formatINR(ledger.dealer.outstandingBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3 text-right">Debit</th>
                  <th className="px-5 py-3 text-right">Credit</th>
                  <th className="px-5 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.data.map((e: any) => (
                  <tr key={e.id}>
                    <td className="px-5 py-3 text-xs">{new Date(e.entryDate).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-3"><Badge>{e.entryType}</Badge></td>
                    <td className="px-5 py-3 text-xs">{e.description}</td>
                    <td className="px-5 py-3 text-right">{Number(e.debitAmount) > 0 ? formatINR(e.debitAmount) : '-'}</td>
                    <td className="px-5 py-3 text-right text-emerald-700">{Number(e.creditAmount) > 0 ? formatINR(e.creditAmount) : '-'}</td>
                    <td className="px-5 py-3 text-right font-semibold">{formatINR(e.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

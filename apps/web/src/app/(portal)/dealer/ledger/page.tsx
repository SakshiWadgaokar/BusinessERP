'use client';

import React, { useEffect, useState } from 'react';
import { formatINR } from '@erp/shared';
import { apiRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DealerLedgerPage() {
  const [ledger, setLedger] = useState<any>(null);

  useEffect(() => {
    apiRequest('/finance/ledger/me?limit=100').then(setLedger);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Outstanding Balance & Statement</h2>
        <p className="text-sm text-slate-600">Read-only ledger maintained by the accounting department.</p>
      </div>
      {ledger && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Opening Balance</p><p className="mt-1 text-xl font-bold">{formatINR(ledger.dealer.openingBalance)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Current Outstanding</p><p className="mt-1 text-xl font-bold text-amber-700">{formatINR(ledger.dealer.outstandingBalance)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Credit Limit</p><p className="mt-1 text-xl font-bold text-slate-900">{formatINR(ledger.dealer.creditLimit)}</p></CardContent></Card>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Ledger Entries</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type / Ref</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3 text-right">Debit</th>
                  <th className="px-5 py-3 text-right">Credit</th>
                  <th className="px-5 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!ledger?.data?.length ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">No ledger entries recorded.</td></tr>
                ) : (
                  ledger.data.map((e: any) => (
                    <tr key={e.id}>
                      <td className="px-5 py-3 text-xs text-slate-600">{new Date(e.entryDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3"><Badge>{e.entryType}</Badge></td>
                      <td className="px-5 py-3 text-xs text-slate-700">{e.description}</td>
                      <td className="px-5 py-3 text-right">{Number(e.debitAmount) > 0 ? formatINR(e.debitAmount) : '-'}</td>
                      <td className="px-5 py-3 text-right text-emerald-700">{Number(e.creditAmount) > 0 ? formatINR(e.creditAmount) : '-'}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatINR(e.runningBalance)}</td>
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

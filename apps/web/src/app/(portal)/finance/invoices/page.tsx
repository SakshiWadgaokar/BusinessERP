'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Search } from 'lucide-react';
import { apiRequest, getAccessToken } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function FinanceInvoicesPage() {
  const [register, setRegister] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        ...(search ? { search } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
      const res = await apiRequest(`/reports/sales-register?${qs}`);
      setRegister(res);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  const openBillPdf = async (invoiceId: string) => {
    const res = await apiRequest<{ url: string }>(`/documents/invoices/${invoiceId}/pdf`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  const exportRegister = async (format: 'pdf' | 'xlsx') => {
    const qs = new URLSearchParams({
      format,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
    const token = getAccessToken();
    const res = await fetch(`/api/v1/reports/sales-register/export?${qs}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-register.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-[#1b2a4a]">
            {register?.businessName || 'Business ERP'} — Sales Register & Bills
          </h2>
          <p className="text-xs text-slate-500">
            Generated: {register?.generatedAt || '-'} • Retail & Wholesale GST Bill Format
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => exportRegister('xlsx')}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
          </Button>
          <Button size="sm" onClick={() => exportRegister('pdf')}>
            <Download className="h-3.5 w-3.5" /> Export Register PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Bills & Tax Register ({register?.grandTotal?.invoiceCount || 0} invoices)</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
            <div className="relative w-60">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice or customer..."
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#1b2a4a] text-white">
                  <th className="border border-slate-600 px-2 py-2 text-center">Sr</th>
                  <th className="border border-slate-600 px-2 py-2 text-left">Sale Type</th>
                  <th className="border border-slate-600 px-2 py-2 text-left">Invoice No</th>
                  <th className="border border-slate-600 px-2 py-2 text-left">Date</th>
                  <th className="border border-slate-600 px-2 py-2 text-left">Customer</th>
                  <th className="border border-slate-600 px-2 py-2 text-left">Product Name</th>
                  <th className="border border-slate-600 px-2 py-2 text-left">HSN</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">Qty</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">Rate</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">Taxable</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">CGST %</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">CGST</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">SGST %</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">SGST</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">IGST %</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">IGST</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">Item Total</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">Grand Total</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">Paid</th>
                  <th className="border border-slate-600 px-2 py-2 text-center">Payment Type</th>
                  <th className="border border-slate-600 px-2 py-2 text-right">Outstanding</th>
                  <th className="border border-slate-600 px-2 py-2 text-center">Status</th>
                  <th className="border border-slate-600 px-2 py-2 text-center">Bill</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={23} className="p-8 text-center text-slate-500">
                      Loading sales register...
                    </td>
                  </tr>
                ) : !register?.rows?.length ? (
                  <tr>
                    <td colSpan={23} className="p-8 text-center text-slate-500">
                      No invoices issued yet.
                    </td>
                  </tr>
                ) : (
                  <>
                    {register.rows.map((row: any, rIdx: number) => {
                      const span = Math.max(1, row.lines.length);
                      const bg = rIdx % 2 === 1 ? 'bg-[#eef3f8]' : 'bg-white';
                      return row.lines.map((l: any, lIdx: number) => (
                        <tr key={`${row.invoiceId}-${lIdx}`} className={bg}>
                          {lIdx === 0 && (
                            <>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5 text-center">{row.sr}</td>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5">{row.saleType}</td>
                              <td rowSpan={span} className="whitespace-nowrap border border-slate-300 px-2 py-1.5 font-mono font-semibold">{row.invoiceNo}</td>
                              <td rowSpan={span} className="whitespace-nowrap border border-slate-300 px-2 py-1.5">{row.date}</td>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5">{row.customer}</td>
                            </>
                          )}
                          <td className="border border-slate-300 px-2 py-1.5">{l.productName}</td>
                          <td className="border border-slate-300 px-2 py-1.5 font-mono">{l.hsn}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.qty}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.rate}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.taxable}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.cgstPct}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.cgst}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.sgstPct}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.sgst}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.igstPct}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right">{l.igst}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right font-medium">{l.itemTotal}</td>
                          {lIdx === 0 && (
                            <>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5 text-right font-semibold">{row.grandTotal}</td>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5 text-right">{row.paid}</td>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5 text-center">{row.paymentType}</td>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5 text-right">{row.outstanding}</td>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5 text-center font-semibold">{row.status}</td>
                              <td rowSpan={span} className="border border-slate-300 px-2 py-1.5 text-center">
                                <button
                                  onClick={() => openBillPdf(row.invoiceId)}
                                  className="rounded bg-[#1b2a4a] px-2 py-1 text-[10px] font-medium text-white hover:bg-slate-700"
                                >
                                  PDF
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ));
                    })}

                    {register.subtotals.map((sub: any) => (
                      <tr key={sub.saleType} className="bg-[#e8eff7] font-semibold">
                        <td colSpan={9} className="border border-slate-400 px-2 py-2">
                          {sub.saleType} subtotal - {sub.invoiceCount} invoice(s)
                        </td>
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.taxable}</td>
                        <td className="border border-slate-400 px-2 py-2" />
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.cgst}</td>
                        <td className="border border-slate-400 px-2 py-2" />
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.sgst}</td>
                        <td className="border border-slate-400 px-2 py-2" />
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.igst}</td>
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.itemTotal}</td>
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.grandTotal}</td>
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.paid}</td>
                        <td className="border border-slate-400 px-2 py-2" />
                        <td className="border border-slate-400 px-2 py-2 text-right">{sub.outstanding}</td>
                        <td colSpan={2} className="border border-slate-400 px-2 py-2" />
                      </tr>
                    ))}

                    <tr className="bg-[#dbe6f4] font-bold text-slate-950">
                      <td colSpan={9} className="border border-slate-400 px-2 py-2">
                        GRAND TOTAL - {register.grandTotal.invoiceCount} invoice(s)
                      </td>
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.taxable}</td>
                      <td className="border border-slate-400 px-2 py-2" />
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.cgst}</td>
                      <td className="border border-slate-400 px-2 py-2" />
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.sgst}</td>
                      <td className="border border-slate-400 px-2 py-2" />
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.igst}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.itemTotal}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.grandTotal}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.paid}</td>
                      <td className="border border-slate-400 px-2 py-2" />
                      <td className="border border-slate-400 px-2 py-2 text-right">{register.grandTotal.outstanding}</td>
                      <td colSpan={2} className="border border-slate-400 px-2 py-2" />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

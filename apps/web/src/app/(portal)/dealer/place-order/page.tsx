'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatINR } from '@erp/shared';
import { ShoppingCart, Tag } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function PlaceOrderContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string>(params.get('offerId') || '');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<{ data: any[] }>('/inventory/items?limit=100'),
      apiRequest<any[]>('/offers/active').catch(() => []),
    ]).then(([itRes, ofRes]) => {
      setItems(itRes.data);
      setOffers(ofRes);
      if (!selectedOfferId && ofRes.length > 0 && params.get('offerId')) {
        setSelectedOfferId(params.get('offerId') || '');
      }
    });
  }, [params, selectedOfferId]);

  const selectedOffer = offers.find((o) => o.id === selectedOfferId) || null;
  const discPct = selectedOffer ? Number(selectedOffer.discountPercent) : 0;

  const selectedLines = Object.entries(quantities)
    .filter(([, q]) => Number(q) > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));

  // Live preview (backend remains single source of truth on submit)
  const itemMap = new Map(items.map((i) => [i.id, i]));
  let grossSubtotal = 0;
  let totalDiscount = 0;
  let totalGst = 0;
  for (const l of selectedLines) {
    const it = itemMap.get(l.itemId);
    if (!it) continue;
    const g = Number(l.quantity) * Number(it.standardSellPrice || 0);
    const d = (g * discPct) / 100;
    const taxable = g - d;
    const tax = (taxable * Number(it.defaultTaxRate || 0)) / 100;
    grossSubtotal += g;
    totalDiscount += d;
    totalGst += tax;
  }
  const estimatedNet = grossSubtotal - totalDiscount + totalGst;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLines.length === 0) {
      setError('Enter a quantity for at least one product.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: selectedLines,
          offerId: selectedOfferId || null,
          notes,
          submitImmediately: true,
        }),
      });
      router.push('/dealer/orders');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Place New Order</h2>
        <p className="text-sm text-slate-600">Select available products, apply active festive discounts, and submit for approval.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Active Offers Selector */}
      {offers.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <Tag className="h-4 w-4" />
              Available Promotional Offers ({offers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {offers.map((o) => {
              const applied = selectedOfferId === o.id;
              return (
                <div
                  key={o.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    applied ? 'border-emerald-500 bg-emerald-50' : 'border-amber-200 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="success">{Number(o.discountPercent)}% OFF</Badge>
                      <span className="font-mono text-xs font-bold text-slate-800">{o.code}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{o.title}</p>
                    <p className="text-xs text-slate-500">
                      {o.occasion} • Valid till {new Date(o.validTo).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={applied ? 'secondary' : 'primary'}
                    onClick={() => setSelectedOfferId(applied ? '' : o.id)}
                  >
                    {applied ? 'Applied ✓' : 'Apply Offer'}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Available Product Catalog</CardTitle></CardHeader>
          <CardContent className="divide-y divide-slate-100 p-0">
            {items.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No products currently published to dealer catalog.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.sku} • Rate: {formatINR(item.standardSellPrice)} / {item.uom.code}
                      {Number(item.defaultTaxRate) > 0 ? ` • GST ${Number(item.defaultTaxRate)}%` : ''}
                    </p>
                    <div className="mt-1">
                      <Badge variant={item.inStock ? 'success' : 'warning'}>
                        {item.inStock
                          ? item.availableQuantity !== null
                            ? `In Stock: ${Number(item.availableQuantity)} ${item.uom.code}`
                            : 'Available'
                          : 'Low / Out of Stock'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">Qty ({item.uom.code}):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={quantities[item.id] || ''}
                      onChange={(e) => setQuantities({ ...quantities, [item.id]: e.target.value })}
                      placeholder="0"
                      className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            {selectedLines.length > 0 && (
              <div className="space-y-1 rounded-lg bg-slate-50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Gross Subtotal:</span>
                  <span className="font-medium">{formatINR(grossSubtotal)}</span>
                </div>
                {selectedOffer && (
                  <div className="flex justify-between text-emerald-700">
                    <span>
                      {selectedOffer.occasion} Offer ({selectedOffer.code} — {discPct}% OFF):
                    </span>
                    <span className="font-semibold">-{formatINR(totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Estimated GST (on discounted taxable value):</span>
                  <span className="font-medium">{formatINR(totalGst)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                  <span>Estimated Order Total:</span>
                  <span>{formatINR(estimatedNet)}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Order Notes (Optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery instructions or remarks..."
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={submitting} disabled={selectedLines.length === 0}>
                <ShoppingCart className="h-4 w-4" />
                Submit Order ({selectedLines.length} item{selectedLines.length === 1 ? '' : 's'})
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default function DealerPlaceOrderPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading order form...</div>}>
      <PlaceOrderContent />
    </Suspense>
  );
}

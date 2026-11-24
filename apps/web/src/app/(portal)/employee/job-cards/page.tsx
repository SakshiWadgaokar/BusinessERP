'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function EmployeeJobCardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [jcRes, locRes] = await Promise.all([
      apiRequest<{ data: any[] }>('/job-cards?limit=50'),
      apiRequest<any[]>('/inventory/locations'),
    ]);
    setCards(jcRes.data);
    setLocations(locRes);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recordConsumption = async (jc: any, mat: any) => {
    const consumed = window.prompt(`Good quantity consumed of ${mat.item.name} (${mat.item.uom.code}):`, '0');
    if (consumed === null) return;
    const defective = window.prompt(`Defective quantity of ${mat.item.name} (${mat.item.uom.code}):`, '0') || '0';
    setFeedback(null);
    try {
      await apiRequest(`/job-cards/${jc.id}/consumption`, {
        method: 'POST',
        body: JSON.stringify({ itemId: mat.item.id, consumedQuantity: consumed, defectiveQuantity: defective }),
      });
      setFeedback(`Recorded consumption on ${jc.jobCardNumber}.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Unable to record consumption.');
    }
  };

  const recordOutput = async (jc: any) => {
    const good = window.prompt(`Finished good quantity of ${jc.finishedProduct.name}:`, '1');
    if (!good) return;
    const wh = locations.find((l) => l.locationType === 'MAIN_WAREHOUSE') || locations[0];
    setFeedback(null);
    try {
      await apiRequest(`/job-cards/${jc.id}/production`, {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ goodQuantity: good, rejectedQuantity: '0', destLocationId: wh.id }),
      });
      setFeedback(`Recorded ${good} finished units for ${jc.jobCardNumber}.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Unable to record production.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Assigned Job Cards</h2>
        <p className="text-sm text-slate-600">Record actual material consumption, defective materials, and finished production output.</p>
      </div>

      {feedback && <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{feedback}</div>}

      <div className="grid gap-4">
        {cards.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-slate-500">No Job Cards currently assigned to you.</CardContent></Card>
        ) : (
          cards.map((jc) => (
            <Card key={jc.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{jc.jobCardNumber} — {jc.finishedProduct.name}</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">
                    Target: {Number(jc.targetQuantity)} • Completed: {Number(jc.finishedQuantity)} {jc.finishedProduct.uom.code}
                  </p>
                </div>
                <Badge variant={jc.status === 'CLOSED' ? 'success' : 'info'}>{jc.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Materials</p>
                  {jc.plannedMaterials.map((m: any) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900">{m.item.name}</p>
                        <p className="text-slate-600">
                          Req: {Number(m.requiredQuantity)} • Issued: {Number(m.issuedQuantity)} • Consumed: {Number(m.consumedQuantity)} • Returned: {Number(m.returnedQuantity)} • Defective: {Number(m.defectiveQuantity)}
                        </p>
                      </div>
                      {jc.status !== 'CLOSED' && (
                        <Button size="sm" variant="outline" onClick={() => recordConsumption(jc, m)}>
                          Log Consumption / Defect
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {jc.status !== 'CLOSED' && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => recordOutput(jc)}>Record Finished Output</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

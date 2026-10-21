'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from 'graphql-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toCsv } from '@/features/lib/financial-ledger';

export function ReconciliationPage() {
  const [days, setDays] = useState<any[]>([]), [selected, setSelected] = useState(''), [day, setDay] = useState<any>(null);
  const [amount, setAmount] = useState('0'), [cutoff, setCutoff] = useState('0'), [reason, setReason] = useState('');
  const [direction, setDirection] = useState('in'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reference, setReference] = useState(''), [method, setMethod] = useState('credit_card'), [gross, setGross] = useState('0'), [fees, setFees] = useState('0');
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const result: any = await request('/api/graphql', '{ restaurantBusinessDays }'); setDays(result.restaurantBusinessDays.filter((e: any) => e.eventType === 'business_day.opened'));
    if (selected) { const detail: any = await request('/api/graphql', 'query($id:String!){ restaurantBusinessDay(id:$id) }', { id: selected }); setDay(detail.restaurantBusinessDay); }
  }, [selected]);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  async function run(operation: string) {
    setBusy(true); setError('');
    const signature = JSON.stringify({ operation, selected, amount, reason, direction, cutoff });
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const value = Number(amount); if (!Number.isSafeInteger(value) || value < 0) throw new Error('Enter integer minor units');
      if (operation === 'open') {
        const result: any = await request('/api/graphql', 'mutation($amount:Int!,$cutoff:Int!,$key:String!){ openRestaurantBusinessDay(openingFloat:$amount,cutoffMinutes:$cutoff,idempotencyKey:$key) }', { amount: value, cutoff: Number(cutoff), key: attempt.current.key }); setSelected(result.openRestaurantBusinessDay);
      } else if (operation === 'movement') {
        await request('/api/graphql', 'mutation($id:String!,$direction:String!,$amount:Int!,$reason:String!,$key:String!){recordRestaurantCashMovement(id:$id,direction:$direction,amount:$amount,reason:$reason,idempotencyKey:$key)}', { id: selected, direction, amount: value, reason, key: attempt.current.key });
      } else if (operation === 'close') {
        await request('/api/graphql', 'mutation($id:String!,$amount:Int!,$reason:String!){closeRestaurantBusinessDay(id:$id,countedCash:$amount,reason:$reason)}', { id: selected, amount: value, reason });
      } else {
        await request('/api/graphql', 'mutation($id:String!,$reference:String!,$method:String!,$gross:Int!,$fees:Int!,$net:Int!,$reason:String!){recordRestaurantSettlement(id:$id,reference:$reference,method:$method,gross:$gross,fees:$fees,net:$net,reason:$reason)}', { id: selected, reference, method, gross: Number(gross), fees: Number(fees), net: Number(gross) - Number(fees), reason });
      }
      attempt.current = null; await load();
    } catch (e: any) { setError(e.message || 'Could not complete operation; retry preserves this request'); }
    finally { setBusy(false); }
  }
  function download() {
    const s = day.summary;
    const rows: unknown[][] = [['Business day', selected], ['Currency', s.currencyCode], ['Window start', s.startAt], ['Window end', s.endAt], ['Opening float', s.openingFloat], ['Cash movements', s.movementTotal], ['Expected cash', s.expectedCash], ['Counted cash', s.countedCash], ['Variance', s.variance], [], ['Tender', 'Gross', 'Refunds', 'Net', 'Tips (included in gross)']];
    for (const [name, value] of Object.entries(s.tenders)) { const v: any = value; rows.push([name, v.gross, v.refunds, v.net, v.tips]); }
    rows.push([], ['Source type', 'Source ID']); s.paymentIds.forEach((id: string) => rows.push(['Payment', id])); s.refundIds.forEach((id: string) => rows.push(['Refund', id]));
    rows.push([], ['Event', 'Actor', 'Time', 'Reason', 'Details']); day.events.forEach((e: any) => rows.push([e.eventType, e.actorId, e.occurredAt, e.reason, JSON.stringify(e.after)]));
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `restaurant-close-${selected}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <main className="p-6 space-y-6 max-w-5xl">
    <h1 className="text-2xl font-semibold">Cash and business-day reconciliation</h1>
    <p>Open before the first sale. One venue drawer is reconciled at a time. Amounts use the venue currency’s integer minor units. Closed totals remain immutable; later refunds appear in the next open period.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <section className="flex flex-wrap items-end gap-3">
      <Label>Float / movement / counted cash<Input type="number" min="0" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></Label>
      <Label>Business-day cutoff (minutes after midnight)<Input type="number" min="0" max="1439" value={cutoff} onChange={e => setCutoff(e.target.value)} /></Label>
      <Button disabled={busy} onClick={() => run('open')}>Open business day</Button>
    </section>
    <Label>Business day<select className="block border rounded p-2" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a day</option>{days.map(d => <option key={d.id} value={d.entityId}>{d.entityId}</option>)}</select></Label>
    {day && <>
      <p>{day.closed ? 'Closed' : 'Open'} · {day.summary.currencyCode} · {day.summary.timezone} · Expected cash: {day.summary.expectedCash}{day.closed && ` · Counted: ${day.summary.countedCash} · Variance: ${day.summary.variance}`}</p>
      <Label>Reason / variance explanation<Input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></Label>
      {!day.closed && <div className="flex gap-3"><select aria-label="Cash movement direction" value={direction} onChange={e => setDirection(e.target.value)}><option value="in">Paid in</option><option value="out">Paid out</option></select><Button disabled={busy} onClick={() => run('movement')}>Record cash movement</Button><Button disabled={busy} onClick={() => run('close')}>Close with counted cash</Button></div>}
      <table className="w-full text-left"><thead><tr><th>Tender</th><th>Gross</th><th>Refunds</th><th>Net</th><th>Tips included</th></tr></thead><tbody>{Object.entries(day.summary.tenders).map(([name, row]: [string, any]) => <tr key={name}><td>{name}</td><td>{row.gross}</td><td>{row.refunds}</td><td>{row.net}</td><td>{row.tips}</td></tr>)}</tbody></table>
      {day.closed && <section className="space-y-3"><h2 className="font-semibold">Attach processor settlement evidence</h2><p>This records an external statement; it does not contact a processor or move money.</p><div className="flex flex-wrap gap-3"><Label>Reference<Input value={reference} onChange={e => setReference(e.target.value)} /></Label><Label>Tender method<Input value={method} onChange={e => setMethod(e.target.value)} /></Label><Label>Statement gross<Input value={gross} onChange={e => setGross(e.target.value)} /></Label><Label>Fees<Input value={fees} onChange={e => setFees(e.target.value)} /></Label><Button disabled={busy} onClick={() => run('settlement')}>Record statement</Button></div></section>}
      <Button onClick={download}>Export reconciliation CSV</Button>
      <ul>{day.events.map((e: any) => <li key={e.id}>{e.eventType} · {e.reason} · {JSON.stringify(e.after)}</li>)}</ul>
    </>}
  </main>;
}

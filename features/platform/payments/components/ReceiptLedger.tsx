'use client';
import { useState } from 'react';
import { request } from 'graphql-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toCsv } from '@/features/lib/financial-ledger';
export default function ReceiptLedger() {
  const [orderId, setOrderId] = useState(''), [rows, setRows] = useState<any[]>([]), [selected, setSelected] = useState<any>(null), [message, setMessage] = useState('');
  async function load() {
    try {
      const data: any = await request('/api/graphql', 'query($where:ReceiptWhereInput!){receipts(where:$where,orderBy:[{issuedAt:desc}],take:100){id receiptNumber kind amount currencyCode issuedAt snapshot order{id orderNumber} payment{id} refund{id} correctsReceipt{id receiptNumber}}}', { where: orderId ? { order: { id: { equals: orderId } } } : {} });
      setRows(data.receipts); setMessage('Latest 100 matching immutable receipts. Filter by check ID for a specific check.');
    } catch (e: any) { setMessage(e.message); }
  }
  function download() {
    const csv = toCsv([['Receipt', 'Kind', 'Check', 'Amount minor units', 'Currency', 'Issued', 'Payment', 'Refund', 'Corrects'], ...rows.map(r => [r.receiptNumber, r.kind, r.order?.orderNumber, r.amount, r.currencyCode, r.issuedAt, r.payment?.id, r.refund?.id, r.correctsReceipt?.receiptNumber])]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'restaurant-receipts.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return <main className="p-6 space-y-4"><div className="print:hidden"><h1 className="text-2xl font-semibold">Receipts</h1><p>Payment readers can inspect, export and print stored sale, refund and correction evidence. Amounts are in the recorded currency’s minor units. Browser printing requires a configured local printer.</p><Input placeholder="Optional check ID" aria-label="Check ID" value={orderId} onChange={e => setOrderId(e.target.value)} /><Button onClick={load}>Load receipts</Button><Button variant="outline" disabled={!rows.length} onClick={download}>Export CSV</Button><p role="status">{message}</p>{rows.map(r => <button className="block border rounded p-3 w-full text-left" key={r.id} onClick={() => setSelected(r)}>{r.receiptNumber} · {r.kind} · {r.amount} {r.currencyCode} · {r.issuedAt}</button>)}</div>{selected && <article className="border rounded p-4"><h2 className="text-xl font-semibold">{selected.receiptNumber}</h2><p>{selected.kind} · Check {selected.order?.orderNumber} · {selected.issuedAt}</p><p>{selected.amount} {selected.currencyCode} minor units</p><pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(selected.snapshot, null, 2)}</pre><Button className="print:hidden" onClick={() => window.print()}>Print stored receipt</Button></article>}</main>;
}

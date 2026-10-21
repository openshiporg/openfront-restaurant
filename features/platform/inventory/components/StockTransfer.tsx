'use client';
import { useRef, useState } from 'react';
import { request } from 'graphql-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function StockTransfer() {
  const [rows, setRows] = useState<any[]>([]), [fromId, setFrom] = useState(''), [toId, setTo] = useState(''), [quantity, setQuantity] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState('');
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  async function load() { try { const data: any = await request('/api/graphql', '{ingredients{id name sku unit currentStock location{id name}}}'); setRows(data.ingredients); } catch (e: any) { setMessage(e.message); } }
  async function transfer() {
    try {
      const variables = { fromId, toId, quantity: Number(quantity), reason }; const signature = JSON.stringify(variables);
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
      await request('/api/graphql', 'mutation($fromId:ID!,$toId:ID!,$quantity:Float!,$reason:String!,$key:String!){transferRestaurantStock(fromId:$fromId,toId:$toId,quantity:$quantity,reason:$reason,idempotencyKey:$key)}', { ...variables, key: attempt.current.key });
      attempt.current = null; setMessage('Transfer posted with paired stock movements.'); await load();
    } catch (e: any) { setMessage(e.message); }
  }
  return <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">Transfer stock</h2><p>Choose two stock records with the same SKU in active storage locations. Quantity uses the source record’s unit; compatible units convert without losing precision.</p><Button variant="outline" onClick={load}>Load stock records</Button>{[['Source', fromId, setFrom], ['Destination', toId, setTo]].map(([label, value, setter]: any) => <select key={label} aria-label={label} value={value} onChange={e => setter(e.target.value)}><option value="">{label}</option>{rows.map(r => <option key={r.id} value={r.id}>{r.name} ({r.sku}) · {r.location?.name} · {r.currentStock} {r.unit}</option>)}</select>)}<Input aria-label="Transfer quantity" type="number" min="0.01" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} /><Input aria-label="Transfer reason" value={reason} onChange={e => setReason(e.target.value)} /><Button disabled={!fromId || !toId || !quantity || reason.length < 3} onClick={transfer}>Post transfer / retry</Button><p role="status">{message}</p></section>;
}

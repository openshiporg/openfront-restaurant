'use client';
import { useState } from 'react';
import { request } from 'graphql-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function OperationsRecovery() {
  const [rows, setRows] = useState<any[]>([]), [message, setMessage] = useState(''), [orderId, setOrderId] = useState('');
  async function load() { try { const result: any = await request('/api/graphql', '{restaurantOperationsRecovery}'); setRows(result.restaurantOperationsRecovery); } catch (e: any) { setMessage(e.message); } }
  async function retry(id: string, legacy = false) {
    try {
      if (legacy) {
        const reason = window.prompt('Legacy check only: review the production records and current recipes first. Explain why those recipes accurately represent this check. This creates immutable reviewed production facts; it does not rewrite historical stock movements.');
        if (!reason) return;
        await request('/api/graphql', 'mutation($id:ID!,$reason:String!){reviewLegacyRestaurantRecipes(orderId:$id,reason:$reason)}', { id, reason });
      } else await request('/api/graphql', 'mutation($id:ID!){retryRestaurantOperations(orderId:$id)}', { id });
      await load(); setMessage('Recovery attempted. Any remaining errors appear below.');
    } catch (e: any) { setMessage(e.message); }
  }
  return <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">Closed-check recovery</h2><p>Inventory managers can retry durable kitchen, stock and table cleanup failures. Review legacy recipes explicitly when historical snapshots are missing.</p><Button variant="outline" onClick={load}>Load recovery work</Button><Input aria-label="Closed check ID" placeholder="Closed check ID" value={orderId} onChange={e => setOrderId(e.target.value)} /><Button disabled={!orderId} onClick={() => retry(orderId)}>Retry check</Button><Button variant="outline" disabled={!orderId} onClick={() => retry(orderId, true)}>Record reviewed legacy recipes</Button>{rows.map(r => <div key={`${r.orderId}:${r.operation}`}><strong>{r.orderId} — {r.operation}</strong><p>{r.error}</p><Button onClick={() => retry(r.orderId)}>Retry</Button></div>)}<p role="status">{message}</p></section>;
}

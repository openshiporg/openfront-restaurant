'use client';
import { useRef, useState } from 'react';
import { request } from 'graphql-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function StockCount() {
  const [rows, setRows] = useState<any[]>([]), [id, setId] = useState(''), [counted, setCounted] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState('');
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  async function refresh() { try { const r: any = await request('/api/graphql', '{ ingredients { id name unit currentStock } }'); setRows(r.ingredients); } catch (e: any) { setMessage(e.message); } }
  async function post() {
    try {
      const ingredient = rows.find(r => r.id === id); if (!ingredient) throw new Error('Load and choose an ingredient');
      const variables = { ingredientId: id, counted: Number(counted), expectedStock: Number(ingredient.currentStock), reason };
      const signature = JSON.stringify(variables); if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
      await request('/api/graphql', 'mutation($ingredientId:ID!,$counted:Float!,$expectedStock:Float!,$reason:String!,$key:String!){countIngredientStock(ingredientId:$ingredientId,counted:$counted,expectedStock:$expectedStock,reason:$reason,idempotencyKey:$key)}', { ...variables, key: attempt.current.key });
      setMessage('Count posted with immutable variance evidence'); attempt.current = null; await refresh();
    } catch (e: any) { setMessage(e.message); }
  }
  return <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">Record a physical stock count</h2><Button variant="outline" onClick={refresh}>Load current balances</Button><select aria-label="Count ingredient" value={id} onChange={e => setId(e.target.value)}><option value="">Choose ingredient</option>{rows.map(r => <option key={r.id} value={r.id}>{r.name}: {r.currentStock} {r.unit}</option>)}</select><Input aria-label="Physical counted quantity" type="number" step="0.01" min="0" value={counted} onChange={e => setCounted(e.target.value)} /><Input aria-label="Stock count reason" placeholder="Reason / count sheet reference" value={reason} onChange={e => setReason(e.target.value)} /><Button disabled={!id || counted === '' || reason.length < 3} onClick={post}>Post count / retry</Button><p role="status">{message}</p></section>;
}

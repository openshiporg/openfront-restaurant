'use client';
import { useEffect, useState } from 'react';
import { request } from 'graphql-request';
import { RestaurantCampaigns } from '@/features/platform/payments/components/RestaurantCampaigns';
import { Button } from '@/components/ui/button';
export function PrivacyPage() {
  const [rows, setRows] = useState<any[]>([]), [message, setMessage] = useState('');
  async function load() { try { const r: any = await request('/api/graphql', '{ restaurantPrivacyRequests }'); setRows(r.restaurantPrivacyRequests); } catch(e: any) { setMessage(e.message); } }
  useEffect(() => { load(); }, []);
  async function resolve(requestId: string, outcome: string) { const reason = window.prompt('Describe the completed action, retained-record reason, or requested information. Include your case/reference number.'); if (!reason) return; try { await request('/api/graphql', 'mutation($id:ID!,$outcome:String!,$reason:String!){resolveRestaurantPrivacyRequest(requestId:$id,outcome:$outcome,reason:$reason)}', { id: requestId, outcome, reason }); await load(); } catch(e: any) { setMessage(e.message); } }
  return <main className="p-6 space-y-4"><h1 className="text-2xl font-semibold">Customer data requests</h1><p>Review requests against the venue’s retention policy. Record evidence of work performed; these actions do not automatically erase transaction records.</p><Button onClick={load}>Refresh</Button><p role="status">{message}</p>{rows.map(row => <article key={row.id} className="border rounded p-4 space-y-2"><p>{row.eventType} · Customer {row.entityId} · {row.occurredAt}</p><p>{row.reason}</p>{row.resolution ? <p>Resolved: {row.resolution.after.outcome} · {row.resolution.reason}</p> : <div className="flex gap-2"><Button onClick={() => resolve(row.id, 'fulfilled')}>Record fulfillment evidence</Button><Button variant="outline" onClick={() => resolve(row.id, 'retained_with_reason')}>Record retention decision</Button><Button variant="outline" onClick={() => resolve(row.id, 'needs_information')}>Request more information</Button></div>}</article>)}<RestaurantCampaigns /></main>;
}

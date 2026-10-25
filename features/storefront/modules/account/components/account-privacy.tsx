'use client';
import { useState } from 'react';
import { request } from 'graphql-request';
import { Button } from '@/components/ui/button';
export function AccountPrivacy() {
  const [message, setMessage] = useState('');
  async function record(action: string) { try { await request('/api/graphql', 'mutation($action:String!,$key:String!){recordMyRestaurantPrivacy(action:$action,idempotencyKey:$key)}', { action, key: crypto.randomUUID() }); setMessage(action.startsWith('request_') ? 'Request recorded for restaurant review. Your records have not been erased.' : 'Your marketing preference was recorded. Transaction confirmations are separate.'); } catch (e: any) { setMessage(e.message); } }
  async function download() { try { const r: any = await request('/api/graphql', '{ exportMyRestaurantData }'); const url = URL.createObjectURL(new Blob([JSON.stringify(r.exportMyRestaurantData, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'my-restaurant-data.json'; a.click(); URL.revokeObjectURL(url); } catch (e: any) { setMessage(e.message); } }
  return <section className="mt-12 space-y-4 bg-steel/50 p-5 sm:p-6"><h2 className="font-serif text-2xl font-extrabold">Your data and preferences</h2><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={download}>Export my data</Button><Button variant="outline" onClick={() => record('marketing_opt_in')}>Opt in to marketing</Button><Button variant="outline" onClick={() => record('marketing_opt_out')}>Opt out of marketing</Button><Button variant="outline" onClick={() => record('request_correction')}>Request a data correction</Button><Button variant="outline" onClick={() => record('request_erasure')}>Request erasure review</Button></div><p className="text-base text-ink-soft">The restaurant reviews data requests while preserving records it must retain. These controls do not erase financial records automatically.</p><p role="status">{message}</p></section>;
}

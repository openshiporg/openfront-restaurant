'use client';
import { useEffect, useState } from 'react';
import { request } from 'graphql-request';
import Link from 'next/link';
export function CheckAllocationNotice({ orderId }: { orderId: string }) {
  const [allocation, setAllocation] = useState<any>(null), [error, setError] = useState('');
  useEffect(() => { let live = true; request('/api/graphql', 'query($id:ID!){restaurantCheckAllocation(orderId:$id)}', { id: orderId }).then((data: any) => { if (live) setAllocation(data.restaurantCheckAllocation); }).catch(() => { if (live) setError('Financial check allocation could not be loaded. Refresh before relying on item totals.'); }); return () => { live = false; }; }, [orderId]);
  if (error) return <p role="alert">{error}</p>;
  if (!allocation) return null;
  return <aside className="rounded border border-blue-300 bg-blue-50 p-4 text-blue-950 space-y-2"><strong>Independent check {allocation.ordinal} of {allocation.guestCount}</strong><p>This check owes {allocation.allocatedTotals.total} minor units from served check {allocation.sourceOrderNumber}. Food detail belongs to that original service; it is not charged again in full on this check.</p><p>Allocated subtotal {allocation.allocatedTotals.subtotal}, tax {allocation.allocatedTotals.tax}, tip {allocation.allocatedTotals.tip}, discount {allocation.allocatedTotals.discount}, delivery {allocation.allocatedTotals.deliveryCharge}.</p><div className="flex gap-3 flex-wrap">{allocation.memberOrderIds.map((id: string, i: number) => <Link key={id} className="underline" href={`/dashboard/platform/pos/${id}/payment`}>Pay check {i + 1}</Link>)}</div></aside>;
}

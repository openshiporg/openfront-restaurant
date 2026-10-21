/** Financial checks reference one fulfilled production check. They never duplicate
 * OrderItems, kitchen tickets or recipe/stock identity. Immutable adjustment rows
 * retain each allocation generation and its explicit recombination. */
export type CheckTotals = { subtotal: number; tax: number; tip: number; discount: number; deliveryCharge: number; total: number };
export type CheckAllocation = {
  groupId: string; sourceOrderId: string; sourceOrderNumber: string; memberOrderIds: string[];
  ordinal: number; guestCount: number; originalTotals: CheckTotals; allocatedTotals: CheckTotals; sourceItems: any[];
};
export async function getActiveCheckAllocation(tx: any, orderId: string): Promise<CheckAllocation | null> {
  const member = await tx.orderAdjustment.findFirst({ where: { orderId, idempotencyKey: { startsWith: 'equal-check-member:' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  if (!member?.metadata?.groupId) return null;
  const groupId = member.metadata.groupId;
  if (await tx.orderAdjustment.findUnique({ where: { idempotencyKey: `equal-check-recombined:${groupId}` } })) return null;
  const group = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: groupId } });
  if (!group?.metadata?.memberOrderIds?.includes(orderId)) throw new Error('Financial check allocation is inconsistent; review its ledger');
  const data = group.metadata, ordinal = data.memberOrderIds.indexOf(orderId);
  return { groupId, sourceOrderId: data.sourceOrderId, sourceOrderNumber: data.sourceOrderNumber,
    memberOrderIds: data.memberOrderIds, ordinal: ordinal + 1, guestCount: data.memberOrderIds.length,
    originalTotals: data.originalTotals, allocatedTotals: data.allocations[ordinal], sourceItems: data.sourceItems };
}
export async function assertNoActiveCheckAllocation(tx: any, orderId: string) {
  if (await getActiveCheckAllocation(tx, orderId)) throw new Error('Recombine the independent equal checks before changing their charges, items or cancellation state');
}
function cents(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Check charges must be nonnegative whole cents');
  return number;
}
/** Apportion a component against the remaining guest balances; largest remainders
 * conserve every cent without exceeding a guest's remaining payable amount. */
function weighted(amount: number, weights: number[]) {
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (!totalWeight) { if (amount) throw new Error('Cannot allocate charges across zero balances'); return weights.map(() => 0); }
  const quotients = weights.map(value => amount * value / totalWeight);
  const result = quotients.map(Math.floor);
  let remainder = amount - result.reduce((sum, value) => sum + value, 0);
  const order = quotients.map((value, index) => ({ index, fraction: value - result[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) if (remainder-- > 0) result[item.index]++;
  return result;
}
export function allocateEqualCheckCharges(input: CheckTotals, count: number): CheckTotals[] {
  if (!Number.isInteger(count) || count < 2 || count > 20) throw new Error('Choose between two and twenty independent checks');
  const original = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, cents(value)])) as CheckTotals;
  if (original.total < count || original.discount > original.subtotal || original.subtotal + original.tax + original.tip + original.deliveryCharge - original.discount !== original.total) throw new Error('Check charges must reconcile with at least one cent per guest');
  const totals = Array.from({ length: count }, (_, index) => Math.floor(original.total / count) + (index < original.total % count ? 1 : 0));
  const remaining = [...totals];
  const parts: Record<string, number[]> = {};
  for (const field of ['tax', 'tip', 'deliveryCharge', 'subtotal'] as const) {
    const amount = field === 'subtotal' ? original.subtotal - original.discount : original[field];
    parts[field] = weighted(amount, remaining);
    parts[field].forEach((value, index) => { remaining[index] -= value; });
  }
  const discounts = weighted(original.discount, totals);
  return totals.map((total, index) => ({ subtotal: parts.subtotal[index] + discounts[index], tax: parts.tax[index], tip: parts.tip[index], deliveryCharge: parts.deliveryCharge[index], discount: discounts[index], total }));
}

type Party = { id: string; guestCount: number };
const prefix = (orderId: string) => `physical-party-members:${orderId}:`;
const revisionKey = (base: string, revision: number) => `${base}${String(revision).padStart(12, '0')}`;
async function membership(tx: any, order: any) {
  const record = await tx.orderAdjustment.findFirst({ where: { orderId: order.id, idempotencyKey: { startsWith: prefix(order.id) } }, orderBy: { idempotencyKey: 'desc' } });
  return record ? { parties: record.metadata.parties as Party[], revision: Number(record.metadata.revision) } :
    { parties: order.orderSource === 'gift_card' ? [] : [{ id: order.id, guestCount: Math.max(1, Number(order.guestCount || 1)) }], revision: -1 };
}
async function writeMembership(tx: any, order: any, parties: Party[], revision: number, actorId?: string) {
  await tx.orderAdjustment.create({ data: { idempotencyKey: revisionKey(prefix(order.id), revision), type: 'correction', amount: 0, reason: 'Physical party membership recorded independently of financial checks', orderId: order.id, actorId, metadata: { kind: 'physical_party_membership', parties, revision } } });
}
async function ensureMembership(tx: any, order: any, actorId?: string) {
  const current = await membership(tx, order);
  if (current.revision < 0) { await writeMembership(tx, order, current.parties, 0, actorId); current.revision = 0; }
  return current;
}
async function ownership(tx: any, partyId: string) {
  const record = await tx.orderAdjustment.findFirst({ where: { idempotencyKey: { startsWith: `physical-party-owner:${partyId}:` } }, orderBy: { idempotencyKey: 'desc' } });
  return record ? { ownerOrderId: record.metadata.ownerOrderId, revision: Number(record.metadata.revision) } : { ownerOrderId: partyId, revision: -1 };
}
/** Every item/seat/equal split shares its original declared party; new financial
 * checks never invent guests. The owner retains the physical seating count. */
export async function copyPhysicalParty(tx: any, source: any, child: any, actorId?: string) {
  const current = await ensureMembership(tx, source, actorId);
  await writeMembership(tx, child, current.parties, 0, actorId);
}
export async function physicalGuestsForOrder(tx: any, order: any) {
  if (order.orderSource === 'gift_card' || order.status === 'cancelled') return 0;
  const current = await membership(tx, order);
  let total = 0;
  for (const party of current.parties) if ((await ownership(tx, party.id)).ownerOrderId === order.id) total += party.guestCount;
  return total;
}
/** Merging checks combines party identities once and transfers ownership only
 * when the cancelled source was the party's owner. Financial totals are separate. */
export async function mergePhysicalParties(tx: any, target: any, source: any, actorId?: string) {
  const a = await ensureMembership(tx, target, actorId), b = await ensureMembership(tx, source, actorId);
  const combined = new Map(a.parties.map(party => [party.id, party]));
  for (const party of b.parties) {
    if (combined.has(party.id) && combined.get(party.id)!.guestCount !== party.guestCount) throw new Error('Physical party counts disagree; review seating history');
    combined.set(party.id, party);
    const owner = await ownership(tx, party.id);
    if (owner.ownerOrderId === source.id) await tx.orderAdjustment.create({ data: { idempotencyKey: revisionKey(`physical-party-owner:${party.id}:`, owner.revision + 1), type: 'correction', amount: 0, reason: 'Physical party ownership follows merged check', orderId: target.id, actorId, metadata: { kind: 'physical_party_owner', ownerOrderId: target.id, previousOwnerOrderId: source.id, partyId: party.id, revision: owner.revision + 1 } } });
  }
  await writeMembership(tx, target, [...combined.values()], a.revision + 1, actorId);
  return physicalGuestsForOrder(tx, target);
}

/** Cancelling one financial/seat check does not cancel the surviving physical
 * party. Move its reporting ownership to a surviving sibling in this commit. */
export async function transferPhysicalPartyOnCancellation(tx: any, order: any, actorId?: string) {
  const current = await membership(tx, order);
  const newOwners = new Map<string, any>();
  for (const party of current.parties) {
    const owner = await ownership(tx, party.id);
    if (owner.ownerOrderId !== order.id) continue;
    const records = await tx.orderAdjustment.findMany({ where: { idempotencyKey: { startsWith: 'physical-party-members:' }, metadata: { path: ['parties'], array_contains: [{ id: party.id }] } }, select: { orderId: true } });
    const ids = [...new Set(records.map((record: any) => record.orderId).filter((id: string) => id && id !== order.id))];
    if (!ids.length) continue;
    const survivors = await tx.restaurantOrder.findMany({ where: { id: { in: ids }, status: { not: 'cancelled' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1 });
    if (!survivors.length) continue; // Entirely cancelled parties have no covers.
    newOwners.set(survivors[0].id, survivors[0]);
    await tx.orderAdjustment.create({ data: { idempotencyKey: revisionKey(`physical-party-owner:${party.id}:`, owner.revision + 1), type: 'correction', amount: 0, reason: 'Physical party ownership survives cancellation of one check', orderId: survivors[0].id, actorId, metadata: { kind: 'physical_party_owner', ownerOrderId: survivors[0].id, previousOwnerOrderId: order.id, partyId: party.id, revision: owner.revision + 1 } } });
  }
  for (const survivor of newOwners.values()) await tx.restaurantOrder.update({ where: { id: survivor.id }, data: { guestCount: Math.max(1, await physicalGuestsForOrder(tx, survivor)) } });
}

import { appendAuditEventWithClient } from './audit';
import { stockQuantity } from '../../lib/stock-units';

export function stockHundredths(value: unknown, allowZero = false) {
  const number = Number(value), scaled = Math.round(number * 100);
  if (!Number.isFinite(number) || !Number.isSafeInteger(scaled) || Math.abs(number * 100 - scaled) > 1e-6 || scaled < (allowZero ? 0 : 1)) throw new Error('Lot quantity must use positive stock units with at most two decimals');
  return scaled;
}
export function validateReceiptLot(input: any) {
  const lotCode = typeof input?.lotCode === 'string' ? input.lotCode.trim() : '';
  const expiryDate = typeof input?.expiryDate === 'string' ? input.expiryDate : '';
  if (!lotCode && !expiryDate) return null;
  if (!lotCode || lotCode.length > 100 || /[\x00-\x1f]/.test(lotCode)) throw new Error('A bounded supplier lot code is required when tracking expiry');
  if (expiryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || !Number.isFinite(Date.parse(`${expiryDate}T00:00:00Z`)) || new Date(`${expiryDate}T00:00:00Z`).toISOString().slice(0, 10) !== expiryDate)) throw new Error('Lot expiry must be a valid calendar date');
  return { lotCode, expiryDate: expiryDate || null };
}
export async function readStockLots(tx: any, ingredientId: string, today = new Date().toISOString().slice(0, 10)) {
  const events = await tx.auditEvent.findMany({ where: { entityType: 'Ingredient', entityId: ingredientId, eventType: { in: ['inventory.lot_received', 'inventory.lot_allocated', 'inventory.lot_restored'] } }, take: 10001 });
  if (events.length > 10000) throw new Error('Lot trace exceeds the supported ledger window; archive-aware reconciliation required');
  const lots = new Map<string, any>();
  for (const event of events) if (event.eventType === 'inventory.lot_received') for (const lot of event.after?.lots || []) {
    if (lots.has(lot.lotId)) throw new Error('Duplicate lot receipt evidence');
    lots.set(lot.lotId, { ...lot, remainingHundredths: stockHundredths(lot.quantity), receiptMovementId: event.after.movementId, receivedAt: event.occurredAt || event.createdAt });
  }
  for (const event of events) if (['inventory.lot_allocated', 'inventory.lot_restored'].includes(event.eventType)) for (const allocation of event.after?.allocations || []) {
    const lot = lots.get(allocation.lotId);
    if (!lot) throw new Error('Lot allocation refers to missing receipt evidence');
    lot.remainingHundredths += (event.eventType === 'inventory.lot_restored' ? 1 : -1) * stockHundredths(allocation.quantity);
  }
  const roots = [...new Set([...lots.values()].map(lot => lot.rootReceiptId))];
  const holds = roots.length ? await tx.auditEvent.findMany({ where: { entityType: 'StockLot', entityId: { in: roots }, eventType: 'inventory.lot_hold' }, take: 10001 }) : [];
  if (holds.length > 10000) throw new Error('Lot hold history requires operator review');
  for (const lot of lots.values()) {
    if (lot.remainingHundredths < 0 || lot.remainingHundredths > stockHundredths(lot.quantity)) throw new Error('Lot balance does not reconcile to received units');
    const hold = holds.filter((event: any) => event.entityId === lot.rootReceiptId).sort((a: any, b: any) => b.after.revision - a.after.revision)[0];
    lot.onHold = Boolean(hold?.after.onHold); lot.holdReason = hold?.reason || null;
    lot.remainingQuantity = lot.remainingHundredths / 100;
    // Expiry date is an inclusive supplier date; allocation is blocked afterwards.
    lot.expired = Boolean(lot.expiryDate && lot.expiryDate < today);
  }
  return { lots: [...lots.values()], events };
}
async function receiveLots(tx: any, movement: any, ingredient: any, lots: any[], actorId?: string | null) {
  const total = lots.reduce((sum, lot) => sum + stockHundredths(lot.quantity), 0);
  if (total > stockHundredths(movement.quantity)) throw new Error('Tracked lots exceed actual received movement quantity');
  return appendAuditEventWithClient(tx, actorId, { eventKey: `stock-lots:received:${movement.id}`, entityType: 'Ingredient', entityId: ingredient.id, eventType: 'inventory.lot_received', after: { movementId: movement.id, lots, untrackedQuantity: (stockHundredths(movement.quantity) - total) / 100 } });
}
export async function registerReceiptLots(tx: any, movement: any, ingredient: any, input: any, actorId?: string | null) {
  const lot = validateReceiptLot(input);
  if (!lot) return null;
  if (!movement.id || movement.type !== 'delivery' || movement.ingredientId !== ingredient.id) throw new Error('Lot registration requires an actual goods receipt movement');
  return receiveLots(tx, movement, ingredient, [{ ...lot, lotId: `${movement.id}:0`, rootReceiptId: movement.id, quantity: stockHundredths(movement.quantity) / 100, unit: ingredient.unit }], actorId);
}
export async function allocateStockLots(tx: any, movement: any, ingredient: any, options: { actorId?: string | null; purpose: 'production' | 'waste' | 'count' | 'transfer'; now?: Date }) {
  if (!movement.id || movement.ingredientId !== ingredient.id || Number(movement.quantity) >= 0) throw new Error('Lot allocation requires a negative stock movement');
  const eventKey = `stock-lots:allocation:${movement.id}`;
  const replay = await tx.auditEvent.findUnique({ where: { eventKey } });
  if (replay) return replay.after;
  const { lots } = await readStockLots(tx, ingredient.id, (options.now || new Date()).toISOString().slice(0, 10));
  const totalTracked = lots.reduce((sum, lot) => sum + lot.remainingHundredths, 0);
  const stockBefore = Math.round(Number(ingredient.currentStock || 0) * 100);
  if (totalTracked > stockBefore && lots.length) throw new Error('Tracked lot balance exceeds physical stock; reconcile missing lot movements first');
  let remaining = stockHundredths(-Number(movement.quantity));
  const allocations = [];
  for (const lot of lots.sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999') || a.lotId.localeCompare(b.lotId))) {
    if (!remaining) break;
    if (lot.unit !== ingredient.unit) throw new Error('Lot stocking unit changed; reconcile before allocation');
    const receivedAfterProduction = options.now && (!lot.receivedAt || new Date(lot.receivedAt) > options.now);
    if (options.purpose === 'production' && (lot.expired || lot.onHold || receivedAfterProduction)) continue;
    const used = Math.min(remaining, lot.remainingHundredths);
    if (!used) continue;
    allocations.push({ lotId: lot.lotId, rootReceiptId: lot.rootReceiptId, lotCode: lot.lotCode, expiryDate: lot.expiryDate, quantity: used / 100, unit: lot.unit });
    remaining -= used;
  }
  const unknownAvailable = Math.max(0, stockBefore - totalTracked);
  const unavailable = lots.some(lot => lot.remainingHundredths && (lot.expired || lot.onHold || (options.now && (!lot.receivedAt || new Date(lot.receivedAt) > options.now))));
  if (options.purpose === 'production' && remaining > unknownAvailable && unavailable) throw new Error('Expired, held or later-received stock cannot be allocated to this food production; record waste or resolve the hold with evidence');
  const after = { movementId: movement.id, purpose: options.purpose, allocations, untrackedQuantity: remaining / 100, allocationPolicy: 'FEFO-recorded-stock', physicalBatchVerified: false };
  await appendAuditEventWithClient(tx, options.actorId, { eventKey, entityType: 'Ingredient', entityId: ingredient.id, eventType: 'inventory.lot_allocated', after });
  return after;
}
export async function transferStockLots(tx: any, outMovement: any, inMovement: any, fromIngredient: any, toIngredient: any, actorId?: string | null) {
  const result = await allocateStockLots(tx, outMovement, fromIngredient, { actorId, purpose: 'transfer' });
  const lots = result.allocations.map((allocation: any, index: number) => {
    const quantity = stockQuantity(allocation.quantity, fromIngredient.unit, toIngredient.unit);
    stockHundredths(quantity);
    return { lotId: `${inMovement.id}:${index}`, rootReceiptId: allocation.rootReceiptId, lotCode: allocation.lotCode, expiryDate: allocation.expiryDate, quantity, unit: toIngredient.unit, sourceLotId: allocation.lotId };
  });
  if (lots.length) await receiveLots(tx, inMovement, toIngredient, lots, actorId);
  return result;
}
export async function reverseStockLotAllocation(tx: any, originalMovementId: string, reversalMovement: any, ingredient: any, actorId?: string | null) {
  const original = await tx.auditEvent.findUnique({ where: { eventKey: `stock-lots:allocation:${originalMovementId}` } });
  if (!original) return null; // Legacy/untracked reversal never invents receipt provenance.
  if (stockHundredths(reversalMovement.quantity) !== original.after.allocations.reduce((sum: number, row: any) => sum + stockHundredths(row.quantity), stockHundredths(original.after.untrackedQuantity || 0, true))) throw new Error('Reversal quantity differs from original lot allocation');
  return appendAuditEventWithClient(tx, actorId, { eventKey: `stock-lots:restored:${originalMovementId}`, entityType: 'Ingredient', entityId: ingredient.id, eventType: 'inventory.lot_restored', reason: reversalMovement.reason, after: { ...original.after, movementId: reversalMovement.id, originalMovementId } });
}

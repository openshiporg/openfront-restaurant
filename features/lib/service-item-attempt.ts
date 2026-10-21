import type { DraftStorage } from './pos-draft';

const PREFIX = 'restaurant-service-item-attempt-v1:';
export const SERVICE_ITEM_ATTEMPT_TTL = 24 * 60 * 60 * 1000;
export type ServiceItemRequest = {
  orderId: string | null; tableId: string; menuItemId: string; quantity: number;
  courseNumber: number; seatNumber: number; specialInstructions: string | null; modifierIds: string[];
};
type Attempt = { version: 1; actorId: string; tableId: string; orderId: string | null; hash: string; key: string; createdAt: number };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
function storageKey(actorId: string, tableId: string) {
  if (!validId(actorId) || !validId(tableId)) throw new Error('Refresh staff and table details before adding an item');
  return `${PREFIX}${actorId}:${tableId}`;
}
/** Only opaque IDs, a digest and retry metadata are stored. Instructions stay in
 * the form. A lost first response reuses its original null orderId even after
 * that newly created check becomes visible. Nothing is automatically submitted. */
export async function reserveServiceItemAttempt(storage: DraftStorage, actorId: string, input: ServiceItemRequest, now = Date.now()) {
  const key = storageKey(actorId, input.tableId);
  const bytes = new TextEncoder().encode(JSON.stringify({ ...input, orderId: undefined }));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const stored = storage.getItem(key);
  if (stored) {
    let prior: Attempt;
    try { prior = JSON.parse(stored); } catch { throw new Error('Saved item retry is invalid. Review the check before clearing the saved retry.'); }
    if (!prior || Object.keys(prior).some(field => !['version', 'actorId', 'tableId', 'orderId', 'hash', 'key', 'createdAt'].includes(field)) || prior.version !== 1 || prior.actorId !== actorId || prior.tableId !== input.tableId ||
        !(prior.orderId === null || validId(prior.orderId)) || !/^[a-f0-9]{64}$/.test(prior.hash) ||
        !/^[a-f0-9-]{36}$/.test(prior.key) || !Number.isFinite(prior.createdAt) || prior.createdAt > now ||
        now - prior.createdAt > SERVICE_ITEM_ATTEMPT_TTL) {
      throw new Error('Saved item retry is invalid or expired. Review the check before clearing the saved retry.');
    }
    if (prior.hash !== hash || (prior.orderId !== null && prior.orderId !== input.orderId)) {
      throw new Error('An earlier item addition is unresolved. Retry its original item details or review the check before clearing the saved retry.');
    }
    return { idempotencyKey: prior.key, orderId: prior.orderId };
  }
  const attempt: Attempt = { version: 1, actorId, tableId: input.tableId, orderId: input.orderId, hash, key: globalThis.crypto.randomUUID(), createdAt: now };
  // Storage failure stops submission: a request must not leave without its key.
  storage.setItem(key, JSON.stringify(attempt));
  return { idempotencyKey: attempt.key, orderId: attempt.orderId };
}
export function clearServiceItemAttempt(storage: DraftStorage, actorId: string, tableId: string) {
  storage.removeItem(storageKey(actorId, tableId));
}

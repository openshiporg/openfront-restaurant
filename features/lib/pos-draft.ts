export const POS_DRAFT_KEY = 'restaurant-pos-draft-v1';
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readPosDraft(storage: DraftStorage, now = Date.now()): any | null {
  try {
    const value = JSON.parse(storage.getItem(POS_DRAFT_KEY) || 'null');
    if (!value || value.version !== 1 || !Array.isArray(value.cart) || value.cart.length > 100 || !Number.isFinite(value.savedAt) || now - value.savedAt > 24 * 60 * 60 * 1000) return null;
    return value;
  } catch { return null; }
}
export function savePosDraft(storage: DraftStorage, draft: any, now = Date.now()) {
  if (!Array.isArray(draft.cart) || draft.cart.length > 100) throw new Error('Draft has too many lines');
  storage.setItem(POS_DRAFT_KEY, JSON.stringify({ ...draft, version: 1, savedAt: now }));
}
export function clearPosDraft(storage: DraftStorage) { storage.removeItem(POS_DRAFT_KEY); }

import test from 'node:test';
import assert from 'node:assert/strict';
import { readPosDraft, savePosDraft, clearPosDraft, POS_DRAFT_KEY } from '../features/lib/pos-draft';
const fixture = () => { const store = new Map<string, string>(); return { getItem: (k: string) => store.get(k) || null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } }; };
test('draft and uncertain attempt survive restart without changing the retry key', () => {
  const storage = fixture(); savePosDraft(storage, { cart: [{ quantity: 1 }], attempt: { key: 'same-request', fingerprint: 'quote' } }, 100);
  assert.equal(readPosDraft(storage, 200).attempt.key, 'same-request'); clearPosDraft(storage); assert.equal(readPosDraft(storage), null);
});
test('expired/malformed drafts are not replayed and storage failures surface', () => {
  const storage = fixture(); storage.setItem(POS_DRAFT_KEY, 'bad'); assert.equal(readPosDraft(storage), null);
  savePosDraft(storage, { cart: [] }, 100); assert.equal(readPosDraft(storage, 100 + 86400001), null);
  assert.throws(() => savePosDraft({ ...storage, setItem: () => { throw new Error('quota'); } }, { cart: [] }), /quota/);
});

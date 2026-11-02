import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import config from '../features/keystone';
import { extractUniqueViews, initialiseLists } from '../features/keystone/view-order/generate-view-order';
import { VIEW_ORDER } from '../features/keystone/view-order';

const lists = initialiseLists((config as any).default || config);
const actualOrder = extractUniqueViews(lists);

test('dashboard field views match the current Keystone model order', () => {
  assert.deepEqual(VIEW_ORDER, actualOrder);
});

test('refund provider JSON and timestamps use their own controllers after checkbox insertion', () => {
  const expected: Record<string, string> = {
    providerData: 'json', processedAt: 'timestamp', createdAt: 'timestamp',
    updatedAt: 'timestamp', amount: 'integer', status: 'select', payment: 'relationship',
  };
  for (const [path, type] of Object.entries(expected)) {
    const field = (lists as any).Refund.fields[path];
    const actualType = field.views.split('/').at(-2);
    assert.equal(actualType, type);
    const index = actualOrder.indexOf(actualType) + 1;
    assert.equal(['id', ...VIEW_ORDER][index], type, `Refund.${path}`);
  }
  // This was the failing case: valid nonempty provider data reached the timestamp calendar.
  assert.equal(['id', ...VIEW_ORDER][9], 'json');
  assert.equal(['id', ...VIEW_ORDER][7], 'timestamp');
});

test('Railway and local builds regenerate the mapping before compiling Next', () => {
  const railway = readFileSync(new URL('../railway.toml', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(railway, /views:generate && next build/);
  for (const name of ['dev', 'build']) assert.match(pkg.scripts[name], /views:generate/);
});

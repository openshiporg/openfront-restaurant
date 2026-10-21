import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedMcpFetch } from '../app/api/completion/scopedMcpFetch';

test('overlapping MCP transports isolate request cookies without changing global fetch', async () => {
  const originalFetch = globalThis.fetch;
  const endpoint = new URL('https://mcp.test/api/mcp-transport/http');
  const received: string[] = [];
  let release!: () => void;
  const overlap = new Promise<void>(resolve => { release = resolve; });
  const transport: typeof fetch = async (_input, init) => {
    received.push(new Headers(init?.headers).get('cookie') || '');
    assert.equal(init?.redirect, 'manual');
    if (received.length === 2) release();
    await overlap;
    return new Response(null, { headers: { 'set-cookie': 'unrelated=ignored; Path=/' } });
  };
  const alice = createScopedMcpFetch(endpoint, 'session=alice', transport);
  const bob = createScopedMcpFetch(endpoint, 'session=bob', transport);
  await Promise.all([alice(endpoint), bob(endpoint)]);
  await Promise.all([alice(endpoint), bob(endpoint)]);
  assert.deepEqual(received.sort(), ['session=alice', 'session=alice', 'session=bob', 'session=bob']);
  await assert.rejects(alice('https://other.test/api/mcp-transport/http'), /outside/);
  assert.equal(received.length, 4);
  assert.equal(globalThis.fetch, originalFetch);
});

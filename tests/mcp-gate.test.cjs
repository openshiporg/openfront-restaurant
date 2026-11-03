const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'app/api/mcp-transport/[transport]/route.ts'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'features/keystone/mcpGate.ts'), 'utf8');

test('MCP transport refuses anonymous callers before schema introspection', () => {
  const refuse = route.indexOf('const refused = await requireMcpSession(request, body);');
  const schema = route.indexOf('await getGraphQLSchema(');
  assert.ok(refuse > 0 && schema > refuse, 'gate runs before getGraphQLSchema');
  assert.match(route, /if \(refused\) return refused;/);
});

test('MCP gate admits only a cookie that resolves to a Keystone session, else 401 Sign in required', () => {
  assert.match(gate, /signedIn = Boolean\(context\.session\?\.itemId\)/);
  assert.match(gate, /status: 401/);
  assert.match(gate, /Sign in required/);
});

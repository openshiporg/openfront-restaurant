import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSchema, parse, validate } from 'graphql';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function templateDocument(source: string, name: string) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*gql\\s*\\x60([\\s\\S]*?)\\x60`));
  assert.ok(match, `Could not find gql document ${name}`);
  return match[1];
}

function functionTemplateDocument(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}(`);
  assert.notEqual(start, -1, `Could not find action ${functionName}`);
  const match = source.slice(start).match(/const\s+query\s*=\s*`([\s\S]*?)`;/);
  assert.ok(match, `Could not find query in ${functionName}`);
  return match[1];
}

test('selected operator and dormant helper GraphQL documents validate against the saved Keystone schema and custom query extension', () => {
  const schema = buildSchema(read('schema.graphql'));
  const cases: Array<[string, string]> = [
    ['staff schedule', templateDocument(read('features/platform/staff/screens/SchedulePage.tsx'), 'GET_SHIFTS')],
    ['tip pool preview', templateDocument(read('features/platform/staff/screens/TipsPage.tsx'), 'PREVIEW_TIP_POOL')],
    ['floor plan position update', templateDocument(read('features/platform/pos/screens/tables/FloorPlanClient.tsx'), 'UPDATE_TABLE_POSITION')],
  ];
  const serviceFloor = read('features/platform/service-floor/screens/ServiceFloorClient.tsx');
  const voidDocument = serviceFloor.match(/request\('\/api\/graphql',\s*`([^`]*voidOrder[^`]*)`/)?.[1];
  assert.ok(voidDocument, 'Could not find service-floor voidOrder document');
  cases.push(['service-floor order void', voidDocument]);
  const recovery = read('features/platform/payments/components/CheckoutRecovery.tsx');
  const queryStart = recovery.indexOf("const PAGE_QUERY = `");
  const queryBodyStart = queryStart < 0 ? -1 : queryStart + "const PAGE_QUERY = `".length;
  const queryEnd = queryBodyStart < 0 ? -1 : recovery.indexOf("`;", queryBodyStart);
  const recoveryQuery = queryBodyStart >= 0 && queryEnd > queryBodyStart ? recovery.slice(queryBodyStart, queryEnd) : undefined;
  assert.ok(recoveryQuery, 'Could not find checkout recovery page query');
  cases.push(['checkout recovery pagination', recoveryQuery]);
  const notificationSource = read('features/platform/payments/components/RestaurantNotifications.tsx');
  const notificationStart = notificationSource.indexOf('const PAGE_QUERY = `');
  const notificationBodyStart = notificationStart < 0 ? -1 : notificationStart + 'const PAGE_QUERY = `'.length;
  const notificationEnd = notificationBodyStart < 0 ? -1 : notificationSource.indexOf('`;', notificationBodyStart);
  const notificationQuery = notificationBodyStart >= 0 && notificationEnd > notificationBodyStart ? notificationSource.slice(notificationBodyStart, notificationEnd) : undefined;
  assert.ok(notificationQuery, 'Could not find notification queue page query');
  cases.push(['notification queue pagination', notificationQuery]);
  cases.push(['category performance helper', functionTemplateDocument(read('features/platform/reports/actions/salesReports.ts'), 'getCategoryPerformance')]);
  cases.push(['single gift-card helper', functionTemplateDocument(read('features/platform/gift-cards/actions/index.ts'), 'getGiftCard')]);
  cases.push(['single payment-provider helper', functionTemplateDocument(read('features/platform/payment-providers/actions/index.ts'), 'getPaymentProvider')]);

  for (const [surface, source] of cases) {
    const errors = validate(schema, parse(source));
    assert.deepEqual(errors.map((error) => error.message), [], `${surface} GraphQL contract is invalid`);
  }
});

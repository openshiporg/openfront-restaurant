import test from 'node:test';
import assert from 'node:assert/strict';
import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLError } from 'graphql';
import { assertOrderingAvailable } from '../features/lib/restaurant-hours';
import { customerErrorMessage } from '../features/lib/customer-errors';

const settings = { name: 'Craft Burgers', timezone: 'America/Chicago', hours: { monday: '11:00 AM - 10:00 PM', sunday: '11:00 AM - 10:00 PM', _ordering: { mealPeriods: { lunch: { open: '11:00', close: '14:00' } } } } };

test('closed rule gives source name, local opening and ISO across DST fallback', () => {
  assert.throws(() => assertOrderingAvailable(settings, undefined, new Date('2026-11-01T06:00:00Z')), (error: any) => {
    assert.equal(error.extensions.code, 'RESTAURANT_CLOSED');
    assert.equal(error.extensions.opensAt, '2026-11-01T17:00:00.000Z');
    assert.match(error.message, /Craft Burgers is closed right now\. Ordering opens at .*11:00 AM CST\./);
    return true;
  });
});

test('service period is public; schedule configuration stays internal', () => {
  assert.throws(() => assertOrderingAvailable(settings, { mealPeriods: ['lunch'] }, new Date('2026-11-02T22:00:00Z')), (error: any) => error.extensions.code === 'OUTSIDE_SERVICE_PERIOD');
  assert.throws(() => assertOrderingAvailable({}), (error: any) => !(error instanceof GraphQLError));
});

test('production Yoga HTTP preserves public code/message and masks internal failures', async () => {
  const yoga = createYoga({ logging: false, maskedErrors: { isDev: false }, schema: makeExecutableSchema({
    typeDefs: 'type Query { closed: String, period: String, internal: String, demo: String }',
    resolvers: { Query: {
      closed: () => assertOrderingAvailable(settings, undefined, new Date('2026-11-02T07:00:00Z')),
      period: () => assertOrderingAvailable(settings, { mealPeriods: ['lunch'] }, new Date('2026-11-02T22:00:00Z')),
      internal: () => assertOrderingAvailable({}),
      demo: () => { throw new GraphQLError('This item is display only.', { extensions: { code: 'DEMO_ITEM_NOT_FOR_SALE', privateData: 'secret' } }); },
    } },
  }) });
  const response = await yoga.fetch('http://localhost/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ closed period internal demo }' }) });
  const body = await response.json() as any;
  const errors = Object.fromEntries(body.errors.map((error: any) => [error.path[0], error]));
  assert.equal(errors.closed.extensions.code, 'RESTAURANT_CLOSED');
  assert.match(errors.closed.message, /Craft Burgers is closed right now/);
  assert.equal(errors.closed.extensions.opensAt, '2026-11-02T17:00:00.000Z');
  assert.equal(errors.period.extensions.code, 'OUTSIDE_SERVICE_PERIOD');
  assert.equal(errors.internal.message, 'Unexpected error.');
  assert.equal(errors.demo.message, 'This item is display only.');
  assert.equal(errors.demo.extensions.code, 'DEMO_ITEM_NOT_FOR_SALE');
  assert.equal(JSON.stringify(body).includes('schedule is not configured'), false);
  assert.equal(customerErrorMessage({ response: { errors: [errors.closed] } }, 'fallback'), errors.closed.message);
});

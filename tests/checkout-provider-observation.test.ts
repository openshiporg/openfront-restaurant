import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentStatusFunction as getPayPalPaymentStatus } from '../features/integrations/payment/paypal';
import {
  assertCapturedCheckoutPayment,
  assertCheckoutProviderObservation,
} from '../features/keystone/utils/checkoutProviderObservation';

const quote = { amount: 1000, currencyCode: 'USD' };

test('checkout accepts only a complete provider observation with the exact net amount and currency', () => {
  assert.doesNotThrow(() => assertCheckoutProviderObservation({
    status: 'succeeded', amount: 1000, currencyCode: 'USD', refundsComplete: true, refunds: [],
  }, quote.amount, quote.currencyCode));
  assert.doesNotThrow(() => assertCheckoutProviderObservation({
    status: 'requires_capture', amount: 1000, currencyCode: 'USD',
  }, quote.amount, quote.currencyCode));

  assert.throws(() => assertCheckoutProviderObservation({
    status: 'succeeded', amount: 1000, currencyCode: 'EUR', refundsComplete: true, refunds: [],
  }, quote.amount, quote.currencyCode), /currency/);
  assert.throws(() => assertCheckoutProviderObservation({
    status: 'succeeded', amount: 1000, currencyCode: 'USD', refundsComplete: false, refunds: [],
  }, quote.amount, quote.currencyCode), /incomplete/);
  assert.throws(() => assertCheckoutProviderObservation({
    status: 'succeeded', amount: 1000, currencyCode: 'USD', refundsComplete: true,
    refunds: [{ status: 'pending', amount: 100, currency: 'USD' }],
  }, quote.amount, quote.currencyCode), /unresolved refund/);
});

test('a successful partial or full refund cannot satisfy the original checkout quote', () => {
  for (const refundedAmount of [250, 1000]) {
    assert.throws(() => assertCheckoutProviderObservation({
      status: 'succeeded', amount: 1000, currencyCode: 'USD', refundsComplete: true,
      refunds: [{ id: 'refund', status: 'succeeded', amount: refundedAmount, currency: 'USD' }],
    }, quote.amount, quote.currencyCode), /net captured amount/);
  }
});

test('captured amount and currency are checked before order persistence', () => {
  assert.doesNotThrow(() => assertCapturedCheckoutPayment({
    status: 'succeeded', amount: 1000, currencyCode: 'USD',
  }, quote.amount, quote.currencyCode));
  assert.throws(() => assertCapturedCheckoutPayment({
    status: 'succeeded', amount: 999, currencyCode: 'USD',
  }, quote.amount, quote.currencyCode), /amount/);
  assert.throws(() => assertCapturedCheckoutPayment({
    status: 'succeeded', amount: 1000, currencyCode: 'EUR',
  }, quote.amount, quote.currencyCode), /currency/);
});

test('PayPal partial/refunded capture states fail closed without contacting PayPal', async () => {
  const envKeys = ['NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'NEXT_PUBLIC_PAYPAL_SANDBOX'] as const;
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = 'offline-fixture-client';
  process.env.PAYPAL_CLIENT_SECRET = 'offline-fixture-secret';
  process.env.NEXT_PUBLIC_PAYPAL_SANDBOX = 'true';

  const providerStatuses = ['PARTIALLY_REFUNDED', 'REFUNDED'];
  let requestedPaymentStatus = '';
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));
    if (url.endsWith('/v1/oauth2/token')) {
      return Response.json({ access_token: 'offline-fixture-token' });
    }
    assert.ok(url.endsWith('/v2/checkout/orders/fixture-order'));
    return Response.json({
      status: 'COMPLETED',
      purchase_units: [{
        amount: { currency_code: 'USD', value: '10.00' },
        payments: { captures: [{
          id: 'fixture-capture',
          status: requestedPaymentStatus,
          amount: { currency_code: 'USD', value: '10.00' },
        }] },
      }],
    });
  };

  try {
    for (const status of providerStatuses) {
      requestedPaymentStatus = status;
      const observation = await getPayPalPaymentStatus({ paymentId: 'fixture-order' });
      assert.equal(observation.amount, quote.amount);
      assert.equal(observation.currencyCode, quote.currencyCode);
      assert.equal(observation.refundsComplete, false);
      assert.throws(() => assertCheckoutProviderObservation(observation, quote.amount, quote.currencyCode), /incomplete/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

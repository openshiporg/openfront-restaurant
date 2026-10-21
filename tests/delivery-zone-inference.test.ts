import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeliveryConfigurationError, inferDefaultDeliveryPostalCodes, isDeliveryConfigured, normalizeDeliveryPostalCodeList } from '../features/lib/delivery-zones';
import restaurantSeed from '../features/platform/onboarding/lib/seed.json';
import { validateRestaurantSeed } from '../features/platform/onboarding/utils/seedRecords';

test('delivery onboarding extracts only the postal token for explicitly supported address countries', () => {
  assert.deepEqual(inferDefaultDeliveryPostalCodes({ countryCode: 'US', address: '123 Main St, Brooklyn, NY 11201' }), ['11201']);
  assert.deepEqual(inferDefaultDeliveryPostalCodes({ countryCode: 'US', address: '123 Main St, Springfield, IL 62701' }), ['62701']);
  assert.deepEqual(inferDefaultDeliveryPostalCodes({ countryCode: 'US', address: '123 Main St, Brooklyn, NY 11201-1234' }), ['11201']);
  assert.deepEqual(inferDefaultDeliveryPostalCodes({ countryCode: 'GB', address: '10 Downing Street, London SW1A 2AA' }), ['SW1A2AA']);
  assert.deepEqual(inferDefaultDeliveryPostalCodes({ countryCode: 'CA', address: '100 Queen St W, Toronto, ON M5H 2N2' }), ['M5H2N2']);
});

test('unknown-country freeform addresses do not silently enable malformed delivery zones', () => {
  const inferred = inferDefaultDeliveryPostalCodes({ address: '123 Main St, Brooklyn, NY 11201' });
  assert.deepEqual(inferred, []);
  assert.equal(isDeliveryConfigured({ deliveryEnabled: true, countryCode: 'US', deliveryPostalCodes: inferred }), false);
});

test('delivery configuration requires an explicit valid country and postal allowlist', () => {
  assert.match(getDeliveryConfigurationError({ deliveryEnabled: true, countryCode: 'US', deliveryPostalCodes: [] }) || '', /explicit delivery postal code/);
  assert.match(getDeliveryConfigurationError({ deliveryEnabled: true, countryCode: '', deliveryPostalCodes: ['11201'] }) || '', /country code/);
  assert.match(getDeliveryConfigurationError({ deliveryEnabled: true, countryCode: 'US', deliveryPostalCodes: ['11201/999'] }) || '', /alphanumeric/);
  assert.equal(getDeliveryConfigurationError({ deliveryEnabled: false, deliveryPostalCodes: [] }), null);
  assert.deepEqual(normalizeDeliveryPostalCodeList([' 11201 ', '11201', 'ab1 2cd']), ['11201', 'AB12CD']);
  assert.equal(isDeliveryConfigured({ deliveryEnabled: true, countryCode: 'US', deliveryPostalCodes: ['11201'] }), true);
});

test('explicit merchant zones take precedence over address inference', () => {
  assert.deepEqual(inferDefaultDeliveryPostalCodes({
    countryCode: 'US',
    address: '123 Main St, Brooklyn, NY 11201',
    deliveryPostalCodes: ['10001', '10002'],
  }), ['10001', '10002']);
});

test('built-in onboarding seed remains pickup-only until a merchant configures delivery zones', () => {
  assert.equal(restaurantSeed.storeInfo.deliveryEnabled, false);
  assert.deepEqual(restaurantSeed.storeInfo.deliveryPostalCodes, []);
  assert.doesNotThrow(() => validateRestaurantSeed(restaurantSeed));
});

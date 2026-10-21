import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkoutDisplayItems,
  checkoutDisplayPricing,
  checkoutSessionMatchesPricing,
} from '../features/storefront/lib/checkout-quote-display';

const zeroSettings = {
  currencyCode: 'USD',
  deliveryFee: 0,
  pickupDiscount: 0,
  taxRate: 0,
};

test('checkout display preserves explicitly configured zero discount and tax', () => {
  const pricing = checkoutDisplayPricing({ subtotal: 1000, orderType: 'pickup', tipPercent: 0 }, zeroSettings);
  assert.equal(pricing.pickupDiscount, 0);
  assert.equal(pricing.tax, 0);
  assert.equal(pricing.total, 1000);
});

test('an active immutable checkout quote wins over subsequently changed cart and settings values', () => {
  const cart = {
    subtotal: 1200,
    orderType: 'pickup',
    tipPercent: '15',
    items: [{ id: 'live-item', quantity: 1, menuItem: { id: 'menu', name: 'Renamed', price: 1200 } }],
    paymentCollection: { paymentSessions: [{
      id: 'session', isSelected: true, amount: 1000,
      data: { state: 'ready', checkoutQuote: {
        version: 1,
        currencyCode: 'USD',
        cart: { orderType: 'pickup', tipPercent: '0' },
        items: [{
          menuItem: { id: 'menu', name: 'Original name', price: 900, thumbnail: '/original.jpg' },
          modifiers: [{ id: 'modifier', name: 'Original option', priceAdjustment: 100 }],
          quantity: 1,
          specialInstructions: 'Original request',
          unitPrice: 1000,
        }],
        pricing: { subtotal: 1000, deliveryFee: 0, pickupDiscount: 0, tax: 0, tip: 0, total: 1000 },
      } },
    }] },
  };

  const pricing = checkoutDisplayPricing(cart, { ...zeroSettings, pickupDiscount: 10, taxRate: 8.75 });
  assert.equal(pricing.total, 1000);
  assert.equal(checkoutSessionMatchesPricing(cart.paymentCollection.paymentSessions[0], pricing), true);
  assert.equal(checkoutSessionMatchesPricing({ amount: 1100, isSelected: true }, pricing), false);

  const [item] = checkoutDisplayItems(cart);
  assert.equal(item.menuItem.name, 'Original name');
  assert.equal(item.menuItem.price + item.modifiers[0].priceAdjustment, 1000);
  assert.equal(item.specialInstructions, 'Original request');
});

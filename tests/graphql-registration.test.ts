import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSchema, validateSchema } from 'graphql';
import { extendGraphqlSchema } from '../features/keystone/mutations';
test('custom schema registers the connected operator and customer workflows without runtime services', () => {
  const schema = extendGraphqlSchema(buildSchema(readFileSync(new URL('../schema.graphql', import.meta.url), 'utf8')));
  assert.deepEqual(validateSchema(schema), []);
  const query = schema.getQueryType()!.getFields(), mutation = schema.getMutationType()!.getFields();
  for (const name of ['restaurantBusinessDays', 'restaurantAttendance', 'previewRestaurantTipPool', 'restaurantPrivacyRequests', 'restaurantOperationsRecovery', 'restaurantCheckAllocation', 'restaurantIngredientLots', 'restaurantPurchaseEvidence', 'previewRestaurantCampaign']) assert.ok(query[name]?.resolve, name);
  for (const name of ['openRestaurantBusinessDay', 'closeRestaurantBusinessDay', 'reconcileRefund', 'recoverCheckoutPayment', 'cancelCheckoutPaymentSession', 'recordRestaurantAttendance', 'approveRestaurantTimeCorrection', 'ensureRestaurantOnboardingRecord', 'receivePurchaseOrder', 'reviewLegacyRestaurantRecipes', 'sendRestaurantNotification', 'issueGiftCard', 'mergeChecks', 'splitCheckByGuest', 'splitCheckBySeat', 'recombineEqualChecks', 'recordRestaurantPurchaseInvoice', 'recordRestaurantPurchaseCredit', 'setRestaurantLotHold', 'createRestaurantCampaign', 'dispatchRestaurantCampaign']) assert.ok(mutation[name]?.resolve, name);
  assert.ok(mutation.createTipPoolLedger.args.find(a => a.name === 'sourceNote'));
  assert.ok(mutation.updateTipPoolStatus.args.find(a => a.name === 'payoutReference'));
});

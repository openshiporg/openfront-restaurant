import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSchema, parse, validate, validateSchema } from "graphql";
import { extendGraphqlSchema } from "../features/keystone/mutations";
import {
  confirmAndReplayVerifiedRefundWebhook,
  isEligibleVerifiedRefundWebhook,
  REFUND_CORRELATION_PENDING_ERROR,
  RETRY_VERIFIED_REFUND_WEBHOOK_MUTATION,
  VERIFIED_REFUND_REPLAY_CONFIRMATION,
  VERIFIED_REFUND_WEBHOOK_WHERE,
  VERIFIED_REFUND_WEBHOOKS_QUERY,
} from "../features/platform/payments/components/verifiedRefundWebhookRecoveryContract";

const schema = extendGraphqlSchema(
  buildSchema(readFileSync(resolve(process.cwd(), "schema.graphql"), "utf8")),
);

test("dashboard query/mutation validate against the actual custom Keystone schema and narrow Stripe refund candidates", () => {
  assert.deepEqual(validateSchema(schema), []);
  assert.equal(typeof schema.getMutationType()?.getFields().retryVerifiedRefundWebhookEvent?.resolve, "function");
  assert.deepEqual(validate(schema, parse(VERIFIED_REFUND_WEBHOOKS_QUERY)).map(error => error.message), []);
  assert.deepEqual(validate(schema, parse(RETRY_VERIFIED_REFUND_WEBHOOK_MUTATION)).map(error => error.message), []);
  assert.deepEqual(VERIFIED_REFUND_WEBHOOK_WHERE, {
    AND: [
      { status: { equals: "failed" } },
      { providerCode: { equals: "pp_stripe_stripe" } },
      { eventType: { in: ["charge.refunded", "refund.created", "refund.updated", "refund.failed"] } },
      { error: { equals: REFUND_CORRELATION_PENDING_ERROR } },
    ],
  });
  assert.doesNotMatch(VERIFIED_REFUND_WEBHOOKS_QUERY, /payload|rawBody/i);
});

test("row action is limited to the exact failed Stripe refund correlation miss", () => {
  const eligible = {
    status: "failed",
    providerCode: "pp_stripe_stripe",
    eventType: "refund.updated",
    error: REFUND_CORRELATION_PENDING_ERROR,
  };
  assert.equal(isEligibleVerifiedRefundWebhook(eligible), true);
  for (const changed of [
    { ...eligible, status: "processed" },
    { ...eligible, providerCode: "pp_paypal_paypal" },
    { ...eligible, eventType: "payment_intent.succeeded" },
    { ...eligible, error: "signature verification failed" },
  ]) assert.equal(isEligibleVerifiedRefundWebhook(changed), false);
});

test("confirmation gates mutation and stale outcomes are generic and refresh the queue", async () => {
  let replays = 0;
  let refreshes = 0;
  let message = "";
  const cancelled = await confirmAndReplayVerifiedRefundWebhook({
    eventId: "event-1",
    confirm: confirmation => { assert.equal(confirmation, VERIFIED_REFUND_REPLAY_CONFIRMATION); assert.match(confirmation, /does not contact Stripe/); return false; },
    replay: async () => { replays++; return { success: true }; },
    refresh: async () => { refreshes++; },
    setMessage: value => { message = value; },
  });
  assert.equal(cancelled, "cancelled");
  assert.equal(replays, 0);
  assert.equal(refreshes, 0);

  const stale = await confirmAndReplayVerifiedRefundWebhook({
    eventId: "event-1",
    confirm: () => true,
    replay: async () => { replays++; throw new Error("provider credential detail must not be shown"); },
    refresh: async () => { refreshes++; },
    setMessage: value => { message = value; },
  });
  assert.equal(stale, "failed");
  assert.equal(replays, 1);
  assert.equal(refreshes, 1);
  assert.match(message, /current status/);
  assert.doesNotMatch(message, /provider credential/);

  const alreadyProcessed = await confirmAndReplayVerifiedRefundWebhook({
    eventId: "event-1",
    confirm: () => true,
    replay: async () => ({ success: true, alreadyProcessed: true }),
    refresh: async () => { refreshes++; },
    setMessage: value => { message = value; },
  });
  assert.equal(alreadyProcessed, "completed");
  assert.match(message, /already processed/);
  assert.equal(refreshes, 2);
});

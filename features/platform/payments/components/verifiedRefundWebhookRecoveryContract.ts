import { REFUND_CORRELATION_PENDING_ERROR, VERIFIED_STRIPE_REFUND_EVENT_TYPES } from "../../../lib/verified-refund-webhook";
export { REFUND_CORRELATION_PENDING_ERROR, VERIFIED_STRIPE_REFUND_EVENT_TYPES } from "../../../lib/verified-refund-webhook";

export const VERIFIED_REFUND_WEBHOOK_PAGE_SIZE = 25;

export const VERIFIED_REFUND_WEBHOOK_WHERE = {
  AND: [
    { status: { equals: "failed" } },
    { providerCode: { equals: "pp_stripe_stripe" } },
    { eventType: { in: [...VERIFIED_STRIPE_REFUND_EVENT_TYPES] } },
    { error: { equals: REFUND_CORRELATION_PENDING_ERROR } },
  ],
};

export const VERIFIED_REFUND_WEBHOOKS_QUERY = `query VerifiedRefundWebhookEvents($where: PaymentWebhookEventWhereInput!, $take: Int!, $skip: Int!) {
  paymentWebhookEvents(where: $where, orderBy: [{ receivedAt: asc }, { id: asc }], take: $take, skip: $skip) {
    id providerCode providerEventId eventType status error attempts receivedAt
  }
  paymentWebhookEventsCount(where: $where)
}`;

export const RETRY_VERIFIED_REFUND_WEBHOOK_MUTATION = `mutation RetryVerifiedRefundWebhookEvent($eventId: ID!) {
  retryVerifiedRefundWebhookEvent(eventId: $eventId)
}`;

/** Client-side defense for stale or unexpected query rows; the mutation rechecks every precondition. */
export function isEligibleVerifiedRefundWebhook(row: any): boolean {
  return row?.status === "failed"
    && row?.providerCode === "pp_stripe_stripe"
    && VERIFIED_STRIPE_REFUND_EVENT_TYPES.includes(row?.eventType)
    && row?.error === REFUND_CORRELATION_PENDING_ERROR;
}

export const VERIFIED_REFUND_REPLAY_CONFIRMATION =
  "Replay this stored, previously signature-verified Stripe refund event against local records only? This does not contact Stripe or retry delivery.";

/** Confirms first, hides mutation errors, and always refreshes after a confirmed attempt. */
export async function confirmAndReplayVerifiedRefundWebhook(input: {
  eventId: string;
  confirm: (message: string) => boolean;
  replay: (eventId: string) => Promise<{ success?: boolean; alreadyProcessed?: boolean }>;
  refresh: () => Promise<void>;
  setMessage: (message: string) => void;
}): Promise<"cancelled" | "completed" | "failed"> {
  if (!input.confirm(VERIFIED_REFUND_REPLAY_CONFIRMATION)) return "cancelled";
  let result: "completed" | "failed" = "completed";
  try {
    const outcome = await input.replay(input.eventId);
    if (!outcome?.success) throw new Error("Replay was not acknowledged");
    input.setMessage(outcome.alreadyProcessed
      ? "This event was already processed."
      : "Stored refund event processed locally.");
  } catch {
    result = "failed";
    input.setMessage("Could not process this event. Refresh the list and review its current status.");
  }
  try {
    await input.refresh();
  } catch {
    result = "failed";
    input.setMessage("The event status may have changed, but the list could not be refreshed. Reload before acting again.");
  }
  return result;
}

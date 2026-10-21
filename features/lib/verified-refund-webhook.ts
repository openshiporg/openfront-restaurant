export const REFUND_CORRELATION_PENDING_ERROR = "Awaiting payment correlation; retry this verified event";

export const VERIFIED_STRIPE_REFUND_EVENT_TYPES = [
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const;

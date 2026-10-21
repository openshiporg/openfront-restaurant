import Stripe from "stripe";
import { stripeRefundReference } from "../../keystone/utils/paymentState";

const getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error("Stripe secret key not configured");
  }
  return new Stripe(stripeKey);
};

export async function createPaymentFunction({ order, amount, currency, idempotencyKey }: { order: any; amount: number; currency: string; idempotencyKey?: string }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: order?.id || "",
        orderNumber: order?.orderNumber || "",
      },
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

export async function capturePaymentFunction({ paymentId, amount, idempotencyKey }: { paymentId: string; amount?: number; idempotencyKey?: string }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    ...(amount == null ? {} : { amount_to_capture: amount }),
  }, idempotencyKey ? { idempotencyKey } : undefined);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    currencyCode: paymentIntent.currency.toUpperCase(),
    data: paymentIntent,
  };
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey, refundId }: { paymentId: string; amount: number; idempotencyKey?: string; refundId?: string }) {
  const stripe = getStripeClient();

  const refund = refundId ? await stripe.refunds.retrieve(refundId) : await stripe.refunds.create(
    { ...stripeRefundReference(paymentId), amount, ...(idempotencyKey ? { metadata: { restaurantRefundKey: idempotencyKey } } : {}) },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return {
    id: refund.id,
    refundId: refund.id,
    status: refund.status,
    amount: refund.amount,
    data: refund,
  };
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  const refunds: Stripe.Refund[] = [];
  let refundsComplete = true;
  for await (const refund of stripe.refunds.list({ payment_intent: paymentId, limit: 100 })) {
    if (refunds.length >= 1000) { refundsComplete = false; break; }
    refunds.push(refund);
  }

  return {
    status: paymentIntent.status,
    amount: paymentIntent.status === "succeeded" ? paymentIntent.amount_received : paymentIntent.amount,
    currencyCode: paymentIntent.currency.toUpperCase(),
    refunds, refundsComplete,
    data: paymentIntent,
  };
}

export async function generatePaymentLinkFunction({ paymentId }: { paymentId: string }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}

export async function handleWebhookFunction({ event, headers, rawBody }: { event: any; headers: any; rawBody?: string }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }

  const stripe = getStripeClient();

  try {
    if (!rawBody) throw new Error("Stripe webhook raw body is required");
    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      headers["stripe-signature"],
      webhookSecret
    );

    return {
      isValid: true,
      event: stripeEvent,
      type: stripeEvent.type,
      resource: stripeEvent.data.object,
    };
  } catch (err: any) {
    throw new Error(`Webhook signature verification failed: ${err?.message || "Unknown error"}`);
  }
}

export async function cancelPaymentFunction({ paymentId, idempotencyKey }: { paymentId: string; idempotencyKey?: string }) {
  const stripe = getStripeClient();
  const current = await stripe.paymentIntents.retrieve(paymentId);
  if (current.status === "canceled") return { status: "cancelled" };
  if (current.status === "succeeded") return { status: "succeeded" };
  const cancelled = await stripe.paymentIntents.cancel(paymentId, {}, idempotencyKey ? { idempotencyKey } : undefined);
  return { status: cancelled.status === "canceled" ? "cancelled" : cancelled.status };
}

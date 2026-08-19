import Stripe from "stripe";

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

export async function capturePaymentFunction({ paymentId, amount }: { paymentId: string; amount: number }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amount,
  });

  return {
    status: paymentIntent.status,
    amount: (paymentIntent as any).amount_captured,
    data: paymentIntent,
  };
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey }: { paymentId: string; amount: number; idempotencyKey?: string }) {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.create(
    { payment_intent: paymentId, amount },
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

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount,
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

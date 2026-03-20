import Stripe from 'stripe';

const getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error('Stripe secret key not configured. Set STRIPE_SECRET_KEY environment variable.');
  }
  return new Stripe(stripeKey, {
    typescript: true,
  });
};

// Lazy initialization - only create client when actually needed
let stripeClient: Stripe | null = null;

export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    if (!stripeClient) {
      stripeClient = getStripeClient();
    }
    return (stripeClient as any)[prop];
  }
});

// Webhook secret for verifying webhook signatures
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Helper function to create a payment intent for a restaurant order
export async function createPaymentIntent({
  amount,
  currency = 'usd',
  orderId,
  customerId,
  metadata = {},
}: {
  amount: number; // Amount in cents
  currency?: string;
  orderId: string;
  customerId?: string;
  metadata?: Record<string, string>;
}) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    metadata: {
      orderId,
      ...metadata,
    },
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return paymentIntent;
}

// Helper function to capture an authorized payment
export async function capturePayment(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
  return paymentIntent;
}

// Helper function to cancel a payment intent
export async function cancelPayment(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
  return paymentIntent;
}

// Helper function to refund a payment
export async function refundPayment({
  paymentIntentId,
  amount,
  reason,
}: {
  paymentIntentId: string;
  amount?: number; // Amount in cents (optional for partial refund)
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason,
  });

  return refund;
}

// Helper function to retrieve payment intent details
export async function getPaymentIntent(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent;
}

// Type exports for convenience
export type { Stripe };

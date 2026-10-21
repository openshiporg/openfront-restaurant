export async function handleWebhookFunction({ event, headers }: { event: any; headers: any }) {
  return {
    isValid: true,
    event,
    type: event.type,
    resource: event.data,
  };
}

export async function createPaymentFunction({ order, amount, currency }: { order: any; amount: number; currency: string }) {
  return {
    status: "pending",
    data: {
      status: "pending",
      amount,
      currency: currency.toLowerCase(),
      orderId: order?.id,
    },
  };
}

export async function capturePaymentFunction({ paymentId, amount }: { paymentId: string; amount: number }) {
  return {
    status: "captured",
    amount,
    data: {
      status: "captured",
      amount,
      captured_at: new Date().toISOString(),
    },
  };
}

export async function refundPaymentFunction({ paymentId, amount }: { paymentId: string; amount: number }) {
  return {
    status: "refunded",
    amount,
    data: {
      status: "refunded",
      amount,
      refunded_at: new Date().toISOString(),
    },
  };
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  return {
    status: "succeeded",
    data: {
      status: "succeeded",
    },
  };
}

export async function generatePaymentLinkFunction({ paymentId }: { paymentId: string }) {
  return null;
}

export async function cancelPaymentFunction() { return { status: "cancelled" }; }

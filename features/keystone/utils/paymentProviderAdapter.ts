export async function executeAdapterFunction({ provider, functionName, args }: { provider: any; functionName: string; args: any }) {
  const functionPath = provider[functionName];

  if (functionPath.startsWith("http")) {
    const response = await fetch(functionPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...args }),
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.statusText}`);
    }
    return response.json();
  }

  const adapter = await import(`../../integrations/payment/${functionPath}.ts`);

  const fn = adapter[functionName];
  if (!fn) {
    throw new Error(
      `Function ${functionName} not found in adapter ${functionPath}`
    );
  }

  try {
    return await fn({ provider, ...args });
  } catch (error: any) {
    throw new Error(
      `Error executing ${functionName} for provider ${functionPath}: ${error?.message || "Unknown error"}`
    );
  }
}

export async function createPayment({ provider, cart, order, amount, currency, idempotencyKey }: { provider: any; cart?: any; order?: any; amount: number; currency: string; idempotencyKey?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency, idempotencyKey },
  });
}

export async function capturePayment({ provider, paymentId, amount }: { provider: any; paymentId: string; amount?: number }) {
  return executeAdapterFunction({
    provider,
    functionName: "capturePaymentFunction",
    args: { paymentId, amount },
  });
}

export async function refundPayment({ provider, paymentId, amount, currency, idempotencyKey }: { provider: any; paymentId: string; amount: number; currency: string; idempotencyKey?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency, idempotencyKey },
  });
}

export async function getPaymentStatus({ provider, paymentId }: { provider: any; paymentId: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "getPaymentStatusFunction",
    args: { paymentId },
  });
}

export async function generatePaymentLink({ provider, paymentId }: { provider: any; paymentId: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "generatePaymentLinkFunction",
    args: { paymentId },
  });
}

export async function handleWebhook({ provider, event, headers, rawBody }: { provider: any; event: any; headers: any; rawBody?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "handleWebhookFunction",
    args: { event, headers, rawBody },
  });
}

import { paymentProviderAdapters } from "../../integrations/payment";

const ADAPTERS = new Set(Object.keys(paymentProviderAdapters));
const ADAPTER_OPERATIONS = new Set(["createPaymentFunction", "capturePaymentFunction", "refundPaymentFunction", "getPaymentStatusFunction", "generatePaymentLinkFunction", "handleWebhookFunction", "cancelPaymentFunction"]);

export function paymentAdapterPayload(provider: any, args: any) {
  // This is an explicit privileged server-to-adapter contract. Provider secrets are
  // supplied only to that provider's configured adapter, never public metadata.
  const projectedProvider = { id: provider.id, code: provider.code, credentials: provider.credentials || {} };
  const input: Record<string, unknown> = {};
  for (const key of ["cart", "order", "amount", "currency", "idempotencyKey", "paymentId", "refundId", "event", "headers", "rawBody"]) {
    if (args?.[key] !== undefined) input[key] = args[key];
  }
  for (const key of ["cart", "order"]) {
    const record = input[key] as Record<string, unknown> | undefined;
    if (record && typeof record === "object") {
      input[key] = Object.fromEntries(["id", "orderNumber", "orderType", "currencyCode", "subtotal", "tax", "tip", "discount", "total", "customerName", "customerEmail", "email"].filter(field => record[field] !== undefined).map(field => [field, record[field]]));
    }
  }
  // Never forward an application's session cookies/authorization to an adapter.
  if (input.headers && typeof input.headers === "object") {
    input.headers = Object.fromEntries(Object.entries(input.headers).filter(([key]) =>
      key.toLowerCase() === "stripe-signature" || key.toLowerCase().startsWith("paypal-")));
  }
  return { ...input, provider: projectedProvider };
}

export async function executeAdapterFunction({ provider, functionName, args }: { provider: any; functionName: string; args: any }) {
  if (!ADAPTER_OPERATIONS.has(functionName)) throw new Error("Unknown payment adapter operation");
  const functionPath = provider?.[functionName];
  if (typeof functionPath !== "string") throw new Error("Payment adapter is not configured");
  const payload = paymentAdapterPayload(provider, args);
  if (/^https?:/i.test(functionPath)) {
    const endpoint = functionPath;
    try {
      const response = await fetch(endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Payment adapter rejected request");
      return await response.json();
    } catch { throw new Error("External payment adapter request failed; reconcile the original attempt before retrying"); }
  }
  if (!ADAPTERS.has(functionPath)) throw new Error("Unknown registered payment adapter");
  const adapter: any = await paymentProviderAdapters[functionPath as keyof typeof paymentProviderAdapters]();
  const fn = adapter[functionName];
  if (typeof fn !== "function") throw new Error("Payment adapter operation is unavailable");
  try { return await fn(payload); }
  catch { throw new Error(`Payment adapter ${functionName} failed; reconcile the original attempt before retrying`); }
}

export async function createPayment({ provider, cart, order, amount, currency, idempotencyKey }: { provider: any; cart?: any; order?: any; amount: number; currency: string; idempotencyKey?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency, idempotencyKey },
  });
}

export async function capturePayment({ provider, paymentId, amount, idempotencyKey }: { provider: any; paymentId: string; amount?: number; idempotencyKey?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "capturePaymentFunction",
    args: { paymentId, amount, idempotencyKey },
  });
}

export async function refundPayment({ provider, paymentId, amount, currency, idempotencyKey, refundId }: { provider: any; paymentId: string; amount: number; currency: string; idempotencyKey?: string; refundId?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency, idempotencyKey, refundId },
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

export async function cancelPayment({ provider, paymentId, idempotencyKey }: { provider: any; paymentId: string; idempotencyKey?: string }) {
  const selector = provider.getPaymentStatusFunction;
  if (!["stripe", "paypal", "manual"].includes(selector)) throw new Error("External payment adapter cancellation contract is not configured");
  return executeAdapterFunction({ provider: { ...provider, cancelPaymentFunction: selector }, functionName: "cancelPaymentFunction", args: { paymentId, idempotencyKey } });
}

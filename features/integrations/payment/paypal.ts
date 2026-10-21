import { currencyMinorUnitDigits, majorToMinorUnits, minorToMajorUnits } from "../../lib/currency-units"

const getPayPalBaseUrl = () => {
  const isSandbox = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX !== "false";
  return isSandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
};

export const formatPayPalAmount = (amount: number, currency: string): string => {
  const digits = currencyMinorUnitDigits(currency);
  return minorToMajorUnits(amount, currency).toFixed(digits);
};

export const parsePayPalAmount = (value: string, currency: string): number => {
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("PayPal returned an invalid decimal amount");
  const digits = currencyMinorUnitDigits(currency);
  const fraction = normalized.split(".")[1] || "";
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) {
    throw new Error("PayPal amount precision exceeds the currency minor unit");
  }
  const amount = majorToMinorUnits(normalized, currency);
  if (!Number.isSafeInteger(amount)) throw new Error("PayPal amount exceeds the supported safe range");
  return amount;
};

export const normalizePayPalStatus = (status: string | undefined): string => {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED':
      return 'succeeded';
    case 'APPROVED':
      return 'requires_capture';
    case 'VOIDED':
      return 'canceled';
    default:
      return 'pending';
  }
};

const getPayPalAccessToken = async () => {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const baseUrl = getPayPalBaseUrl();
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Language": "en_US",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  const { access_token } = await response.json();
  if (!access_token) {
    throw new Error("Failed to get PayPal access token");
  }

  return access_token;
};

export async function handleWebhookFunction({ event, headers }: { event: any; headers: any }) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PayPal webhook ID is not configured");
  }

  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: event,
      }),
    }
  );

  const verification = await response.json();
  const isValid = verification.verification_status === "SUCCESS";

  if (!isValid) {
    throw new Error("Invalid webhook signature");
  }

  return {
    isValid: true,
    event,
    type: event.event_type,
    resource: event.resource,
  };
}

export async function createPaymentFunction({ order, amount, currency, idempotencyKey }: { order: any; amount: number; currency: string; idempotencyKey?: string }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency.toUpperCase(),
            value: formatPayPalAmount(amount, currency),
          },
          custom_id: order?.id,
        },
      ],
    }),
  });

  const orderResult = await response.json();
  if (orderResult.error) {
    throw new Error(`PayPal order creation failed: ${orderResult.error.message}`);
  }

  return {
    orderId: orderResult.id,
    status: orderResult.status,
  };
}

export async function capturePaymentFunction({ paymentId, idempotencyKey }: { paymentId: string; idempotencyKey?: string }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(
    `${baseUrl}/v2/checkout/orders/${paymentId}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": idempotencyKey || `capture:${paymentId}`,
      },
    }
  );

  const capture = await response.json();
  if (capture.error) {
    throw new Error(`PayPal capture failed: ${capture.error.message}`);
  }

  const capturedAmount = capture.purchase_units[0].payments.captures[0].amount;
  return {
    status: normalizePayPalStatus(capture.status),
    amount: parsePayPalAmount(capturedAmount.value, capturedAmount.currency_code),
    currencyCode: capturedAmount.currency_code.toUpperCase(),
    data: capture,
  };
}

export async function refundPaymentFunction({ paymentId, amount, currency = "USD", idempotencyKey, refundId }: { paymentId: string; amount: number; currency?: string; idempotencyKey?: string; refundId?: string }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(
    refundId ? `${baseUrl}/v2/payments/refunds/${refundId}` : `${baseUrl}/v2/payments/captures/${paymentId}/refund`,
    {
      method: refundId ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}),
      },
      body: refundId ? undefined : JSON.stringify({
        amount: {
          value: formatPayPalAmount(amount, currency),
          currency_code: currency.toUpperCase(),
        },
      }),
    }
  );

  const refund = await response.json();
  if (refund.error) {
    throw new Error(`PayPal refund failed: ${refund.error.message}`);
  }

  return {
    id: refund.id,
    refundId: refund.id,
    status: refund.status,
    amount: parsePayPalAmount(refund.amount.value, refund.amount.currency_code),
    data: refund,
  };
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${paymentId}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const orderResult = await response.json();
  if (orderResult.error) {
    throw new Error(`PayPal status check failed: ${orderResult.error.message}`);
  }

  const purchaseUnits = orderResult.purchase_units || [];
  const orderAmount = purchaseUnits[0]?.amount;
  if (!orderAmount?.currency_code || orderAmount.value == null) throw new Error("PayPal order is missing its quoted amount or currency");
  const captures = purchaseUnits.flatMap((unit: any) => unit.payments?.captures || []);
  const currencies = [orderAmount.currency_code, ...captures.map((capture: any) => capture.amount?.currency_code)]
    .filter(Boolean)
    .map((currency: string) => currency.toUpperCase());
  if (new Set(currencies).size !== 1) throw new Error("PayPal order and capture currencies do not match");

  const status = normalizePayPalStatus(orderResult.status);
  const capturedAmount = captures.reduce((sum: number, capture: any) => {
    if (capture.amount?.value == null) throw new Error("PayPal capture is missing its amount");
    return sum + parsePayPalAmount(capture.amount.value, capture.amount.currency_code);
  }, 0);
  const refundsComplete = status === "requires_capture"
    ? captures.length === 0
    : status === "succeeded" && captures.length > 0 && captures.every((capture: any) => capture.status === "COMPLETED");

  return {
    status,
    amount: status === "succeeded" ? capturedAmount : parsePayPalAmount(orderAmount.value, orderAmount.currency_code),
    currencyCode: currencies[0],
    refunds: [],
    refundsComplete,
    data: orderResult,
  };
}

export async function generatePaymentLinkFunction({ paymentId }: { paymentId: string }) {
  return `https://www.paypal.com/activity/payment/${paymentId}`;
}

export async function cancelPaymentFunction({ paymentId }: { paymentId: string }) {
  const current = await getPaymentStatusFunction({ paymentId });
  // PayPal checkout orders have no general cancellation endpoint. An unapproved
  // order may be abandoned locally only because our completion gate then forbids
  // capture of that deselected session. Authorization/capture must be reconciled.
  if (["CREATED", "PAYER_ACTION_REQUIRED"].includes(current.data?.status)) return { status: "abandoned" };
  return { status: current.status };
}

type RefundObservation = {
  amount?: unknown;
  currency?: unknown;
  currencyCode?: unknown;
  status?: unknown;
};

type ProviderObservation = {
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  currencyCode?: unknown;
  refunds?: unknown;
  refundsComplete?: unknown;
};

function currencyCode(value: unknown): string {
  return String(value || "").toUpperCase();
}

function assertAmount(value: unknown, expected: number, label: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount !== expected) {
    throw new Error(`${label} amount does not match the reserved checkout quote`);
  }
  return amount;
}

export function assertCheckoutProviderObservation(
  observation: ProviderObservation,
  expectedAmount: number,
  expectedCurrencyCode: string,
): void {
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
    throw new Error("Reserved checkout amount is invalid");
  }

  const observedCurrency = currencyCode(observation?.currencyCode ?? observation?.currency);
  if (!/^[A-Z]{3}$/.test(observedCurrency) || observedCurrency !== currencyCode(expectedCurrencyCode)) {
    throw new Error("Provider currency does not match the reserved checkout quote");
  }

  const amount = assertAmount(observation?.amount, expectedAmount, "Provider");
  if (observation.status === "requires_capture") {
    if (Array.isArray(observation.refunds) && observation.refunds.length > 0) {
      throw new Error("Uncaptured checkout unexpectedly contains refund evidence");
    }
    return;
  }
  if (observation.status !== "succeeded") {
    throw new Error(`Payment not successful. Status: ${String(observation.status || "unknown")}`);
  }
  if (observation.refundsComplete !== true || !Array.isArray(observation.refunds)) {
    throw new Error("Provider refund history is incomplete; operator reconciliation required");
  }

  let refundedAmount = 0;
  for (const refund of observation.refunds as RefundObservation[]) {
    if (refund.status === "failed") continue;
    if (refund.status !== "succeeded") {
      throw new Error("Provider has an unresolved refund; operator reconciliation required");
    }
    const refundCurrency = currencyCode(refund.currencyCode ?? refund.currency);
    const refundAmount = Number(refund.amount);
    if (
      !/^[A-Z]{3}$/.test(refundCurrency) ||
      refundCurrency !== observedCurrency ||
      !Number.isSafeInteger(refundAmount) ||
      refundAmount <= 0
    ) {
      throw new Error("Provider refund evidence has invalid amount or currency");
    }
    refundedAmount += refundAmount;
    if (!Number.isSafeInteger(refundedAmount)) {
      throw new Error("Provider refund total exceeds the supported amount range");
    }
  }

  if (amount - refundedAmount !== expectedAmount) {
    throw new Error("Provider net captured amount does not match the reserved checkout quote");
  }
}

export function assertCapturedCheckoutPayment(
  capture: { status?: unknown; amount?: unknown; currency?: unknown; currencyCode?: unknown },
  expectedAmount: number,
  expectedCurrencyCode: string,
): void {
  if (capture?.status !== "succeeded") {
    throw new Error("Payment capture did not succeed; operator reconciliation required");
  }
  if (currencyCode(capture.currencyCode ?? capture.currency) !== currencyCode(expectedCurrencyCode)) {
    throw new Error("Captured payment currency does not match the reserved checkout quote");
  }
  assertAmount(capture.amount, expectedAmount, "Captured payment");
}

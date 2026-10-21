/** ISO 4217 minor-unit scale supplied by the runtime's internationalization data. */
export function currencyMinorUnitDigits(currencyCode = "USD"): number {
  const code = currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Invalid currency code: ${currencyCode}`);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new Error(`Unsupported currency code: ${currencyCode}`);
  }
}

export function currencyMinorUnitScale(currencyCode = "USD"): number {
  return 10 ** currencyMinorUnitDigits(currencyCode);
}

export function majorToMinorUnits(value: number | string, currencyCode = "USD"): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * currencyMinorUnitScale(currencyCode));
}

export function minorToMajorUnits(value: number | string, currencyCode = "USD"): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(parsed)) return 0;
  return parsed / currencyMinorUnitScale(currencyCode);
}

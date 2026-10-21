import type { StoreInfo } from "./store-data"
import { majorToMinorUnits, minorToMajorUnits } from "../../lib/currency-units"

export interface CurrencyConfig {
  currencyCode?: string
  locale?: string
}

const DEFAULT_CONFIG: Required<CurrencyConfig> = {
  currencyCode: "USD",
  locale: "en-US",
}

export function getCurrencyConfig(storeInfo?: Partial<StoreInfo> | null): Required<CurrencyConfig> {
  return {
    currencyCode: storeInfo?.currencyCode || DEFAULT_CONFIG.currencyCode,
    locale: storeInfo?.locale || DEFAULT_CONFIG.locale,
  }
}

/**
 * Formats a monetary amount using locale + currency.
 * By default expects minor units (cents for USD/EUR, no-division currencies supported).
 */
export function formatCurrency(
  amount: number | string,
  config?: CurrencyConfig,
  options?: { inputIsCents?: boolean }
): string {
  const parsed = typeof amount === "string" ? Number.parseFloat(amount) : amount
  if (Number.isNaN(parsed)) {
    const fallback = config?.currencyCode || DEFAULT_CONFIG.currencyCode
    const locale = config?.locale || DEFAULT_CONFIG.locale
    return new Intl.NumberFormat(locale, { style: "currency", currency: fallback }).format(0)
  }

  const currencyCode = config?.currencyCode || DEFAULT_CONFIG.currencyCode
  const locale = config?.locale || DEFAULT_CONFIG.locale
  const inputIsCents = options?.inputIsCents ?? true

  const value = inputIsCents ? minorToMajorUnits(parsed, currencyCode) : parsed

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
  }).format(value)
}

/**
 * Converts major unit value to minor units (e.g. 12.99 => 1299 for USD).
 */
export function toMinorUnits(value: number | string, currencyCode = DEFAULT_CONFIG.currencyCode): number {
  return majorToMinorUnits(value, currencyCode)
}

/**
 * Converts minor units to major units.
 */
export function fromMinorUnits(value: number | string, currencyCode = DEFAULT_CONFIG.currencyCode): number {
  return minorToMajorUnits(value, currencyCode)
}

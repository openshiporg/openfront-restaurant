export function normalizeCountryCode(value?: string | null) {
  return (value || "").trim().toUpperCase()
}

export function normalizePostalCode(value?: string | null) {
  return (value || "").trim().toUpperCase().replace(/[\s-]+/g, "")
}

export function parseDeliveryPostalCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizePostalCode(typeof entry === "string" ? entry : ""))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizePostalCode(entry))
      .filter(Boolean)
  }

  return []
}

export function getUniqueDeliveryPostalCodes(value: unknown): string[] {
  return Array.from(new Set(parseDeliveryPostalCodes(value)))
}

export function normalizeDeliveryPostalCodeList(value: unknown) {
  return Array.isArray(value) || typeof value === "string" ? getUniqueDeliveryPostalCodes(value) : value
}

/** Validate a venue-owned allowlist; postal inference from a street address is not proof of a service area. */
export function getDeliveryConfigurationError(settings?: {
  deliveryEnabled?: boolean | null
  countryCode?: string | null
  deliveryPostalCodes?: unknown
} | null) {
  if (!settings?.deliveryEnabled) return null
  if (!/^[A-Z]{2}$/.test(normalizeCountryCode(settings.countryCode))) {
    return "Choose a valid two-letter country code before enabling delivery"
  }
  const raw = settings.deliveryPostalCodes
  const entries = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []
  if (entries.length === 0) return "Add at least one explicit delivery postal code before enabling delivery"
  if (entries.length > 1000 || entries.some((entry) => typeof entry !== "string" || !normalizePostalCode(entry) || !/^[A-Z0-9]+$/.test(normalizePostalCode(entry)) || normalizePostalCode(entry).length > 16)) {
    return "Delivery postal codes must be explicit alphanumeric codes of at most 16 characters (up to 1,000 codes)"
  }
  return null
}

// An enabled flag alone is not enough: checkout fails closed without zones.
export function isDeliveryConfigured(settings?: {
  deliveryEnabled?: boolean | null
  countryCode?: string | null
  deliveryPostalCodes?: unknown
} | null) {
  return Boolean(settings?.deliveryEnabled) && getDeliveryConfigurationError(settings) === null
}

export function inferDefaultDeliveryPostalCodes(params: {
  deliveryPostalCodes?: unknown
  address?: string | null
  countryCode?: string | null
}) {
  const configured = getUniqueDeliveryPostalCodes(params.deliveryPostalCodes)
  if (configured.length > 0) {
    return configured
  }

  const address = params.address || ""
  const countryCode = normalizeCountryCode(params.countryCode)
  const postalCode = countryCode === "US"
    ? address.match(/(?:^|[\s,])(?:[A-Z]{2}\s+)?(\d{5})(?:-\d{4})?\s*$/i)?.[1]
    : countryCode === "CA"
      ? address.match(/\b([A-Z]\d[A-Z][ -]?\d[A-Z]\d)\s*$/i)?.[1]
      : countryCode === "GB"
        ? address.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i)?.[1]
        : null

  const normalizedPostalCode = normalizePostalCode(postalCode)
  return normalizedPostalCode ? [normalizedPostalCode] : []
}

export function getDeliveryEligibility(params: {
  deliveryEnabled?: boolean | null
  storeCountryCode?: string | null
  deliveryPostalCodes?: unknown
  addressCountryCode?: string | null
  addressPostalCode?: string | null
}) {
  const deliveryEnabled = Boolean(params.deliveryEnabled)
  const storeCountryCode = normalizeCountryCode(params.storeCountryCode)
  const addressCountryCode = normalizeCountryCode(params.addressCountryCode)
  const addressPostalCode = normalizePostalCode(params.addressPostalCode)
  const allowedPostalCodes = getUniqueDeliveryPostalCodes(params.deliveryPostalCodes)

  if (!deliveryEnabled) {
    return {
      eligible: false,
      reason: "delivery_disabled" as const,
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode,
    }
  }

  if (getDeliveryConfigurationError({ deliveryEnabled, countryCode: storeCountryCode, deliveryPostalCodes: params.deliveryPostalCodes })) {
    return {
      eligible: false,
      reason: "missing_delivery_zones" as const,
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode,
    }
  }

  if (!addressCountryCode || !addressPostalCode) {
    return {
      eligible: false,
      reason: "missing_address" as const,
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode,
    }
  }

  if (storeCountryCode && addressCountryCode !== storeCountryCode) {
    return {
      eligible: false,
      reason: "country_mismatch" as const,
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode,
    }
  }

  if (allowedPostalCodes.length === 0) {
    return {
      eligible: false,
      reason: "missing_delivery_zones" as const,
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode,
    }
  }

  if (!allowedPostalCodes.includes(addressPostalCode)) {
    return {
      eligible: false,
      reason: "postal_code_outside_zone" as const,
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode,
    }
  }

  return {
    eligible: true,
    reason: "eligible" as const,
    allowedPostalCodes,
    normalizedPostalCode: addressPostalCode,
  }
}

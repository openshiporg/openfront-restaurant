import { shopperError } from "./shopperError";
import type { Context } from ".keystone/types";
import { getDeliveryEligibility, normalizeCountryCode, normalizePostalCode } from "../../lib/delivery-zones";

export async function getStoreDeliverySettings(context: Context) {
  return context.sudo().query.StoreSettings.findOne({
    where: { id: "1" },
    query: `
      id
      countryCode
      deliveryEnabled
      deliveryPostalCodes
      deliveryMinimum
      deliveryFee
      pickupDiscount
      taxRate
      currencyCode
    `,
  });
}

function getDeliveryErrorMessage(reason: ReturnType<typeof getDeliveryEligibility>["reason"]) {
  switch (reason) {
    case "delivery_disabled":
      return "Delivery is not available for this restaurant.";
    case "missing_address":
      return "Delivery address is incomplete. Add street address, city, postal code, and country code.";
    case "country_mismatch":
      return "This address is outside the restaurant's delivery country.";
    case "postal_code_outside_zone":
      return "This address is outside the restaurant's delivery zone.";
    case "missing_delivery_zones":
      return "Delivery zones have not been configured for this restaurant.";
    default:
      return "Delivery is not available for this address.";
  }
}

export function assertDeliveryModeAllowed(params: {
  orderType?: string | null;
  storeSettings?: {
    deliveryEnabled?: boolean | null;
  } | null;
}) {
  if (params.orderType === "delivery" && !params.storeSettings?.deliveryEnabled) {
    throw shopperError("Delivery is not available for this restaurant.", "DELIVERY_UNAVAILABLE");
  }
}

export function assertDeliveryAddressComplete(params: {
  orderType?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryZip?: string | null;
  deliveryCountryCode?: string | null;
}) {
  if (params.orderType !== "delivery") {
    return
  }

  if (!params.deliveryAddress || !params.deliveryCity || !params.deliveryZip || !params.deliveryCountryCode) {
    throw shopperError("Delivery address is incomplete. Add street address, city, postal code, and country code.", "DELIVERY_ADDRESS_INCOMPLETE")
  }
}

export function assertDeliveryAddressEligible(params: {
  orderType?: string | null;
  storeSettings?: {
    deliveryEnabled?: boolean | null;
    countryCode?: string | null;
    deliveryPostalCodes?: unknown;
  } | null;
  deliveryCountryCode?: string | null;
  deliveryZip?: string | null;
}) {
  if (params.orderType !== "delivery") {
    return
  }

  const eligibility = getDeliveryEligibility({
    deliveryEnabled: params.storeSettings?.deliveryEnabled,
    storeCountryCode: params.storeSettings?.countryCode,
    deliveryPostalCodes: params.storeSettings?.deliveryPostalCodes,
    addressCountryCode: params.deliveryCountryCode,
    addressPostalCode: params.deliveryZip,
  })

  if (!eligibility.eligible) {
    // Missing zone configuration is a store setup problem, not shopper input: it stays masked.
    if (eligibility.reason === "missing_delivery_zones") throw new Error(getDeliveryErrorMessage(eligibility.reason))
    throw shopperError(getDeliveryErrorMessage(eligibility.reason), eligibility.reason === "delivery_disabled" ? "DELIVERY_UNAVAILABLE" : eligibility.reason === "missing_address" ? "DELIVERY_ADDRESS_INCOMPLETE" : "DELIVERY_OUT_OF_ZONE")
  }
}

export function normalizeDeliveryFields<T extends Record<string, any>>(data: T): T {
  const next: Record<string, any> = { ...data }

  if ("deliveryCountryCode" in next) {
    next.deliveryCountryCode = normalizeCountryCode(next.deliveryCountryCode)
  }

  if ("deliveryZip" in next) {
    next.deliveryZip = normalizePostalCode(next.deliveryZip)
  }

  return next as T
}

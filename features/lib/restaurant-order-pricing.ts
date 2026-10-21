import { majorToMinorUnits } from "./currency-units"

type NumericLike = number | string | null | undefined

function toNumber(value: NumericLike, fallback = 0): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toMinorUnits(value: NumericLike, currencyCode = "USD"): number {
  return majorToMinorUnits(toNumber(value), currencyCode)
}

export function isDeliveryOrder(orderType?: string | null): boolean {
  return orderType === "delivery"
}

export function isPickupLikeOrder(orderType?: string | null): boolean {
  return orderType === "pickup" || orderType === "takeout"
}

export function calculateRestaurantTotals({
  subtotal,
  orderType,
  tipPercent,
  deliveryFee,
  deliveryMinimum,
  pickupDiscountPercent,
  taxRate,
  currencyCode = "USD",
}: {
  subtotal: number
  orderType?: string | null
  tipPercent?: NumericLike
  deliveryFee?: NumericLike
  deliveryMinimum?: NumericLike
  pickupDiscountPercent?: NumericLike
  taxRate?: NumericLike
  currencyCode?: string
}) {
  const normalizedSubtotal = toNumber(subtotal)
  const normalizedTipPercent = toNumber(tipPercent)
  const normalizedTaxRate = toNumber(taxRate)
  const normalizedPickupDiscountPercent = toNumber(pickupDiscountPercent)
  const normalizedDeliveryFee = isDeliveryOrder(orderType)
    ? toMinorUnits(deliveryFee, currencyCode)
    : 0
  const normalizedDeliveryMinimum = isDeliveryOrder(orderType)
    ? toMinorUnits(deliveryMinimum, currencyCode)
    : 0

  const pickupDiscount = isPickupLikeOrder(orderType)
    ? Math.round(normalizedSubtotal * (normalizedPickupDiscountPercent / 100))
    : 0
  const tax = Math.round(normalizedSubtotal * (normalizedTaxRate / 100))
  const tip = Math.round(normalizedSubtotal * (normalizedTipPercent / 100))
  const total = normalizedSubtotal - pickupDiscount + normalizedDeliveryFee + tax + tip
  const deliveryMinimumNotMet =
    isDeliveryOrder(orderType) && normalizedDeliveryMinimum > 0 && normalizedSubtotal < normalizedDeliveryMinimum

  return {
    subtotal: normalizedSubtotal,
    deliveryFee: normalizedDeliveryFee,
    deliveryMinimum: normalizedDeliveryMinimum,
    deliveryMinimumNotMet,
    deliveryMinimumShortfall: deliveryMinimumNotMet
      ? normalizedDeliveryMinimum - normalizedSubtotal
      : 0,
    pickupDiscount,
    tax,
    tip,
    total,
  }
}

export function getOrderPriceAdjustments({
  orderType,
  subtotal,
  tax,
  tip,
  discount,
  total,
}: {
  orderType?: string | null
  subtotal: NumericLike
  tax: NumericLike
  tip: NumericLike
  discount?: NumericLike
  total: NumericLike
}) {
  const normalizedSubtotal = toNumber(subtotal)
  const normalizedTax = toNumber(tax)
  const normalizedTip = toNumber(tip)
  const normalizedDiscount = toNumber(discount)
  const normalizedTotal = toNumber(total)
  const baseTotal = normalizedSubtotal + normalizedTax + normalizedTip

  const pickupDiscount = isPickupLikeOrder(orderType)
    ? Math.max(normalizedDiscount, Math.max(0, baseTotal - normalizedTotal))
    : 0
  const deliveryFee = isDeliveryOrder(orderType)
    ? Math.max(0, normalizedTotal - baseTotal + normalizedDiscount)
    : 0
  const remainingDiscount = Math.max(0, normalizedDiscount - pickupDiscount)

  return {
    pickupDiscount,
    deliveryFee,
    remainingDiscount,
  }
}

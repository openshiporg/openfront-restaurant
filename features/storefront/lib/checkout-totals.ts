import { calculateRestaurantTotals } from "@/features/lib/restaurant-order-pricing"

export function calculateRestaurantCheckoutTotals({
  subtotal,
  orderType,
  tipPercent,
  deliveryFee,
  pickupDiscountPercent,
  taxRate,
  currencyCode = "USD",
}: {
  subtotal: number
  orderType: string
  tipPercent: number
  deliveryFee: number
  pickupDiscountPercent: number
  taxRate: number
  currencyCode?: string
}) {
  return calculateRestaurantTotals({
    subtotal,
    orderType,
    tipPercent,
    deliveryFee,
    pickupDiscountPercent,
    taxRate,
    currencyCode,
  })
}

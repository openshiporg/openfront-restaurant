"use client";

import { formatCurrency } from "@/features/storefront/lib/currency";
import { getOrderPriceAdjustments } from "@/features/lib/restaurant-order-pricing";

interface OrderSummaryProps {
  orderType?: string;
  subtotal: number;
  tax: number;
  tip: number;
  discount: number;
  total: number;
  currencyCode?: string;
  locale?: string;
}

export function OrderSummary({
  orderType,
  subtotal,
  tax,
  tip,
  discount,
  total,
  currencyCode = "USD",
  locale = "en-US",
}: OrderSummaryProps) {
  const currencyConfig = { currencyCode, locale };
  const { deliveryFee, pickupDiscount, remainingDiscount } = getOrderPriceAdjustments({
    orderType,
    subtotal,
    tax,
    tip,
    discount,
    total,
  });

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-primary">Order summary</p>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-foreground">{formatCurrency(subtotal, currencyConfig)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="text-foreground">{formatCurrency(tax, currencyConfig)}</span>
        </div>
        {tip > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tip</span>
            <span className="text-foreground">{formatCurrency(tip, currencyConfig)}</span>
          </div>
        ) : null}
        {pickupDiscount > 0 ? (
          <div className="flex items-center justify-between text-emerald-700">
            <span>Pickup discount</span>
            <span>-{formatCurrency(pickupDiscount, currencyConfig)}</span>
          </div>
        ) : null}
        {deliveryFee > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Delivery fee</span>
            <span className="text-foreground">{formatCurrency(deliveryFee, currencyConfig)}</span>
          </div>
        ) : null}
        {remainingDiscount > 0 ? (
          <div className="flex items-center justify-between text-emerald-700">
            <span>Discount</span>
            <span>-{formatCurrency(remainingDiscount, currencyConfig)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between pt-4 text-base font-medium">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">{formatCurrency(total, currencyConfig)}</span>
        </div>
      </div>
    </div>
  );
}

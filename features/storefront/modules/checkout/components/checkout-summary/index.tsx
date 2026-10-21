"use client";

import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/features/storefront/lib/currency";
import { checkoutDisplayItems, checkoutDisplayPricing, checkoutSessionMatchesPricing, selectedCheckoutQuote } from "@/features/storefront/lib/checkout-quote-display";
import PaymentButton from "../payment-button";
import LineItemDisplay from "@/features/storefront/modules/common/components/line-item-display";

type CheckoutSummaryProps = {
  cart: any;
  customer: any;
  storeSettings: any;
};

const CheckoutSummary = ({
  cart,
  customer,
  storeSettings,
}: CheckoutSummaryProps) => {
  const searchParams = useSearchParams();
  const activeSession = cart?.paymentCollection?.paymentSessions?.find(
    (session: any) => session.isSelected
  );
  const checkoutQuote = selectedCheckoutQuote(cart);
  const items = checkoutDisplayItems(cart);
  const pricing = checkoutDisplayPricing(cart, storeSettings);
  const subtotal = pricing.subtotal;
  const orderType = checkoutQuote?.cart?.orderType || cart?.orderType || "pickup";
  const tipPercent = String(checkoutQuote?.cart?.tipPercent ?? cart?.tipPercent ?? "0");
  const currencyConfig = {
    currencyCode: checkoutQuote?.currencyCode || storeSettings?.currencyCode || "USD",
    locale: storeSettings?.locale || "en-US",
  };

  const { deliveryFee, pickupDiscount, tax, tip, total } = pricing;
  const activeSessionMatchesTotal = checkoutSessionMatchesPricing(activeSession, pricing);
  const currentStep = searchParams?.get("step") || "contact";
  const isPaymentStage = currentStep === "payment" || currentStep === "review";

  const hasCustomerInfo = Boolean(cart?.customerName && cart?.email && cart?.customerPhone);
  const hasDeliveryInfo =
    orderType === "pickup" ||
    Boolean(
      cart?.deliveryAddress &&
        cart?.deliveryCity &&
        cart?.deliveryZip &&
        cart?.deliveryCountryCode
    );

  const canShowPaymentControls = Boolean(
    hasCustomerInfo && hasDeliveryInfo && isPaymentStage && activeSession
  );

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="storefront-surface bg-card p-6">
        <div className="border-b border-border pb-4">
          <p className="text-sm font-medium text-primary">Order summary</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</h2>
        </div>

        <div className="mt-2">
          {items.map((item: any) => (
            <LineItemDisplay
              key={item.id}
              item={item}
              currencyCode={currencyConfig.currencyCode}
              locale={currencyConfig.locale}
            />
          ))}
        </div>

        <div className="mt-4 border-t border-border pt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(subtotal, currencyConfig)}
            </span>
          </div>

          {pickupDiscount > 0 && (
            <div className="flex items-center justify-between text-emerald-700">
              <span>Pickup discount</span>
              <span className="font-medium tabular-nums">
                -{formatCurrency(pickupDiscount, currencyConfig)}
              </span>
            </div>
          )}

          {deliveryFee > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(deliveryFee, currencyConfig)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(tax, currencyConfig)}
            </span>
          </div>

          {Number(tipPercent) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tip ({tipPercent}%)</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(tip, currencyConfig)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4 text-base">
            <span className="font-medium text-foreground">Total</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatCurrency(total, currencyConfig)}
            </span>
          </div>
        </div>

        {canShowPaymentControls ? (
          <div className="mt-5 border-t border-border pt-5 space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              By placing your order, you agree to our terms and acknowledge our privacy policy.
            </p>
            {!activeSessionMatchesTotal && checkoutQuote ? (
              <p role="alert" className="text-sm text-destructive">The saved checkout quote does not match its payment session. Cancel or reconcile this unpaid attempt before proceeding.</p>
            ) : null}
            <PaymentButton
              cart={cart}
              billingAddress={customer?.billingAddress || null}
              allowPlacement={activeSessionMatchesTotal}
              data-testid="submit-order-button"
            />
          </div>
        ) : (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm leading-6 text-muted-foreground">
              Complete the steps on the left to unlock order placement.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default CheckoutSummary;

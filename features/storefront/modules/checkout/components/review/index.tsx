"use client"

import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { checkoutDisplayItems, checkoutDisplayPricing, checkoutSessionMatchesPricing, selectedCheckoutQuote } from "@/features/storefront/lib/checkout-quote-display"
import PaymentButton from "../payment-button"
import { ClipboardCheck } from "lucide-react"

const Review = ({
  cart,
  customer,
  storeSettings,
}: {
  cart: any
  customer: any
  storeSettings: any
}) => {
  const storeInfo = storeSettings || {}
  const searchParams = useSearchParams()

  const isOpen = searchParams?.get("step") === "review"

  const orderType = cart?.orderType || "pickup"

  const hasCustomerInfo = !!(cart?.customerName && cart?.email && cart?.customerPhone)
  const hasDeliveryInfo =
    orderType === "pickup" ||
    !!(cart?.deliveryAddress && cart?.deliveryCity && cart?.deliveryZip && cart?.deliveryCountryCode)
  const activeSession = cart?.paymentCollection?.paymentSessions?.find((s: any) => s.isSelected)
  const hasPaymentSession = Boolean(activeSession)
  const previousStepsCompleted = hasCustomerInfo && hasDeliveryInfo && hasPaymentSession

  const checkoutQuote = selectedCheckoutQuote(cart)
  const displayItems = checkoutDisplayItems(cart)
  const pricing = checkoutDisplayPricing(cart, storeInfo)
  const subtotal = pricing.subtotal
  const tipPercent = Number(checkoutQuote?.cart?.tipPercent ?? cart?.tipPercent ?? 0)
  const currencyConfig = { currencyCode: checkoutQuote?.currencyCode || storeInfo?.currencyCode || "USD", locale: storeInfo?.locale || "en-US" }
  const { deliveryFee, pickupDiscount, tax, tip, total } = pricing
  const sessionMatchesQuote = checkoutSessionMatchesPricing(activeSession, pricing)

  return (
    <div>
      <div className="flex flex-row items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-steel flex items-center justify-center">
            <ClipboardCheck className="h-4 w-4 text-warm-700" />
          </div>
          <h2
            className={cn("font-serif font-bold text-xl tracking-tight", {
              "text-muted-foreground": !isOpen || !previousStepsCompleted,
            })}
          >
            Review & Place Order
          </h2>
        </div>
      </div>

      {isOpen && previousStepsCompleted && (
        <>
          {/* Order items */}
          <div className="space-y-3 mb-6">
            {displayItems.map((item: any) => {
              const modifiersTotal = item.modifiers?.reduce((sum: number, m: any) => sum + (m.priceAdjustment || 0), 0) || 0
              const itemTotal = (item.menuItem?.price || 0) + modifiersTotal
              return (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <div className="relative h-14 w-14 shrink-0 bg-muted rounded-lg overflow-hidden">
                    <Image src={item.menuItem?.thumbnail || "/placeholder.jpg"} alt={item.menuItem?.name || ""} fill className="object-cover" sizes="56px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.menuItem?.name}</p>
                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold whitespace-nowrap tabular-nums">{formatCurrency(itemTotal * item.quantity, currencyConfig)}</p>
                    </div>
                    {item.modifiers?.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-0.5">+ {item.modifiers.map((m: any) => m.name).join(", ")}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div className="rounded-xl bg-muted/40 p-4 mb-6">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal, currencyConfig)}</span>
              </div>
              {pickupDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Pickup Discount</span>
                  <span className="tabular-nums">-{formatCurrency(pickupDiscount, currencyConfig)}</span>
                </div>
              )}
              {deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className="tabular-nums">{formatCurrency(deliveryFee, currencyConfig)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatCurrency(tax, currencyConfig)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tip ({tipPercent}%)</span>
                <span className="tabular-nums">{formatCurrency(tip, currencyConfig)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold pt-3">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(total, currencyConfig)}</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            By placing your order, you agree to our Terms of Use, Terms of Sale and acknowledge our Privacy Policy.
          </p>

          {!sessionMatchesQuote && checkoutQuote ? (
            <p role="alert" className="mb-4 text-sm text-destructive">The saved checkout quote does not match its payment session. Cancel or reconcile this unpaid attempt before proceeding.</p>
          ) : null}
          <PaymentButton
            cart={cart}
            billingAddress={customer?.billingAddress || null}
            allowPlacement={sessionMatchesQuote}
            data-testid="submit-order-button"
          />
        </>
      )}
    </div>
  )
}

export default Review

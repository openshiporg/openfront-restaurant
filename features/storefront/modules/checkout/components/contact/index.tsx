"use client"

import { isDeliveryConfigured } from "@/features/lib/delivery-zones"
import { CircleCheck, Loader2, ShoppingBag, Truck, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { submitCheckoutContact } from "@/features/storefront/lib/data/cart"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { calculateRestaurantTotals } from "@/features/lib/restaurant-order-pricing"

const Contact = ({
  cart,
  customer,
  storeSettings,
}: {
  cart: any
  customer: any
  storeSettings: any
}) => {
  const user = customer
  const deliveryEnabled = isDeliveryConfigured(storeSettings)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentStep = searchParams?.get("step") || "contact"
  const isOpen = currentStep === "contact"

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderType, setOrderType] = useState(
    cart?.orderType === "delivery" && !deliveryEnabled ? "pickup" : cart?.orderType || "pickup"
  )
  const [customerInfo, setCustomerInfo] = useState({
    firstName:
      user?.firstName || user?.name?.split(" ")[0] || cart?.customerName?.split(" ")[0] || "",
    lastName:
      user?.lastName ||
      user?.name?.split(" ").slice(1).join(" ") ||
      cart?.customerName?.split(" ").slice(1).join(" ") ||
      "",
    email: user?.email || cart?.email || "",
    phone: user?.phone || cart?.customerPhone || "",
  })

  const isComplete = customerInfo.firstName && customerInfo.lastName && customerInfo.email && customerInfo.phone
  const currencyConfig = {
    currencyCode: storeSettings?.currencyCode || "USD",
    locale: storeSettings?.locale || "en-US",
  }
  const deliveryPricing = calculateRestaurantTotals({
    subtotal: Number(cart?.subtotal || 0),
    orderType,
    tipPercent: Number(cart?.tipPercent || 0),
    deliveryFee: storeSettings?.deliveryFee,
    deliveryMinimum: storeSettings?.deliveryMinimum,
    pickupDiscountPercent: Number(storeSettings?.pickupDiscount || 0),
    taxRate: Number(storeSettings?.taxRate || 0),
    currencyCode: currencyConfig.currencyCode,
  })
  const deliveryMinimumNotMet = Boolean(deliveryPricing.deliveryMinimumNotMet)

  const handleEdit = () => {
    router.push(pathname + "?step=contact", { scroll: false })
  }

  const handleSubmit = async () => {
    if (!isComplete) return
    setIsLoading(true)
    setError(null)

    try {
      if (orderType === "delivery" && deliveryMinimumNotMet) {
        setError(
          `Delivery requires a minimum subtotal of ${formatCurrency(storeSettings?.deliveryMinimum || 0, currencyConfig, {
            inputIsCents: false,
          })}. Add ${formatCurrency(deliveryPricing.deliveryMinimumShortfall, currencyConfig)} more or switch to pickup.`
        )
        setIsLoading(false)
        return
      }

      const result = await submitCheckoutContact({
        email: customerInfo.email,
        customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
        customerPhone: customerInfo.phone,
        orderType,
      })

      if (!result.success) {
        setError(result.message || "Could not proceed. Please try again.")
        setIsLoading(false)
        return
      }

      router.push(pathname + "?step=delivery", { scroll: false })
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <User className="h-4 w-4 text-foreground" />
          </div>
          <h2
            className={cn("font-serif text-xl font-bold tracking-tight", {
              "text-muted-foreground": !isOpen && !isComplete,
            })}
          >
            Contact
          </h2>
          {!isOpen && isComplete ? <CircleCheck className="h-4 w-4 text-green-600" /> : null}
        </div>
        {!isOpen && isComplete ? (
          <Button
            onClick={handleEdit}
            data-testid="edit-contact-button"
            variant="ghost"
            size="sm"
            className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            Edit
          </Button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium text-primary">Order type</div>
            <RadioGroup
              value={orderType}
              onValueChange={(val) => setOrderType(val)}
              className={deliveryEnabled ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3"}
            >
              <div>
                <RadioGroupItem value="pickup" id="order-pickup" className="peer sr-only" />
                <Label
                  htmlFor="order-pickup"
                  className="flex cursor-pointer flex-col gap-2 border border-border bg-muted/35 p-4 transition-colors hover:border-primary/30 peer-data-[state=checked]:border-primary/50 peer-data-[state=checked]:bg-muted"
                >
                  <div className="flex items-center gap-2 text-foreground">
                    <ShoppingBag className="size-4" />
                    <span className="text-base font-medium">Pickup</span>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <span className="block">Free</span>
                    <span className="block">Minimum {formatCurrency(0, currencyConfig, { inputIsCents: false })}</span>
                  </div>
                </Label>
              </div>

              {deliveryEnabled ? (
                <div>
                  <RadioGroupItem value="delivery" id="order-delivery" className="peer sr-only" />
                  <Label
                    htmlFor="order-delivery"
                    className="flex cursor-pointer flex-col gap-2 border border-border bg-muted/35 p-4 transition-colors hover:border-primary/30 peer-data-[state=checked]:border-primary/50 peer-data-[state=checked]:bg-muted"
                  >
                    <div className="flex items-center gap-2 text-foreground">
                      <Truck className="size-4" />
                      <span className="text-base font-medium">Delivery</span>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>{formatCurrency(storeSettings?.deliveryFee || 0, currencyConfig, { inputIsCents: false })}</p>
                      <p>Minimum {formatCurrency(storeSettings?.deliveryMinimum || 0, currencyConfig, { inputIsCents: false })}</p>
                    </div>
                  </Label>
                </div>
              ) : null}
            </RadioGroup>

            {orderType === "delivery" && deliveryMinimumNotMet ? (
              <p className="text-sm font-medium text-amber-700">
                Add {formatCurrency(deliveryPricing.deliveryMinimumShortfall, currencyConfig)} more for delivery, or switch to pickup.
              </p>
            ) : null}

            {!deliveryEnabled ? (
              <p className="text-sm text-muted-foreground">This restaurant is currently pickup only.</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium text-primary">Your details</Label>
              {!user ? (
                <Link href="/account" className="text-sm text-muted-foreground transition-colors hover:text-primary">
                  Sign in instead
                </Link>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                placeholder="First name"
                value={customerInfo.firstName}
                onChange={(e) => setCustomerInfo((prev) => ({ ...prev, firstName: e.target.value }))}
                required
                data-testid="first-name-input"
                className="h-11 border-border bg-background"
              />
              <Input
                placeholder="Last name"
                value={customerInfo.lastName}
                onChange={(e) => setCustomerInfo((prev) => ({ ...prev, lastName: e.target.value }))}
                required
                data-testid="last-name-input"
                className="h-11 border-border bg-background"
              />
            </div>
            <Input
              type="email"
              placeholder="Email"
              value={customerInfo.email}
              onChange={(e) => setCustomerInfo((prev) => ({ ...prev, email: e.target.value }))}
              required
              data-testid="email-input"
              className="h-11 border-border bg-background"
            />
            <Input
              type="tel"
              placeholder="Phone"
              value={customerInfo.phone}
              onChange={(e) => setCustomerInfo((prev) => ({ ...prev, phone: e.target.value }))}
              required
              data-testid="phone-input"
              className="h-11 border-border bg-background"
            />
          </div>

          {error ? (
            <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
              {error}
            </div>
          ) : null}

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!isComplete || isLoading || (orderType === "delivery" && deliveryMinimumNotMet)}
            data-testid="submit-contact-button"
            variant="ghost"
            className="h-12 w-full rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          >
            {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Continue
          </Button>
        </div>
      ) : isComplete ? (
        <div className="space-y-4 pl-11" data-testid="contact-summary">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Contact
            </p>
            <p className="text-sm text-foreground">
              {customerInfo.firstName} {customerInfo.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{customerInfo.email}</p>
            <p className="text-sm text-muted-foreground">{customerInfo.phone}</p>
          </div>
          <div data-testid="order-type-summary">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Order Type
            </p>
            <p className="text-sm capitalize text-foreground">{orderType}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Contact

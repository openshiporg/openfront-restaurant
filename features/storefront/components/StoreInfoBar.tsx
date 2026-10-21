import { isDeliveryConfigured } from "@/features/lib/delivery-zones"
import { orderingWindow } from "@/features/lib/restaurant-hours"
import { Clock3, MapPin, Phone, Star, Truck } from "lucide-react"
import { type StoreInfo } from "@/features/storefront/lib/store-data"
import { formatCurrency } from "@/features/storefront/lib/currency"

interface StoreInfoBarProps {
  storeInfo: StoreInfo
}

export function StoreInfoBar({ storeInfo }: StoreInfoBarProps) {
  const isOpen = orderingWindow(storeInfo.hours, storeInfo.timezone || "UTC", new Date(), Number((storeInfo.hours as any)?._ordering?.cutoffMinutes || 0))
  const status = { isOpen, text: isOpen ? "Accepting orders in the restaurant’s local service window" : "Ordering is outside the restaurant’s service window" }

  return (
    <section className="border-y border-border bg-background">
      <div className="storefront-shell py-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="storefront-surface-soft flex items-center gap-3 px-4 py-3">
            <span className={`size-2 rounded-full ${status.isOpen ? "bg-emerald-500" : "bg-destructive"}`} />
            <div>
              <p className="text-sm font-medium text-foreground">{status.isOpen ? "Open now" : "Closed"}</p>
              <p className="text-sm text-muted-foreground">{status.text}</p>
            </div>
          </div>

          {storeInfo.address ? (
            <div className="storefront-surface-soft flex items-center gap-3 px-4 py-3">
              <MapPin className="size-4 text-primary" />
              <p className="text-sm text-muted-foreground">{storeInfo.address}</p>
            </div>
          ) : null}

          {storeInfo.phone ? (
            <div className="storefront-surface-soft flex items-center gap-3 px-4 py-3">
              <Phone className="size-4 text-primary" />
              <p className="text-sm text-muted-foreground">{storeInfo.phone}</p>
            </div>
          ) : null}

          <div className="storefront-surface-soft flex items-center gap-3 px-4 py-3">
            {isDeliveryConfigured(storeInfo) ? <Truck className="size-4 text-primary" /> : <Clock3 className="size-4 text-primary" />}
            <p className="text-sm text-muted-foreground">
              {isDeliveryConfigured(storeInfo)
                ? `${storeInfo.estimatedDelivery || "Delivery available"} · ${formatCurrency(storeInfo.deliveryFee, { currencyCode: storeInfo.currencyCode, locale: storeInfo.locale }, { inputIsCents: false })}`
                : storeInfo.estimatedPickup || "Pickup available"}
            </p>
          </div>
        </div>

        {storeInfo.rating && storeInfo.reviewCount ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Star className="size-4 fill-primary text-primary" />
            <span className="font-medium text-foreground">{storeInfo.rating}</span>
            <span>from {storeInfo.reviewCount.toLocaleString()} reviews</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Clock, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { setCheckoutTime } from "@/features/storefront/lib/data/cart"
import { orderingWindow } from "@/features/lib/restaurant-hours"
import { timesInLabel } from "@/features/lib/time-zone-label"
import {
  formatScheduled,
  formatSlotTime,
  groupSlots,
  leadForOrderType,
  orderAheadSlots,
} from "@/features/lib/order-ahead"

/**
 * Pickup / delivery time, the Toast and Square way: "As soon as possible" while the kitchen is
 * taking orders, or any 15-minute slot from the next opening through tomorrow, inside store hours
 * and after prep time. When the restaurant is closed, a later time is the only choice.
 */
/** Whether the cart's time is orderable right now: ASAP while open, otherwise a live slot. */
export function orderTimeIsValid(cart: any, storeSettings: any, now = new Date()) {
  const orderType = cart?.orderType || "pickup"
  const timeZone = storeSettings?.timezone || "America/New_York"
  const cutoff = Number(storeSettings?.hours?._ordering?.cutoffMinutes || 0)
  const openNow = storeSettings?.hours ? Boolean(orderingWindow(storeSettings.hours, timeZone, now, cutoff)) : false
  const selected = cart?.scheduledFor ? new Date(cart.scheduledFor).toISOString() : ""
  if (!selected) return openNow
  const slots = orderAheadSlots(storeSettings?.hours, timeZone, leadForOrderType(storeSettings, orderType), now)
  return slots.some((slot) => slot.toISOString() === selected)
}

export default function OrderTime({
  cart,
  storeSettings,
  onValidityChange,
}: {
  cart: any
  storeSettings: any
  onValidityChange?: (valid: boolean) => void
}) {
  const router = useRouter()
  const orderType = cart?.orderType || "pickup"
  const timeZone = storeSettings?.timezone || "America/New_York"
  const locale = storeSettings?.locale || "en-US"
  const lead = leadForOrderType(storeSettings, orderType)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const cutoff = Number(storeSettings?.hours?._ordering?.cutoffMinutes || 0)
  const openNow = storeSettings?.hours ? orderingWindow(storeSettings.hours, timeZone, now, cutoff) : false
  const slots = useMemo(
    () => orderAheadSlots(storeSettings?.hours, timeZone, lead, now),
    [storeSettings?.hours, timeZone, lead, now]
  )
  const groups = useMemo(() => groupSlots(slots, timeZone, now), [slots, timeZone, now])
  const selected = cart?.scheduledFor ? new Date(cart.scheduledFor).toISOString() : ""
  const selectedValid = !selected || slots.some((slot) => slot.toISOString() === selected)
  const selectedDay = selected
    ? groups.find((group) => group.slots.some((slot) => slot.toISOString() === selected))?.label
    : undefined
  const [day, setDay] = useState<string | undefined>(selectedDay)
  const activeDay = day || selectedDay || groups[0]?.label
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const valid = (openNow && !selected) || (Boolean(selected) && selectedValid)
  useEffect(() => {
    onValidityChange?.(valid)
  }, [valid, onValidityChange])

  const choose = async (value: string) => {
    setPending(value || "asap")
    setError(null)
    const result = await setCheckoutTime(value)
    setPending(null)
    if (!result.success) setError(result.message || "That time is no longer available. Choose another time.")
    router.refresh()
  }

  const word = orderType === "delivery" ? "Delivery" : "Pickup"
  const activeSlots = groups.find((group) => group.label === activeDay)?.slots || []

  return (
    <section aria-labelledby="order-time-heading" className="space-y-3" data-testid="order-time">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-foreground" aria-hidden />
        <h3 id="order-time-heading" className="text-sm font-semibold">
          {word} time
        </h3>
      </div>

      {!openNow ? (
        <p className="text-sm text-muted-foreground">
          {slots.length
            ? `We're closed right now. Choose a ${word.toLowerCase()} time and we'll have it ready then.`
            : `We're closed and not taking orders for today or tomorrow.`}
        </p>
      ) : null}

      <div className="grid gap-2" role="radiogroup" aria-label={`${word} time`}>
        {openNow ? (
          <button
            type="button"
            role="radio"
            aria-checked={!selected}
            onClick={() => selected && choose("")}
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
              !selected ? "border-foreground bg-foreground/5 font-semibold" : "border-border hover:border-foreground/40"
            )}
          >
            <span>As soon as possible</span>
            <span className="text-muted-foreground">
              {pending === "asap" ? <Loader2 className="h-4 w-4 animate-spin" /> : `${storeSettings?.[orderType === "delivery" ? "estimatedDelivery" : "estimatedPickup"] || `${lead} min`}`}
            </span>
          </button>
        ) : null}

        {slots.length ? (
          <div
            className={cn(
              "rounded-xl border px-4 py-3",
              selected ? "border-foreground bg-foreground/5" : "border-border"
            )}
          >
            <p className="text-sm font-semibold">
              {selected && selectedValid ? `Scheduled for ${formatScheduled(selected, timeZone, locale, now)}` : "Schedule for later"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{timesInLabel(timeZone, { locale })}</p>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Day">
              {groups.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  role="tab"
                  aria-selected={group.label === activeDay}
                  onClick={() => setDay(group.label)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm",
                    group.label === activeDay ? "border-foreground font-semibold text-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <label htmlFor="order-time-slot" className="sr-only">
              {word} time on {activeDay}
            </label>
            <select
              id="order-time-slot"
              data-testid="order-time-select"
              value={activeSlots.some((slot) => slot.toISOString() === selected) ? selected : ""}
              onChange={(event) => event.target.value && choose(event.target.value)}
              disabled={Boolean(pending)}
              className="mt-3 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">Choose a time</option>
              {activeSlots.map((slot) => (
                <option key={slot.toISOString()} value={slot.toISOString()}>
                  {formatSlotTime(slot, timeZone, locale)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {selected && !selectedValid ? (
        <p className="text-sm text-destructive">That time has passed or is no longer available. Choose another time.</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}

import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { timeZoneLabel, timeZoneNames } from "@/features/lib/time-zone-label"

/**
 * Order-ahead time in the restaurant's own clock, the way Toast and Square show a pickup time:
 * the guest collects at the store, so the store's time zone is the one that matters.
 */
export async function ScheduledTime({ value }: { value: string }) {
  const settings: any = await getStoreSettings().catch(() => null)
  const timeZone = settings?.timezone || "America/New_York"
  const locale = settings?.locale || "en-US"
  const zone = timeZoneNames(timeZone, locale)
  return (
    <time dateTime={value} title={timeZoneLabel(timeZone, { locale, city: true })}>
      {new Date(value).toLocaleString(locale, { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      {zone ? ` ${zone.short || zone.long}` : null}
    </time>
  )
}

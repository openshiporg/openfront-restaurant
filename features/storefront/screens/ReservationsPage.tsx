import { Metadata } from "next"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { StorefrontUnavailable } from "@/features/storefront/components/StorefrontUnavailable"
import ReservationForm from "@/features/storefront/components/ReservationForm"
import { getCurrencyConfig } from "@/features/storefront/lib/currency"
import { addDays, venueDateString } from "@/features/lib/venue-time"

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  const name = settings?.name || "Restaurant"
  return { title: `Reserve a table - ${name}`, description: `Book a table at ${name}. Pick a date, party size and time.` }
}

export default async function ReservationsPage() {
  const settings = await getStoreSettings()
  if (!settings?.timezone || !settings?.hours) {
    return <StorefrontUnavailable title="Reservations aren't open yet" message="Please check back soon, or call us to book." />
  }
  const timezone = settings.timezone
  const today = venueDateString(new Date(), timezone)
  return (
    <main className="bg-white text-ink">
      <div className="storefront-shell py-6 sm:py-10 lg:py-14">
        <h1 className="sf-page-title">Reserve a table</h1>
        <p className="mt-2 max-w-[52ch] sf-lede sm:mt-3">Pick a day, your party size and a time. You&apos;ll get a confirmation straight away.</p>
        <div className="mt-6 max-w-3xl sm:mt-10">
          <ReservationForm today={today} maxDate={addDays(today, 60)} timezone={timezone} locale={getCurrencyConfig(settings).locale} restaurantName={settings.name || "the restaurant"} />
          {settings.phone ? <p className="mt-6 text-ink-soft">Larger group? Call <a className="pass-link" href={`tel:${String(settings.phone).replace(/[^\d+]/g, "")}`}>{settings.phone}</a>.</p> : null}
        </div>
      </div>
    </main>
  )
}

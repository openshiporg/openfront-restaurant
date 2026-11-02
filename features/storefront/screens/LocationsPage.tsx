import { Metadata } from "next"
import Link from "next/link"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { StorefrontUnavailable } from "@/features/storefront/components/StorefrontUnavailable"
import { ServiceLamp, ServiceStatusText } from "@/features/storefront/components/ServiceLamp"
import { getServiceStatus, getWeeklyHoursDisplay } from "@/features/storefront/lib/store-hours-display"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { isDeliveryConfigured } from "@/features/lib/delivery-zones"
import { venueClock } from "@/features/lib/restaurant-hours"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  const name = settings?.name || "Restaurant"
  return {
    title: `Hours & location - ${name}`,
    description: settings?.address
      ? `Find ${name} at ${settings.address}. Opening hours, pickup and delivery details, and contact.`
      : `Opening hours, pickup and delivery details, and contact for ${name}.`,
  }
}

export function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function todayLabel(timezone: string, now = new Date()) {
  let day: string
  try {
    day = venueClock(now, timezone || "UTC").day
  } catch {
    day = venueClock(now, "UTC").day
  }
  return day.charAt(0).toUpperCase() + day.slice(1, 3)
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

export default async function LocationsPage() {
  const settings = await getStoreSettings()
  if (!settings) {
    return (
      <StorefrontUnavailable
        title="Restaurant information isn't available yet"
        message="Hours and location haven't been published. Please try again later."
      />
    )
  }

  const currency = getCurrencyConfig(settings)
  const locale = currency.locale
  const timezone = settings.timezone || "America/New_York"
  const status = getServiceStatus(settings.hours, timezone, locale)
  const week = getWeeklyHoursDisplay(settings.hours, locale)
  const today = todayLabel(timezone)
  const delivery = isDeliveryConfigured(settings)
  const postalCodes: string[] = Array.isArray(settings.deliveryPostalCodes) ? settings.deliveryPostalCodes : []
  const money = (value: unknown) =>
    formatCurrency(parseFloat(String(value ?? 0)) || 0, currency, { inputIsCents: false })
  const deliveryMinimum = parseFloat(String(settings.deliveryMinimum ?? 0)) || 0
  const phoneHref = settings.phone ? `tel:${String(settings.phone).replace(/[^\d+]/g, "")}` : null

  return (
    <main className="bg-white text-ink">
      <div className="storefront-shell py-6 sm:py-10 lg:py-14">
        <h1 className="sf-page-title">
          Hours & location
          <ServiceLamp hours={settings.hours} timezone={timezone} locale={locale} initial={status} />
        </h1>
        <p className="mt-2 sf-lede sm:mt-3">
          <ServiceStatusText hours={settings.hours} timezone={timezone} locale={locale} initial={status} />
        </p>

        <div className="mt-6 grid gap-8 sm:mt-10 lg:grid-cols-12 lg:gap-10">
          <section className="lg:col-span-6" aria-labelledby="visit-heading">
            <h2 id="visit-heading" className="sf-section-title">Find us</h2>
            {settings.address ? (
              <a
                href={mapsHref(settings.address)}
                target="_blank"
                rel="noreferrer"
                className="pass-link mt-3 block max-w-[28ch] text-[1rem] leading-snug sm:text-xl"
              >
                {settings.address}
              </a>
            ) : (
              <p className="mt-4 text-ink-soft">The address hasn&apos;t been published yet.</p>
            )}

            <dl className="mt-4 text-[0.9rem] sm:text-base">
              {settings.address ? (
                <Fact label="Directions">
                  <a href={mapsHref(settings.address)} target="_blank" rel="noreferrer" className="pass-link">
                    Open in Maps
                  </a>
                </Fact>
              ) : null}
              {phoneHref ? (
                <Fact label="Phone">
                  <a href={phoneHref} className="pass-link">{settings.phone}</a>
                </Fact>
              ) : null}
              {settings.email ? (
                <Fact label="Email">
                  <a href={`mailto:${settings.email}`} className="pass-link break-all">{settings.email}</a>
                </Fact>
              ) : null}
            </dl>

            <h2 className="mt-8 sf-section-title sm:mt-12">Pickup and delivery</h2>
            <dl className="mt-3 text-[0.9rem] sm:text-base">
              <Fact label="Pickup">
                {settings.estimatedPickup ? `Ready in ${settings.estimatedPickup}` : "Order ahead and collect at the counter"}
                {settings.pickupDiscount ? `, ${settings.pickupDiscount}% off pickup orders` : ""}
              </Fact>
              {delivery ? (
                <>
                  <Fact label="Delivery">
                    {settings.estimatedDelivery ? `${settings.estimatedDelivery}, ` : ""}
                    {money(settings.deliveryFee)} fee
                    {deliveryMinimum > 0 ? `, ${money(deliveryMinimum)} minimum` : ""}
                  </Fact>
                  {postalCodes.length > 0 ? (
                    <Fact label="Delivers to">{postalCodes.join(", ")}</Fact>
                  ) : null}
                </>
              ) : (
                <Fact label="Delivery">Not offered at the moment</Fact>
              )}
            </dl>

            <Link href="/" prefetch={false} className="pass-action mt-8 w-full sm:w-auto sm:min-w-[14rem]">
              See the menu
            </Link>
          </section>

          <section className="lg:col-span-5 lg:col-start-8" aria-labelledby="hours-heading">
            <h2 id="hours-heading" className="sf-section-title">Opening hours</h2>
            <dl className="mt-3 text-[0.9rem] sm:text-base">
              {week.map((entry) => (
                <div
                  key={entry.day}
                  className={cn(
                    "grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-4 px-3 py-2",
                    entry.day === today ? "bg-paper font-semibold" : "",
                  )}
                  aria-current={entry.day === today ? "date" : undefined}
                >
                  <dt>{entry.day}</dt>
                  <dd className="tabular-nums">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </main>
  )
}

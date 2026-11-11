import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { getServiceStatus, getWeeklyHoursDisplay } from "@/features/storefront/lib/store-hours-display"
import { isDeliveryConfigured } from "@/features/lib/delivery-zones"
import { addDays, venueDateString } from "@/features/lib/venue-time"
import { retrieveOrder } from "@/features/storefront/lib/data/orders"
import FindOrderForm from "@/features/storefront/components/FindOrderForm"
import GiftCardPurchase from "@/features/storefront/components/GiftCardPurchase"
import GiftCardBalance from "@/features/storefront/components/GiftCardBalance"
import ReservationForm from "@/features/storefront/components/ReservationForm"
import OrderCompletedTemplate from "@/features/storefront/modules/order/templates/order-completed-template"
import { venueClock } from "@/features/lib/restaurant-hours"
import { mapsHref } from "./lib"
import { Arcs } from "./Arcs"
import { Unavailable } from "./Unavailable"

/** The top of every inner page: light on paper, a pastel arc, and a thin-over-heavy title. */
export function PageHero({ thin, heavy, lede, children }: { thin: string; heavy: string; lede?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="o-pagehero">
      <Arcs variant="page" />
      <div className="o-shell">
        <h1 className="o-split o-split-xl"><span className="o-thin">{thin}</span><span className="o-heavy">{heavy}</span></h1>
        {lede ? <p className="o-lede" style={{ marginTop: 12 }}>{lede}</p> : null}
        {children}
      </div>
    </section>
  )
}

function todayLabel(timezone: string) {
  let day: string
  try { day = venueClock(new Date(), timezone || "UTC").day } catch { day = venueClock(new Date(), "UTC").day }
  return day.charAt(0).toUpperCase() + day.slice(1, 3)
}

const storeName = (settings: any) => String(settings?.name || "the restaurant").trim()

/* Find order */
export const findOrderMetadata: Metadata = { title: "Find your order", description: "Look up an order with its number and the email you used at checkout." }
export function OrbitFindOrderPage() {
  return (
    <>
      <PageHero thin="Find your" heavy="Order" lede="See where your order is with its number and your email. No account needed." />
      <div className="o-shell" style={{ paddingBottom: "4rem" }}>
        <div className="o-glass" style={{ maxWidth: 560, padding: "clamp(1.25rem, 4vw, 2rem)" }}><FindOrderForm /></div>
      </div>
    </>
  )
}

/* Gift cards */
export async function giftCardsMetadata(): Promise<Metadata> {
  const name = storeName(await getStoreSettings())
  return { title: `Gift cards | ${name}`, description: `Give a ${name} gift card by email, or check the balance on one you have.` }
}
export async function OrbitGiftCardsPage() {
  const settings = await getStoreSettings()
  if (!settings) return <Unavailable title="Gift cards aren't available yet" message="Please try again later." />
  const currency = getCurrencyConfig(settings)
  return (
    <>
      <PageHero thin="Gift" heavy="Cards" lede={`Send a meal at ${storeName(settings)} by email, or keep one for yourself.`} />
      <div className="o-shell" style={{ paddingBottom: "4rem", display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))", alignItems: "start" }}>
        <section className="o-glass" style={{ padding: "clamp(1.25rem, 4vw, 2rem)", gridColumn: "span 1" }} aria-labelledby="buy-heading">
          <h2 id="buy-heading" className="o-split o-split-sm" style={{ marginBottom: 18 }}><span className="o-thin">Buy a</span><span className="o-heavy">Gift card</span></h2>
          <GiftCardPurchase locale={currency.locale} currencyCode={currency.currencyCode} />
        </section>
        <section className="o-glass" style={{ padding: "clamp(1.25rem, 4vw, 2rem)" }} aria-labelledby="balance-heading">
          <h2 id="balance-heading" className="o-split o-split-sm" style={{ marginBottom: 18 }}><span className="o-thin">Check a</span><span className="o-heavy">Balance</span></h2>
          <GiftCardBalance locale={currency.locale} />
        </section>
      </div>
    </>
  )
}

/* Reservations */
export async function reservationsMetadata(): Promise<Metadata> {
  const name = storeName(await getStoreSettings())
  return { title: `Reserve a table | ${name}`, description: `Book a table at ${name}. Pick a date, party size and time.` }
}
export async function OrbitReservationsPage() {
  const settings = await getStoreSettings()
  if (!settings?.timezone || !settings?.hours) return <Unavailable title="Reservations aren't open yet" message="Please check back soon, or call us to book." />
  const timezone = settings.timezone
  const today = venueDateString(new Date(), timezone)
  return (
    <>
      <PageHero thin="Reserve a" heavy="Table" lede="Pick a day, your party size and a time. You'll get a confirmation straight away." />
      <div className="o-shell" style={{ paddingBottom: "4rem" }}>
        <div className="o-glass" style={{ maxWidth: 820, padding: "clamp(1.25rem, 4vw, 2rem)" }}>
          <ReservationForm today={today} maxDate={addDays(today, 60)} timezone={timezone} locale={getCurrencyConfig(settings).locale} restaurantName={storeName(settings)} />
        </div>
        {settings.phone ? <p style={{ marginTop: 20, color: "var(--o-ink-soft)" }}>Larger group? Call <a className="o-link" href={`tel:${String(settings.phone).replace(/[^\d+]/g, "")}`}>{settings.phone}</a>.</p> : null}
      </div>
    </>
  )
}

/* Hours & location */
export async function locationsMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  const name = storeName(settings)
  return { title: `Hours & location | ${name}`, description: settings?.address ? `Find ${name} at ${settings.address}. Opening hours, pickup and delivery.` : `Opening hours, pickup and delivery for ${name}.` }
}
export async function OrbitLocationsPage() {
  const settings = await getStoreSettings()
  if (!settings) return <Unavailable title="Restaurant information isn't available yet" message="Hours and location haven't been published. Please try again later." />
  const currency = getCurrencyConfig(settings)
  const timezone = settings.timezone || "America/New_York"
  const status = getServiceStatus(settings.hours, timezone, currency.locale)
  const week = getWeeklyHoursDisplay(settings.hours, currency.locale)
  const today = todayLabel(timezone)
  const delivery = isDeliveryConfigured(settings)
  const money = (v: unknown) => formatCurrency(parseFloat(String(v ?? 0)) || 0, currency, { inputIsCents: false })
  const minimum = parseFloat(String(settings.deliveryMinimum ?? 0)) || 0
  const postal: string[] = Array.isArray(settings.deliveryPostalCodes) ? settings.deliveryPostalCodes : []
  return (
    <>
      <PageHero thin="Hours &" heavy="Location">
        <p style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontWeight: 600 }}>
          <span className="o-dot" data-on={status.isOpen ? "true" : "false"} aria-hidden="true" />
          {status.isOpen ? "Open now" : "Closed now"}{status.detail ? ` · ${status.detail}` : ""}
        </p>
      </PageHero>
      <div className="o-shell" style={{ paddingBottom: "4rem", display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))", alignItems: "start" }}>
        <section className="o-glass" style={{ padding: "clamp(1.25rem, 4vw, 2rem)" }} aria-labelledby="find-us">
          <h2 id="find-us" className="o-split o-split-sm"><span className="o-thin">Find</span><span className="o-heavy">Us</span></h2>
          {settings.address ? <a className="o-link" style={{ display: "block", fontSize: "1.2rem", marginTop: 12, maxWidth: "26ch" }} href={mapsHref(settings.address)} target="_blank" rel="noreferrer">{settings.address}</a> : <p className="o-lede">The address hasn&apos;t been published yet.</p>}
          {settings.phone ? <p style={{ marginTop: 10 }}><a className="o-link" href={`tel:${String(settings.phone).replace(/[^\d+]/g, "")}`}>{settings.phone}</a></p> : null}
          {settings.email ? <p style={{ marginTop: 6, overflowWrap: "anywhere" }}><a className="o-link" href={`mailto:${settings.email}`}>{settings.email}</a></p> : null}
          <h3 className="o-eyebrow" style={{ marginTop: 26, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--o-ink-soft)" }}>Pickup and delivery</h3>
          <p style={{ margin: "6px 0 0" }}>Pickup: {settings.estimatedPickup ? `ready in ${settings.estimatedPickup}` : "order ahead and collect at the counter"}{settings.pickupDiscount ? `, ${settings.pickupDiscount}% off` : ""}</p>
          <p style={{ margin: "6px 0 0" }}>Delivery: {delivery ? `${settings.estimatedDelivery ? `${settings.estimatedDelivery}, ` : ""}${money(settings.deliveryFee)} fee${minimum > 0 ? `, ${money(minimum)} minimum` : ""}` : "not offered at the moment"}</p>
          {delivery && postal.length ? <p style={{ margin: "6px 0 0", color: "var(--o-ink-soft)" }}>Delivers to {postal.join(", ")}</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            <Link href="/menu" className="o-btn">See the menu</Link>
            {settings.address ? <a href={mapsHref(settings.address)} target="_blank" rel="noreferrer" className="o-btn o-btn-ghost">Directions</a> : null}
          </div>
        </section>
        <section className="o-glass" style={{ padding: "clamp(1.25rem, 4vw, 2rem)" }} aria-labelledby="hours-h">
          <h2 id="hours-h" className="o-split o-split-sm" style={{ marginBottom: 12 }}><span className="o-thin">Opening</span><span className="o-heavy">Hours</span></h2>
          <dl className="o-hours" style={{ fontSize: "1rem", rowGap: 6 }}>
            {week.map((row) => (
              <div key={row.day} style={{ display: "contents" }} aria-current={row.day === today ? "date" : undefined}>
                <dt data-today={row.day === today ? "true" : undefined}>{row.day}</dt>
                <dd data-today={row.day === today ? "true" : undefined}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  )
}

/* Order confirmed */
export const confirmedMetadata: Metadata = { title: "Order confirmed", description: "Your order was placed." }
export async function OrbitOrderConfirmedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const query = await searchParams
  const secretKey = typeof query?.secretKey === "string" ? query.secretKey : null
  const order = await retrieveOrder(id, secretKey).catch(() => null)
  if (!order) notFound()
  return (
    <div className="o-order">
      <PageHero thin={order.customerName ? `Thanks, ${String(order.customerName).split(" ")[0]}` : "Thank you"} heavy="Order placed" lede="The kitchen has your order. This page updates as it moves along." />
      <OrderCompletedTemplate order={order} />
    </div>
  )
}

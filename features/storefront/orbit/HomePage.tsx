import type { Metadata } from "next"
import Link from "next/link"
import { getMenuCategories, getMenuItems, getStoreSettings } from "@/features/storefront/lib/data/menu"
import { StorefrontDataUnavailableError } from "@/features/storefront/lib/data/errors"
import type { MenuCategory, MenuItem } from "@/features/storefront/lib/store-data"
import { getCurrencyConfig } from "@/features/storefront/lib/currency"
import { getServiceStatus, getWeeklyHoursDisplay } from "@/features/storefront/lib/store-hours-display"
import { HomeHero } from "./HomeHero"
import { PlateCard } from "./PlateCard"
import { Arcs } from "./Arcs"
import { categoryIdOf, inMenuOrder, orbitDishes, plateFor, sectionTitle, toPlateCard, usedCategories } from "./lib"
import { Unavailable } from "./Unavailable"

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  const name = String(settings?.name || "").trim()
  return {
    title: name ? `${name} | Order pickup & delivery` : "Order online",
    description: settings?.tagline || settings?.heroHeadline || "",
  }
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default async function OrbitHomePage() {
  let categories: MenuCategory[]
  let items: MenuItem[]
  let settings: any
  try {
    ;[categories, items, settings] = await Promise.all([getMenuCategories(true), getMenuItems(undefined, true), getStoreSettings(true)])
  } catch (error) {
    if (!(error instanceof StorefrontDataUnavailableError)) throw error
    return <Unavailable title="We can't load the menu right now" message="Please try again in a moment. If it keeps happening, call the restaurant." />
  }
  if (!settings) return <Unavailable title="We're not taking orders online yet" message="Please check back soon or contact the restaurant directly." />

  const name = String(settings.name || "").trim()
  const money = getCurrencyConfig(settings)
  const timezone = settings.timezone || "America/New_York"
  const status = getServiceStatus(settings.hours, timezone, money.locale)
  const hours = getWeeklyHoursDisplay(settings.hours, money.locale)
  let today = ""
  try { today = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(new Date()) } catch { today = WEEKDAY[new Date().getDay()] }
  const address = String(settings.address || "").trim()

  const ordered = inMenuOrder(items, categories)
  const dishes = orbitDishes(ordered, name, money)
  const sections = usedCategories(categories, items, false)
  const popularPool = [...items.filter((i) => i.popular), ...items.filter((i) => i.featured), ...ordered]
  const popular = [...new Map(popularPool.map((i) => [i.id, i])).values()].filter((i) => i.available !== false).slice(0, 8)
  const cards = popular.map((item, index) => toPlateCard(item, index, money))
  const pickup = settings.estimatedPickup ? String(settings.estimatedPickup) : null
  const delivery = settings.deliveryEnabled && settings.estimatedDelivery ? String(settings.estimatedDelivery) : null

  return (
    <>
      {dishes.length ? (
        <HomeHero dishes={dishes} />
      ) : (
        <section className="o-pagehero">
          <Arcs variant="page" />
          <div className="o-shell"><h1 className="o-split o-split-xl"><span className="o-thin">Order</span><span className="o-heavy">{name}</span></h1></div>
        </section>
      )}

      {/* Menu categories */}
      <section id="menu" className="o-section o-rel" aria-labelledby="home-menu">
        <Arcs variant="menu" />
        <div className="o-shell">
          <div className="o-section-head o-center">
            <h2 id="home-menu" className="o-split o-split-lg" style={{ textAlign: "center" }}>
              <span className="o-thin">The</span>
              <span className="o-heavy">Menu</span>
            </h2>
          </div>
          <div className="o-cats">
            {sections.map((category) => {
              const inside = ordered.filter((item) => categoryIdOf(item) === category.id)
              const lead = inside.find((item) => plateFor(item).cutout) || inside[0]
              const picture = lead ? plateFor(lead) : null
              return (
                <Link key={category.id} href={`/menu#c-${category.id}`} className="o-cat o-glass">
                  {picture?.src ? <img src={picture.src} className={picture.cutout ? undefined : "o-photo"} alt="" width={56} height={56} loading="lazy" /> : null}
                  <strong>
                    {category.name}
                    <small>{inside.length} dish{inside.length === 1 ? "" : "es"}</small>
                  </strong>
                </Link>
              )
            })}
          </div>
          <p style={{ textAlign: "center", marginTop: 24 }}>
            <Link href="/menu" className="o-btn o-btn-ghost">See the full menu</Link>
          </p>
        </div>
      </section>

      {/* Popular */}
      {cards.length ? (
        <section className="o-section o-rel" aria-labelledby="home-popular" style={{ paddingTop: 0 }}>
          <Arcs variant="popular" />
          <div className="o-shell">
            <div className="o-section-head">
              <h2 id="home-popular" className="o-split o-split-lg">
                <span className="o-thin">Most</span>
                <span className="o-heavy">Ordered</span>
              </h2>
              <Link href="/menu" className="o-link" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Everything on the menu</Link>
            </div>
            <div className="o-grid o-grid-4">
              {cards.map((card) => <PlateCard key={card.id} card={card} />)}
            </div>
          </div>
        </section>
      ) : null}

      {/* Hours & location, and about */}
      <section id="visit" className="o-section o-rel" aria-labelledby="home-visit" style={{ scrollMarginTop: 90 }}>
        <Arcs variant="visit" />
        <div className="o-shell" style={{ display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))", alignItems: "start" }}>
          <div className="o-glass" style={{ padding: "clamp(1.25rem, 4vw, 2rem)" }}>
            <h2 id="home-visit" className="o-split o-split-md">
              <span className="o-thin">Hours &amp;</span>
              <span className="o-heavy">Location</span>
            </h2>
            <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 18px", fontWeight: 600 }}>
              <span className="o-dot" data-on={status.isOpen ? "true" : "false"} aria-hidden="true" />
              {status.isOpen ? "Open now" : "Closed now"}{status.detail ? ` · ${status.detail}` : ""}
            </p>
            <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))" }}>
              <dl className="o-hours">
                {hours.map((row) => (
                  <div key={row.day} style={{ display: "contents" }}>
                    <dt data-today={row.day === today ? "true" : undefined}>{row.day}</dt>
                    <dd data-today={row.day === today ? "true" : undefined}>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <p style={{ fontWeight: 700, margin: 0 }}>{name}</p>
                {address ? <p style={{ margin: "4px 0 0", lineHeight: 1.5 }}>{address}</p> : null}
                {settings.phone ? <p style={{ margin: "4px 0 0" }}><a className="o-link" href={`tel:${String(settings.phone).replace(/[^\d+]/g, "")}`}>{settings.phone}</a></p> : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                  {pickup ? <span className="o-tag" style={{ background: "color-mix(in oklab, var(--o-mint) 70%, white)" }}>Pickup in {pickup}</span> : null}
                  {delivery ? <span className="o-tag" style={{ background: "color-mix(in oklab, var(--o-sky) 70%, white)" }}>Delivery in {delivery}</span> : null}
                </div>
                {address ? <a className="o-btn o-btn-ghost" style={{ marginTop: 16 }} href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">Get directions</a> : null}
              </div>
            </div>
          </div>

          <div style={{ paddingTop: "clamp(0rem, 2vw, 1rem)" }}>
            <h2 className="o-split o-split-lg">
              <span className="o-thin">About</span>
              <span className="o-heavy">{name}</span>
            </h2>
            {settings.heroHeadline ? <p style={{ fontSize: "1.25rem", fontWeight: 600, margin: "1.25rem 0 0.5rem", maxWidth: "30ch" }}>{settings.heroHeadline}</p> : null}
            {settings.tagline ? <p className="o-lede">{settings.tagline}{settings.heroTagline ? `. ${settings.heroTagline}.` : "."}</p> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
              <Link href="/menu" className="o-btn">Start an order</Link>
              <Link href="/find-order" className="o-btn o-btn-ghost">Check an order</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

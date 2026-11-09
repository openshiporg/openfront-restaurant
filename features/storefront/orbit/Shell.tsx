import Link from "next/link"
import { getStoreSettings, getMenuItems } from "@/features/storefront/lib/data/menu"
import { retrieveCart } from "@/features/storefront/lib/data/cart"
import { getCurrencyConfig } from "@/features/storefront/lib/currency"
import { getServiceStatus, getWeeklyHoursDisplay } from "@/features/storefront/lib/store-hours-display"
import { storeOwnMark } from "@/features/storefront/lib/store-mark"
import StorefrontServer from "@/features/storefront/screens/StorefrontServer"
import type { MenuItem } from "@/features/storefront/lib/store-data"
import { OrbitCartProvider, type OrbitCart } from "./cart"
import { Header } from "./chrome"
import { NAV_LINKS } from "./links"
import { plateFor } from "./lib"
import { Arcs } from "./Arcs"
import "./orbit.css"

/** Every Dish Orbit page sits in this: the new header, the cart drawer, and the new footer. */
export async function OrbitShell({ children, chrome = true }: { children: React.ReactNode; chrome?: boolean }) {
  const [settings, cart, items] = await Promise.all([
    getStoreSettings(),
    retrieveCart().catch(() => null),
    getMenuItems().catch(() => [] as MenuItem[]),
  ])
  const name = String(settings?.name || "Restaurant").trim()
  const money = getCurrencyConfig(settings)
  const timezone = settings?.timezone || "America/New_York"
  const status = getServiceStatus(settings?.hours, timezone, money.locale)
  const mark = storeOwnMark(settings?.logoIcon)
  const plates: Record<string, string> = {}
  for (const item of items as MenuItem[]) {
    const plate = plateFor(item)
    if (plate.src) plates[item.id] = plate.src
  }

  return (
    <StorefrontServer prefetchUser prefetchCart prefetchStoreSettings prefetchMenuCategories>
      <OrbitCartProvider cart={cart as OrbitCart} money={money} plates={plates}>
        <div className="orbit-ui o-page">
          {chrome ? (
            <Header name={name} mark={mark} hue={settings?.logoColor} banner={settings?.promoBanner} hours={settings?.hours} timezone={timezone} locale={money.locale} status={status} />
          ) : null}
          <main>{children}</main>
          {chrome ? <Footer settings={settings} name={name} mark={mark} locale={money.locale} /> : null}
        </div>
      </OrbitCartProvider>
    </StorefrontServer>
  )
}

function Footer({ settings, name, mark, locale }: { settings: any; name: string; mark: string; locale: string }) {
  const hours = getWeeklyHoursDisplay(settings?.hours, locale)
  const address = String(settings?.address || "").trim()
  return (
    <footer className="o-footer o-rel">
      <Arcs variant="footer" />
      <div className="o-shell o-footer-grid">
        <div>
          <Link href="/" className="o-brand" style={{ marginBottom: 12 }}>
            {mark ? <span className="o-brand-mark" style={{ filter: `hue-rotate(${settings?.logoColor || "0"}deg)` }} dangerouslySetInnerHTML={{ __html: mark }} aria-hidden="true" /> : null}
            <span className="o-brand-name">{name}</span>
          </Link>
          {settings?.tagline ? <p style={{ color: "var(--o-ink-soft)", maxWidth: "32ch" }}>{settings.tagline}</p> : null}
        </div>
        <div>
          <h3>Hours</h3>
          <dl className="o-hours">
            {hours.map((row) => (
              <div key={row.day} style={{ display: "contents" }}>
                <dt>{row.day}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>Visit</h3>
          {address ? (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" style={{ display: "block", minHeight: 0, lineHeight: 1.6, padding: "4px 0" }}>{address}</a>
          ) : null}
          {settings?.phone ? <a href={`tel:${String(settings.phone).replace(/[^\d+]/g, "")}`}>{settings.phone}</a> : null}
          {settings?.email ? <p><a href={`mailto:${settings.email}`}>{settings.email}</a></p> : null}
        </div>
        <div>
          <h3>Pages</h3>
          <ul>
            {[...NAV_LINKS, { href: "/reservations", label: "Reserve" }, { href: "/gift-cards", label: "Gift cards" }, { href: "/account", label: "Account" }].map((link) => (
              <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="o-shell" style={{ marginTop: 28, fontSize: 13, color: "var(--o-ink-soft)" }}>
        © {new Date().getFullYear()} {name}
      </div>
    </footer>
  )
}

import { type StorefrontLayoutSettings } from "@/features/storefront/modules/layout/components/store-logo"
import { StorefrontSectionLink } from "@/features/storefront/components/StorefrontSectionLink"
import { getWeeklyHoursDisplay } from "@/features/storefront/lib/store-hours-display"

const quickLinks = [
  { href: "/#menu", label: "Menu" },
  { href: "/account", label: "Account" },
  { href: "/checkout?step=contact", label: "Checkout" },
]

interface FooterProps {
  storeSettings: StorefrontLayoutSettings | null
}

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export default function Footer({ storeSettings }: FooterProps) {
  const storeName = storeSettings?.name || "Restaurant"
  const tagline = storeSettings?.heroSubheadline || storeSettings?.tagline || ""
  const address = storeSettings?.address || ""
  const phone = storeSettings?.phone || ""
  const hours = storeSettings?.hours || {}
  const locale = storeSettings?.locale || "en-US"
  const footerHours = getWeeklyHoursDisplay(hours, locale)
  const hasHours = footerHours.some((entry) => entry.value !== "Closed")

  return (
    <footer id="visit-us" className="mt-auto scroll-mt-16 bg-ink text-paper">
      <div className="storefront-shell pb-8 pt-16 sm:pt-20 lg:pt-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <h2 className="font-serif text-5xl font-black leading-[0.9] lg:text-7xl">Hours & location</h2>
            {address ? (
              <a href={mapsHref(address)} target="_blank" rel="noreferrer" className="mt-6 block max-w-[24ch] text-xl leading-snug underline decoration-paper/35 underline-offset-[0.2em] hover:decoration-paper">
                {address}
              </a>
            ) : null}
            {phone ? (
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="mt-3 block text-xl underline decoration-paper/35 underline-offset-[0.2em] hover:decoration-paper">
                {phone}
              </a>
            ) : null}
            {tagline ? <p className="mt-6 max-w-[44ch] text-pretty text-base leading-relaxed text-paper/75">{tagline}</p> : null}
          </div>

          {hasHours ? (
            <dl className="text-lg lg:col-span-4">
              {footerHours.map((entry) => (
                <div key={entry.day} className="flex items-baseline justify-between gap-6 py-1">
                  <dt className="font-semibold">{entry.day}</dt>
                  <dd className="text-right tabular-nums text-paper/80">{entry.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <nav className="lg:col-span-2 lg:col-start-11" aria-label="Footer">
            <ul className="flex flex-col gap-2">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <StorefrontSectionLink
                    href={link.href}
                    className="font-serif text-2xl font-extrabold transition-colors hover:text-paper/70"
                  >
                    {link.label}
                  </StorefrontSectionLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p
          aria-hidden="true"
          className="mt-20 overflow-hidden whitespace-nowrap font-serif font-black leading-[0.8] text-paper"
          style={{ fontSize: `clamp(3.5rem, ${Math.min(22, 150 / Math.max(storeName.length, 6))}vw, 18rem)` }}
        >
          {storeName}
        </p>

        <div className="mt-8 flex flex-col gap-2 text-[0.95rem] text-paper/70 sm:flex-row sm:items-center sm:justify-between">
          <p suppressHydrationWarning>© {new Date().getFullYear()} {storeName}</p>
          <p>Powered by Openfront</p>
        </div>
      </div>
    </footer>
  )
}

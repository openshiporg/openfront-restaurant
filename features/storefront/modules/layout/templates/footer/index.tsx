import Link from "next/link"
import { MapPin, MessageCircle } from "lucide-react"
import {
  StoreBrand,
  type StorefrontLayoutSettings,
} from "@/features/storefront/modules/layout/components/store-logo"
import { getWeeklyHoursDisplay } from "@/features/storefront/lib/store-hours-display"

const quickLinks = [
  { href: "/#menu", label: "Menu" },
  { href: "/reservations", label: "Reserve a table" },
  { href: "/gift-cards", label: "Gift cards" },
  { href: "/find-order", label: "Find your order" },
  { href: "/locations", label: "Hours & location" },
  { href: "/account", label: "Account" },
]

interface FooterProps {
  storeSettings: StorefrontLayoutSettings | null
}

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** Collapses runs of days with the same hours: "Mon – Thu  11:00 AM – 10:00 PM". */
function groupedHours(entries: Array<{ day: string; value: string }>) {
  const groups: Array<{ from: string; to: string; value: string }> = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last && last.value === entry.value) last.to = entry.day
    else groups.push({ from: entry.day, to: entry.day, value: entry.value })
  }
  return groups.map((group) => ({ days: group.from === group.to ? group.from : `${group.from} – ${group.to}`, value: group.value }))
}

export default function Footer({ storeSettings }: FooterProps) {
  const storeName = (storeSettings?.name || "Restaurant").trim()
  const tagline = storeSettings?.tagline || storeSettings?.heroSubheadline || ""
  const address = storeSettings?.address || ""
  const phone = storeSettings?.phone || ""
  const locale = storeSettings?.locale || "en-US"
  const hours = getWeeklyHoursDisplay(storeSettings?.hours || {}, locale)
  const hasHours = hours.some((entry) => entry.value !== "Closed")

  return (
    <footer id="visit-us" className="mt-auto scroll-mt-16 border-t border-border bg-white text-ink">
      <div className="storefront-shell grid gap-10 py-12 sm:py-14 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <StoreBrand name={storeName} logoIcon={storeSettings?.logoIcon} logoColor={storeSettings?.logoColor} />
          {tagline ? <p className="mt-4 max-w-[36ch] text-pretty text-[0.95rem] text-ink-soft">{tagline}</p> : null}
          {address ? (
            <a href={mapsHref(address)} target="_blank" rel="noreferrer" className="mt-4 flex max-w-[30ch] items-start gap-2 text-[0.95rem] text-ink hover:text-leaf">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden="true" />
              {address}
            </a>
          ) : null}
        </div>

        {hasHours ? (
          <div className="lg:col-span-3">
            <h2 className="text-lg font-medium">Opening Hours</h2>
            <dl className="mt-3 space-y-1 text-[0.95rem]">
              {groupedHours(hours).map((entry) => (
                <div key={entry.days} className="flex gap-3">
                  <dt className="min-w-[6.5rem] text-ink-soft">{entry.days}</dt>
                  <dd className="tabular-nums">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <nav className="lg:col-span-3" aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-[0.95rem]">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-ink-soft transition-colors hover:text-leaf">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {phone ? (
          <div className="lg:col-span-2 lg:justify-self-end">
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="pass-action h-11 px-5 text-[0.95rem]">
              <MessageCircle className="size-4" aria-hidden="true" />
              Contact us
            </a>
            <p className="mt-2 text-sm text-ink-soft">{phone}</p>
          </div>
        ) : null}
      </div>
      <div className="storefront-shell flex flex-col gap-1 border-t border-border py-5 text-sm text-ink-soft sm:flex-row sm:justify-between">
        <p suppressHydrationWarning>© {new Date().getFullYear()} {storeName}. All rights reserved.</p>
        <p>Powered by Openfront</p>
      </div>
    </footer>
  )
}

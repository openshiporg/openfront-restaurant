import Link from "next/link"
import { Clock, MapPin } from "lucide-react"
import { getCurrencyConfig } from "@/features/storefront/lib/currency"
import CartButton from "@/features/storefront/modules/layout/components/cart-button"
import type { CartData } from "@/features/storefront/modules/layout/components/cart-dropdown"
import {
  StoreBrand,
  type StorefrontLayoutSettings,
} from "@/features/storefront/modules/layout/components/store-logo"
import { NavServiceStatus } from "@/features/storefront/components/NavServiceStatus"
import { getServiceStatus } from "@/features/storefront/lib/store-hours-display"
import { NavMenu } from "./nav-menu"

export const primaryLinks = [
  { href: "/#menu", label: "Menu" },
  { href: "/reservations", label: "Reserve" },
  { href: "/gift-cards", label: "Gift cards" },
  { href: "/locations", label: "Hours & location" },
  { href: "/find-order", label: "Find your order" },
]

interface NavProps {
  storeSettings: (StorefrontLayoutSettings & { estimatedPickup?: string | null }) | null
  cart: CartData | null
  brandHue: string
}

function readyIn(estimate?: string | null) {
  const value = (estimate || "").trim()
  if (!value) return null
  return /min|hour|hr/i.test(value) ? value : `${value} min`
}

/** Splits "742 Artisan Way, Brooklyn, NY 11201" into a street line and the rest. */
export function addressLines(address?: string | null) {
  const value = (address || "").trim()
  if (!value) return null
  const comma = value.indexOf(",")
  if (comma < 0) return [value]
  return [value.slice(0, comma).trim(), value.slice(comma + 1).trim()]
}

export default function Nav({ storeSettings, cart, brandHue }: NavProps) {
  const storeName = (storeSettings?.name || "Restaurant").trim()
  const currencyConfig = getCurrencyConfig({
    currencyCode: storeSettings?.currencyCode || undefined,
    locale: storeSettings?.locale || undefined,
  })
  const timezone = storeSettings?.timezone || "America/New_York"
  const locale = currencyConfig.locale
  const initialStatus = getServiceStatus(storeSettings?.hours, timezone, locale)
  const ready = readyIn(storeSettings?.estimatedPickup)
  const lines = addressLines(storeSettings?.address)

  return (
    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <header className="border-b border-border/70">
        <div className="storefront-shell flex h-[4.5rem] items-center justify-between gap-3 lg:h-24">
          <StoreBrand name={storeName} logoIcon={storeSettings?.logoIcon} logoColor={storeSettings?.logoColor} />

          {ready ? (
            <p className="hidden items-center gap-2.5 text-[1.15rem] text-ink xl:flex">
              <span className="grid size-7 place-items-center rounded-full bg-leaf text-white">
                <Clock className="size-4" strokeWidth={2.25} aria-hidden="true" />
              </span>
              Ready in <span className="font-semibold text-leaf">{ready}</span>
            </p>
          ) : null}

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <nav className="hidden items-center lg:flex" aria-label="Storefront">
              {primaryLinks.slice(0, 4).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex h-10 items-center rounded-full px-3 text-[0.98rem] font-medium text-ink transition-colors hover:bg-mint"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            {lines ? (
              <Link href="/locations" className="ml-2 hidden items-center gap-2.5 rounded-xl px-2 py-1 text-[0.98rem] leading-snug text-ink transition-colors hover:bg-mint 2xl:flex">
                <MapPin className="size-6 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {lines.map((line) => (
                    <span key={line} className="block whitespace-nowrap">{line}</span>
                  ))}
                </span>
              </Link>
            ) : null}
            <span className="2xl:hidden">
              <NavServiceStatus hours={storeSettings?.hours} timezone={timezone} locale={locale} initial={initialStatus} />
            </span>
            <CartButton cart={cart} currencyCode={currencyConfig.currencyCode} locale={currencyConfig.locale} brandHue={brandHue} />
            <NavMenu links={primaryLinks} />
          </div>
        </div>
      </header>
      {storeSettings?.promoBanner ? (
        <div className="bg-mint text-ink">
          <p className="storefront-shell truncate py-1.5 text-center text-[0.9rem] font-medium">{storeSettings.promoBanner}</p>
        </div>
      ) : null}
    </div>
  )
}

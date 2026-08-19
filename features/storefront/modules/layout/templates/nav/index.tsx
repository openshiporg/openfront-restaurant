import Link from "next/link"
import { getCurrencyConfig } from "@/features/storefront/lib/currency"
import CartButton from "@/features/storefront/modules/layout/components/cart-button"
import type { CartData } from "@/features/storefront/modules/layout/components/cart-dropdown"
import {
  StoreBrand,
  type StorefrontLayoutSettings,
} from "@/features/storefront/modules/layout/components/store-logo"
import { StorefrontSectionLink } from "@/features/storefront/components/StorefrontSectionLink"

const primaryLinks = [
  { href: "/#popular-dishes", label: "Popular" },
  { href: "/#menu", label: "Menu" },
  { href: "/#visit-us", label: "Visit us" },
]

interface NavProps {
  storeSettings: StorefrontLayoutSettings | null
  cart: CartData | null
  brandHue: string
}

export default function Nav({ storeSettings, cart, brandHue }: NavProps) {
  const storeName = storeSettings?.name || "Restaurant"
  const currencyConfig = getCurrencyConfig({
    currencyCode: storeSettings?.currencyCode || undefined,
    locale: storeSettings?.locale || undefined,
  })

  return (
    <div className="sticky top-0 z-50">
      {storeSettings?.promoBanner ? (
        <div className="border-b border-primary/20 bg-primary text-primary-foreground">
          <div className="storefront-shell py-2">
            <p className="text-center text-xs font-medium tracking-[0.18em] text-primary-foreground/90 uppercase">
              {storeSettings.promoBanner}
            </p>
          </div>
        </div>
      ) : null}

      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="storefront-shell flex h-16 items-center justify-between gap-6">
          <StoreBrand
            name={storeName}
            logoIcon={storeSettings?.logoIcon}
            logoColor={storeSettings?.logoColor}
          />

          <nav className="hidden items-center gap-1 lg:flex">
            {primaryLinks.map((link) => (
              <StorefrontSectionLink
                key={link.href}
                href={link.href}
                className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/8 hover:text-primary"
              >
                {link.label}
              </StorefrontSectionLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/account"
              className="hidden rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary sm:inline-flex"
            >
              Account
            </Link>

            <CartButton
              cart={cart}
              currencyCode={currencyConfig.currencyCode}
              locale={currencyConfig.locale}
              brandHue={brandHue}
            />
          </div>
        </div>
      </header>
    </div>
  )
}

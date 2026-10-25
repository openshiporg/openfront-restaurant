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
  { href: "/#menu", label: "Menu" },
  { href: "/#visit-us", label: "Hours & location" },
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
        <div className="bg-ink text-paper">
          <p className="storefront-shell truncate py-2 text-center text-[0.95rem] font-medium">
            {storeSettings.promoBanner}
          </p>
        </div>
      ) : null}

      <header className="bg-steel text-ink">
        <div className="storefront-shell flex h-16 items-center justify-between gap-4">
          <StoreBrand
            name={storeName}
            logoIcon={storeSettings?.logoIcon}
            logoColor={storeSettings?.logoColor}
          />

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <nav className="hidden items-center md:flex" aria-label="Storefront">
              {primaryLinks.map((link) => (
                <StorefrontSectionLink
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 text-[0.95rem] font-medium text-ink transition-colors hover:bg-steel-shade"
                >
                  {link.label}
                </StorefrontSectionLink>
              ))}
            </nav>
            <Link
              href="/account"
              className="px-3 py-2 text-[0.95rem] font-medium text-ink transition-colors hover:bg-steel-shade"
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

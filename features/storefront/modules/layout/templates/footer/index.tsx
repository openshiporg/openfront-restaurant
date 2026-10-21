import {
  StoreBrand,
  type StorefrontLayoutSettings,
} from "@/features/storefront/modules/layout/components/store-logo"
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

export default function Footer({ storeSettings }: FooterProps) {
  const storeName = storeSettings?.name || "Restaurant"
  const tagline = storeSettings?.heroSubheadline || storeSettings?.tagline || ""
  const address = storeSettings?.address || ""
  const phone = storeSettings?.phone || ""
  const hours = storeSettings?.hours || {}
  const locale = storeSettings?.locale || "en-US"
  const footerHours = getWeeklyHoursDisplay(hours, locale)

  return (
    <footer
      id="visit-us"
      className="mt-auto border-t border-border bg-muted"
      style={{ clipPath: "polygon(0 16px, 100% 0, 100% 100%, 0 100%)" }}
    >
      <div className="storefront-shell py-12 sm:py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_1fr] lg:gap-12">
          <div>
            <StoreBrand
              name={storeName}
              logoIcon={storeSettings?.logoIcon}
              logoColor={storeSettings?.logoColor}
            />
            {tagline ? <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-muted-foreground">{tagline}</p> : null}

            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              {address ? <p>{address}</p> : null}
              {phone ? <p>{phone}</p> : null}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-primary">Quick links</p>
            <div className="mt-4 flex flex-col gap-2">
              {quickLinks.map((link) => (
                <StorefrontSectionLink
                  key={link.href}
                  href={link.href}
                  className="w-fit text-base text-foreground transition-colors hover:text-primary"
                >
                  {link.label}
                </StorefrontSectionLink>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-primary">Hours</p>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              {footerHours.map((entry) => (
                <div key={entry.day} className="flex items-center justify-between gap-6">
                  <span className="font-medium text-foreground">{entry.day}</span>
                  <span className="text-right">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border/70 pt-6 text-center text-sm text-muted-foreground sm:flex sm:items-center sm:justify-between sm:text-left">
          <p suppressHydrationWarning>© {new Date().getFullYear()} {storeName}</p>
          <p className="mt-2 sm:mt-0">Powered by OpenFront</p>
        </div>
      </div>
    </footer>
  )
}

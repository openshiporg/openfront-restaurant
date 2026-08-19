import type { DayHours } from "@/features/storefront/lib/store-data"
import {
  StoreBrand,
  type StorefrontLayoutSettings,
} from "@/features/storefront/modules/layout/components/store-logo"
import { StorefrontSectionLink } from "@/features/storefront/components/StorefrontSectionLink"

function parseHours(value: string | DayHours | undefined): DayHours | null {
  if (!value) return null

  if (typeof value === "object") {
    if (value.ranges?.length) return { ...value, enabled: value.enabled ?? true }
    if (value.open && value.close) {
      return {
        enabled: value.enabled ?? true,
        ranges: [{ open: value.open, close: value.close }],
      }
    }
    return value.enabled === false ? { enabled: false, ranges: [] } : null
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (!normalized || normalized === "closed") {
      return { enabled: false, ranges: [] }
    }
    const [open, close] = normalized.split("-").map((segment: string) => segment.trim())
    if (!open || !close) return null
    return { enabled: true, ranges: [{ open, close }] }
  }

  return null
}

function formatTime(time: string, locale: string, timezone: string): string {
  const normalized = time.trim().toLowerCase()
  const meridianMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)

  let hours = 0
  let minutes = 0

  if (meridianMatch) {
    hours = Number.parseInt(meridianMatch[1], 10)
    minutes = Number.parseInt(meridianMatch[2] || "0", 10)
    const meridian = meridianMatch[3]
    if (meridian === "pm" && hours < 12) hours += 12
    if (meridian === "am" && hours === 12) hours = 0
  } else {
    const hhmm = normalized.includes(":") ? normalized : `${normalized}:00`
    const [hRaw, mRaw] = hhmm.split(":")
    hours = Number.parseInt(hRaw, 10)
    minutes = Number.parseInt(mRaw || "0", 10)
  }

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time

  const date = new Date()
  date.setHours(hours, minutes, 0, 0)

  try {
    return new Intl.DateTimeFormat(locale || "en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || "UTC",
    }).format(date)
  } catch {
    return time
  }
}

const dayOrder = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

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
  const timezone = storeSettings?.timezone || "America/New_York"

  const footerHours = dayOrder.map((day) => {
    const parsed = parseHours((hours as Record<string, string | DayHours | undefined>)?.[day])
    const label = day.charAt(0).toUpperCase() + day.slice(1, 3)

    if (!parsed || parsed.enabled === false || !parsed.ranges?.length) {
      return { day: label, value: "Closed" }
    }

    const first = parsed.ranges[0]
    return {
      day: label,
      value: `${formatTime(first.open, locale, timezone)} – ${formatTime(first.close, locale, timezone)}`,
    }
  })

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

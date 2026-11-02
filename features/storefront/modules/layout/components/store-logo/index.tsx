import Link from "next/link"
import { storeOwnMark } from "@/features/storefront/lib/store-mark"

export interface StorefrontLayoutSettings {
  name?: string | null
  logoIcon?: string | null
  logoColor?: string | null
  currencyCode?: string | null
  locale?: string | null
  promoBanner?: string | null
  tagline?: string | null
  heroSubheadline?: string | null
  address?: string | null
  phone?: string | null
  timezone?: string | null
  hours?: unknown
}

interface StoreBrandProps {
  name: string
  logoIcon?: string | null
  logoColor?: string | null
}

/**
 * The single storefront brand lockup used by both navigation and footer.
 * Keeping the complete markup here prevents either location from drifting in
 * SVG source, hue treatment, typography, sizing, or link behavior.
 */
export function StoreBrand({ name, logoIcon, logoColor, className }: StoreBrandProps & { className?: string }) {
  // The saved icon always shows beside the name; the platform default stands in when none is saved.
  const mark = storeOwnMark(logoIcon)
  return (
    <Link href="/" className={`flex min-w-0 items-center gap-2.5 py-1 ${className || ""}`}>
      {mark ? (
        <span
          className="block size-7 shrink-0 overflow-hidden sm:size-9 [&>svg]:block [&>svg]:size-full"
          style={{ filter: `hue-rotate(${logoColor || "0"}deg)` }}
          dangerouslySetInnerHTML={{ __html: mark }}
          aria-hidden="true"
        />
      ) : null}
      <span className="flex min-w-0 flex-col items-start gap-1 sm:gap-1.5">
        <span className="block truncate whitespace-nowrap font-sans text-[1.05rem] font-bold leading-none text-ink sm:text-[1.75rem]">
          {name.trim()}
        </span>
        <span aria-hidden="true" className="block h-[2px] w-6 rounded-full bg-leaf sm:h-[3px] sm:w-8" />
      </span>
    </Link>
  )
}

/** The store's initials in a rounded tile: the store row on the phone, under a header that already shows the mark. */
export function StoreMark({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase()
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-[0.9rem] border border-border bg-white" aria-hidden="true">
      <span className="font-sans text-[1.15rem] font-bold leading-none text-leaf">{initials}</span>
    </span>
  )
}

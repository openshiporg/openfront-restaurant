import Link from "next/link"

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
  return (
    <Link href="/" className={`flex min-w-0 items-center gap-3 py-1 ${className || ""}`}>
      {logoIcon ? (
        <span
          className="block size-9 shrink-0 overflow-hidden [&>svg]:block [&>svg]:size-full"
          style={{ filter: `hue-rotate(${logoColor || "0"}deg)` }}
          dangerouslySetInnerHTML={{ __html: logoIcon }}
          aria-hidden="true"
        />
      ) : null}
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <span className="block truncate whitespace-nowrap font-serif text-[1.45rem] font-bold leading-none text-ink sm:text-[1.75rem]">
          {name.trim()}
        </span>
        <span aria-hidden="true" className="block h-[3px] w-8 rounded-full bg-leaf" />
      </span>
    </Link>
  )
}

/** The store's own logo in a rounded tile, or its initials when no logo is set. */
export function StoreMark({ name, logoIcon, logoColor }: StoreBrandProps) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase()
  return (
    <span className="grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-white p-3">
      {logoIcon ? (
        <span
          className="block size-full [&>svg]:block [&>svg]:size-full"
          style={{ filter: `hue-rotate(${logoColor || "0"}deg)` }}
          dangerouslySetInnerHTML={{ __html: logoIcon }}
          aria-hidden="true"
        />
      ) : (
        <span className="font-serif text-2xl font-bold text-leaf" aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}

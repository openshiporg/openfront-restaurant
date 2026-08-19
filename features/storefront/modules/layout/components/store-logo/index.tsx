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
export function StoreBrand({ name, logoIcon, logoColor }: StoreBrandProps) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 py-1">
      {logoIcon ? (
        <span
          className="block size-7 shrink-0 overflow-hidden [&>svg]:block [&>svg]:size-full"
          style={{ filter: `hue-rotate(${logoColor || "0"}deg)` }}
          dangerouslySetInnerHTML={{ __html: logoIcon }}
          aria-hidden="true"
        />
      ) : null}
      <span className="block truncate whitespace-nowrap font-serif text-[1.4rem] font-bold leading-[1.05] tracking-tight text-primary sm:text-[1.6rem]">
        {name}
      </span>
    </Link>
  )
}

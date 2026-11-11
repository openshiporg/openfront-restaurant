import { Bricolage_Grotesque, Outfit } from "next/font/google"

// Outfit throughout, the dish carousel's own face: light for names, heavy for emphasis.
const outfit = Outfit({
  variable: "--font-storefront",
  subsets: ["latin", "latin-ext"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  display: "swap",
})

const outfitDisplay = Outfit({
  variable: "--font-storefront-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "700", "800"],
  display: "swap",
})

// The store name beside the mark is set in its own face, so the wordmark reads as a logo and not as another title.
const brand = Bricolage_Grotesque({
  variable: "--font-storefront-brand",
  subsets: ["latin", "latin-ext"],
  weight: ["700"],
  display: "swap",
})

export const storefrontFont = { variable: `${outfit.variable} ${outfitDisplay.variable} ${brand.variable}` }

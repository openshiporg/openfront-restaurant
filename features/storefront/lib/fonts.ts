import { Outfit } from "next/font/google"

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

export const storefrontFont = { variable: `${outfit.variable} ${outfitDisplay.variable}` }

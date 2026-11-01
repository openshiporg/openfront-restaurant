import { Figtree, Source_Serif_4 } from "next/font/google"

// A friendly sans for everything a guest reads, and a sturdy serif for names and titles.
const sans = Figtree({
  variable: "--font-storefront",
  subsets: ["latin", "latin-ext"],
  display: "swap",
})

const serif = Source_Serif_4({
  variable: "--font-storefront-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  display: "swap",
})

export const storefrontFont = { variable: `${sans.variable} ${serif.variable}` }

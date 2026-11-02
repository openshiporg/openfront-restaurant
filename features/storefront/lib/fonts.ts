import { Figtree, Source_Serif_4 } from "next/font/google"

// A friendly sans for guest-facing copy and store names, and a sturdy serif for page titles.
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

import { Figtree, Newsreader, Source_Serif_4 } from "next/font/google"

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

// The store name in the header and footer: a lighter, wider book serif, the closest match to the Antares wordmark.
const wordmark = Newsreader({
  variable: "--font-storefront-wordmark",
  subsets: ["latin", "latin-ext"],
  weight: ["500"],
  display: "swap",
})

export const storefrontFont = { variable: `${sans.variable} ${serif.variable} ${wordmark.variable}` }

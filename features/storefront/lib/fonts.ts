import { Archivo } from "next/font/google"

// One family, two voices: the condensed heavy cut names dishes and prices,
// the regular width carries everything a guest reads.
export const storefrontFont = Archivo({
  variable: "--font-storefront",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
})

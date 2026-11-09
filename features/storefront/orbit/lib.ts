import { existsSync } from "node:fs"
import { join } from "node:path"
import type { MenuCategory, MenuItem } from "@/features/storefront/lib/store-data"
import { getMenuItemDescriptionText, getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { formatCurrency, type CurrencyConfig } from "@/features/storefront/lib/currency"
import type { OrbitDish } from "./DishOrbit"

export const PASTELS = ["#ffb8a8", "#b9d8ff", "#ffe08a", "#c4e8b5", "#e0c6ff", "#ffc9e0", "#a9e6dc", "#ffd0a0"]
export const pastel = (i: number) => PASTELS[((i % PASTELS.length) + PASTELS.length) % PASTELS.length]

export function plateSlug(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

const plateCache = new Map<string, boolean>()
function hasPlateFile(slug: string) {
  if (!plateCache.has(slug)) plateCache.set(slug, existsSync(join(process.cwd(), "public", "images", "plates", `${slug}.webp`)))
  return plateCache.get(slug)!
}

/** The top-down plate cut-out for a dish, falling back to its own photo. */
export function plateFor(item: Pick<MenuItem, "name" | "thumbnail">): { src: string | null; cutout: boolean } {
  const slug = plateSlug(item.name)
  if (slug && hasPlateFile(slug)) return { src: `/images/plates/${slug}.webp`, cutout: true }
  return { src: item.thumbnail || null, cutout: false }
}

/** "Signature Cheeseburger" -> thin "Signature" over heavy "Cheeseburger". A one-word name sits under its section. */
export function splitName(name: string, fallbackTop: string) {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return { thin: fallbackTop, heavy: words[0] }
  const cut = words.length === 2 ? 1 : Math.ceil(words.length / 2)
  return { thin: words.slice(0, cut).join(" "), heavy: words.slice(cut).join(" ") }
}

/** Section headings in the split style: "Burgers" -> "Stacked / Burgers" only when the kitchen hasn't written a description. */
const SECTION_LEADS: Record<string, string> = {
  burgers: "Stacked",
  chicken: "Crispy",
  sides: "On the",
  drinks: "Cold",
  desserts: "Sweet",
  featured: "House",
  popular: "Most",
  beer: "Cold",
}
export function sectionTitle(name: string) {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) return splitName(name, "")
  return { thin: SECTION_LEADS[name.trim().toLowerCase()] || "The", heavy: name.trim() }
}

export const categoryIdOf = (item: MenuItem) => (typeof item.category === "object" ? item.category?.id : item.category) || ""
export const categoryNameOf = (item: MenuItem) => (typeof item.category === "object" ? item.category?.name : "") || ""

/** True when adding needs a choice the kitchen hasn't defaulted. */
export function needsChoice(item: MenuItem) {
  const groups = new Map<string, { required: boolean; min: number; defaults: number }>()
  for (const modifier of item.modifiers || []) {
    const key = modifier.modifierGroup || "other"
    const group = groups.get(key) || { required: false, min: 0, defaults: 0 }
    group.required ||= Boolean(modifier.required)
    group.min = Math.max(group.min, modifier.minSelections || 0)
    if (modifier.defaultSelected) group.defaults += 1
    groups.set(key, group)
  }
  return [...groups.values()].some((group) => (group.required || group.min > 0) && group.defaults < Math.max(1, group.min))
}
export const defaultModifierIds = (item: MenuItem) => (item.modifiers || []).filter((m) => m.defaultSelected).map((m) => m.id)

/** Menu categories that actually hold dishes, in the kitchen's order. `shelves: false` drops the "Featured" shelf. */
export function usedCategories(categories: MenuCategory[], items: MenuItem[], shelves = true) {
  return categories.filter((category) =>
    (shelves || !/^featured$/i.test(category.name)) && items.some((item) => categoryIdOf(item) === category.id),
  )
}

export type PlateCard = {
  id: string
  href: string
  name: string
  thin: string
  heavy: string
  price: string
  description: string
  plate: string | null
  cutout: boolean
  accent: string
  needsChoice: boolean
  defaultModifierIds: string[]
  soldOut: boolean
}

export function toPlateCard(item: MenuItem, index: number, currency: Required<CurrencyConfig>): PlateCard {
  const { thin, heavy } = splitName(item.name, categoryNameOf(item) || "House")
  const plate = plateFor(item)
  return {
    id: item.id,
    href: getMenuItemHref(item.id),
    name: item.name,
    thin,
    heavy,
    price: formatCurrency(item.price, currency),
    description: getMenuItemDescriptionText(item.description).trim(),
    plate: plate.src,
    cutout: plate.cutout,
    accent: pastel(index),
    needsChoice: needsChoice(item),
    defaultModifierIds: defaultModifierIds(item),
    soldOut: item.available === false,
  }
}

/** The hero's dishes: featured, then popular, then the rest of the menu, only ones with a plate cut-out. */
export function orbitDishes(items: MenuItem[], storeName: string, currency: Required<CurrencyConfig>, max = 6): OrbitDish[] {
  const ordered = [
    ...items.filter((item) => item.featured),
    ...items.filter((item) => item.popular),
    ...items,
  ]
  const unique = [...new Map(ordered.map((item) => [item.id, item])).values()]
    .filter((item) => item.available !== false && plateFor(item).cutout)
    .slice(0, max)
  return unique.map((item, index) => {
    const { thin, heavy } = splitName(item.name, categoryNameOf(item) || "House")
    const facts = [item.calories ? `${item.calories} cal` : "", item.prepTime ? `ready in about ${item.prepTime} min` : ""].filter(Boolean).join(" · ")
    const description = getMenuItemDescriptionText(item.description).trim()
    const station = item.kitchenStation ? `${item.kitchenStation.charAt(0).toUpperCase()}${item.kitchenStation.slice(1)} station` : undefined
    return {
      id: item.id,
      title: thin,
      subtitle: heavy,
      image: plateFor(item).src!,
      alt: item.name,
      eyebrow: `${formatCurrency(item.price, currency)}${categoryNameOf(item) ? ` · ${categoryNameOf(item)}` : ""}`,
      label: item.name,
      badge: item.prepTime ? String(item.prepTime) : undefined,
      badgeUnit: item.prepTime ? "min" : undefined,
      heading: storeName,
      subheading: station,
      description: description || facts || `${item.name}, made to order.`,
      options: [...new Set((item.modifiers || []).map((modifier) => modifier.name))].slice(0, 8),
      accent: pastel(index),
      href: getMenuItemHref(item.id),
      needsChoice: needsChoice(item),
      defaultModifierIds: defaultModifierIds(item),
    }
  })
}

/** Sorts dishes into the kitchen's section order, keeping name order inside a section. */
export function inMenuOrder(items: MenuItem[], categories: MenuCategory[]) {
  const rank = new Map(categories.map((category, index) => [category.id, index]))
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (rank.get(categoryIdOf(a.item)) ?? 999) - (rank.get(categoryIdOf(b.item)) ?? 999) || a.index - b.index)
    .map(({ item }) => item)
}

export function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

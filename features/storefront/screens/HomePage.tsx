import { Metadata } from "next"
import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  getMenuCategories,
  getMenuItems,
  getStoreSettings,
} from "@/features/storefront/lib/data/menu"
import { StorefrontDataUnavailableError } from "@/features/storefront/lib/data/errors"
import { type MenuCategory, type MenuItem } from "@/features/storefront/lib/store-data"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuItemDescriptionText } from "@/features/storefront/lib/menu-item-utils"
import { getServiceStatus } from "@/features/storefront/lib/store-hours-display"
import { buildMenuVisibility } from "@/features/storefront/lib/menu-visibility"
import { StorefrontUnavailable } from "@/features/storefront/components/StorefrontUnavailable"
import { MenuGrid, type GridItem, type GridTab } from "@/features/storefront/components/antares/MenuGrid"
import { HomeOrbit, type OrbitDish } from "@/features/storefront/components/orbit/HomeOrbit"
import { PickupSummary } from "@/features/storefront/components/PickupSummary"

export async function generateMetadata(): Promise<Metadata> {
  const storeSettings = await getStoreSettings()
  return {
    title: storeSettings?.name ? `${storeSettings.name.trim()} | Order Pickup` : "Restaurant",
    description: storeSettings?.heroSubheadline || storeSettings?.tagline || "",
  }
}

const PASTELS = ["#ffb8a8", "#b9d8ff", "#ffe08a", "#c4e8b5", "#e0c6ff", "#ffc9e0", "#a9e6dc", "#ffd0a0"]
const MAX_DISHES = 8

function readyIn(estimate?: string | null) {
  const value = (estimate || "").trim()
  if (!value) return null
  return /min|hour|hr/i.test(value) ? value : `${value} min`
}

function plateSlug(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** "Classic Burger" -> thin "Classic" over heavy "Burger". A one-word name sits under its section. */
function splitName(name: string, section: string) {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return { title: section, subtitle: words[0] }
  const cut = words.length === 2 ? 1 : Math.ceil(words.length / 2)
  return { title: words.slice(0, cut).join(" "), subtitle: words.slice(cut).join(" ") }
}

export default async function HomePage() {
  let categories: MenuCategory[]
  let allItems: MenuItem[]
  let storeSettings: any
  try {
    [categories, allItems, storeSettings] = await Promise.all([
      getMenuCategories(true),
      getMenuItems(undefined, true),
      getStoreSettings(true),
    ])
  } catch (error) {
    if (!(error instanceof StorefrontDataUnavailableError)) throw error
    return <StorefrontUnavailable
      title="We can't load the menu right now"
      message="Restaurant and menu information is temporarily unavailable. Please try again in a moment. If the problem continues, contact the restaurant directly."
    />
  }

  if (!storeSettings) {
    return <StorefrontUnavailable
      title="Restaurant information isn't available yet"
      message="Ordering details haven't been published. Please try again later or contact the restaurant directly."
    />
  }

  const currency = getCurrencyConfig(storeSettings)
  const timezone = storeSettings.timezone || "America/New_York"
  const status = getServiceStatus(storeSettings.hours, timezone, currency.locale)
  const ready = readyIn(storeSettings.estimatedPickup)
  const storeName = String(storeSettings.name || "").trim()

  const { featuredItems, popularItems } = buildMenuVisibility<MenuItem, MenuCategory>(allItems, categories)

  const usedCategories = categories.filter((category) =>
    allItems.some((item) => (typeof item.category === "object" ? item.category?.id : item.category) === category.id),
  )
  const popularIds = new Set([...popularItems, ...featuredItems].map((item) => item.id))
  const tabs: GridTab[] = [
    ...(popularIds.size > 0 ? [{ id: "popular", label: "Popular", icon: "popular" }] : []),
    ...usedCategories
      .filter((category) => !/^featured$/i.test(category.name))
      .map((category) => ({ id: category.id, label: category.name, icon: (category as { icon?: string | null }).icon })),
  ]
  if (tabs.length === 0) tabs.push({ id: "all", label: "All", icon: "all" })

  // The menu reads in the kitchen's own section order (sortOrder): mains first, desserts last.
  const sectionRank = new Map(categories.map((category, index) => [category.id, index]))
  const rankOf = (item: MenuItem) => sectionRank.get((typeof item.category === "object" ? item.category?.id : item.category) || "") ?? categories.length
  const ordered = allItems.map((item, index) => ({ item, index })).sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.index - b.index).map(({ item }) => item)

  const gridItems: GridItem[] = ordered.map((item) => {
    const modifiers = item.modifiers || []
    const groups = new Map<string, { required: boolean; min: number; defaults: number }>()
    for (const modifier of modifiers) {
      const key = modifier.modifierGroup || "other"
      const group = groups.get(key) || { required: false, min: 0, defaults: 0 }
      group.required ||= Boolean(modifier.required)
      group.min = Math.max(group.min, modifier.minSelections || 0)
      if (modifier.defaultSelected) group.defaults += 1
      groups.set(key, group)
    }
    const needsChoice = [...groups.values()].some((group) => (group.required || group.min > 0) && group.defaults < Math.max(1, group.min))
    const categoryId = typeof item.category === "object" ? item.category?.id : item.category
    return {
      id: item.id,
      name: item.name,
      price: formatCurrency(item.price, currency),
      thumbnail: item.thumbnail || null,
      description: getMenuItemDescriptionText(item.description),
      needsChoice,
      defaultModifierIds: modifiers.filter((modifier) => modifier.defaultSelected).map((modifier) => modifier.id),
      soldOut: item.available === false,
      categoryIds: [...(categoryId ? [categoryId] : []), ...(popularIds.has(item.id) ? ["popular"] : []), "all"],
    }
  })

  const categoryName = (item: MenuItem) => (typeof item.category === "object" ? item.category?.name : "") || ""
  const hasPlate = (item: MenuItem) => existsSync(join(process.cwd(), "public", "images", "plates", `${plateSlug(item.name)}.webp`))
  const stationLabel = (value?: string | null) => (value ? `${value.charAt(0).toUpperCase()}${value.slice(1)} station` : undefined)
  const spotlight = [...new Map([...featuredItems, ...popularItems, ...ordered].map((item) => [item.id, item])).values()]
    .filter((item) => item.available !== false && hasPlate(item))
    .slice(0, MAX_DISHES)
  const optionNames = (item: MenuItem) => [...new Set((item.modifiers || []).map((modifier) => modifier.name))].slice(0, 8)
  const orbitDishes: OrbitDish[] = spotlight.map((item, index) => {
    const grid = gridItems.find((entry) => entry.id === item.id)!
    const { title, subtitle } = splitName(item.name, categoryName(item) || "House")
    const facts = [item.calories ? `${item.calories} cal` : "", item.prepTime ? `ready in about ${item.prepTime} min` : ""].filter(Boolean).join(" · ")
    return {
      id: item.id,
      needsChoice: grid.needsChoice,
      defaultModifierIds: grid.defaultModifierIds,
      title,
      subtitle,
      image: `/images/plates/${plateSlug(item.name)}.webp`,
      alt: item.name,
      eyebrow: `${grid.price}${categoryName(item) ? ` · ${categoryName(item)}` : ""}`,
      label: item.name,
      badge: item.prepTime ? String(item.prepTime) : undefined,
      badgeUnit: item.prepTime ? "min" : undefined,
      chef: storeName,
      kitchen: stationLabel(item.kitchenStation),
      description: grid.description || facts || `${item.name}, made to order.`,
      ingredients: optionNames(item),
      accent: PASTELS[index % PASTELS.length],
    }
  })

  return (
    <div className="bg-white">
      {orbitDishes.length > 0 ? (
        <HomeOrbit dishes={orbitDishes} backdrop="/images/kitchen-backdrop.webp" />
      ) : (
        <section className="storefront-shell pt-6">
          <h1 className="sf-page-title">{storeName}</h1>
        </section>
      )}

      <section className="storefront-shell pt-8 md:pt-10">
        <PickupSummary name={storeName} address={storeSettings.address} status={status} readyIn={ready} nameAsHeading={orbitDishes.length === 0} />
      </section>

      <div className="storefront-shell pb-16 pt-5 md:pt-8">
        <MenuGrid tabs={tabs} items={gridItems} />
      </div>
    </div>
  )
}

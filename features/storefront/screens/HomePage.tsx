import { Metadata } from "next"
import Image from "next/image"
import { Clock, Leaf } from "lucide-react"
import {
  getMenuCategories,
  getMenuItems,
  getStoreSettings,
} from "@/features/storefront/lib/data/menu"
import { retrieveCart } from "@/features/storefront/lib/data/cart"
import { StorefrontDataUnavailableError } from "@/features/storefront/lib/data/errors"
import { type MenuCategory, type MenuItem } from "@/features/storefront/lib/store-data"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuItemDescriptionText } from "@/features/storefront/lib/menu-item-utils"
import { getServiceStatus, getWeeklyHoursDisplay } from "@/features/storefront/lib/store-hours-display"
import { buildMenuVisibility, selectHeroMenuItems } from "@/features/storefront/lib/menu-visibility"
import { StorefrontUnavailable } from "@/features/storefront/components/StorefrontUnavailable"
import { MenuGrid, type GridItem, type GridTab } from "@/features/storefront/components/antares/MenuGrid"
import { OrderBag } from "@/features/storefront/components/antares/OrderBag"
import { StoreMark } from "@/features/storefront/modules/layout/components/store-logo"

export async function generateMetadata(): Promise<Metadata> {
  const storeSettings = await getStoreSettings()
  return {
    title: storeSettings?.name ? `${storeSettings.name.trim()} | Order Pickup` : "Restaurant",
    description: storeSettings?.heroSubheadline || storeSettings?.tagline || "",
  }
}

const HERO_PHOTO = "/images/bacon-bbq-burger-onion-rings.png"

function readyIn(estimate?: string | null) {
  const value = (estimate || "").trim()
  if (!value) return null
  return /min|hour|hr/i.test(value) ? value : `${value} min`
}

/** "Open 11am – 9pm Daily" when every day matches; otherwise today's hours. */
function hoursLine(hours: unknown, locale: string, timezone: string) {
  const week = getWeeklyHoursDisplay(hours, locale)
  const open = week.filter((entry) => entry.value !== "Closed")
  if (open.length === 0) return null
  if (open.length === 7 && open.every((entry) => entry.value === open[0].value)) return `Open ${open[0].value} daily`
  let today = ""
  try {
    today = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(new Date())
  } catch {
    today = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date())
  }
  const entry = week.find((day) => day.day === today)
  return entry && entry.value !== "Closed" ? `Today ${entry.value}` : null
}

/** Splits a headline into lines at sentence ends so "Craft Burgers. Real Good." stacks like the menu board. */
function headlineLines(headline: string) {
  const parts = headline.match(/[^.!?]+[.!?]*/g)?.map((part) => part.trim()).filter(Boolean) || [headline]
  return parts.length > 1 && parts.length <= 3 ? parts : [headline]
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

  const cart = await retrieveCart().catch(() => null)
  const currency = getCurrencyConfig(storeSettings)
  const timezone = storeSettings.timezone || "America/New_York"
  const status = getServiceStatus(storeSettings.hours, timezone, currency.locale)
  const ready = readyIn(storeSettings.estimatedPickup)
  const hours = hoursLine(storeSettings.hours, currency.locale, timezone)
  const storeName = String(storeSettings.name || "").trim()
  const headline = storeSettings.heroHeadline || storeName
  const subheadline = storeSettings.heroSubheadline || storeSettings.tagline || ""
  const madeFresh = (storeSettings.heroTagline || "").split("·")[0]?.trim()

  const { featuredItems, popularItems } = buildMenuVisibility<MenuItem, MenuCategory>(allItems, categories)
  const heroItem = selectHeroMenuItems(allItems, featuredItems, popularItems).find((item) => item.thumbnail)
  // A composed counter shot reads better at hero width than a square menu crop.
  const hero = heroItem ? { name: heroItem.name, thumbnail: HERO_PHOTO } : null

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

  return (
    <div className="bg-white">
      {/* Phone: pickup timing and the store card. */}
      <section className="storefront-shell pt-4 md:hidden">
        {ready ? (
          <p className="flex items-start gap-2.5">
            <Clock className="mt-px size-5 shrink-0 text-leaf" strokeWidth={1.75} aria-hidden="true" />
            <span className="leading-tight">
              <span className="block text-[0.8rem] font-semibold text-leaf">Ready in {ready}</span>
              <span className="text-[0.75rem] text-ink-soft">Pickup</span>
            </span>
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <StoreMark name={storeName} />
          <div className="min-w-0 flex-1 leading-snug">
            <h1 className="storefront-store-name truncate font-sans text-[0.86rem] font-bold">{storeName}</h1>
            {storeSettings.address ? <p className="truncate text-[0.75rem] text-ink-soft">{storeSettings.address}</p> : null}
            <p className={status.isOpen ? "text-[0.75rem] font-medium text-leaf" : "text-[0.75rem] font-medium text-ink-soft"}>
              {status.isOpen ? "Open" : "Closed"}
              {status.detail ? <span className="font-normal text-ink-soft"> · {status.detail}</span> : null}
            </p>
          </div>
        </div>
      </section>

      {/* Wider: hero with the order bag floating over its right edge. */}
      <div className="relative">
        <section className="relative hidden overflow-hidden bg-[oklch(0.965_0.003_90)] md:block">
          {hero?.thumbnail ? (
            <div className="absolute inset-y-0 right-0 aspect-[5/4] lg:right-[19rem] xl:right-[21rem]">
              <Image src={hero.thumbnail} alt={hero.name} fill priority sizes="40vw" className="object-cover" />
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-[oklch(0.965_0.003_90)] via-[oklch(0.965_0.003_90/0.55)] to-transparent" />
            </div>
          ) : null}
          <div className="storefront-shell relative py-9 lg:py-10">
            <div className="max-w-[34rem] lg:max-w-[42%]">
              <h1 className="font-serif text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] text-ink lg:text-[3.05rem]">
                {headlineLines(headline).map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </h1>
              <span aria-hidden="true" className="mt-4 block h-1 w-12 rounded-full bg-leaf" />
              {subheadline ? <p className="mt-4 max-w-[46ch] text-pretty text-[1rem] text-ink">{subheadline}</p> : null}
              <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-2 text-[0.95rem] text-ink">
                {madeFresh ? (
                  <li className="flex items-center gap-2.5"><Leaf className="size-5 fill-leaf text-leaf" aria-hidden="true" />{madeFresh}</li>
                ) : null}
                {ready ? (
                  <li className="flex items-center gap-2.5"><Clock className="size-5 text-leaf" aria-hidden="true" />Ready in <span className="text-leaf">{ready}</span></li>
                ) : null}
                {hours ? (
                  <li className="flex items-center gap-2.5"><Clock className="size-5 text-ink-soft" aria-hidden="true" />{hours}</li>
                ) : null}
              </ul>
            </div>
          </div>
        </section>

        <div className="storefront-shell pb-16 pt-5 md:pt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <MenuGrid tabs={tabs} items={gridItems} />
        </div>

        {/* The bag starts at the hero's top edge and follows the guest down the menu. */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="storefront-shell flex h-full justify-end pb-16 pt-8">
            <div className="pointer-events-auto w-[18rem] xl:w-[20rem]">
              <div className="sticky top-28">
                <OrderBag
                  cart={cart}
                  currencyCode={currency.currencyCode}
                  locale={currency.locale}
                  readyIn={ready}
                  address={storeSettings.address}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { Metadata } from "next"
import {
  getMenuCategories,
  getMenuItems,
  getStoreSettings,
} from "@/features/storefront/lib/data/menu"
import { StorefrontDataUnavailableError } from "@/features/storefront/lib/data/errors"
import {
  type MenuCategory,
  type MenuItem,
  type StoreInfo,
} from "@/features/storefront/lib/store-data"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { HeroBanner } from "@/features/storefront/components/HeroBanner"
import { CategoryNav } from "@/features/storefront/components/CategoryNav"
import { MenuSection, PopularRail, type MenuRow } from "@/features/storefront/components/MenuSection"
import { getMenuItemDescriptionText } from "@/features/storefront/lib/menu-item-utils"
import { getServiceStatus } from "@/features/storefront/lib/store-hours-display"
import { buildMenuVisibility, selectHeroMenuItems } from "@/features/storefront/lib/menu-visibility"
import { getStorefrontRating } from "@/features/storefront/lib/store-rating-display"
import { cn } from "@/lib/utils"
import { StorefrontUnavailable } from "@/features/storefront/components/StorefrontUnavailable"

export async function generateMetadata(): Promise<Metadata> {
  const storeSettings = await getStoreSettings()

  return {
    title: storeSettings?.name
      ? `${storeSettings.name} - ${storeSettings.tagline || ""}`
      : "Restaurant",
    description: storeSettings?.heroSubheadline || storeSettings?.tagline || "",
  }
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

  const { featuredItems, popularItems, houseItems, categorySections, otherItems } = buildMenuVisibility<MenuItem, MenuCategory>(allItems, categories)

  const heroCandidates = selectHeroMenuItems(allItems, featuredItems, popularItems)

  const currencyConfig = getCurrencyConfig(storeSettings)
  const storefrontRating = getStorefrontRating(storeSettings.rating, storeSettings.reviewCount)

  const storeInfo: StoreInfo = {
    name: storeSettings.name,
    tagline: storeSettings.tagline || "",
    address: storeSettings.address || "",
    phone: storeSettings.phone || "",
    currencyCode: currencyConfig.currencyCode,
    locale: currencyConfig.locale,
    timezone: storeSettings.timezone || "America/New_York",
    countryCode: storeSettings.countryCode || "US",
    deliveryEnabled: storeSettings.deliveryEnabled ?? true,
    deliveryPostalCodes: Array.isArray(storeSettings.deliveryPostalCodes)
      ? storeSettings.deliveryPostalCodes
      : [],
    hours: storeSettings.hours || {},
    deliveryFee: parseFloat(storeSettings.deliveryFee) || 0,
    deliveryMinimum: parseFloat(storeSettings.deliveryMinimum) || 0,
    pickupDiscount: storeSettings.pickupDiscount ?? 0,
    taxRate: parseFloat(storeSettings.taxRate || "8.75") || 8.75,
    estimatedDelivery: storeSettings.estimatedDelivery || "",
    estimatedPickup: storeSettings.estimatedPickup || "",
    heroHeadline: storeSettings.heroHeadline,
    heroSubheadline: storeSettings.heroSubheadline,
    heroTagline: storeSettings.heroTagline,
    promoBanner: storeSettings.promoBanner,
    rating: storefrontRating?.rating,
    reviewCount: storefrontRating?.reviewCount,
  }

  const currency = { currencyCode: storeInfo.currencyCode, locale: storeInfo.locale }
  const toRow = (item: MenuItem): MenuRow => ({
    id: item.id,
    name: item.name,
    price: formatCurrency(item.price, currency),
    description: getMenuItemDescriptionText(item.description),
    thumbnail: item.thumbnail || null,
    calories: item.calories ?? null,
    customizable: Boolean(item.modifiers?.length),
    soldOut: item.available === false,
    dietary: (item.dietaryFlags || []).slice(0, 2).map((flag) => flag.replace(/_/g, " ")),
  })

  const status = getServiceStatus(storeInfo.hours, storeInfo.timezone, storeInfo.locale)

  const popularSectionId = "popular-dishes"
  const featuredSectionId = "house-picks"

  const navItems: Array<{ href: string; label: string }> = []
  if (popularItems.length > 0) navItems.push({ href: `#${popularSectionId}`, label: "Popular" })
  if (houseItems.length > 0) navItems.push({ href: `#${featuredSectionId}`, label: "House picks" })
  categorySections.forEach(({ category, sectionId }: { category: MenuCategory; sectionId: string }) => {
    navItems.push({ href: `#${sectionId}`, label: category.name })
  })
  if (otherItems.length > 0) navItems.push({ href: "#other-menu-items", label: "More" })

  const menuHref = navItems[0]?.href || "#menu"
  const railOffset = storeSettings.promoBanner ? "top-[100px]" : "top-16"
  const sectionScrollMt = storeSettings.promoBanner ? "scroll-mt-40" : "scroll-mt-32"

  return (
    <div className="flex flex-col bg-steel" id="menu">
      <HeroBanner
        menuHref={menuHref}
        storeInfo={storeInfo}
        status={status}
        heroItems={heroCandidates.map((item) => ({
          id: item.id,
          name: item.name,
          description: getMenuItemDescriptionText(item.description),
          imagePath: item.thumbnail || null,
          price: item.price,
          categoryName:
            typeof item.category === "object" && item.category?.name ? item.category.name : undefined,
        }))}
      />

      {navItems.length > 0 ? (
        <div className={cn("sticky z-40 mt-4 sm:mt-6", railOffset)}>
          <CategoryNav items={navItems} />
        </div>
      ) : null}

      <main className="flex flex-col">
        <PopularRail
          sectionId={popularSectionId}
          title="Popular"
          rows={popularItems.map(toRow)}
          className={sectionScrollMt}
        />

        <MenuSection
          sectionId={featuredSectionId}
          title="House picks"
          rows={houseItems.map(toRow)}
          className={sectionScrollMt}
        />

        {categorySections.map(({ category, items, sectionId }) => (
          <MenuSection
            key={category.id}
            sectionId={sectionId}
            title={category.name}
            description={category.description || undefined}
            rows={items.map(toRow)}
            className={sectionScrollMt}
          />
        ))}

        {otherItems.length > 0 ? (
          <MenuSection
            sectionId="other-menu-items"
            title="More"
            rows={otherItems.map(toRow)}
            className={sectionScrollMt}
          />
        ) : null}
      </main>
    </div>
  )
}

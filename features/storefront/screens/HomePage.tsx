import { Metadata } from "next"
import {
  getMenuCategories,
  getMenuItems,
  getStoreSettings,
  StorefrontDataUnavailableError,
} from "@/features/storefront/lib/data/menu"
import {
  type MenuCategory,
  type MenuItem,
  type StoreInfo,
} from "@/features/storefront/lib/store-data"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { HeroBanner } from "@/features/storefront/components/HeroBanner"
import { StoreInfoBar } from "@/features/storefront/components/StoreInfoBar"
import { CategoryNav } from "@/features/storefront/components/CategoryNav"
import { MenuSection } from "@/features/storefront/components/MenuSection"
import { getMenuItemDescriptionText } from "@/features/storefront/lib/menu-item-utils"
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

  const popularSectionId = "popular-dishes"
  const featuredSectionId = "house-picks"

  const navItems: Array<{ href: string; label: string }> = []

  if (popularItems.length > 0) {
    navItems.push({ href: `#${popularSectionId}`, label: "Popular" })
  }

  if (featuredItems.length > 0) {
    navItems.push({ href: `#${featuredSectionId}`, label: "House picks" })
  }

  categorySections.forEach(({ category, sectionId }: { category: MenuCategory; sectionId: string }) => {
    navItems.push({ href: `#${sectionId}`, label: category.name })
  })
  if (otherItems.length > 0) navItems.push({ href: "#other-menu-items", label: "More" })

  const menuHref = categorySections[0]?.sectionId
    ? `#${categorySections[0].sectionId}`
    : navItems[0]?.href || "#menu"
  const navOffset = storeSettings.promoBanner ? "top-[96px]" : "top-16"
  const sectionScrollMt = storeSettings.promoBanner ? "scroll-mt-44" : "scroll-mt-32"

  return (
    <div className="flex flex-col" id="menu">
      <HeroBanner
        menuHref={menuHref}
        storeInfo={storeInfo}
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

      <StoreInfoBar storeInfo={storeInfo} />

      {navItems.length > 0 ? (
        <div className={cn("sticky z-40", navOffset)}>
          <CategoryNav items={navItems} />
        </div>
      ) : null}

      <main className="flex flex-col">
        {popularItems.length > 0 ? (
          <section id={popularSectionId} className={cn("py-8 sm:py-16 lg:py-24", sectionScrollMt)}>
            <div className="storefront-shell">
              <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center justify-center space-y-3 text-center sm:mb-12">
                <h2 className="storefront-heading">Popular picks</h2>
                <p className="storefront-copy max-w-2xl text-center">
                  The items customers order most often, available for the same quick checkout as the full menu below.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {popularItems.map((item: MenuItem) => (
                  <MenuSection.Card
                    key={item.id}
                    item={item}
                    currencyCode={storeInfo.currencyCode}
                    locale={storeInfo.locale}
                    showCategory={true}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {featuredItems.length > 0 ? (
          <section id={featuredSectionId} className={cn("py-8 sm:py-16 lg:py-24", sectionScrollMt)}>
            <div className="storefront-shell">
              <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center justify-center space-y-3 text-center sm:mb-12">
                <h2 className="storefront-heading">House favorites</h2>
                <p className="storefront-copy max-w-2xl text-center">
                  Signature items highlighted at the top, with the full live menu ready just below.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {houseItems.map((item: MenuItem) => (
                  <MenuSection.FeatureCard
                    key={item.id}
                    item={item}
                    currencyCode={storeInfo.currencyCode}
                    locale={storeInfo.locale}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <div className="storefront-shell py-8 sm:py-10 lg:py-14">
          <div className="space-y-14 sm:space-y-16">
            {categorySections.map(({ category, items, sectionId }) => (
              <MenuSection
                key={category.id}
                sectionId={sectionId}
                title={category.name}
                description={category.description || undefined}
                items={items}
                currencyCode={storeInfo.currencyCode}
                locale={storeInfo.locale}
                className={sectionScrollMt}
              />
            ))}
            {otherItems.length > 0 ? (
              <MenuSection
                sectionId="other-menu-items"
                title="More to enjoy"
                items={otherItems}
                currencyCode={storeInfo.currencyCode}
                locale={storeInfo.locale}
                className={sectionScrollMt}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}

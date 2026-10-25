import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuItem, getStoreSettings } from "@/features/storefront/lib/data/menu"
import { getMenuItemDescriptionText } from "@/features/storefront/lib/menu-item-utils"
import { MenuItemPurchaseForm } from "@/features/storefront/components/MenuItemPurchaseForm"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const [item, storeSettings] = await Promise.all([getMenuItem(id), getStoreSettings()])

  if (!item) {
    return { title: "Menu Item" }
  }

  const storeName = storeSettings?.name || "Restaurant"
  const description = getMenuItemDescriptionText(item.description)
  const image = item.thumbnail || undefined

  return {
    title: `${item.name} | ${storeName}`,
    description: description || `${item.name} from ${storeName}`,
    openGraph: image
      ? {
          title: `${item.name} | ${storeName}`,
          description: description || `${item.name} from ${storeName}`,
          images: [image],
        }
      : undefined,
  }
}

export default async function MenuItemPage(props: Props) {
  const { id } = await props.params
  const [item, storeSettings] = await Promise.all([getMenuItem(id), getStoreSettings()])

  if (!item) {
    notFound()
  }

  const currencyConfig = getCurrencyConfig(storeSettings)
  const description = getMenuItemDescriptionText(item.description)
  const categoryName = typeof item.category === "object" ? item.category?.name : null

  const facts = [
    item.prepTime ? { label: "Ready in", value: `About ${item.prepTime} min` } : null,
    item.calories ? { label: "Calories", value: `${item.calories} cal` } : null,
    item.dietaryFlags?.length ? { label: "Dietary", value: item.dietaryFlags.map((flag: string) => flag.replace(/_/g, " ")).join(", ") } : null,
    item.mealPeriods?.length ? { label: "Served", value: item.mealPeriods.map((period: string) => period.replace(/_/g, " ")).join(", ") } : null,
    item.allergens?.length ? { label: "Contains", value: item.allergens.map((allergen: string) => allergen.replace(/_/g, " ")).join(", ") } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact))

  return (
    <main className="bg-steel pb-16 text-ink sm:pb-24">
      <div className="storefront-shell pt-4 sm:pt-6">
        <Link
          href="/#menu"
          className="-ml-2 inline-flex items-center gap-2 px-2 py-2 text-base font-medium text-ink transition-colors hover:bg-steel-shade"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {categoryName ? `Menu, ${categoryName}` : "Menu"}
        </Link>
      </div>

      <div className="storefront-shell mt-2 grid gap-0 lg:mt-6 lg:grid-cols-12 lg:gap-10">
        <section className="-mx-4 sm:-mx-6 lg:col-span-7 lg:mx-0">
          {item.thumbnail ? (
            <div className="pass-shutter relative aspect-square w-full overflow-hidden bg-steel-shade lg:sticky lg:top-24 lg:aspect-[5/4]">
              <div className="absolute inset-0">
                <Image
                  src={item.thumbnail}
                  alt={item.name}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 58vw"
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className={item.thumbnail ? "relative -mt-10 lg:col-span-5 lg:mt-0" : "relative mt-4 lg:col-span-7 lg:col-start-3 lg:mt-0"}>
          <div className="ticket px-5 pt-6 sm:px-7 sm:pt-8">
            <h1 className="text-balance font-serif text-5xl font-black leading-[0.92] sm:text-6xl">
              {item.name}
            </h1>
            <p className="mt-3 font-serif text-3xl font-extrabold">
              {item.available === false ? "Sold out" : formatCurrency(item.price, currencyConfig)}
            </p>

            {description ? (
              <p className="mt-5 max-w-[52ch] text-pretty text-lg leading-relaxed text-ink">{description}</p>
            ) : null}

            {facts.length > 0 ? (
              <dl className="mt-6 text-base">
                {facts.map((fact) => (
                  <div key={fact.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-1">
                    <dt className="text-ink-soft">{fact.label}</dt>
                    <dd className="text-ink">{fact.value.charAt(0).toUpperCase() + fact.value.slice(1)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <MenuItemPurchaseForm
              item={item}
              currencyCode={currencyConfig.currencyCode}
              locale={currencyConfig.locale}
              className="mt-8 px-0 pb-4 sm:px-0"
            />
          </div>
        </section>
      </div>
    </main>
  )
}

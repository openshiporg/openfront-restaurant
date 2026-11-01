import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight, Clock, Flame, Leaf, UtensilsCrossed } from "lucide-react"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuCategories, getMenuItem, getMenuItems, getStoreSettings } from "@/features/storefront/lib/data/menu"
import { retrieveCart } from "@/features/storefront/lib/data/cart"
import { getMenuItemDescriptionText, getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { MenuItemPurchaseForm } from "@/features/storefront/components/MenuItemPurchaseForm"
import { OrderBag } from "@/features/storefront/components/antares/OrderBag"
import { CategoryIcon } from "@/features/storefront/components/antares/CategoryIcon"
import { QuickAdd } from "@/features/storefront/components/antares/QuickAdd"
import type { MenuCategory, MenuItem } from "@/features/storefront/lib/store-data"
import { cn } from "@/lib/utils"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const [item, storeSettings] = await Promise.all([getMenuItem(id), getStoreSettings()])
  if (!item) return { title: "Menu Item" }
  const storeName = (storeSettings?.name || "Restaurant").trim()
  const description = getMenuItemDescriptionText(item.description)
  const image = item.thumbnail || undefined
  return {
    title: `${item.name} | ${storeName}`,
    description: description || `${item.name} from ${storeName}`,
    openGraph: image ? { title: `${item.name} | ${storeName}`, description: description || `${item.name} from ${storeName}`, images: [image] } : undefined,
  }
}

function readyIn(estimate?: string | null) {
  const value = (estimate || "").trim()
  if (!value) return null
  return /min|hour|hr/i.test(value) ? value : `${value} min`
}

const label = (value: string) => {
  const text = value.replace(/_/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export default async function MenuItemPage(props: Props) {
  const { id } = await props.params
  const [item, storeSettings, categories, allItems, cart] = await Promise.all([
    getMenuItem(id),
    getStoreSettings(),
    getMenuCategories().catch(() => [] as MenuCategory[]),
    getMenuItems().catch(() => [] as MenuItem[]),
    retrieveCart().catch(() => null),
  ])
  if (!item) notFound()

  const currency = getCurrencyConfig(storeSettings)
  const description = getMenuItemDescriptionText(item.description)
  const category = item.category as { id: string; name: string } | null
  const used = (categories as MenuCategory[]).filter((entry) =>
    (allItems as MenuItem[]).some((menuItem) => (typeof menuItem.category === "object" ? menuItem.category?.id : menuItem.category) === entry.id),
  )
  // Pair the dish with things from other sections: a side, a drink, a dessert.
  const others = (allItems as MenuItem[]).filter((entry) => entry.id !== item.id && entry.thumbnail)
  const seen = new Set<string>()
  const related = others
    .filter((entry) => {
      const key = (entry.category as { id?: string } | null)?.id || entry.id
      if (key === category?.id || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .concat(others)
    .filter((entry, index, list) => list.findIndex((other) => other.id === entry.id) === index)
    .slice(0, 4)

  const facts = [
    item.prepTime ? { icon: Clock, title: "Made to order", detail: `Ready in about ${item.prepTime} min` } : null,
    item.calories ? { icon: Flame, title: `${item.calories} calories`, detail: "Before any add-ons" } : null,
    item.dietaryFlags?.length ? { icon: Leaf, title: label(item.dietaryFlags[0]), detail: item.dietaryFlags.slice(1).map(label).join(", ") || "As listed" } : null,
    item.allergens?.length ? { icon: UtensilsCrossed, title: "Contains", detail: item.allergens.map(label).join(", ") } : null,
  ].filter(Boolean) as Array<{ icon: typeof Clock; title: string; detail: string }>

  return (
    <main className="bg-white pb-16 text-ink">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Category rail. */}
        <aside className="hidden border-r border-border lg:block">
          <nav className="sticky top-28 px-5 py-8" aria-label="Menu categories">
            <ul className="space-y-1.5">
              {used.map((entry) => {
                const on = entry.id === category?.id
                return (
                  <li key={entry.id}>
                    <Link
                      href={`/?category=${entry.id}#menu`}
                      className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-[1.08rem] transition-colors", on ? "bg-muted text-leaf" : "text-ink-soft hover:bg-muted hover:text-ink")}
                    >
                      <CategoryIcon icon={(entry as { icon?: string | null }).icon} name={entry.name} className="size-6" />
                      {entry.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        <div className="storefront-shell !max-w-none pt-5 lg:pt-8 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[0.95rem] text-ink-soft">
              <Link href="/" className="hover:text-ink">Home</Link>
              {category ? (
                <>
                  <ChevronRight className="size-4" aria-hidden="true" />
                  <Link href={`/?category=${category.id}#menu`} className="hover:text-ink">{category.name}</Link>
                </>
              ) : null}
              <ChevronRight className="size-4" aria-hidden="true" />
              <span className="text-ink">{item.name}</span>
            </nav>

            <div className="mt-5 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10">
              <div className="relative aspect-[5/4] overflow-hidden rounded-3xl bg-muted">
                {item.thumbnail ? <Image src={item.thumbnail} alt={item.name} fill priority sizes="(max-width: 768px) 100vw, 36vw" className="object-cover" /> : null}
              </div>

              <div>
                <h1 className="text-balance text-[2.1rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[2.5rem]">{item.name}</h1>
                <p className="mt-1 text-[2rem] font-semibold text-leaf">
                  {item.available === false ? "Sold out" : formatCurrency(item.price, currency)}
                </p>
                {description ? <p className="mt-4 max-w-[52ch] text-pretty text-[1.08rem] leading-relaxed text-ink">{description}</p> : null}
                <MenuItemPurchaseForm item={item} currencyCode={currency.currencyCode} locale={currency.locale} className="mt-6 px-0 py-0 sm:px-0" />
              </div>
            </div>

            {related.length > 0 ? (
              <section className="mt-12" aria-labelledby="also-like">
                <h2 id="also-like" className="text-[1.6rem] font-medium">You may also like</h2>
                <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {related.map((entry) => (
                    <li key={entry.id}>
                      <Link href={getMenuItemHref(entry.id)} prefetch={false} className="relative block aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                        <Image src={entry.thumbnail!} alt="" fill sizes="(max-width: 768px) 50vw, 18vw" className="object-cover" />
                        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/60 to-transparent" />
                        <span className="absolute bottom-3 left-3 right-12 text-[1.05rem] leading-tight text-white">
                          {entry.name} <span className="whitespace-nowrap">{formatCurrency(entry.price, currency)}</span>
                        </span>
                        <span className="absolute right-3 top-3">
                          <QuickAdd itemId={entry.id} name={entry.name} needsChoice={Boolean(entry.modifiers?.some((modifier) => modifier.required))} defaultModifierIds={(entry.modifiers || []).filter((modifier) => modifier.defaultSelected).map((modifier) => modifier.id)} soldOut={entry.available === false} className="size-8" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {facts.length > 0 ? (
              <ul className="mt-10 grid grid-cols-2 gap-6 border-t border-border pt-8 md:grid-cols-4">
                {facts.map(({ icon: Icon, title, detail }) => (
                  <li key={title} className="flex items-start gap-3">
                    <Icon className="size-8 shrink-0 text-leaf" strokeWidth={1.6} aria-hidden="true" />
                    <span>
                      <span className="block text-[1.05rem] text-ink">{title}</span>
                      <span className="block text-sm text-ink-soft">{detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="hidden xl:block">
            <div className="sticky top-28">
              <OrderBag cart={cart} currencyCode={currency.currencyCode} locale={currency.locale} readyIn={readyIn(storeSettings?.estimatedPickup)} address={storeSettings?.address} />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

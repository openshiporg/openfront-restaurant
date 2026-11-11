import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getMenuCategories, getMenuItem, getMenuItems, getStoreSettings } from "@/features/storefront/lib/data/menu"
import { getCurrencyConfig, formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuItemDescriptionText } from "@/features/storefront/lib/menu-item-utils"
import type { MenuCategory, MenuItem } from "@/features/storefront/lib/store-data"
import { arcPath } from "./geometry"
import { DishForm } from "./DishForm"
import { PlateCard } from "./PlateCard"
import { categoryIdOf, categoryNameOf, pastel, plateFor, splitName, toPlateCard } from "./lib"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const [item, settings] = await Promise.all([getMenuItem(id), getStoreSettings()])
  if (!item) return { title: "Dish" }
  const store = String(settings?.name || "").trim()
  const description = getMenuItemDescriptionText(item.description).trim()
  return { title: `${item.name}${store ? ` | ${store}` : ""}`, description: description || `${item.name}${store ? ` from ${store}` : ""}` }
}

const label = (value: string) => {
  const text = value.replace(/_/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export default async function OrbitItemPage(props: Props) {
  const { id } = await props.params
  const [item, settings, allItems] = await Promise.all([
    getMenuItem(id) as Promise<MenuItem | null>,
    getStoreSettings(),
    getMenuItems().catch(() => [] as MenuItem[]),
    getMenuCategories().catch(() => [] as MenuCategory[]),
  ])
  if (!item) notFound()

  const money = getCurrencyConfig(settings)
  const plate = plateFor(item)
  const category = typeof item.category === "object" ? item.category : null
  const { thin, heavy } = splitName(item.name, categoryNameOf(item) || "House")
  const description = getMenuItemDescriptionText(item.description).trim()
  const hue = pastel(item.name.length)
  const facts = [
    item.prepTime ? `Ready in about ${item.prepTime} min` : "",
    item.calories ? `${item.calories} cal` : "",
    ...(item.dietaryFlags || []).map(label),
    item.allergens?.length ? `Contains ${item.allergens.map(label).join(", ").toLowerCase()}` : "",
  ].filter(Boolean)

  // Something from another section to go with it: a side, a drink, a dessert.
  const seen = new Set<string>([categoryIdOf(item)])
  const pairs = (allItems as MenuItem[]).filter((other) => {
    const key = categoryIdOf(other)
    if (other.id === item.id || seen.has(key) || other.available === false) return false
    seen.add(key)
    return true
  }).slice(0, 4)

  return (
    <div className="o-rel">
      <div className="o-shell">
        <nav className="o-crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">/</span>
          <Link href={category ? `/menu#c-${category.id}` : "/menu"}>{category?.name || "Menu"}</Link><span aria-hidden="true">/</span>
          <span style={{ color: "var(--o-ink)" }}>{item.name}</span>
        </nav>
        <div className="o-item">
          <div className="o-item-stage">
            <svg viewBox="0 0 400 400" aria-hidden="true"><path d={arcPath(110, 250, 200, 200, 175, 64)} fill={hue} opacity={0.55} /><path d={arcPath(-70, 40, 200, 200, 175, 48)} fill={pastel(item.name.length + 2)} opacity={0.45} /></svg>
            {plate.src ? <img src={plate.src} className={plate.cutout ? undefined : "o-photo"} alt={item.name} width={520} height={520} fetchPriority="high" /> : <span className="o-noimg" aria-hidden="true">{item.name.trim().charAt(0)}</span>}
          </div>
          <div>
            {category ? <p className="o-eyebrow">{category.name}</p> : null}
            <h1 className="o-split o-split-lg"><span className="o-thin">{thin}</span><span className="o-heavy">{heavy}</span></h1>
            <p style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.75rem 0 0" }}>{item.available === false ? "Sold out" : formatCurrency(item.price, money)}</p>
            {description ? <p className="o-lede" style={{ marginTop: 12 }}>{description}</p> : null}
            {facts.length ? <div className="o-facts">{facts.map((f) => <span key={f}>{f}</span>)}</div> : null}
            <div className="o-glass" style={{ marginTop: 24, padding: "clamp(1.1rem, 4vw, 1.75rem)" }}>
              <DishForm item={item} money={money} />
            </div>
          </div>
        </div>

        {pairs.length ? (
          <section style={{ paddingBottom: "4rem", paddingTop: "2rem" }} aria-labelledby="pairs">
            <h2 id="pairs" className="o-split o-split-md" style={{ marginBottom: "1.5rem" }}><span className="o-thin">Goes well</span><span className="o-heavy">With it</span></h2>
            <div className="o-grid o-grid-4">
              {pairs.map((other, i) => <PlateCard key={other.id} card={toPlateCard(other, i + 1, money)} />)}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

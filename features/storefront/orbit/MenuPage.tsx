import type { Metadata } from "next"
import Link from "next/link"
import { getMenuCategories, getMenuItems, getStoreSettings } from "@/features/storefront/lib/data/menu"
import { StorefrontDataUnavailableError } from "@/features/storefront/lib/data/errors"
import type { MenuCategory, MenuItem } from "@/features/storefront/lib/store-data"
import { getCurrencyConfig } from "@/features/storefront/lib/currency"
import { PlateCard } from "./PlateCard"
import { Arcs } from "./Arcs"
import { categoryIdOf, inMenuOrder, sectionTitle, toPlateCard, usedCategories } from "./lib"
import { Unavailable } from "./Unavailable"

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  const name = String(settings?.name || "").trim()
  return { title: name ? `Menu | ${name}` : "Menu" }
}

export default async function OrbitMenuPage() {
  let categories: MenuCategory[]
  let items: MenuItem[]
  let settings: any
  try {
    ;[categories, items, settings] = await Promise.all([getMenuCategories(true), getMenuItems(undefined, true), getStoreSettings(true)])
  } catch (error) {
    if (!(error instanceof StorefrontDataUnavailableError)) throw error
    return <Unavailable title="We can't load the menu right now" message="Please try again in a moment." action={false} />
  }
  const money = getCurrencyConfig(settings)
  const ordered = inMenuOrder(items, categories)
  const sections = usedCategories(categories, items)
  const loose = ordered.filter((item) => !sections.some((category) => category.id === categoryIdOf(item)))
  let n = 0

  return (
    <>
      <section className="o-pagehero">
        <Arcs variant="page" />
        <div className="o-shell">
          <h1 className="o-split o-split-xl"><span className="o-thin">The</span><span className="o-heavy">Menu</span></h1>
          <p className="o-lede" style={{ marginTop: 12 }}>
            {items.length} dishes, cooked to order{settings?.estimatedPickup ? `. Pickup in ${settings.estimatedPickup}` : ""}.
          </p>
        </div>
      </section>

      <nav className="o-chiprow" aria-label="Menu sections">
        <div className="o-shell o-chips">
          {sections.map((category) => (
            <a key={category.id} href={`#c-${category.id}`} className="o-pill">{category.name}</a>
          ))}
        </div>
      </nav>

      <div className="o-shell" style={{ paddingBottom: "3rem" }}>
        {[...sections.map((category) => ({ id: category.id, name: category.name, description: category.description, items: ordered.filter((item) => categoryIdOf(item) === category.id) })),
          ...(loose.length ? [{ id: "more", name: "More", description: "", items: loose }] : [])].map((section) => {
          const { thin, heavy } = sectionTitle(section.name)
          return (
            <section key={section.id} id={`c-${section.id}`} className="o-band" aria-labelledby={`h-${section.id}`}>
              <div className="o-band-head">
                <h2 id={`h-${section.id}`} className="o-split o-split-md">
                  <span className="o-thin">{thin}</span>
                  <span className="o-heavy">{heavy}</span>
                </h2>
                <span className="o-rule" aria-hidden="true" />
                {section.description?.trim() ? <p className="o-lede" style={{ marginTop: 12 }}>{section.description}</p> : (
                  <p className="o-lede" style={{ marginTop: 12 }}>{section.items.length} dish{section.items.length === 1 ? "" : "es"}</p>
                )}
              </div>
              <div className="o-grid">
                {section.items.map((item) => <PlateCard key={item.id} card={toPlateCard(item, n++, money)} showDescription />)}
              </div>
            </section>
          )
        })}
        {!sections.length && !loose.length ? (
          <p className="o-lede" style={{ padding: "3rem 0" }}>Nothing is on the menu right now. <Link className="o-link" href="/#visit">See our hours</Link>.</p>
        ) : null}
      </div>
    </>
  )
}

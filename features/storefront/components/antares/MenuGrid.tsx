"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Search, X } from "lucide-react"
import { getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { cn } from "@/lib/utils"
import { CategoryIcon } from "./CategoryIcon"
import { QuickAdd } from "./QuickAdd"

export type GridItem = {
  id: string
  name: string
  price: string
  thumbnail: string | null
  description: string
  needsChoice: boolean
  defaultModifierIds: string[]
  soldOut: boolean
  categoryIds: string[]
}

export type GridTab = { id: string; label: string; icon?: string | null }

/** "Our Menu": category tabs over a grid of photo tiles, each with a quick add. */
export function MenuGrid({ tabs, items }: { tabs: GridTab[]; items: GridItem[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "all")
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)

  // Links from a dish page land on its section: /?category=<id>#menu
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("category")
    if (wanted && tabs.some((tab) => tab.id === wanted)) setActive(wanted)
  }, [tabs])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) return items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(q))
    return items.filter((item) => active === "all" || item.categoryIds.includes(active))
  }, [items, active, query])

  return (
    <section id="menu" className="scroll-mt-24" aria-labelledby="menu-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="menu-title" className="font-serif text-[2rem] font-bold leading-none sm:text-[2.6rem]">
          <span className="sm:hidden">Menu</span>
          <span className="hidden sm:inline">Our Menu</span>
        </h2>
        <button
          type="button"
          onClick={() => setSearching((open) => !open)}
          className="grid size-12 place-items-center rounded-full border border-border bg-white text-ink transition-colors hover:bg-mint lg:hidden"
          aria-label={searching ? "Close search" : "Search the menu"}
          aria-expanded={searching}
        >
          {searching ? <X className="size-5" /> : <Search className="size-5" />}
        </button>
      </div>

      {searching ? (
        <label className="mt-4 flex h-12 items-center gap-3 rounded-full border border-border bg-white px-4 lg:hidden">
          <Search className="size-5 text-ink-soft" aria-hidden="true" />
          <span className="sr-only">Search the menu</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search menu items"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-soft"
          />
        </label>
      ) : null}

      {/* Phone: pill chips. */}
      <div className="no-scrollbar -mx-4 mt-5 flex gap-2.5 overflow-x-auto px-4 sm:hidden" role="tablist" aria-label="Menu categories">
        {tabs.map((tab) => {
          const on = tab.id === active && !query
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setQuery("")
                setActive(tab.id)
              }}
              className={cn(
                "inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-5 text-[1.05rem] transition-colors",
                on ? "border-leaf bg-leaf font-medium text-white" : "border-border bg-white text-ink hover:border-leaf/40",
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Wider: underlined tabs with icons. */}
      <div className="no-scrollbar mt-8 hidden overflow-x-auto border-b border-border sm:block" role="tablist" aria-label="Menu categories">
        <div className="flex gap-10">
          {tabs.map((tab) => {
            const on = tab.id === active && !query
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setQuery("")
                  setActive(tab.id)
                }}
                className={cn(
                  "-mb-px inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap border-b-[3px] pb-4 pt-1 text-[1.15rem] transition-colors",
                  on ? "border-leaf text-leaf" : "border-transparent text-ink-soft hover:text-ink",
                )}
              >
                <CategoryIcon icon={tab.icon} name={tab.label} className={cn("size-6", on ? "text-leaf" : "text-ink-soft/70")} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-10 text-lg text-ink-soft">{query ? `Nothing on the menu matches "${query}".` : "Nothing in this section right now."}</p>
      ) : (
        <>
          {/* Phone: photo cards, the first one tall. */}
          <ul className="mt-6 grid grid-cols-2 auto-rows-[9.75rem] gap-3 sm:hidden">
            {shown.map((item, index) => (
              <li key={item.id} className={cn(index === 0 && shown.length > 2 ? "row-span-2" : "")}>
                <Link
                  href={getMenuItemHref(item.id)}
                  prefetch={false}
                  className={cn(
                    "relative block overflow-hidden rounded-2xl bg-muted",
                    "h-full",
                  )}
                >
                  {item.thumbnail ? (
                    <Image src={item.thumbnail} alt="" fill priority={index < 3} sizes="50vw" className="object-cover" />
                  ) : null}
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/45 to-transparent" />
                  <span className="absolute inset-x-2.5 bottom-2.5 flex flex-col items-start gap-1.5 pr-11">
                    <span className="line-clamp-2 text-[1.02rem] font-semibold leading-tight text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.35)]">{item.name}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-sm font-medium text-ink">{item.soldOut ? "Sold out" : item.price}</span>
                  </span>
                  <span className="absolute bottom-2.5 right-2.5">
                    <QuickAdd itemId={item.id} name={item.name} needsChoice={item.needsChoice} defaultModifierIds={item.defaultModifierIds} soldOut={item.soldOut} variant="light" className="size-9" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Wider: photo tiles with the name, price and add underneath. */}
          <ul className="mt-8 hidden grid-cols-2 gap-5 sm:grid lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((item, index) => (
              <li key={item.id}>
                <Link href={getMenuItemHref(item.id)} prefetch={false} className="storefront-card group flex h-full flex-col overflow-hidden !rounded-2xl">
                  <div className="relative aspect-[2/1] overflow-hidden bg-muted">
                    {item.thumbnail ? (
                      <Image
                        src={item.thumbnail}
                        alt=""
                        fill
                        priority={index < 4}
                        sizes="(max-width: 1024px) 45vw, (max-width: 1280px) 25vw, 18vw"
                        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 items-start gap-3 px-4 py-4">
                    <h3 className="line-clamp-2 min-w-0 flex-1 text-[1.1rem] leading-snug text-ink">{item.name}</h3>
                    <span className="pt-1.5 text-[1.05rem] font-medium tabular-nums text-leaf">{item.soldOut ? "Sold out" : item.price}</span>
                    <QuickAdd itemId={item.id} name={item.name} needsChoice={item.needsChoice} defaultModifierIds={item.defaultModifierIds} soldOut={item.soldOut} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

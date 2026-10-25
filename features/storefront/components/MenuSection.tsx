"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"

export type MenuRow = {
  id: string
  name: string
  price: string
  description: string
  thumbnail: string | null
  calories?: number | null
  customizable: boolean
  soldOut: boolean
  dietary: string[]
}

interface MenuSectionProps {
  sectionId: string
  title: string
  description?: string
  rows: MenuRow[]
  /** Which side the plate sits on at desktop width. */
  plateSide?: "left" | "right"
  className?: string
}

function rowMeta(row: MenuRow) {
  const parts: string[] = []
  if (row.calories) parts.push(`${row.calories} cal`)
  parts.push(...row.dietary)
  if (row.customizable) parts.push("Choose options")
  return parts.join(", ")
}

/**
 * A category set as the kitchen's menu board: names and prices in a list, with
 * the plate beside it switching to whichever dish the guest is looking at.
 */
export function MenuSection({ sectionId, title, description, rows, plateSide = "left", className }: MenuSectionProps) {
  const withPhotos = rows.filter((row) => row.thumbnail)
  const [activeId, setActiveId] = useState(withPhotos[0]?.id ?? null)

  if (rows.length === 0) return null
  const hasPlate = withPhotos.length > 0

  return (
    <section id={sectionId} className={cn("scroll-mt-32 py-10 sm:py-16 lg:py-20", className)}>
      <div className="storefront-shell">
        <div className={cn("lg:grid lg:grid-cols-12 lg:gap-x-10", !hasPlate && "lg:block")}>
          {hasPlate ? (
            <div
              className={cn(
                "hidden lg:block lg:col-span-5",
                plateSide === "right" && "lg:order-2 lg:col-start-8",
              )}
            >
              <div className="sticky top-44 h-[clamp(24rem,100%,38rem)] w-full overflow-hidden bg-steel-shade">
                {withPhotos.map((row) => (
                  <Image
                    key={row.id}
                    src={row.thumbnail!}
                    alt=""
                    fill
                    sizes="40vw"
                    className={cn(
                      "object-cover transition-[opacity,transform] duration-300 ease-out",
                      row.id === activeId ? "scale-100 opacity-100" : "scale-[1.03] opacity-0",
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              hasPlate ? "lg:col-span-7" : "max-w-4xl",
              hasPlate && plateSide === "left" && "lg:col-start-6 lg:pl-6",
              hasPlate && plateSide === "right" && "lg:order-1 lg:pr-6",
            )}
          >
            <div className="flex items-baseline gap-4">
              <h2 className="pass-rise font-serif text-5xl font-black leading-[0.9] sm:text-6xl lg:text-7xl">{title}</h2>
              <span className="text-base text-ink-soft">
                {rows.length} {rows.length === 1 ? "item" : "items"}
              </span>
            </div>
            {description ? <p className="mt-4 max-w-[60ch] text-pretty text-lg text-ink">{description}</p> : null}

            <ul className="mt-8 sm:mt-10">
              {rows.map((row) => {
                const isActive = row.id === activeId
                const meta = rowMeta(row)
                return (
                  <li key={row.id} className="pass-rise">
                    <Link
                      href={getMenuItemHref(row.id)}
                      prefetch={false}
                      onMouseEnter={() => row.thumbnail && setActiveId(row.id)}
                      onFocus={() => row.thumbnail && setActiveId(row.id)}
                      className={cn(
                        "group -mx-3 flex gap-4 px-3 py-4 transition-colors duration-150 sm:-mx-4 sm:px-4 sm:py-5",
                        isActive ? "lg:bg-paper" : "hover:bg-steel-shade",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-4">
                          <h3 className="font-serif text-2xl font-extrabold leading-[1.05] sm:text-3xl">
                            {row.name}
                          </h3>
                          <span className="hidden shrink-0 font-serif text-2xl font-extrabold leading-none sm:inline sm:text-3xl">
                            {row.soldOut ? <span className="text-ink-soft">Sold out</span> : row.price}
                          </span>
                        </div>
                        {row.description ? (
                          <p className="mt-1.5 line-clamp-2 max-w-[56ch] text-pretty text-base leading-relaxed text-ink">
                            {row.description}
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-[0.95rem] text-ink-soft">
                          <span className="font-semibold text-ink sm:hidden">
                            {row.soldOut ? "Sold out" : row.price}
                          </span>
                          {meta ? <span className="sm:hidden">{", "}</span> : null}
                          {meta}
                        </p>
                      </div>
                      {row.thumbnail ? (
                        <div className="relative size-24 shrink-0 self-center overflow-hidden bg-steel-shade sm:size-28 lg:hidden">
                          <Image src={row.thumbnail} alt={row.name} fill sizes="112px" className="object-cover" />
                        </div>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Popular items as small plates on a rail; the strip scrolls sideways on a phone. */
export function PopularRail({ sectionId, title, rows, className }: { sectionId: string; title: string; rows: MenuRow[]; className?: string }) {
  if (rows.length === 0) return null

  return (
    <section id={sectionId} className={cn("scroll-mt-32 py-10 sm:py-16 lg:py-20", className)}>
      <div className="storefront-shell lg:grid lg:grid-cols-12 lg:gap-10">
        <h2 className="pass-rise font-serif text-5xl font-black leading-[0.9] sm:text-6xl lg:col-span-4 lg:text-7xl">{title}</h2>
        <ul className="mt-6 grid grid-cols-4 gap-3 sm:gap-4 lg:col-span-8 lg:mt-0 lg:gap-6">
          {rows.map((row, index) => (
            <li key={row.id} className="pass-rise">
              <Link href={getMenuItemHref(row.id)} prefetch={false} className="group block">
                <div className="relative aspect-square overflow-hidden bg-steel-shade">
                  {row.thumbnail ? (
                    <Image
                      src={row.thumbnail}
                      alt={row.name}
                      fill
                      priority={index < 2}
                      sizes="(max-width: 1024px) 24vw, 15vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="size-full" />
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  <h3 className="font-serif text-base font-extrabold leading-[1.05] group-hover:underline sm:text-2xl">{row.name}</h3>
                  <span className="text-[0.95rem] font-semibold sm:text-base">
                    {row.soldOut ? <span className="text-ink-soft">Sold out</span> : row.price}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

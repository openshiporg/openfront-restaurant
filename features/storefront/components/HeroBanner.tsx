"use client"

import { isDeliveryConfigured } from "@/features/lib/delivery-zones"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Clock3, MapPin, Star, Truck } from "lucide-react"
import { StorefrontSectionLink } from "@/features/storefront/components/StorefrontSectionLink"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { type StoreInfo } from "@/features/storefront/lib/store-data"

type HeroItem = {
  id: string
  name: string
  description: string
  imagePath?: string | null
  price: number | string
  categoryName?: string
}

interface HeroBannerProps {
  menuHref: string
  popularHref?: string
  storeInfo: StoreInfo
  heroItems: HeroItem[]
}

function HeroImage({ item, priority = false }: { item: HeroItem; priority?: boolean }) {
  if (!item.imagePath) {
    return (
      <div className="flex size-full items-center justify-center p-8 text-center">
        <div>
          <p className="font-serif text-2xl font-semibold text-foreground">{item.name}</p>
          <p className="mt-2 text-sm text-muted-foreground">Prepared fresh to order.</p>
        </div>
      </div>
    )
  }

  return (
    <Image
      src={item.imagePath}
      alt={item.name}
      fill
      priority={priority}
      className="object-cover"
      sizes="(max-width: 1024px) 100vw, 34vw"
    />
  )
}

export function HeroBanner({ menuHref, storeInfo, heroItems }: HeroBannerProps) {
  const featuredItems = heroItems.slice(0, 4)
  const heroItem = featuredItems[0]

  return (
    <section
      id="home"
      className="relative flex-1 border-b border-border/70 bg-gradient-to-b from-muted/35 via-background to-background py-10 sm:py-14 lg:py-16"
    >
      <div className="storefront-shell flex flex-col gap-8 lg:gap-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center lg:gap-12">
          <div className="space-y-6">
            <div className="space-y-4">
              <span className="storefront-kicker">{storeInfo.heroTagline || storeInfo.name}</span>
              <h1 className="max-w-3xl text-balance font-serif text-4xl font-semibold leading-[1.04] sm:text-5xl lg:text-[3.7rem]">
                {storeInfo.heroHeadline || storeInfo.name}
              </h1>
              <p className="max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-[1.15rem]">
                {storeInfo.heroSubheadline || storeInfo.tagline}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <StorefrontSectionLink
                href={menuHref}
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start order
                <ArrowRight className="size-4" />
              </StorefrontSectionLink>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {storeInfo.estimatedPickup ? (
                <div className="storefront-surface-soft px-4 py-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Clock3 className="size-4" />
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/80">Pickup</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{storeInfo.estimatedPickup}</p>
                </div>
              ) : null}

              {isDeliveryConfigured(storeInfo) ? (
                <div className="storefront-surface-soft px-4 py-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Truck className="size-4" />
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/80">Delivery</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatCurrency(storeInfo.deliveryFee, {
                      currencyCode: storeInfo.currencyCode,
                      locale: storeInfo.locale,
                    }, { inputIsCents: false })}
                    {" · "}
                    Min {formatCurrency(storeInfo.deliveryMinimum, {
                      currencyCode: storeInfo.currencyCode,
                      locale: storeInfo.locale,
                    }, { inputIsCents: false })}
                  </p>
                </div>
              ) : null}

              {storeInfo.address ? (
                <div className="storefront-surface-soft px-4 py-3 sm:col-span-2 xl:col-span-1">
                  <div className="flex items-center gap-2 text-primary">
                    <MapPin className="size-4" />
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/80">Location</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{storeInfo.address}</p>
                </div>
              ) : null}

              {storeInfo.rating ? (
                <div className="storefront-surface-soft px-4 py-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Star className="size-4 fill-primary" />
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/80">Rating</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {storeInfo.rating}
                    {storeInfo.reviewCount ? ` · ${storeInfo.reviewCount.toLocaleString()} reviews` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {heroItem ? (
            <Link href={getMenuItemHref(heroItem.id)} prefetch={false} className="group block">
              <article className="storefront-surface overflow-hidden bg-card p-3 sm:p-4">
                <div className="relative aspect-[5/4] overflow-hidden rounded-[1.75rem] bg-muted/35">
                  <HeroImage item={heroItem} priority={true} />
                </div>
                <div className="flex flex-col gap-3 p-3 pb-1 pt-5 sm:p-4 sm:pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      {heroItem.categoryName ? (
                        <p className="text-sm font-medium text-primary">{heroItem.categoryName}</p>
                      ) : null}
                      <h2 className="mt-1 font-serif text-2xl font-semibold text-foreground transition-colors group-hover:text-primary">
                        {heroItem.name}
                      </h2>
                    </div>
                    <span className="text-base font-medium tabular-nums text-foreground">
                      {formatCurrency(heroItem.price, {
                        currencyCode: storeInfo.currencyCode,
                        locale: storeInfo.locale,
                      })}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {heroItem.description || "Prepared fresh to order."}
                  </p>
                </div>
              </article>
            </Link>
          ) : null}
        </div>

        {featuredItems.length > 1 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-primary">Featured items</p>
                <h2 className="font-serif text-2xl font-semibold text-foreground">Start with the house favorites</h2>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {featuredItems.map((item, index) => (
                <Link key={item.id} href={getMenuItemHref(item.id)} prefetch={false} className="group block min-w-0 h-full">
                  <article className="storefront-surface-soft flex h-full min-w-0 items-center gap-3 overflow-hidden px-3 py-4 transition-colors hover:border-primary/30 hover:bg-card sm:gap-4 sm:px-4 xl:flex-col xl:items-start">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted/40 xl:size-full xl:aspect-square">
                      <HeroImage item={item} priority={index < 2} />
                    </div>
                    <div className="min-w-0 flex-1 xl:w-full">
                      {item.categoryName ? <p className="truncate text-xs font-medium text-primary">{item.categoryName}</p> : null}
                      <h3 className="truncate font-medium text-foreground transition-colors group-hover:text-primary">{item.name}</h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{item.description || "Prepared fresh to order."}</p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-foreground xl:self-end">
                      {formatCurrency(item.price, {
                        currencyCode: storeInfo.currencyCode,
                        locale: storeInfo.locale,
                      })}
                    </span>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

import { isDeliveryConfigured } from "@/features/lib/delivery-zones"
import Image from "next/image"
import Link from "next/link"
import { StorefrontSectionLink } from "@/features/storefront/components/StorefrontSectionLink"
import { ServiceLamp, ServiceStatusText } from "@/features/storefront/components/ServiceLamp"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { type ServiceStatus } from "@/features/storefront/lib/store-hours-display"
import { type StoreInfo } from "@/features/storefront/lib/store-data"
import { cn } from "@/lib/utils"

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
  storeInfo: StoreInfo
  heroItems: HeroItem[]
  status: ServiceStatus
}

// The name is the title, set as large as its length allows on two lines.
function nameSize(name: string) {
  if (name.length <= 10) return "text-[clamp(4rem,19vw,6rem)] lg:text-[clamp(5.5rem,7.6vw,8.5rem)]"
  if (name.length <= 16) return "text-[clamp(3rem,13.5vw,5.5rem)] lg:text-[clamp(4.5rem,6.4vw,7.5rem)]"
  if (name.length <= 26) return "text-[clamp(2.8rem,12vw,4.4rem)] lg:text-[clamp(3.6rem,4.8vw,5.6rem)]"
  return "text-[clamp(2.2rem,9.5vw,3.4rem)] lg:text-[clamp(2.8rem,3.6vw,4.2rem)]"
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:py-1.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

export function HeroBanner({ menuHref, storeInfo, heroItems, status }: HeroBannerProps) {
  const plate = heroItems.find((item) => item.imagePath) || null
  const currency = { currencyCode: storeInfo.currencyCode, locale: storeInfo.locale }
  const delivery = isDeliveryConfigured(storeInfo)
  const headline = storeInfo.heroHeadline && storeInfo.heroHeadline !== storeInfo.name
    ? storeInfo.heroHeadline
    : storeInfo.tagline

  return (
    <section
      id="home"
      className={cn(
        "relative overflow-hidden bg-steel text-ink",
        plate ? "lg:min-h-[min(calc(100svh-4rem),58rem)]" : "",
      )}
    >
      {plate ? (
        <div className="relative h-[38svh] min-h-[15rem] w-full overflow-hidden sm:h-[50svh] lg:absolute lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[58%]">
          <div className="pass-shutter absolute inset-0">
            <div className="absolute left-1/2 top-1/2 aspect-square w-[128%] -translate-x-1/2 -translate-y-[48%] lg:left-auto lg:right-0 lg:h-[116%] lg:w-auto lg:translate-x-0 lg:-translate-y-1/2">
              <Image
                src={plate.imagePath!}
                alt={plate.name}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 150vw, 80vw"
              />
            </div>
          </div>

          <Link
            href={getMenuItemHref(plate.id)}
            prefetch={false}
            className="ticket group absolute left-4 top-0 z-10 block w-[min(19rem,calc(100%-2rem))] px-4 pt-3 transition-transform duration-150 active:scale-[0.98] sm:left-6 lg:bottom-10 lg:left-10 lg:top-auto"
          >
            <span className="flex items-baseline justify-between gap-4">
              <span className="font-serif text-2xl font-extrabold leading-tight">{plate.name}</span>
              <span className="font-serif text-2xl font-extrabold">{formatCurrency(plate.price, currency)}</span>
            </span>
            <span className="mt-1 block pb-1 text-[0.95rem] font-semibold text-primary group-hover:underline">
              Order this
            </span>
          </Link>
        </div>
      ) : null}

      <div className="storefront-shell relative lg:grid lg:min-h-[inherit] lg:grid-cols-12">
        <div
          className={cn(
            "flex flex-col justify-center pb-5 pt-6 sm:py-12",
            plate ? "lg:col-span-5 lg:col-start-8 lg:py-16 lg:pl-8 xl:pl-4" : "lg:col-span-9 lg:py-24",
          )}
        >
          <h1 className={cn("text-balance font-serif font-black", nameSize(storeInfo.name), "leading-[0.86]")}>
            {storeInfo.name}
            <ServiceLamp
              hours={storeInfo.hours}
              timezone={storeInfo.timezone}
              locale={storeInfo.locale}
              initial={status}
            />
          </h1>

          {headline ? (
            <p className="mt-3 max-w-[30ch] text-pretty text-lg leading-snug text-ink sm:mt-5 sm:text-2xl">
              {headline}
            </p>
          ) : null}

          <dl className="mt-4 text-base sm:mt-7">
            <Fact label="Today">
              <ServiceStatusText
                hours={storeInfo.hours}
                timezone={storeInfo.timezone}
                locale={storeInfo.locale}
                initial={status}
              />
            </Fact>
            {storeInfo.estimatedPickup ? <Fact label="Pickup">Ready in {storeInfo.estimatedPickup}</Fact> : null}
            {delivery ? (
              <Fact label="Delivery">
                {storeInfo.estimatedDelivery ? `${storeInfo.estimatedDelivery}, ` : ""}
                {formatCurrency(storeInfo.deliveryFee, currency, { inputIsCents: false })} fee
                {storeInfo.deliveryMinimum > 0
                  ? `, ${formatCurrency(storeInfo.deliveryMinimum, currency, { inputIsCents: false })} minimum`
                  : ""}
              </Fact>
            ) : null}
            {storeInfo.address ? <Fact label="Address">{storeInfo.address}</Fact> : null}
            {storeInfo.rating ? (
              <Fact label="Rating">
                {storeInfo.rating} out of 5
                {storeInfo.reviewCount ? `, ${storeInfo.reviewCount.toLocaleString(storeInfo.locale)} reviews` : ""}
              </Fact>
            ) : null}
          </dl>

          <div className="mt-8 hidden sm:block">
            <StorefrontSectionLink href={menuHref} prefetch={false} className="pass-action w-full sm:w-auto sm:min-w-[14rem]">
              See the menu
            </StorefrontSectionLink>
          </div>
        </div>
      </div>
    </section>
  )
}

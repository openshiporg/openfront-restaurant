import type { ServiceStatus } from "@/features/storefront/lib/store-hours-display"
import { cn } from "@/lib/utils"

interface PickupSummaryProps {
  name?: string | null
  address?: string | null
  status?: ServiceStatus | null
  readyIn?: string | null
  /** "compact" for the phone header and the order bag, "hero" for the wide hero. */
  size?: "compact" | "hero"
  /** Render the name as the page heading (the phone home page has no other h1). */
  nameAsHeading?: boolean
  className?: string
}

/** "15-20 min" reads as a range: set it with an en dash. */
function rangeDash(value: string) {
  return value.replace(/(\d)\s*-\s*(\d)/g, "$1–$2")
}

/**
 * The one store block: name, address, then a single meta line with the open
 * status and the pickup estimate. Used wherever the storefront shows where and
 * when to collect an order, so the phone header, the hero and the bag agree.
 */
export function PickupSummary({ name, address, status, readyIn, size = "compact", nameAsHeading, className }: PickupSummaryProps) {
  const storeName = (name || "").trim()
  const statusText = status ? (status.isOpen ? status.detail || "Open" : status.detail || "Closed") : null
  const pickup = readyIn ? `Pickup ready in ${rangeDash(readyIn)}` : null
  if (!storeName && !address && !statusText && !pickup) return null

  const hero = size === "hero"
  const Name = nameAsHeading ? "h1" : "p"
  return (
    <div data-pickup-header className={cn("min-w-0 leading-snug", className)}>
      {storeName ? (
        <Name className={cn("storefront-store-name truncate font-sans font-bold text-ink", hero ? "text-[1.1rem]" : "text-[0.95rem]")}>{storeName}</Name>
      ) : null}
      {address ? (
        <p className={cn("text-pretty text-ink-soft", hero ? "text-[0.98rem]" : "text-[0.8125rem]")}>{address}</p>
      ) : null}
      {statusText || pickup ? (
        <p className={cn("text-ink-soft", hero ? "mt-0.5 text-[0.98rem]" : "text-[0.8125rem]")}>
          {statusText ? (
            <span className={status?.isOpen ? "font-medium text-leaf" : "font-medium text-ink"}>{statusText}</span>
          ) : null}
          {statusText && pickup ? <span aria-hidden="true"> · </span> : null}
          {pickup ? <span className="whitespace-nowrap">{pickup}</span> : null}
        </p>
      ) : null}
    </div>
  )
}

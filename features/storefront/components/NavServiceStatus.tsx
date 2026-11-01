"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { getServiceStatus, type ServiceStatus } from "@/features/storefront/lib/store-hours-display"

interface NavServiceStatusProps {
  hours: unknown
  timezone: string
  locale: string
  initial: ServiceStatus
}

/** Open now / Opens at, in the header on every page. Links to hours and location. */
export function NavServiceStatus({ hours, timezone, locale, initial }: NavServiceStatusProps) {
  const [status, setStatus] = useState(initial)

  useEffect(() => {
    const read = () => setStatus(getServiceStatus(hours, timezone, locale))
    read()
    const timer = window.setInterval(read, 60_000)
    return () => window.clearInterval(timer)
  }, [hours, timezone, locale])

  const label = status.isOpen ? "Open now" : "Closed"
  const detail = status.detail

  return (
    <Link
      href="/locations"
      className="hidden h-10 items-center gap-2 rounded-full px-3 text-[0.95rem] font-medium text-ink transition-colors hover:bg-mint sm:inline-flex"
      aria-label={detail ? `${label}. ${detail}. Hours and location` : `${label}. Hours and location`}
    >
      <span className="lamp !size-2.5" data-on={status.isOpen ? "true" : "false"} aria-hidden="true" />
      <span className="hidden whitespace-nowrap lg:inline">{detail ? (status.isOpen ? detail : `${label}. ${detail}`) : label}</span>
      <span className="hidden whitespace-nowrap sm:inline lg:hidden">{label}</span>
    </Link>
  )
}

"use client"

import { useEffect, useState } from "react"
import { getServiceStatus, type ServiceStatus } from "@/features/storefront/lib/store-hours-display"

interface ServiceLampProps {
  hours: unknown
  timezone: string
  locale: string
  initial: ServiceStatus
}

/** The heat lamp on the title line: lit while the kitchen is taking orders. */
export function ServiceLamp({ hours, timezone, locale, initial }: ServiceLampProps) {
  const [status, setStatus] = useState(initial)

  useEffect(() => {
    const read = () => setStatus(getServiceStatus(hours, timezone, locale))
    read()
    const timer = window.setInterval(read, 60_000)
    return () => window.clearInterval(timer)
  }, [hours, timezone, locale])

  return (
    <span
      className="lamp ml-[0.16em] -translate-y-[0.26em]"
      data-on={status.isOpen ? "true" : "false"}
      role="img"
      aria-label={status.isOpen ? "Open now" : "Closed"}
    />
  )
}

export function ServiceStatusText({ hours, timezone, locale, initial }: ServiceLampProps) {
  const [status, setStatus] = useState(initial)

  useEffect(() => {
    const read = () => setStatus(getServiceStatus(hours, timezone, locale))
    read()
    const timer = window.setInterval(read, 60_000)
    return () => window.clearInterval(timer)
  }, [hours, timezone, locale])

  return (
    <>
      {status.isOpen
        ? status.detail || "Open now"
        : status.detail ? `Closed. ${status.detail}` : "Closed"}
    </>
  )
}

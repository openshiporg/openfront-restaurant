"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface CategoryNavProps {
  items: Array<{
    href: string
    label: string
  }>
}

export function CategoryNav({ items }: CategoryNavProps) {
  const [active, setActive] = useState(items[0]?.href ?? "")
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.href.replace(/^\/?#/, "")))
      .filter((section): section is HTMLElement => Boolean(section))
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(`#${visible.target.id}`)
        else if (window.scrollY < sections[0].offsetTop - window.innerHeight * 0.3) setActive(items[0]?.href ?? "")
      },
      { rootMargin: "-30% 0px -60% 0px" },
    )
    sections.forEach((section) => observer.observe(section))
    // Back above the menu, the first chip is current again.
    const onScroll = () => {
      if (window.scrollY < sections[0].offsetTop - window.innerHeight * 0.3) setActive(items[0]?.href ?? "")
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
    }
  }, [items])

  useEffect(() => {
    const rail = railRef.current
    const current = rail?.querySelector<HTMLElement>(`[data-href="${CSS.escape(active)}"]`)
    if (!rail || !current) return
    const left = current.offsetLeft - rail.clientWidth / 2 + current.clientWidth / 2
    rail.scrollTo({ left, behavior: "smooth" })
  }, [active])

  return (
    <div className="bg-steel">
      <nav className="storefront-shell" aria-label="Menu categories">
        <div ref={railRef} className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto py-2">
          {items.map((item) => {
            const isActive = item.href === active
            return (
              <button
                key={item.href}
                type="button"
                data-href={item.href}
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  setActive(item.href)
                  document.getElementById(item.href.replace(/^\/?#/, ""))?.scrollIntoView({ block: "start" })
                }}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center whitespace-nowrap px-3.5 font-serif text-lg font-bold leading-none transition-colors duration-150",
                  isActive ? "bg-ink text-paper" : "text-ink hover:bg-steel-shade",
                )}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

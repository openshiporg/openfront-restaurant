"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, UserRound } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { storefrontFont } from "@/features/storefront/lib/fonts"

/** The account-and-menu pill: account plus every storefront page, in a side sheet. */
export function NavMenu({ links }: { links: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-white px-3 text-ink transition-colors hover:bg-mint active:scale-95 md:h-12 md:gap-2.5 md:px-4"
        aria-label="Account and pages"
      >
        <UserRound className="size-4 md:size-5" strokeWidth={1.75} aria-hidden="true" />
        <Menu className="size-4 md:size-5" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className={`storefront-sheet ${storefrontFont.variable} w-full max-w-sm border-0 bg-white p-0 text-ink`}>
          <SheetHeader className="px-6 pb-2 pt-6 text-left">
            <SheetTitle className="font-serif text-[1.35rem] font-bold text-ink sm:text-3xl">Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col px-3 pb-6" aria-label="Pages">
            {[{ href: "/account", label: "Account" }, ...links].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-[0.95rem] font-medium text-ink sm:text-lg transition-colors hover:bg-mint"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}

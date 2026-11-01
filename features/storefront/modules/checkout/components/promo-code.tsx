"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { applyPromo, removePromo } from "@/features/storefront/lib/data/public"

/** Promo field for the order summary. Locked once a payment attempt owns the quote. */
export default function PromoCode({ applied, locked }: { applied?: string | null; locked?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (applied) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Code <span className="font-medium text-foreground">{applied}</span></span>
        {!locked ? (
          <button type="button" disabled={pending} className="pass-link" onClick={() => start(async () => { await removePromo(); router.refresh() })}>Remove</button>
        ) : null}
      </div>
    )
  }
  if (locked) return null
  if (!open) return <button type="button" className="pass-link text-sm" onClick={() => setOpen(true)}>Have a promo code?</button>
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        const code = String(new FormData(event.currentTarget).get("code") || "")
        setError(null)
        start(async () => {
          const r = await applyPromo(code)
          if (!r.success) { setError(r.message || "That code isn't valid."); return }
          router.refresh()
        })
      }}
    >
      <div className="flex gap-2">
        <input name="code" aria-label="Promo code" required autoCapitalize="characters" autoComplete="off" className="h-11 min-w-0 flex-1 border border-border bg-background px-3 text-base" />
        <button type="submit" disabled={pending} className="pass-action h-11 min-w-0 px-4">{pending ? "…" : "Apply"}</button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  )
}

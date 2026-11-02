"use client"

import { useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Field, FormError, inputClass } from "@/features/storefront/components/forms/Field"
import { checkGiftCardBalance } from "@/features/storefront/lib/data/public"
import { formatCurrency } from "@/features/storefront/lib/currency"

export default function GiftCardBalance({ locale }: { locale: string }) {
  const [result, setResult] = useState<{ balance: number; currencyCode: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const code = String(new FormData(event.currentTarget).get("code") || "")
        setError(null); setResult(null)
        start(async () => {
          const r = await checkGiftCardBalance(code)
          if (r.ok) setResult(r as any)
          else setError(r.message)
        })
      }}
    >
      <Field id="gc-code" label="Gift card code"><Input id="gc-code" name="code" required autoComplete="off" autoCapitalize="characters" className={inputClass} /></Field>
      <FormError message={error} />
      {result ? <p role="status" className="sf-section-title">{formatCurrency(result.balance, { currencyCode: result.currencyCode, locale })} left</p> : null}
      <button type="submit" disabled={pending} className="pass-action w-full sm:w-auto sm:min-w-[14rem]">{pending ? "Checking…" : "Check balance"}</button>
    </form>
  )
}

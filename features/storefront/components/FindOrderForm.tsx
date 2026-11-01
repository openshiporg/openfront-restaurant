"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Field, FormError, inputClass } from "@/features/storefront/components/forms/Field"
import { findOrder } from "@/features/storefront/lib/data/public"

export default function FindOrderForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="storefront-surface space-y-5 bg-card p-5 sm:p-8"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setError(null)
        start(async () => {
          const r = await findOrder(String(form.get("orderNumber") || ""), String(form.get("email") || ""))
          if (r.ok) router.push(r.href)
          else setError(r.message)
        })
      }}
    >
      <Field id="fo-number" label="Order number" hint="It's in your confirmation email, like ORD-XXXX-XXXXXX.">
        <Input id="fo-number" name="orderNumber" required autoComplete="off" autoCapitalize="characters" className={inputClass} />
      </Field>
      <Field id="fo-email" label="Email used at checkout"><Input id="fo-email" name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
      <FormError message={error} />
      <button type="submit" disabled={pending} className="pass-action w-full sm:w-auto sm:min-w-[14rem]">{pending ? "Looking…" : "Find my order"}</button>
    </form>
  )
}

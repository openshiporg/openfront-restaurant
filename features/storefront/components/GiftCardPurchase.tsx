"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FormError, inputClass } from "@/features/storefront/components/forms/Field"
import { finishGiftCard, startGiftCard } from "@/features/storefront/lib/data/public"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { cn } from "@/lib/utils"

const AMOUNTS = [2500, 5000, 7500, 10000]
const KEY = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = KEY ? loadStripe(KEY) : null

type Issued = { code: string; amount: number; currencyCode: string; recipientEmail: string }

function PayStep({ paymentIntentId, onIssued, onBack }: { paymentIntentId: string; onIssued: (i: Issued) => void; onBack: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function settle() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await finishGiftCard(paymentIntentId)
      if (r.ok && r.status === "issued") { onIssued(r as unknown as Issued); return }
      if (!r.ok) { setError(r.message); return }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    setError("Your payment is processing. Your gift card will be emailed shortly.")
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!stripe || !elements) return
        setBusy(true); setError(null)
        const { error: payError } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: `${window.location.origin}/gift-cards` } })
        if (payError) { setError(payError.message || "Your payment didn't go through."); setBusy(false); return }
        await settle()
        setBusy(false)
      }}
    >
      <PaymentElement />
      <FormError message={error} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy || !stripe} className="pass-action w-full sm:w-auto sm:min-w-[14rem]">{busy ? "Processing…" : "Pay and send"}</button>
        <button type="button" onClick={onBack} disabled={busy} className="pass-link self-center">Change details</button>
      </div>
    </form>
  )
}

export default function GiftCardPurchase({ locale, currencyCode }: { locale: string; currencyCode: string }) {
  const money = (cents: number) => formatCurrency(cents, { currencyCode, locale })
  const [amount, setAmount] = useState(5000)
  const [custom, setCustom] = useState("")
  const [step, setStep] = useState<"details" | "pay">("details")
  const [intent, setIntent] = useState<{ clientSecret: string; paymentIntentId: string } | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const effective = custom ? Math.round(parseFloat(custom) * 100) || 0 : amount
  const options = useMemo(() => intent ? { clientSecret: intent.clientSecret, fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500&display=swap" }], appearance: { variables: { fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif", colorPrimary: "#2c983a", colorText: "#1d2a24", borderRadius: "12px" } } } : undefined, [intent])

  // Return from a redirect-based payment method.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("payment_intent")
    if (!id) return
    finishGiftCard(id).then((r) => { if (r.ok && r.status === "issued") setIssued(r as unknown as Issued) })
  }, [])

  if (!stripePromise) return <p className="text-ink">Gift cards can&apos;t be bought online right now. Please ask in the restaurant.</p>

  if (issued) {
    return (
      <div role="status" className="space-y-3">
        <p className="font-serif text-3xl font-extrabold">Thank you.</p>
        <p className="text-lg">{money(issued.amount)} gift card{issued.recipientEmail ? ` sent to ${issued.recipientEmail}` : ""}.</p>
        <p className="text-sm text-ink-soft">Gift card code</p>
        <p className="break-all font-serif text-3xl font-black tracking-wider">{issued.code}</p>
        <p className="text-ink-soft">We&apos;ve emailed a copy to you.</p>
      </div>
    )
  }

  if (step === "pay" && intent && options) {
    return (
      <Elements stripe={stripePromise} options={options}>
        <p className="mb-4 text-lg">{money(effective)} gift card</p>
        <PayStep paymentIntentId={intent.paymentIntentId} onIssued={setIssued} onBack={() => setStep("details")} />
      </Elements>
    )
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setError(null)
        if (effective < 1000 || effective > 50000) { setError(`Choose an amount between ${money(1000)} and ${money(50000)}.`); return }
        start(async () => {
          const r = await startGiftCard({ amount: effective, purchaserEmail: String(form.get("email") || ""), recipientName: String(form.get("recipientName") || ""), recipientEmail: String(form.get("recipientEmail") || ""), message: String(form.get("message") || "") })
          if (!r.ok) { setError(r.message); return }
          setIntent({ clientSecret: (r as any).clientSecret, paymentIntentId: (r as any).paymentIntentId })
          setStep("pay")
        })
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Amount</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AMOUNTS.map((value) => (
            <button key={value} type="button" aria-pressed={!custom && amount === value} onClick={() => { setAmount(value); setCustom("") }}
              className={cn("h-11 rounded-xl border text-base tabular-nums transition-colors", !custom && amount === value ? "border-leaf bg-mint font-medium text-leaf" : "border-border bg-background text-ink hover:border-leaf/40")}>
              {money(value)}
            </button>
          ))}
        </div>
        <div className="mt-3 max-w-[12rem]">
          <Field id="gc-custom" label="Or another amount"><Input id="gc-custom" inputMode="decimal" placeholder="e.g. 40" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} /></Field>
        </div>
      </fieldset>
      <Field id="gc-email" label="Your email" hint="Your receipt goes here."><Input id="gc-email" name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="gc-rname" label="Recipient name (optional)"><Input id="gc-rname" name="recipientName" className={inputClass} /></Field>
        <Field id="gc-remail" label="Recipient email (optional)" hint="Leave empty to keep the code for yourself."><Input id="gc-remail" name="recipientEmail" type="email" className={inputClass} /></Field>
      </div>
      <Field id="gc-msg" label="Message (optional)"><Textarea id="gc-msg" name="message" rows={3} maxLength={300} className="w-full border-border bg-background text-base" /></Field>
      <FormError message={error} />
      <button type="submit" disabled={pending} className="pass-action w-full sm:w-auto sm:min-w-[14rem]">{pending ? "One moment…" : `Continue to payment · ${money(effective)}`}</button>
    </form>
  )
}

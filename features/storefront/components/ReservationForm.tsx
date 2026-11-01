"use client"

import { useEffect, useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FormError, inputClass } from "@/features/storefront/components/forms/Field"
import { bookReservation, getReservationSlots } from "@/features/storefront/lib/data/public"
import { cn } from "@/lib/utils"

type Slot = { time: string; startsAt: string }
type Booked = { code: string; startsAt: string; partySize: number; name: string; timezone: string }

function formatTime(iso: string, timezone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso))
}

export default function ReservationForm({ today, maxDate, timezone, locale, restaurantName }: { today: string; maxDate: string; timezone: string; locale: string; restaurantName: string }) {
  const [date, setDate] = useState(today)
  const [party, setParty] = useState(2)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [maxParty, setMaxParty] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<Booked | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let current = true
    setSlots(null); setChosen(null); setLoadError(null)
    getReservationSlots(date, party).then((result) => {
      if (!current) return
      if (!result.ok) { setLoadError(result.message); setSlots([]); return }
      setSlots(result.slots); setMaxParty(result.maxParty)
    })
    return () => { current = false }
  }, [date, party])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen) { setError("Choose a time first."); return }
    const form = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await bookReservation({
        date, startsAt: chosen, partySize: party,
        name: String(form.get("name") || ""), email: String(form.get("email") || ""), phone: String(form.get("phone") || ""), notes: String(form.get("notes") || ""),
      })
      if (!result.ok) {
        setError(result.message)
        const fresh = await getReservationSlots(date, party)
        if (fresh.ok) { setSlots(fresh.slots); setChosen(null) }
        return
      }
      setBooked(result as unknown as Booked)
    })
  }

  if (booked) {
    const day = new Intl.DateTimeFormat(locale, { timeZone: booked.timezone, weekday: "long", month: "long", day: "numeric" }).format(new Date(booked.startsAt))
    return (
      <div className="storefront-surface bg-card p-6 sm:p-8" role="status">
        <p className="font-serif text-3xl font-extrabold text-ink">You&apos;re booked.</p>
        <p className="mt-3 text-lg text-ink">
          Table for {booked.partySize} at {restaurantName}, {day} at {formatTime(booked.startsAt, booked.timezone, locale)}.
        </p>
        <p className="mt-6 text-sm text-ink-soft">Confirmation code</p>
        <p className="font-serif text-4xl font-black tracking-wider text-ink">{booked.code}</p>
        <p className="mt-4 text-ink-soft">We&apos;ve emailed the details. Quote the code if you need to change anything.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="storefront-surface space-y-6 bg-card p-5 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="res-date" label="Date">
          <Input id="res-date" type="date" required min={today} max={maxDate} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field id="res-party" label="Party size">
          <div className="flex h-11 items-center gap-3">
            <button type="button" className="pass-action h-11 w-11 min-w-0 px-0" aria-label="Fewer guests" onClick={() => setParty((p) => Math.max(1, p - 1))}>−</button>
            <output id="res-party" className="min-w-8 text-center text-xl font-semibold tabular-nums">{party}</output>
            <button type="button" className="pass-action h-11 w-11 min-w-0 px-0" aria-label="More guests" onClick={() => setParty((p) => Math.min(maxParty || 20, p + 1))}>+</button>
          </div>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Time</legend>
        {slots === null ? (
          <p className="text-ink-soft">Checking tables…</p>
        ) : loadError ? (
          <FormError message={loadError} />
        ) : slots.length === 0 ? (
          <p className="text-ink">
            {maxParty && party > maxParty ? `For parties over ${maxParty}, please call us.` : "No tables left on this day for your party. Try another date."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.startsAt}
                type="button"
                aria-pressed={chosen === slot.startsAt}
                onClick={() => setChosen(slot.startsAt)}
                className={cn("h-11 border border-border text-base tabular-nums transition-colors", chosen === slot.startsAt ? "bg-ink text-paper" : "bg-background text-ink hover:bg-paper")}
              >
                {formatTime(slot.startsAt, timezone, locale)}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="res-name" label="Name"><Input id="res-name" name="name" required autoComplete="name" className={inputClass} /></Field>
        <Field id="res-phone" label="Phone"><Input id="res-phone" name="phone" type="tel" required autoComplete="tel" className={inputClass} /></Field>
      </div>
      <Field id="res-email" label="Email" hint="We send your confirmation here.">
        <Input id="res-email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </Field>
      <Field id="res-notes" label="Anything we should know? (optional)">
        <Textarea id="res-notes" name="notes" rows={3} maxLength={500} className="w-full border-border bg-background text-base" />
      </Field>

      <FormError message={error} />
      <button type="submit" disabled={pending || !chosen} className="pass-action w-full sm:w-auto sm:min-w-[14rem]">
        {pending ? "Booking…" : "Book this table"}
      </button>
    </form>
  )
}

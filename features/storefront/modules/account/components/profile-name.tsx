"use client"

import { useActionState, useEffect, useState } from "react"
import { updateCustomerName } from "@/features/storefront/lib/data/user"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Check } from "lucide-react"

export default function ProfileName({ customer }: { customer: any }) {
  const [state, action, isPending] = useActionState(updateCustomerName, null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (state?.success) {
      setSuccess(true)
      const timer = setTimeout(() => setSuccess(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [state])

  return (
    <form action={action} className="storefront-surface bg-background p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-primary">Display name</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium text-foreground">First name</Label>
              <Input id="firstName" name="firstName" defaultValue={customer.firstName || ""} required className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium text-foreground">Last name</Label>
              <Input id="lastName" name="lastName" defaultValue={customer.lastName || ""} required className="h-11 border-border bg-card" />
            </div>
          </div>
          {state?.error ? <p className="mt-3 text-sm text-destructive">{state.error}</p> : null}
        </div>

        <Button type="submit" variant="ghost" disabled={isPending} className="h-11 rounded-full px-5 text-sm text-foreground hover:border-primary/30 hover:text-primary">
          {isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : success ? <Check size={14} className="mr-2 text-emerald-600" /> : null}
          {success ? "Saved" : "Save"}
        </Button>
      </div>
    </form>
  )
}

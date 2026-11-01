import { Label } from "@/components/ui/label"

export function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-ink">{label}</Label>
      {children}
      {hint ? <p className="text-sm text-ink-soft">{hint}</p> : null}
    </div>
  )
}

export const inputClass = "h-11 w-full border-border bg-background text-base"

export function FormError({ message }: { message?: string | null }) {
  return message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null
}

'use client'

/* Hallmark · component: logo picker · genre: modern-minimal · theme: existing restaurant system
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */

import { useMemo, useState } from 'react'
import { CheckCircle2, Code2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo'
import { LOGO_ICONS } from '@/features/platform/store-settings/lib/icon-registry'

interface LogoPickerProps {
  value: string
  hue: string
  onChange: (svg: string) => void
}

const triggerClassName = 'h-9 w-full justify-between border-0 bg-transparent px-0 py-0 text-sm font-semibold shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:size-3.5 [&>svg]:opacity-40'

export function LogoPicker({ value, hue, onChange }: LogoPickerProps) {
  const selectedIcon = useMemo(
    () => LOGO_ICONS.find((icon) => icon.lightSvg === value),
    [value]
  )
  const [isEditingCustom, setIsEditingCustom] = useState(!selectedIcon)
  const [draft, setDraft] = useState(value)
  const safeDraft = useMemo(() => sanitizeStoreLogoSvg(draft), [draft])
  const hasValidDraft = safeDraft.length > 0
  const hasDraftChanges = safeDraft !== value

  const selectLogo = (id: string) => {
    if (id === 'custom') {
      setDraft(value)
      setIsEditingCustom(true)
      return
    }
    const icon = LOGO_ICONS.find((candidate) => candidate.id === id)
    if (!icon) return
    onChange(icon.lightSvg)
    setDraft(icon.lightSvg)
    setIsEditingCustom(false)
  }

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Logo</p>
      <Select value={selectedIcon?.id || 'custom'} onValueChange={selectLogo}>
        <SelectTrigger className={triggerClassName} aria-label="Choose a logo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[280px]">
          <SelectItem value="custom">
            <span className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
                <Code2 className="size-3.5 text-muted-foreground" />
              </span>
              <span className="font-medium">Custom SVG</span>
            </span>
          </SelectItem>
          {LOGO_ICONS.map((icon) => (
            <SelectItem key={icon.id} value={icon.id}>
              <span className="flex items-center gap-3">
                <span
                  className="flex size-7 items-center justify-center overflow-hidden rounded-md border border-border bg-background p-1 [&>svg]:block [&>svg]:size-full"
                  style={{ filter: `hue-rotate(${hue}deg)` }}
                  dangerouslySetInnerHTML={{ __html: icon.lightSvg }}
                  aria-hidden="true"
                />
                <span className="font-medium">{icon.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => {
            setDraft(value)
            setIsEditingCustom((open) => !open)
          }}
          aria-expanded={isEditingCustom}
        >
          <Code2 className="mr-1.5 size-3.5" />
          {selectedIcon ? 'Edit SVG' : 'Custom SVG'}
        </Button>
        {!selectedIcon ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" /> Custom
          </span>
        ) : null}
      </div>

      {isEditingCustom ? (
        <div className="mt-3 rounded-md border border-border bg-muted/15 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">Custom SVG</p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                Paste a complete SVG. Scripts, links, styles, event handlers, and external assets are rejected.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setIsEditingCustom(false)}
              aria-label="Close custom SVG editor"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-3 min-h-32 resize-y font-mono text-[11px] leading-4"
            placeholder='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">…</svg>'
            spellCheck={false}
            aria-invalid={draft.length > 0 && !hasValidDraft}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background p-1.5 [&>svg]:block [&>svg]:size-full"
                style={{ filter: `hue-rotate(${hue}deg)` }}
                dangerouslySetInnerHTML={{ __html: safeDraft }}
                aria-hidden="true"
              />
              <span className={`truncate text-[11px] ${hasValidDraft ? 'text-muted-foreground' : 'text-destructive'}`}>
                {hasValidDraft ? 'Safe preview' : 'Enter a valid, safe SVG document'}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              disabled={!hasValidDraft || !hasDraftChanges}
              onClick={() => {
                onChange(safeDraft)
                setIsEditingCustom(false)
              }}
            >
              Apply SVG
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

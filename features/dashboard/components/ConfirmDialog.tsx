'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type ConfirmRequest = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  resolve: (value: boolean) => void
}

let enqueue: ((request: ConfirmRequest) => void) | null = null

/**
 * The app's replacement for window.confirm(): `if (!(await confirmAction({ title: 'Delete this table?' }))) return`.
 * Renders through <ConfirmDialogHost /> in the dashboard layout. Falls back to window.confirm only if no host is mounted.
 */
export function confirmAction(options: Omit<ConfirmRequest, 'resolve'> | string): Promise<boolean> {
  const request = typeof options === 'string' ? { title: options } : options
  if (!enqueue) return Promise.resolve(typeof window !== 'undefined' ? window.confirm(request.title) : false)
  return new Promise((resolve) => enqueue!({ ...request, resolve }))
}

export function ConfirmDialogHost() {
  const [current, setCurrent] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    enqueue = (request) => setCurrent((previous) => {
      previous?.resolve(false)
      return request
    })
    return () => { enqueue = null }
  }, [])

  const close = (value: boolean) => {
    current?.resolve(value)
    setCurrent(null)
  }

  return (
    <AlertDialog open={Boolean(current)} onOpenChange={(open) => { if (!open) close(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{current?.title}</AlertDialogTitle>
          {current?.description ? <AlertDialogDescription>{current.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{current?.cancelLabel || 'Keep'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={current?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {current?.confirmLabel || 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

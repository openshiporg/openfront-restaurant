'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Plus, RefreshCw } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/features/storefront/lib/currency'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'

interface WasteLog {
  id: string
  ingredient: { id: string; name: string; unit: string } | null
  quantity: string
  reason: string
  cost: number | null
  notes: string | null
  createdAt: string
  loggedBy: { name: string } | null
  reversedAt: string | null
  reversalReason: string | null
}

interface Ingredient {
  id: string
  name: string
  unit: string
  costPerUnit: string | null
}

const WASTE_REASONS = [
  { value: 'spoilage', label: 'Spoilage', color: 'bg-rose-500' },
  { value: 'preparation_error', label: 'Prep Error', color: 'bg-orange-500' },
  { value: 'overproduction', label: 'Overproduction', color: 'bg-amber-500' },
  { value: 'plate_waste', label: 'Plate Waste', color: 'bg-blue-500' },
  { value: 'expired', label: 'Expired', color: 'bg-purple-500' },
  { value: 'damaged', label: 'Damaged', color: 'bg-zinc-500' },
  { value: 'other', label: 'Other', color: 'bg-slate-400' },
]

const GET_WASTE_DATA = gql`
  query GetWasteData {
    wasteLogs(orderBy: { createdAt: desc }, take: 100) {
      id
      ingredient { id name unit }
      quantity reason cost notes createdAt reversedAt reversalReason
      loggedBy { name }
    }
    ingredients(orderBy: { name: asc }) {
      id name unit costPerUnit
    }
    storeSettings { currencyCode locale }
  }
`

const RECORD_WASTE = gql`
  mutation RecordWaste(
    $ingredientId: ID!
    $quantity: String!
    $reason: String!
    $notes: String
    $idempotencyKey: String!
  ) {
    recordWaste(
      ingredientId: $ingredientId
      quantity: $quantity
      reason: $reason
      notes: $notes
      idempotencyKey: $idempotencyKey
    ) { success wasteLogId error }
  }
`

const REVERSE_WASTE = gql`
  mutation ReverseWaste($wasteLogId: ID!, $reason: String!, $idempotencyKey: String!) {
    reverseWaste(wasteLogId: $wasteLogId, reason: $reason, idempotencyKey: $idempotencyKey) {
      success wasteLogId error
    }
  }
`

export function WastePage() {
  const [logs, setLogs] = useState<WasteLog[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })

  const [form, setForm] = useState({
    ingredientId: '',
    quantity: '',
    reason: 'spoilage',
    notes: '',
  })

  const fetchData = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_WASTE_DATA)
      setLogs((data as any).wasteLogs || [])
      setIngredients((data as any).ingredients || [])
      if ((data as any).storeSettings) {
        setCurrencyConfig({
          currencyCode: (data as any).storeSettings.currencyCode || 'USD',
          locale: (data as any).storeSettings.locale || 'en-US',
        })
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCreate = async () => {
    if (!form.ingredientId || !form.quantity) return
    try {
      const result: any = await request('/api/graphql', RECORD_WASTE, {
        ingredientId: form.ingredientId,
        quantity: form.quantity,
        reason: form.reason,
        notes: form.notes || null,
        idempotencyKey: crypto.randomUUID(),
      })
      if (!result?.recordWaste?.success) {
        throw new Error(result?.recordWaste?.error || 'Unable to record waste')
      }
      setDialogOpen(false)
      setForm({ ingredientId: '', quantity: '', reason: 'spoilage', notes: '' })
      fetchData()
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const handleReverse = async (id: string) => {
    const reason = prompt('Reason for reversing this waste entry?')?.trim()
    if (!reason) return
    try {
      const result: any = await request('/api/graphql', REVERSE_WASTE, {
        wasteLogId: id,
        reason,
        idempotencyKey: `waste-reversal:${id}`,
      })
      if (!result?.reverseWaste?.success) {
        throw new Error(result?.reverseWaste?.error || 'Unable to reverse waste')
      }
      fetchData()
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const getReasonConfig = (reason: string) =>
    WASTE_REASONS.find(r => r.value === reason) || WASTE_REASONS[WASTE_REASONS.length - 1]

  const activeLogs = logs.filter(log => !log.reversedAt)
  const totalWasteCost = activeLogs.reduce((s, l) => s + (l.cost || 0), 0)
  const last7DaysCost = activeLogs
    .filter(l => new Date(l.createdAt) > new Date(Date.now() - 7 * 86400000))
    .reduce((s, l) => s + (l.cost || 0), 0)
  const last30DaysCost = activeLogs
    .filter(l => new Date(l.createdAt) > new Date(Date.now() - 30 * 86400000))
    .reduce((s, l) => s + (l.cost || 0), 0)
  const avgDailyCost = last30DaysCost / 30

  const reasonBreakdown = WASTE_REASONS.map(r => ({
    ...r,
    count: activeLogs.filter(l => l.reason === r.value).length,
    cost: activeLogs.filter(l => l.reason === r.value).reduce((s, l) => s + (l.cost || 0), 0),
  })).filter(r => r.count > 0).sort((a, b) => b.cost - a.cost)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageBreadcrumbs
        items={[
          { type: 'link', label: 'Dashboard', href: '' },
          { type: 'page', label: 'Platform' },
          { type: 'page', label: 'Waste Tracking' },
        ]}
      />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Waste Tracking</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monitor and reduce food waste costs.</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="h-8 text-xs">
          <Plus size={13} className="mr-1.5" />
          Log Waste
        </Button>
      </div>

      {/* Stat Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">All Time Cost</p>
          <p className="text-xl font-semibold mt-1 text-rose-600 dark:text-rose-400">
            {formatCurrency(totalWasteCost, currencyConfig, { inputIsCents: false })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{logs.length} log{logs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Last 7 Days</p>
          <p className="text-xl font-semibold mt-1">
            {formatCurrency(last7DaysCost, currencyConfig, { inputIsCents: false })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeLogs.filter(l => new Date(l.createdAt) > new Date(Date.now() - 7 * 86400000)).length} incidents
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Avg / Day</p>
          <p className="text-xl font-semibold mt-1">
            {formatCurrency(avgDailyCost, currencyConfig, { inputIsCents: false })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">30-day average</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Top Issue</p>
          <p className="text-base font-semibold mt-1">{reasonBreakdown[0]?.label || '—'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {reasonBreakdown[0]
              ? formatCurrency(reasonBreakdown[0].cost, currencyConfig, { inputIsCents: false })
              : 'No data'}
          </p>
        </div>
      </div>

      {/* Body: log + breakdown */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Waste log */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div className="px-4 md:px-6 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold">Waste Log</p>
            <span className="text-[11px] text-muted-foreground">{logs.length} entries</span>
          </div>
          <ScrollArea className="flex-1">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                <Trash2 size={28} className="text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No waste logged yet.</p>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
                  <Plus size={12} className="mr-1.5" /> Log First Entry
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {logs.map(log => {
                  const rc = getReasonConfig(log.reason)
                  return (
                    <div key={log.id} className="px-4 md:px-6 py-3 hover:bg-muted/20 transition-colors flex items-start gap-3 group">
                      {/* Reason dot */}
                      <div className="pt-1 shrink-0">
                        <span className={cn('w-2.5 h-2.5 rounded-full inline-block', rc.color)} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">
                              {log.ingredient?.name || 'Unknown ingredient'}
                              {log.reversedAt ? <span className="ml-2 text-[10px] uppercase text-muted-foreground">Reversed</span> : null}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              <span className="text-[11px] text-muted-foreground">
                                {log.quantity} {log.ingredient?.unit}
                              </span>
                              <span className="text-[11px] text-muted-foreground">{rc.label}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {log.loggedBy && (
                                <span className="text-[11px] text-muted-foreground">{log.loggedBy.name}</span>
                              )}
                            </div>
                            {log.notes && (
                              <p className="text-xs text-muted-foreground mt-1 italic">{log.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                              {formatCurrency(log.cost || 0, currencyConfig, { inputIsCents: false })}
                            </p>
                            <button
                              onClick={() => handleReverse(log.id)}
                              disabled={Boolean(log.reversedAt)}
                              title={log.reversedAt ? 'Already reversed' : 'Reverse this entry'}
                              className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600 disabled:opacity-30"
                            >
                              <RefreshCw size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Breakdown sidebar */}
        <div className="w-56 xl:w-64 shrink-0 overflow-y-auto">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">By Category</p>
          </div>
          {reasonBreakdown.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">No data yet</div>
          ) : (
            <div className="divide-y">
              {reasonBreakdown.map(r => {
                const pct = totalWasteCost > 0 ? (r.cost / totalWasteCost) * 100 : 0
                return (
                  <div key={r.value} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', r.color)} />
                      <span className="text-xs font-medium">{r.label}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">{r.count}</span>
                    </div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold">
                        {formatCurrency(r.cost, currencyConfig, { inputIsCents: false })}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', r.color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Log waste dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Log Waste Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ingredient *</Label>
              <Select value={form.ingredientId} onValueChange={v => setForm({ ...form, ingredientId: v })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select ingredient" />
                </SelectTrigger>
                <SelectContent>
                  {ingredients.map(ing => (
                    <SelectItem key={ing.id} value={ing.id} className="text-sm">
                      {ing.name} ({ing.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Quantity *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                placeholder="Amount"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reason *</Label>
              <Select value={form.reason} onValueChange={v => setForm({ ...form, reason: v })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WASTE_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value} className="text-sm">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Context, preventative measures…"
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9"
                onClick={handleCreate}
                disabled={!form.ingredientId || !form.quantity}
              >
                Log Entry
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WastePage

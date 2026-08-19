'use client'

import { useState, useEffect, useCallback } from 'react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import { RefreshCw, Plus, Calendar, Users, Phone, Mail, Trash2, Edit2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlatformDatePicker } from '@/features/platform/components/PlatformDatePicker'

interface Reservation {
  id: string
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  reservationDate: string | null
  partySize: number | null
  duration: number | null
  status: string | null
  specialRequests: string | null
  assignedTable: { id: string; tableNumber: string } | null
  createdAt: string
}

interface Table {
  id: string
  tableNumber: string
  capacity: number
}

const GET_RESERVATIONS = gql`
  query GetReservations($where: ReservationWhereInput!) {
    reservations(where: $where, orderBy: { reservationDate: asc }) {
      id customerName customerPhone customerEmail
      reservationDate partySize duration status specialRequests
      assignedTable { id tableNumber }
      createdAt
    }
    tables(orderBy: { tableNumber: asc }) { id tableNumber capacity }
  }
`

const UPSERT_RESERVATION = gql`
  mutation UpsertReservation(
    $reservationId: ID
    $customerName: String!
    $customerPhone: String
    $customerEmail: String
    $reservationDate: String!
    $partySize: Int!
    $duration: Int
    $status: String
    $specialRequests: String
    $assignedTableId: ID
  ) {
    upsertReservation(
      reservationId: $reservationId
      customerName: $customerName
      customerPhone: $customerPhone
      customerEmail: $customerEmail
      reservationDate: $reservationDate
      partySize: $partySize
      duration: $duration
      status: $status
      specialRequests: $specialRequests
      assignedTableId: $assignedTableId
    ) { success error }
  }
`

const UPDATE_RESERVATION_STATUS = gql`
  mutation UpdateReservationStatus($reservationId: ID!, $action: String!, $tableId: ID) {
    updateReservationStatus(reservationId: $reservationId, action: $action, tableId: $tableId) { success error }
  }
`

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  confirmed: { label: 'Confirmed', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  pending: { label: 'Pending', dot: 'bg-amber-500', text: 'text-amber-600' },
  cancelled: { label: 'Cancelled', dot: 'bg-red-400', text: 'text-red-500' },
  completed: { label: 'Completed', dot: 'bg-zinc-400', text: 'text-zinc-500' },
  no_show: { label: 'No Show', dot: 'bg-orange-500', text: 'text-orange-600' },
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function toDateInputValue(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function endOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

const emptyForm = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  reservationDate: '',
  reservationTime: '19:00',
  partySize: '2',
  duration: '90',
  status: 'confirmed',
  specialRequests: '',
  assignedTableId: '',
}

export function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [activeStatusFilter, setActiveStatusFilter] = useState('all')
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const dayStart = startOfDay(selectedDate).toISOString()
      const dayEnd = endOfDay(selectedDate).toISOString()
      const res: any = await request('/api/graphql', GET_RESERVATIONS, {
        where: {
          reservationDate: { gte: dayStart, lte: dayEnd },
        },
      })
      setReservations(res.reservations || [])
      setTables(res.tables || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openCreate = () => {
    setActionError(null)
    setEditingId(null)
    setForm({
      ...emptyForm,
      reservationDate: toDateInputValue(selectedDate),
    })
    setDialogOpen(true)
  }

  const openEdit = (r: Reservation) => {
    setActionError(null)
    const d = r.reservationDate ? new Date(r.reservationDate) : new Date()
    setEditingId(r.id)
    setForm({
      customerName: r.customerName || '',
      customerPhone: r.customerPhone || '',
      customerEmail: r.customerEmail || '',
      reservationDate: toDateInputValue(d),
      reservationTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      partySize: String(r.partySize || 2),
      duration: String(r.duration || 90),
      status: r.status || 'confirmed',
      specialRequests: r.specialRequests || '',
      assignedTableId: r.assignedTable?.id || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.reservationDate || !form.reservationTime) {
      setActionError('Name, phone, date, and time are required')
      return
    }
    setActionError(null)
    setSaving(true)
    try {
      const [year, month, day] = form.reservationDate.split('-').map(Number)
      const [hour, minute] = form.reservationTime.split(':').map(Number)
      const dt = new Date(year, month - 1, day, hour, minute, 0)

      const res: any = await request('/api/graphql', UPSERT_RESERVATION, {
        reservationId: editingId,
        customerName: form.customerName,
        customerPhone: form.customerPhone || null,
        customerEmail: form.customerEmail || null,
        reservationDate: dt.toISOString(),
        partySize: parseInt(form.partySize) || 2,
        duration: parseInt(form.duration) || 90,
        status: form.status,
        specialRequests: form.specialRequests || null,
        assignedTableId: form.assignedTableId || null,
      })

      if (!res?.upsertReservation?.success) {
        throw new Error(res?.upsertReservation?.error || 'Unable to save reservation')
      }

      setActionError(null)
      setDialogOpen(false)
      fetchData()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to save reservation')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelReservation = async (id: string) => {
    if (!confirm('Cancel this reservation?')) return
    await updateReservationAction(id, 'cancel')
  }

  const updateReservationAction = async (id: string, action: string, tableId?: string | null) => {
    try {
      const res: any = await request('/api/graphql', UPDATE_RESERVATION_STATUS, {
        reservationId: id,
        action,
        tableId: tableId || null,
      })
      if (!res?.updateReservationStatus?.success) {
        throw new Error(res?.updateReservationStatus?.error || 'Unable to update reservation')
      }
      setActionError(null)
      fetchData()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to update reservation')
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    const actionByStatus: Record<string, string> = {
      pending: 'pending',
      confirmed: 'confirm',
      seated: 'seat',
      completed: 'complete',
      cancelled: 'cancel',
      no_show: 'no_show',
    }
    await updateReservationAction(id, actionByStatus[status] || 'confirm')
  }

  const navigateDay = (delta: number) => {
    setSelectedDate(d => {
      const n = new Date(d)
      n.setDate(n.getDate() + delta)
      return n
    })
  }

  const filteredReservations = reservations.filter(r =>
    activeStatusFilter === 'all' || r.status === activeStatusFilter
  )

  const statusCounts = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = reservations.filter(r => r.status === s).length
    return acc
  }, {} as Record<string, number>)

  const isToday = toDateInputValue(selectedDate) === toDateInputValue(new Date())

  return (
    <>
      <PageBreadcrumbs
        items={[
          { type: 'link', label: 'Dashboard', href: '' },
          { type: 'page', label: 'Platform' },
          { type: 'page', label: 'Reservations' },
        ]}
      />

      {actionError ? (
        <div className="mx-4 md:mx-6 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Reservations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {reservations.length} reservation{reservations.length !== 1 ? 's' : ''} for {isToday ? 'today' : formatDate(selectedDate.toISOString())}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} className="h-8 text-xs">
              <RefreshCw size={13} className="mr-1.5" /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate} className="h-8 text-xs">
              <Plus size={13} className="mr-1.5" /> New Reservation
            </Button>
          </div>
        </div>

        {/* Date navigator + stat strip */}
        <div className="border-b border-border">
          {/* Date nav */}
          <div className="px-4 md:px-6 flex items-center gap-2 h-11 border-b border-border">
            <button
              onClick={() => navigateDay(-1)}
              className="w-8 h-8 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
            >
              <ChevronLeft size={13} />
            </button>

            {/* Date picker */}
            <PlatformDatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              className="font-semibold"
            />

            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="text-[10px] uppercase tracking-wider font-semibold border border-border rounded px-2.5 h-8 text-muted-foreground hover:bg-muted transition-colors"
              >
                Today
              </button>
            )}

            <button
              onClick={() => navigateDay(1)}
              className="w-8 h-8 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
            >
              <ChevronRight size={13} />
            </button>

            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {reservations.length} reservation{reservations.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-y md:divide-y-0">
            <button
              onClick={() => setActiveStatusFilter('all')}
              className={cn(
                'px-4 py-2.5 text-left transition-colors',
                activeStatusFilter === 'all' ? 'bg-muted/40' : 'hover:bg-muted/20'
              )}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">All</p>
              <p className="text-lg font-semibold mt-0.5">{reservations.length}</p>
            </button>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setActiveStatusFilter(activeStatusFilter === key ? 'all' : key)}
                className={cn(
                  'px-4 py-2.5 text-left transition-colors',
                  activeStatusFilter === key ? 'bg-muted/40' : 'hover:bg-muted/20'
                )}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{cfg.label}</p>
                <p className={cn('text-lg font-semibold mt-0.5', cfg.text)}>{statusCounts[key] || 0}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Reservation list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="py-16 text-center">
              <Calendar size={32} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {reservations.length === 0
                  ? 'No reservations for this day.'
                  : 'No reservations match the selected filter.'}
              </p>
              {reservations.length === 0 && (
                <button
                  onClick={openCreate}
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Add the first reservation
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredReservations.map(r => {
                const statusCfg = STATUS_CONFIG[r.status || 'pending'] || STATUS_CONFIG.pending
                return (
                  <div key={r.id} className="px-4 md:px-6 py-4 hover:bg-muted/20 transition-colors flex items-start gap-4 group">
                    {/* Time column */}
                    <div className="w-16 shrink-0 text-right pt-0.5">
                      <p className="text-sm font-semibold tabular-nums">{formatTime(r.reservationDate)}</p>
                      {r.duration && (
                        <p className="text-[11px] text-muted-foreground">{r.duration}m</p>
                      )}
                    </div>

                    {/* Status dot */}
                    <div className="pt-1.5 shrink-0">
                      <span className={cn('w-2.5 h-2.5 rounded-full inline-block', statusCfg.dot)} />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold">{r.customerName || 'Guest'}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users size={11} /> {r.partySize || '—'} guests
                            </span>
                            {r.customerPhone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone size={11} /> {r.customerPhone}
                              </span>
                            )}
                            {r.customerEmail && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1 hidden sm:flex">
                                <Mail size={11} /> {r.customerEmail}
                              </span>
                            )}
                            {r.assignedTable && (
                              <span className="text-xs text-muted-foreground">
                                Table {r.assignedTable.tableNumber}
                              </span>
                            )}
                          </div>
                          {r.specialRequests && (
                            <p className="text-xs text-muted-foreground mt-1 italic">"{r.specialRequests}"</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Status selector */}
                          <select
                            value={r.status || 'pending'}
                            onChange={e => handleStatusChange(r.id, e.target.value)}
                            className={cn(
                              'text-[11px] uppercase tracking-wider font-semibold border border-border rounded-full px-2.5 py-1 bg-background cursor-pointer outline-none',
                              statusCfg.text
                            )}
                          >
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>

                          {['pending', 'confirmed'].includes(r.status || 'pending') ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => updateReservationAction(r.id, 'seat', r.assignedTable?.id || null)}
                              disabled={!r.assignedTable?.id}
                            >
                              Seat
                            </Button>
                          ) : null}
                          {r.status === 'seated' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => updateReservationAction(r.id, 'complete')}
                            >
                              Complete
                            </Button>
                          ) : null}
                          {['pending', 'confirmed'].includes(r.status || 'pending') ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px] text-orange-600 hover:text-orange-700"
                              onClick={() => updateReservationAction(r.id, 'no_show')}
                            >
                              No-show
                            </Button>
                          ) : null}

                          <button
                            onClick={() => openEdit(r)}
                            className="w-7 h-7 rounded border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => handleCancelReservation(r.id)}
                            className="w-7 h-7 rounded border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-950/30"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {editingId ? 'Edit Reservation' : 'New Reservation'}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 pt-2"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            {actionError ? (
              <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                {actionError}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Customer Name *</Label>
                <Input
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="Jane Smith"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone *</Label>
                <Input
                  value={form.customerPhone}
                  onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="(555) 000-0000"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input
                  value={form.customerEmail}
                  onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
                  placeholder="jane@example.com"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date *</Label>
                <PlatformDatePicker
                  value={form.reservationDate ? new Date(form.reservationDate + 'T12:00:00') : undefined}
                  onChange={(d) => setForm(f => ({ ...f, reservationDate: d ? toDateInputValue(d) : '' }))}
                  placeholder="Select date"
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={form.reservationTime}
                  onChange={e => setForm(f => ({ ...f, reservationTime: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Party Size</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={form.partySize}
                  onChange={e => setForm(f => ({ ...f, partySize: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Duration (min)</Label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-sm">{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Assigned Table</Label>
                <Select
                  value={form.assignedTableId || 'none'}
                  onValueChange={v => setForm(f => ({ ...f, assignedTableId: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-sm">None</SelectItem>
                    {tables.map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-sm">
                        Table {t.tableNumber} (cap. {t.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Special Requests</Label>
                <Textarea
                  value={form.specialRequests}
                  onChange={e => setForm(f => ({ ...f, specialRequests: e.target.value }))}
                  placeholder="Allergies, birthday cake, high chair…"
                  className="text-sm resize-none h-16"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9"
                type="button"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9"
                type="submit"
                disabled={saving || !form.customerName.trim() || !form.customerPhone.trim() || !form.reservationDate || !form.reservationTime}
              >
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

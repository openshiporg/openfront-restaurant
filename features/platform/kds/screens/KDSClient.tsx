'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { gql, request } from 'graphql-request'
import { RefreshCw } from 'lucide-react'

type StatusFilter = 'all' | 'in-progress' | 'ready'
type LaneFilter = 'all' | 'prep' | 'expediter'
type Density = 'comfortable' | 'compact'
type ViewMode = 'tickets' | 'all-day'

type TicketItem = {
  modifiers?: Array<{ name?: string; label?: string; value?: string }>;
  seatNumber?: number | null;
  courseNumber?: number | null;
  id: string
  name: string
  quantity: number
  notes?: string | null
  station: string
  status: 'new' | 'in_progress' | 'fulfilled' | 'cancelled'
  fulfilledAt?: string | null
}

type KdsTicket = {
  id: string
  status: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled'
  priority: number
  firedAt?: string | null
  station: { id: string; name: string } | null
  order: {
    id: string
    orderNumber: string
    orderType: 'dine_in' | 'takeout' | 'delivery'
    guestCount: number
    isUrgent: boolean
    onHold: boolean
    createdAt: string
    tables: { id: string; tableNumber: string }[]
  } | null
  items: TicketItem[]
}

const GET_KDS_DATA = gql`
  query GetKdsData {
    kitchenStations(where: { isActive: { equals: true } }, orderBy: { displayOrder: asc }) {
      id
      name
      displayOrder
    }
    kitchenTickets(
      where: { status: { in: ["new", "in_progress", "ready"] } }
      orderBy: { firedAt: asc }
    ) {
      id
      status
      priority
      firedAt
      items
      station { id name }
      order {
        id
        orderNumber
        orderType
        guestCount
        isUrgent
        onHold
        createdAt
        tables { id tableNumber }
      }
    }
  }
`

const UPDATE_TICKET_STATUS = gql`
  mutation UpdateKitchenTicketStatus($ticketId: String!, $status: String!) {
    updateKitchenTicketStatus(ticketId: $ticketId, status: $status) {
      success
      error
    }
  }
`

const FULFILL_TICKET_ITEM = gql`
  mutation FulfillKitchenTicketItem($ticketId: String!, $itemId: String!, $fulfilled: Boolean!) {
    fulfillKitchenTicketItem(ticketId: $ticketId, itemId: $itemId, fulfilled: $fulfilled) {
      success
      error
    }
  }
`

const warnMins = 12
const criticalMins = 20

function getTicketAgeMins(ticket: KdsTicket) {
  const sentAt = ticket.firedAt || ticket.order?.createdAt
  if (!sentAt) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000))
}

function getTicketLane(ticket: KdsTicket): LaneFilter {
  const stationName = (ticket.station?.name || '').toLowerCase()
  if (stationName.includes('expo') || stationName.includes('expediter')) return 'expediter'
  return 'prep'
}

function sortTickets(tickets: KdsTicket[]) {
  return [...tickets].sort((a, b) => {
    const aUrgent = !!a.order?.isUrgent
    const bUrgent = !!b.order?.isUrgent
    if (aUrgent !== bUrgent) return aUrgent ? -1 : 1

    const aHold = !!a.order?.onHold
    const bHold = !!b.order?.onHold
    if (aHold !== bHold) return aHold ? 1 : -1

    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0)

    return getTicketAgeMins(b) - getTicketAgeMins(a)
  })
}

function KDSHeader({
  now,
  activeStatus,
  onStatusChange,
  counts,
}: {
  now: Date
  activeStatus: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  counts: { active: number; inProgress: number; ready: number; urgent: number; overdue: number; critical: number }
}) {
  const filters = [
    { id: 'all' as const, label: 'Active', count: counts.active },
    { id: 'in-progress' as const, label: 'In Progress', count: counts.inProgress },
    { id: 'ready' as const, label: 'Ready', count: counts.ready },
  ]

  return (
    <header className="bg-secondary border-b border-border">
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Kitchen Display System</h1>
            <p className="text-xs text-muted-foreground mt-1">Ticket-first queue • urgent pinned first • sequenced expediter gate enabled</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold tracking-tight">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">System Time</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => onStatusChange(filter.id)}
              className={`rounded border p-3 text-left transition-colors ${
                activeStatus === filter.id
                  ? 'border-blue-500 bg-card'
                  : 'border-border bg-card hover:border-border-hover'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{filter.label}</p>
              <p className="text-2xl font-bold mt-1">{filter.count}</p>
            </button>
          ))}

          <div className="rounded border border-border p-3 bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Urgent</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{counts.urgent}</p>
          </div>

          <div className="rounded border border-border p-3 bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Overdue</p>
            <p className="text-2xl font-bold mt-1 text-orange-600">{counts.overdue}</p>
          </div>

          <div className="rounded border border-border p-3 bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Critical</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{counts.critical}</p>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border px-2 py-1 bg-card">1. Order</span>
          <span className="rounded border px-2 py-1 bg-card">2. Prepare</span>
          <span className="rounded border px-2 py-1 bg-card">3. Ready / Serve</span>
          <span className="rounded border px-2 py-1 bg-card">4. Pay</span>
        </div>
      </div>
    </header>
  )
}

function StationTabs({
  stations,
  activeStation,
  stationCounts,
  onStationChange,
}: {
  stations: { id: string; name: string }[]
  activeStation: string
  stationCounts: Record<string, number>
  onStationChange: (stationId: string) => void
}) {
  const allStations = [{ id: 'all', name: 'All Stations' }, ...stations]

  return (
    <div className="border-b border-border bg-secondary">
      <div className="px-8 flex items-center gap-1 overflow-x-auto">
        {allStations.map((station) => (
          <button
            key={station.id}
            onClick={() => onStationChange(station.id)}
            className={`px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-all ${
              activeStation === station.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {station.name} <span className="text-xs opacity-80">({stationCounts[station.id] || 0})</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function KDSViewControls({
  laneFilter,
  onLaneFilterChange,
  density,
  onDensityChange,
  viewMode,
  onViewModeChange,
}: {
  laneFilter: LaneFilter
  onLaneFilterChange: (lane: LaneFilter) => void
  density: Density
  onDensityChange: (density: Density) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}) {
  return (
    <div className="px-8 py-3 border-b border-border bg-background/80 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">Lane</span>
        {([
          { id: 'all', label: 'All' },
          { id: 'prep', label: 'Prep' },
          { id: 'expediter', label: 'Expediter' },
        ] as { id: LaneFilter; label: string }[]).map((lane) => (
          <button
            key={lane.id}
            onClick={() => onLaneFilterChange(lane.id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              laneFilter === lane.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background border-border text-foreground hover:border-zinc-400'
            }`}
          >
            {lane.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">View</span>
        {([
          { id: 'tickets', label: 'Tickets' },
          { id: 'all-day', label: 'All Day' },
        ] as { id: ViewMode; label: string }[]).map((mode) => (
          <button
            key={mode.id}
            onClick={() => onViewModeChange(mode.id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              viewMode === mode.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background border-border text-foreground hover:border-zinc-400'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">Density</span>
        {([
          { id: 'comfortable', label: 'Comfortable' },
          { id: 'compact', label: 'Compact' },
        ] as { id: Density; label: string }[]).map((mode) => (
          <button
            key={mode.id}
            onClick={() => onDensityChange(mode.id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              density === mode.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background border-border text-foreground hover:border-zinc-400'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function StationMetrics({ tickets }: { tickets: KdsTicket[] }) {
  const metrics = useMemo(() => {
    const map = new Map<string, { active: number; ready: number; overdue: number; avgAge: number; sumAge: number }>()

    tickets.forEach((ticket) => {
      const key = ticket.station?.name || 'Unassigned'
      const curr = map.get(key) || { active: 0, ready: 0, overdue: 0, avgAge: 0, sumAge: 0 }
      curr.active += 1
      if (ticket.status === 'ready') curr.ready += 1
      const age = getTicketAgeMins(ticket)
      curr.sumAge += age
      if (age >= warnMins) curr.overdue += 1
      map.set(key, curr)
    })

    return Array.from(map.entries()).map(([name, val]) => ({
      name,
      active: val.active,
      ready: val.ready,
      overdue: val.overdue,
      avgAge: val.active > 0 ? Math.round(val.sumAge / val.active) : 0,
    }))
  }, [tickets])

  if (metrics.length === 0) return null

  return (
    <section className="px-8 py-4 border-b border-border bg-background/60">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Station throughput</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.name} className="rounded border border-border bg-card p-3">
            <div className="text-sm font-semibold">{m.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Active {m.active} • Ready {m.ready} • Overdue {m.overdue}
            </div>
            <div className="text-xs mt-2">Avg age: <span className="font-semibold">{m.avgAge}m</span></div>
          </div>
        ))}
      </div>
    </section>
  )
}

function TicketCard({
  ticket,
  onStatusChange,
  onToggleItem,
  density,
}: {
  ticket: KdsTicket
  onStatusChange: (ticketId: string, status: string) => void
  onToggleItem: (ticketId: string, itemId: string, fulfilled: boolean) => void
  density: Density
}) {
  const table = ticket.order?.tables?.length
    ? ticket.order.tables.map((t) => t.tableNumber).join(', ')
    : '—'

  const elapsed = getTicketAgeMins(ticket)
  const elapsedTone = elapsed >= criticalMins ? 'text-red-600' : elapsed >= warnMins ? 'text-orange-600' : 'text-muted-foreground'

  const urgent = !!ticket.order?.isUrgent
  const onHold = !!ticket.order?.onHold

  return (
    <div
      className={`rounded-lg border ${density === 'compact' ? 'p-3' : 'p-4'} ${
        urgent
          ? 'border-red-500 bg-red-500/10 shadow-sm shadow-red-500/20'
          : onHold
            ? 'border-yellow-500/40 bg-yellow-500/10'
            : 'border-border bg-secondary'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-lg font-medium">Table {table}</div>
          <div className="text-xs text-muted-foreground mt-1">
            #{ticket.order?.orderNumber || '—'} • {(ticket.order?.guestCount || 0)} guest{(ticket.order?.guestCount || 0) !== 1 ? 's' : ''} • {(ticket.order?.orderType || '').replace('_', ' ')}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {ticket.station?.name || '—'} • {getTicketLane(ticket).toUpperCase()}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-semibold ${elapsedTone}`}>{elapsed === 0 ? 'Just now' : `${elapsed}m`}</div>
          {urgent && <div className="text-[11px] font-semibold text-red-600 mt-1">URGENT</div>}
          {onHold && <div className="text-[11px] font-semibold text-yellow-700 mt-1">ON HOLD</div>}
          <div className="text-[11px] uppercase text-muted-foreground mt-1">{ticket.status.replace('_', ' ')}</div>
        </div>
      </div>

      <div className={density === 'compact' ? 'space-y-1.5 mb-2' : 'space-y-2 mb-3'}>
        {(ticket.items || []).map((item) => {
          const done = item.status === 'fulfilled'
          const cancelled = item.status === 'cancelled'
          return (
            <button
              key={item.id}
              disabled={cancelled || ticket.status === 'served' || ticket.status === 'cancelled'}
              onClick={() => onToggleItem(ticket.id, item.id, !done)}
              className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                done
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-sm ${done ? 'line-through text-muted-foreground' : ''}`}>
                  {item.quantity}x {item.name}
                </div>
                <div className={`text-[11px] uppercase ${done ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                  {cancelled ? 'Cancelled' : done ? 'Fulfilled' : 'Mark Done'}
                </div>
              </div>
              {(item.seatNumber || item.courseNumber) && <div className="text-xs font-semibold">{item.seatNumber ? `Seat ${item.seatNumber} · ` : ''}Course {item.courseNumber || 1}</div>}
              {item.modifiers?.map((modifier, index) => <div key={index} className="text-sm font-semibold">+ {modifier.name || modifier.label || modifier.value}</div>)}
              {item.notes && <div className="text-xs italic text-muted-foreground mt-1">{item.notes}</div>}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {ticket.status === 'new' && (
          <button
            onClick={() => onStatusChange(ticket.id, 'in_progress')}
            className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
          >
            Start
          </button>
        )}

        {ticket.status === 'in_progress' && (
          <button
            onClick={() => onStatusChange(ticket.id, 'ready')}
            className="rounded border border-emerald-500/40 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10"
          >
            Mark Ready
          </button>
        )}

        {ticket.status === 'ready' && (
          <>
            <button
              onClick={() => onStatusChange(ticket.id, 'served')}
              className="rounded border border-blue-500/40 px-3 py-1 text-xs text-blue-700 hover:bg-blue-500/10"
            >
              Bump / Served
            </button>
            <button
              onClick={() => onStatusChange(ticket.id, 'in_progress')}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              Recall
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AllDayView({ tickets }: { tickets: KdsTicket[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; station: string; qty: number; fulfilled: number; urgentOrders: number }>()

    tickets.forEach((ticket) => {
      const urgent = ticket.order?.isUrgent ? 1 : 0
      ticket.items.forEach((item) => {
        const key = `${item.station}::${item.name}`
        const curr = map.get(key) || { name: item.name, station: item.station, qty: 0, fulfilled: 0, urgentOrders: 0 }
        curr.qty += item.quantity
        if (item.status === 'fulfilled') curr.fulfilled += item.quantity
        curr.urgentOrders += urgent
        map.set(key, curr)
      })
    })

    return Array.from(map.values()).sort((a, b) => b.qty - a.qty)
  }, [tickets])

  return (
    <section className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium">All Day</h2>
        <span className="text-sm text-muted-foreground">{rows.length} item line{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No active production items
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Item</div>
            <div className="col-span-2">Station</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Done</div>
            <div className="col-span-2 text-right">Remaining</div>
          </div>
          {rows.map((row, idx) => (
            <div key={`${row.station}-${row.name}-${idx}`} className="grid grid-cols-12 gap-2 px-4 py-3 border-t text-sm">
              <div className="col-span-4 font-medium">{row.name}</div>
              <div className="col-span-2 text-muted-foreground capitalize">{row.station}</div>
              <div className="col-span-2 text-right font-semibold">{row.qty}</div>
              <div className="col-span-2 text-right text-emerald-700 font-semibold">{row.fulfilled}</div>
              <div className="col-span-2 text-right font-semibold">{Math.max(0, row.qty - row.fulfilled)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function QueueView({
  tickets,
  onStatusChange,
  onToggleItem,
  density,
}: {
  tickets: KdsTicket[]
  onStatusChange: (ticketId: string, status: string) => void
  onToggleItem: (ticketId: string, itemId: string, fulfilled: boolean) => void
  density: Density
}) {
  return (
    <section className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium">Queue</h2>
        <span className="text-sm text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
      </div>

      <div className={density === 'compact' ? 'space-y-2' : 'space-y-3'}>
        {tickets.length === 0 ? (
          <div className="rounded border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No active tickets
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onStatusChange={onStatusChange}
              onToggleItem={onToggleItem}
              density={density}
            />
          ))
        )}
      </div>
    </section>
  )
}

export function KDSClient() {
  const [loading, setLoading] = useState(true)
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([])
  const [tickets, setTickets] = useState<KdsTicket[]>([])
  const [activeStation, setActiveStation] = useState('all')
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('all')
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all')
  const [density, setDensity] = useState<Density>('comfortable')
  const [viewMode, setViewMode] = useState<ViewMode>('tickets')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())

  const fetchKDS = async () => {
    try {
      const res: any = await request('/api/graphql', GET_KDS_DATA)

      setStations((res.kitchenStations || []).map((s: any) => ({ id: s.id, name: s.name })))
      setTickets((res.kitchenTickets || []).map((ticket: any) => ({
        ...ticket,
        items: Array.isArray(ticket.items) ? ticket.items : [],
      })))

      setMutationError(null)
    } catch (err) {
      console.error(err)
      setMutationError('KDS failed to load data. Check session and GraphQL logs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKDS()
    const poll = setInterval(fetchKDS, 10000)
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(clock)
    }
  }, [])

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const res: any = await request('/api/graphql', UPDATE_TICKET_STATUS, { ticketId, status })
      if (!res?.updateKitchenTicketStatus?.success) {
        setMutationError(res?.updateKitchenTicketStatus?.error || 'Failed to update ticket status')
        return
      }
      setMutationError(null)
      await fetchKDS()
    } catch (err) {
      console.error(err)
      setMutationError('Failed to update ticket status')
    }
  }

  const toggleItemFulfilled = async (ticketId: string, itemId: string, fulfilled: boolean) => {
    try {
      const res: any = await request('/api/graphql', FULFILL_TICKET_ITEM, { ticketId, itemId, fulfilled })
      if (!res?.fulfillKitchenTicketItem?.success) {
        setMutationError(res?.fulfillKitchenTicketItem?.error || 'Failed to update item')
        return
      }
      setMutationError(null)
      await fetchKDS()
    } catch (err) {
      console.error(err)
      setMutationError('Failed to update item')
    }
  }

  const statusFiltered = useMemo(() => {
    if (activeStatus === 'ready') return tickets.filter((t) => t.status === 'ready')
    if (activeStatus === 'in-progress') return tickets.filter((t) => ['new', 'in_progress'].includes(t.status))
    return tickets
  }, [tickets, activeStatus])

  const laneFiltered = useMemo(() => {
    if (laneFilter === 'all') return statusFiltered
    return statusFiltered.filter((ticket) => getTicketLane(ticket) === laneFilter)
  }, [statusFiltered, laneFilter])

  const stationFiltered = useMemo(() => {
    if (activeStation === 'all') return sortTickets(laneFiltered)
    return sortTickets(laneFiltered.filter((ticket) => ticket.station?.id === activeStation))
  }, [laneFiltered, activeStation])

  const counts = useMemo(() => {
    const active = tickets.length
    const inProgress = tickets.filter((t) => ['new', 'in_progress'].includes(t.status)).length
    const ready = tickets.filter((t) => t.status === 'ready').length
    const urgent = tickets.filter((t) => !!t.order?.isUrgent).length
    const overdue = tickets.filter((t) => getTicketAgeMins(t) >= warnMins).length
    const critical = tickets.filter((t) => getTicketAgeMins(t) >= criticalMins).length
    return { active, inProgress, ready, urgent, overdue, critical }
  }, [tickets])

  const stationCounts = useMemo(() => {
    const out: Record<string, number> = { all: laneFiltered.length }
    stations.forEach((station) => {
      out[station.id] = laneFiltered.filter((ticket) => ticket.station?.id === station.id).length
    })
    return out
  }, [laneFiltered, stations])

  if (loading && tickets.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <RefreshCw className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <KDSHeader now={now} activeStatus={activeStatus} onStatusChange={setActiveStatus} counts={counts} />
      <StationTabs
        stations={stations}
        activeStation={activeStation}
        stationCounts={stationCounts}
        onStationChange={setActiveStation}
      />
      <KDSViewControls
        laneFilter={laneFilter}
        onLaneFilterChange={setLaneFilter}
        density={density}
        onDensityChange={setDensity}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {mutationError && (
        <div className="px-8 py-3 text-sm bg-red-500/10 text-red-700 border-b border-red-500/20">
          {mutationError}
        </div>
      )}
      <StationMetrics tickets={stationFiltered} />
      {viewMode === 'all-day' ? (
        <AllDayView tickets={stationFiltered} />
      ) : (
        <QueueView
          tickets={stationFiltered}
          onStatusChange={updateTicketStatus}
          onToggleItem={toggleItemFulfilled}
          density={density}
        />
      )}
    </div>
  )
}

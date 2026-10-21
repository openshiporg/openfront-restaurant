'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Users, Clock, Phone, Plus, Bell, Check, X, UserX, User, ArrowRight, Table as TableIcon, MessageSquare, AlertCircle, RefreshCw, MoreVertical } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { cn } from '@/lib/utils'

interface WaitlistEntry {
  id: string
  customerName: string
  phoneNumber: string
  partySize: number
  quotedWaitTime: number
  status: 'waiting' | 'notified' | 'seated' | 'completed' | 'cancelled' | 'no_show'
  addedAt: string
  notifiedAt: string | null
  seatedAt: string | null
  notes: string | null
  table: { id: string; tableNumber: string } | null
}

interface Table {
  id: string
  tableNumber: string
  capacity: number
  status: string
}

const GET_WAITLIST = gql`
  query GetWaitlist {
    waitlistEntries(
      where: { status: { in: ["waiting", "notified", "seated"] } }
      orderBy: { addedAt: asc }
    ) {
      id
      customerName
      phoneNumber
      partySize
      quotedWaitTime
      status
      addedAt
      notifiedAt
      seatedAt
      notes
      table {
        id
        tableNumber
      }
    }
  }
`

const GET_AVAILABLE_TABLES = gql`
  query GetAvailableTables($minCapacity: Int) {
    tables(
      where: { 
        status: { equals: "available" }
        capacity: { gte: $minCapacity }
      }
      orderBy: { capacity: asc }
    ) {
      id
      tableNumber
      capacity
      status
    }
  }
`

const CREATE_WAITLIST_ENTRY = gql`
  mutation CreateWaitlistGuest(
    $customerName: String!
    $phoneNumber: String!
    $partySize: Int!
    $quotedWaitTime: Int
    $notes: String
  ) {
    createWaitlistGuest(
      customerName: $customerName
      phoneNumber: $phoneNumber
      partySize: $partySize
      quotedWaitTime: $quotedWaitTime
      notes: $notes
    ) { success error }
  }
`

const UPDATE_WAITLIST_STATUS = gql`
  mutation UpdateWaitlistStatus($entryId: ID!, $action: String!, $tableId: ID, $contactConfirmed: Boolean) {
    updateWaitlistStatus(entryId: $entryId, action: $action, tableId: $tableId, contactConfirmed: $contactConfirmed) { success error }
  }
`

const STATUS_CONFIG: Record<string, { color: string; bg: string; text: string; label: string; icon: any }> = {
  waiting: { 
    color: 'bg-amber-500', 
    bg: 'bg-amber-500/10', 
    text: 'text-amber-600 dark:text-amber-400', 
    label: 'Waiting', 
    icon: Clock 
  },
  notified: { 
    color: 'bg-blue-500', 
    bg: 'bg-blue-500/10', 
    text: 'text-blue-600 dark:text-blue-400', 
    label: 'Notified', 
    icon: Bell 
  },
  seated: { 
    color: 'bg-emerald-500', 
    bg: 'bg-emerald-500/10', 
    text: 'text-emerald-600 dark:text-emerald-400', 
    label: 'Seated', 
    icon: Check 
  },
  cancelled: { 
    color: 'bg-zinc-500', 
    bg: 'bg-zinc-500/10', 
    text: 'text-zinc-600 dark:text-zinc-400', 
    label: 'Cancelled', 
    icon: X 
  },
  no_show: { 
    color: 'bg-rose-500', 
    bg: 'bg-rose-500/10', 
    text: 'text-rose-600 dark:text-rose-400', 
    label: 'No Show', 
    icon: UserX 
  },
}

export function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [availableTables, setAvailableTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [seatDialogOpen, setSeatDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string>('')
  const [actionError, setActionError] = useState<string | null>(null)

  const [newEntry, setNewEntry] = useState({
    customerName: '',
    phoneNumber: '',
    partySize: 2,
    quotedWaitTime: 15,
    notes: '',
  })

  const fetchWaitlist = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_WAITLIST)
      setEntries((data as any).waitlistEntries || [])
    } catch (err) {
      console.error('Error fetching waitlist:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAvailableTables = useCallback(async (minCapacity: number) => {
    try {
      const data = await request('/api/graphql', GET_AVAILABLE_TABLES, { minCapacity })
      setAvailableTables((data as any).tables || [])
    } catch (err) {
      console.error('Error fetching tables:', err)
    }
  }, [])

  useEffect(() => {
    fetchWaitlist()
    const interval = setInterval(fetchWaitlist, 30000)
    return () => clearInterval(interval)
  }, [fetchWaitlist])

  const handleAddEntry = async () => {
    if (!newEntry.customerName || !newEntry.phoneNumber) return;
    try {
      const res: any = await request('/api/graphql', CREATE_WAITLIST_ENTRY, {
        customerName: newEntry.customerName,
        phoneNumber: newEntry.phoneNumber,
        partySize: newEntry.partySize,
        quotedWaitTime: newEntry.quotedWaitTime,
        notes: newEntry.notes || null,
      })
      if (!res?.createWaitlistGuest?.success) {
        throw new Error(res?.createWaitlistGuest?.error || 'Unable to add guest')
      }
      setActionError(null)
      setAddDialogOpen(false)
      setNewEntry({ customerName: '', phoneNumber: '', partySize: 2, quotedWaitTime: 15, notes: '' })
      fetchWaitlist()
    } catch (err: any) {
      console.error('Error adding entry:', err)
      setActionError(err?.message || 'Unable to add guest')
    }
  }

  const handleNotify = async (entry: WaitlistEntry) => {
    if (!window.confirm(`Call ${entry.customerName} at ${entry.phoneNumber}. Have you successfully contacted this guest?`)) return;
    try {
      const res: any = await request('/api/graphql', UPDATE_WAITLIST_STATUS, {
        entryId: entry.id,
        action: 'notify',
        contactConfirmed: true,
      })
      if (!res?.updateWaitlistStatus?.success) {
        throw new Error(res?.updateWaitlistStatus?.error || 'Unable to notify guest')
      }
      setActionError(null)
      fetchWaitlist()
    } catch (err: any) {
      console.error('Error notifying:', err)
      setActionError(err?.message || 'Unable to notify guest')
    }
  }

  const handleSeatClick = async (entry: WaitlistEntry) => {
    setSelectedEntry(entry)
    await fetchAvailableTables(entry.partySize)
    setSeatDialogOpen(true)
  }

  const handleSeat = async () => {
    if (!selectedEntry || !selectedTableId) return

    try {
      const res: any = await request('/api/graphql', UPDATE_WAITLIST_STATUS, {
        entryId: selectedEntry.id,
        action: 'seat',
        tableId: selectedTableId,
      })
      if (!res?.updateWaitlistStatus?.success) {
        throw new Error(res?.updateWaitlistStatus?.error || 'Unable to seat guest')
      }
      setActionError(null)
      setSeatDialogOpen(false)
      setSelectedEntry(null)
      setSelectedTableId('')
      fetchWaitlist()
    } catch (err: any) {
      console.error('Error seating:', err)
      setActionError(err?.message || 'Unable to seat guest')
    }
  }

  const handleCancel = async (entry: WaitlistEntry) => {
    if (!confirm('Cancel this waitlist entry?')) return;
    try {
      const res: any = await request('/api/graphql', UPDATE_WAITLIST_STATUS, {
        entryId: entry.id,
        action: 'cancel',
      })
      if (!res?.updateWaitlistStatus?.success) {
        throw new Error(res?.updateWaitlistStatus?.error || 'Unable to cancel guest')
      }
      setActionError(null)
      fetchWaitlist()
    } catch (err: any) {
      console.error('Error cancelling:', err)
      setActionError(err?.message || 'Unable to cancel guest')
    }
  }

  const handleNoShow = async (entry: WaitlistEntry) => {
    try {
      const res: any = await request('/api/graphql', UPDATE_WAITLIST_STATUS, {
        entryId: entry.id,
        action: 'no_show',
      })
      if (!res?.updateWaitlistStatus?.success) {
        throw new Error(res?.updateWaitlistStatus?.error || 'Unable to mark no show')
      }
      setActionError(null)
      fetchWaitlist()
    } catch (err: any) {
      console.error('Error marking no show:', err)
      setActionError(err?.message || 'Unable to mark no show')
    }
  }

  const getWaitTime = (addedAt: string) => {
    const minutes = Math.floor((Date.now() - new Date(addedAt).getTime()) / 60000)
    return Math.max(0, minutes)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const waitingCount = entries.filter(e => e.status === 'waiting').length
  const notifiedCount = entries.filter(e => e.status === 'notified').length

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Waitlist' }
  ]

  return (
    <div className="flex flex-col h-full">
      <PageBreadcrumbs items={breadcrumbs} />

      {actionError ? (
        <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {actionError}
        </div>
      ) : null}

      {/* Header */}
      <div className="px-6 py-6 border-b bg-gradient-to-br from-indigo-500/5 via-background to-blue-500/5">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
              Waitlist
            </h1>
            <p className="text-muted-foreground">Manage your restaurant floor flow and guest experience</p>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 active:scale-95">
                <Plus className="h-5 w-5 mr-2" />
                Add Guest
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">New Waitlist Entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Guest Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-10 h-11 rounded-xl"
                      value={newEntry.customerName}
                      onChange={(e) => setNewEntry({ ...newEntry, customerName: e.target.value })}
                      placeholder="e.g. Sarah Parker"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-10 h-11 rounded-xl"
                      value={newEntry.phoneNumber}
                      onChange={(e) => setNewEntry({ ...newEntry, phoneNumber: e.target.value })}
                      placeholder="e.g. (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Party Size</Label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min={1}
                        className="pl-10 h-11 rounded-xl"
                        value={newEntry.partySize}
                        onChange={(e) => setNewEntry({ ...newEntry, partySize: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quoted (min)</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min={0}
                        className="pl-10 h-11 rounded-xl"
                        value={newEntry.quotedWaitTime}
                        onChange={(e) => setNewEntry({ ...newEntry, quotedWaitTime: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                  <Textarea
                    className="rounded-xl resize-none"
                    value={newEntry.notes}
                    onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                    placeholder="High chair, window seat, etc."
                    rows={3}
                  />
                </div>
                <Button onClick={handleAddEntry} className="w-full h-12 text-base font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700">
                  Add to Waitlist
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-2 rounded-2xl bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-background">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20">
                  <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Currently Waiting</div>
                  <div className="text-3xl font-black mt-1">{waitingCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 rounded-2xl hover:border-blue-500/30 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20">
                  <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notified</div>
                  <div className="text-3xl font-black mt-1">{notifiedCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 rounded-2xl hover:border-emerald-500/30 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20">
                  <Clock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Avg Wait Time</div>
                  <div className="text-3xl font-black mt-1">18<span className="text-sm font-medium ml-1">min</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* List Area */}
      <ScrollArea className="flex-1">
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {entries.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <Users className="h-10 w-10 text-muted-foreground opacity-30" />
              </div>
              <h3 className="text-xl font-bold mb-2">Waitlist is empty</h3>
              <p className="text-muted-foreground mb-8 max-w-xs mx-auto">All guests have been seated. Ready for more arrivals!</p>
              <Button onClick={() => setAddDialogOpen(true)} variant="outline" className="rounded-xl border-2">
                <Plus className="h-4 w-4 mr-2" />
                Add First Guest
              </Button>
            </div>
          ) : (
            entries.map((entry, index) => {
              const waitTime = getWaitTime(entry.addedAt)
              const isOverQuoted = waitTime > entry.quotedWaitTime
              const config = STATUS_CONFIG[entry.status]
              const StatusIcon = config.icon

              return (
                <Card key={entry.id} className={cn(
                  "border-2 rounded-3xl transition-all hover:shadow-lg overflow-hidden flex flex-col group",
                  isOverQuoted && entry.status === 'waiting' ? "border-rose-500 shadow-rose-100 dark:shadow-none bg-rose-50/20 dark:bg-rose-950/5" : "hover:border-indigo-500/30"
                )}>
                  <div className="p-5 flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-sm",
                          isOverQuoted && entry.status === 'waiting' ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-tight">{entry.customerName}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={cn("rounded-lg px-2 py-0.5 text-[10px] font-bold tracking-wider", config.bg, config.text, "border-none shadow-none uppercase")}>
                              <StatusIcon className="h-2.5 w-2.5 mr-1" />
                              {config.label}
                            </Badge>
                            {isOverQuoted && entry.status === 'waiting' && (
                                <Badge className="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-rose-600 text-white border-none shadow-none uppercase">
                                  Delayed
                                </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl w-40">
                          <DropdownMenuItem onClick={() => handleCancel(entry)} className="text-rose-600 font-medium cursor-pointer">
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/40 p-3 rounded-2xl flex flex-col justify-center">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Party Size</div>
                        <div className="flex items-center gap-2 font-bold text-lg">
                          <Users className="h-4 w-4 text-indigo-500" />
                          {entry.partySize}
                        </div>
                      </div>
                      <div className={cn(
                        "p-3 rounded-2xl flex flex-col justify-center",
                        isOverQuoted && entry.status === 'waiting' ? "bg-rose-500/10" : "bg-muted/40"
                      )}>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Wait Time</div>
                        <div className={cn("font-bold text-lg flex items-center gap-2", isOverQuoted && entry.status === 'waiting' ? "text-rose-600" : "")}>
                          <Clock className="h-4 w-4" />
                          {waitTime}m
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-sm font-medium">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        {entry.phoneNumber}
                      </div>
                    </div>

                    {entry.notes && (
                      <div className="bg-muted/30 p-3 rounded-2xl border-2 border-dashed border-muted flex gap-2">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-indigo-500 shrink-0" />
                        <p className="text-xs text-muted-foreground italic leading-normal">{entry.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-muted/20 border-t flex gap-2">
                    {entry.status === 'seated' ? <Button onClick={async () => { try { const r: any = await request('/api/graphql', UPDATE_WAITLIST_STATUS, { entryId: entry.id, action: 'complete' }); if (!r.updateWaitlistStatus.success) throw new Error(r.updateWaitlistStatus.error); await fetchWaitlist(); } catch (e: any) { setActionError(e.message); } }}>Complete table visit</Button> : entry.status === 'waiting' ? (
                      <>
                        <Button 
                          className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-xs uppercase tracking-widest h-10" 
                          onClick={() => handleNotify(entry)}
                        >
                          <Bell className="h-3.5 w-3.5 mr-2" />
                          Record contact
                        </Button>
                        <Button 
                          className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs uppercase tracking-widest h-10"
                          onClick={() => handleSeatClick(entry)}
                        >
                          <TableIcon className="h-3.5 w-3.5 mr-2" />
                          Seat
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button 
                          className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs uppercase tracking-widest h-10"
                          onClick={() => handleSeatClick(entry)}
                        >
                          <Check className="h-3.5 w-3.5 mr-2" />
                          Seat Guest
                        </Button>
                        <Button 
                          variant="outline" 
                          className="flex-1 rounded-xl border-2 font-bold text-xs uppercase tracking-widest h-10"
                          onClick={() => handleNoShow(entry)}
                        >
                          <UserX className="h-3.5 w-3.5 mr-2" />
                          No Show
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>

      <Dialog open={seatDialogOpen} onOpenChange={setSeatDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Assign Table</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-between p-4 bg-muted/40 rounded-2xl border-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Guest</div>
                <div className="font-bold text-lg">{selectedEntry?.customerName}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Party Size</div>
                <div className="font-bold text-lg">{selectedEntry?.partySize} People</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Select Available Table</Label>
              <Select value={selectedTableId} onValueChange={setSelectedTableId}>
                <SelectTrigger className="h-12 rounded-xl border-2">
                  <SelectValue placeholder="Select Table" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableTables.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No suitable tables available
                    </div>
                  ) : (
                    availableTables.map((table) => (
                      <SelectItem key={table.id} value={table.id} className="rounded-lg">
                        Table {table.tableNumber} (Seats {table.capacity})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSeat}
              className="w-full h-12 text-base font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 dark:shadow-none"
              disabled={!selectedTableId}
            >
              Confirm Seating
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WaitlistPage

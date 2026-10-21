'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Calendar as CalendarIcon, Plus, RefreshCw, ChevronLeft, ChevronRight, Briefcase, UserPlus, Timer, XCircle } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { cn } from '@/lib/utils'

interface Shift {
  id: string
  staff: { id: string; name: string } | null
  startTime: string
  endTime: string
  role: string
  status: string
  hourlyRate: string | null
  clockIn: string | null
  clockOut: string | null
  hoursWorked: number | null
}

interface StaffMember {
  id: string
  name: string
  email: string
}

const ROLES = [
  { value: 'server', label: 'Server', color: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' },
  { value: 'bartender', label: 'Bartender', color: 'bg-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400' },
  { value: 'host', label: 'Host', color: 'bg-green-500', bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400' },
  { value: 'busser', label: 'Busser', color: 'bg-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-600 dark:text-yellow-400' },
  { value: 'cook', label: 'Cook', color: 'bg-red-500', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400' },
  { value: 'dishwasher', label: 'Dishwasher', color: 'bg-gray-500', bg: 'bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400' },
  { value: 'manager', label: 'Manager', color: 'bg-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400' },
]

const GET_SHIFTS = gql`
  query GetShifts($startDate: DateTime!, $endDate: DateTime!) {
    shifts(
      where: { startTime: { gte: $startDate, lte: $endDate } }
      orderBy: { startTime: asc }
    ) {
      id
      staff { id name }
      startTime
      endTime
      role
      status
      hourlyRate
      clockIn
      clockOut
      hoursWorked
    }
    users(where: { NOT: { role: null } }, orderBy: { name: asc }) {
      id
      name
      email
    }
  }
`

const UPSERT_SHIFT = gql`
  mutation UpsertShift(
    $shiftId: ID
    $staffId: ID
    $role: String!
    $startTime: String!
    $endTime: String!
    $hourlyRate: String
  ) {
    upsertShift(
      shiftId: $shiftId
      staffId: $staffId
      role: $role
      startTime: $startTime
      endTime: $endTime
      hourlyRate: $hourlyRate
    ) { success error }
  }
`

const UPDATE_SHIFT_STATUS = gql`
  mutation UpdateShiftStatus($shiftId: ID!, $action: String!) {
    updateShiftStatus(shiftId: $shiftId, action: $action) { success error }
  }
`

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function getWeekDates(baseDate: Date): Date[] {
  const dates: Date[] = []
  const start = new Date(baseDate)
  start.setDate(start.getDate() - start.getDay())
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dates.push(d)
  }
  return dates
}

export function SchedulePage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [form, setForm] = useState({
    staffId: '',
    role: 'server',
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    hourlyRate: '15.00',
  })

  const weekDates = getWeekDates(weekStart)

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true)
      const startDate = weekDates[0].toISOString()
      const endDate = new Date(weekDates[6].getTime() + 86400000).toISOString()
      const data = await request('/api/graphql', GET_SHIFTS, { startDate, endDate })
      setShifts((data as any).shifts || [])
      setStaff((data as any).users || [])
    } catch (err) {
      console.error('Error fetching shifts:', err)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    fetchShifts()
  }, [fetchShifts])

  const navigateWeek = (direction: number) => {
    const newStart = new Date(weekStart)
    newStart.setDate(newStart.getDate() + direction * 7)
    setWeekStart(newStart)
  }

  const openAddDialog = (date?: Date) => {
    setEditingShift(null)
    setForm({
      staffId: '',
      role: 'server',
      date: date ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      startTime: '09:00',
      endTime: '17:00',
      hourlyRate: '15.00',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (shift: Shift) => {
    setEditingShift(shift)
    const startDate = new Date(shift.startTime)
    const endDate = new Date(shift.endTime)
    setForm({
      staffId: shift.staff?.id || '',
      role: shift.role,
      date: startDate.toISOString().slice(0, 10),
      startTime: startDate.toTimeString().slice(0, 5),
      endTime: endDate.toTimeString().slice(0, 5),
      hourlyRate: shift.hourlyRate || '15.00',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    try {
      const startDateTime = new Date(`${form.date}T${form.startTime}:00`)
      const endDateTime = new Date(`${form.date}T${form.endTime}:00`)

      const res: any = await request('/api/graphql', UPSERT_SHIFT, {
        shiftId: editingShift?.id || null,
        staffId: form.staffId || null,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        role: form.role,
        hourlyRate: form.hourlyRate,
      })

      if (!res?.upsertShift?.success) {
        throw new Error(res?.upsertShift?.error || 'Unable to save shift')
      }

      setActionError(null)
      setDialogOpen(false)
      fetchShifts()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to save shift')
      console.error('Error saving shift:', err)
    }
  }

  const updateShiftAction = async (id: string, action: 'cancel' | 'no_show' | 'start' | 'complete') => {
    try {
      const res: any = await request('/api/graphql', UPDATE_SHIFT_STATUS, { shiftId: id, action })
      if (!res?.updateShiftStatus?.success) {
        throw new Error(res?.updateShiftStatus?.error || 'Unable to update shift')
      }
      setActionError(null)
      fetchShifts()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to update shift')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Cancel this shift?')) return
    await updateShiftAction(id, 'cancel')
  }

  const getShiftsForDate = (date: Date): Shift[] => {
    return shifts.filter(s => {
      const shiftDate = new Date(s.startTime).toDateString()
      return shiftDate === date.toDateString()
    })
  }

  const getRoleConfig = (role: string) => ROLES.find(r => r.value === role) || ROLES[0]

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Staff' },
    { type: 'page' as const, label: 'Schedule' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {actionError ? (
        <div className="mx-6 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {actionError}
        </div>
      ) : null}

      {/* Header */}
      <div className="px-6 py-6 border-b bg-gradient-to-br from-indigo-500/5 via-background to-blue-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-1">Staff Roster</h1>
            <p className="text-muted-foreground font-medium">Manage shifts, roles, and labor distribution</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 bg-card border-2 rounded-2xl p-1 shadow-sm">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigateWeek(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" className="h-9 px-4 rounded-xl font-black uppercase tracking-widest text-[10px]" onClick={() => setWeekStart(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())))}>
                  Current Week
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigateWeek(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
             </div>
             <Button onClick={() => openAddDialog()} className="h-11 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 dark:shadow-none font-black uppercase tracking-widest text-xs">
                <Plus className="h-4 w-4 mr-2" />
                Assign Shift
             </Button>
          </div>
        </div>

        {/* Date Range Label */}
        <div className="flex items-center gap-2 mb-2">
           <CalendarIcon className="size-4 text-indigo-600 dark:text-indigo-400" />
           <span className="text-sm font-black uppercase tracking-widest">
             {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
           </span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-7 h-full gap-4 min-w-[1000px]">
          {weekDates.map((date, i) => {
            const dayShifts = getShiftsForDate(date)
            const isToday = date.toDateString() === new Date().toDateString()
            return (
              <div key={i} className="flex flex-col h-full gap-4">
                <div className={cn(
                  "flex flex-col items-center py-4 rounded-3xl border-2 transition-all",
                  isToday ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-100 dark:shadow-none" : "bg-card text-foreground"
                )}>
                  <span className={cn("text-[10px] font-black uppercase tracking-widest mb-1", isToday ? "text-white/80" : "text-muted-foreground")}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="text-2xl font-black tracking-tighter">
                    {date.getDate()}
                  </span>
                </div>

                <div className={cn(
                  "flex-1 rounded-[2rem] border-2 bg-muted/20 p-2 overflow-hidden flex flex-col group/col",
                  isToday ? "border-indigo-100 dark:border-indigo-900/30" : "border-transparent"
                )}>
                  <ScrollArea className="flex-1 px-1">
                    <div className="space-y-3 pt-2">
                      {dayShifts.map((shift) => {
                        const roleConfig = getRoleConfig(shift.role)
                        return (
                          <Card 
                            key={shift.id}
                            className="border-2 rounded-2xl hover:border-indigo-500/50 transition-all cursor-pointer shadow-sm group/shift"
                            onClick={() => openEditDialog(shift)}
                          >
                            <CardContent className="p-3 space-y-2">
                               <div className="flex items-center gap-2">
                                  <div className={cn("size-2 rounded-full", roleConfig.color)} />
                                  <span className="text-xs font-black truncate">{shift.staff?.name || 'Unassigned'}</span>
                               </div>
                               
                               <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  <Timer className="size-3" />
                                  <span>{formatTime(shift.startTime)}</span>
                               </div>

                               <div className="flex items-center justify-between gap-2">
                                  <Badge className={cn("rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-none", roleConfig.bg, roleConfig.text)}>
                                    {roleConfig.label}
                                  </Badge>
                                  <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">
                                    {shift.status.replace('_', ' ')}
                                  </Badge>
                               </div>

                               <div className="grid grid-cols-2 gap-1 pt-1 opacity-0 transition-opacity group-hover/shift:opacity-100">
                                  {shift.status === 'scheduled' ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 rounded-xl text-[10px] font-bold"
                                      onClick={(e) => { e.stopPropagation(); updateShiftAction(shift.id, 'start') }}
                                    >
                                      Start
                                    </Button>
                                  ) : null}
                                  {shift.status === 'started' ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 rounded-xl text-[10px] font-bold"
                                      onClick={(e) => { e.stopPropagation(); updateShiftAction(shift.id, 'complete') }}
                                    >
                                      Complete
                                    </Button>
                                  ) : null}
                                  {shift.status === 'scheduled' ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 rounded-xl text-[10px] font-bold text-orange-600 hover:text-orange-700"
                                      onClick={(e) => { e.stopPropagation(); updateShiftAction(shift.id, 'no_show') }}
                                    >
                                      No-show
                                    </Button>
                                  ) : null}
                               </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                      <Button
                        variant="ghost"
                        className="w-full rounded-2xl border-2 border-dashed border-muted-foreground/10 hover:border-indigo-500/30 hover:bg-indigo-50/50 text-muted-foreground hover:text-indigo-600 transition-all py-8 flex flex-col gap-2"
                        onClick={() => openAddDialog(date)}
                      >
                        <UserPlus className="size-5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Add Shift</span>
                      </Button>
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-[2.5rem] p-8 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
               <Briefcase className="size-6 text-indigo-600" />
               {editingShift ? 'Modify Shift' : 'Assign New Shift'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Personnel</Label>
              <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
                <SelectTrigger className="h-12 rounded-2xl border-2 font-bold">
                  <SelectValue placeholder="Select Staff Member" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="rounded-xl font-medium">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Functional Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="h-12 rounded-2xl border-2 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="rounded-xl font-medium">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Shift Date</Label>
              <Input
                type="date"
                className="h-12 rounded-2xl border-2 font-bold"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Clock In</Label>
                <Input
                  type="time"
                  className="h-12 rounded-2xl border-2 font-bold"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Clock Out</Label>
                <Input
                  type="time"
                  className="h-12 rounded-2xl border-2 font-bold"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Hourly Compensation ($)</Label>
              <Input
                type="number"
                step="0.01"
                className="h-12 rounded-2xl border-2 font-bold"
                value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-500/20">
                {editingShift ? 'Save Changes' : 'Confirm Assignment'}
              </Button>
              {editingShift && (
                <Button variant="outline" size="icon" className="h-14 w-14 rounded-2xl border-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => { handleDelete(editingShift.id); setDialogOpen(false); }}>
                  <XCircle className="size-5" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default SchedulePage

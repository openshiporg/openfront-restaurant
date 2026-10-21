'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { DollarSign, Clock, Users, TrendingUp, RefreshCw, ArrowRight, Activity, Wallet } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { cn } from '@/lib/utils'
import { PlatformDatePicker } from '@/features/platform/components/PlatformDatePicker'
import { formatCurrency } from "../lib/reportHelpers"
import { toMinorUnits } from "@/features/storefront/lib/currency"

interface LaborShift {
  id: string
  staff: { id: string; name: string } | null
  startTime: string
  endTime: string
  clockIn: string | null
  clockOut: string | null
  role: string
  status: string
  hourlyRate: string | null
  hoursWorked: number | null
  laborCost: number | null
}

interface TipPoolDistribution {
  staffId?: string
  staffName?: string
  role?: string
  hoursWorked?: number
  amount?: number
}

interface TipPool {
  id: string
  date: string
  status: string
  distributions: TipPoolDistribution[] | null
}

const GET_LABOR_DATA = gql`
  query GetLaborData($startDate: DateTime!, $endDate: DateTime!, $fromDate:String!, $toDate:String!) {
    restaurantAttendance(fromDate:$fromDate,toDate:$toDate,skip:0,take:200)
    tipPools(
      where: {
        date: { gte: $startDate, lte: $endDate }
        status: { in: ["calculated", "distributed"] }
      }
      orderBy: { date: desc }
    ) {
      id date status distributions
    }
    restaurantOrders(
      where: {
        status: { equals: "completed" }
        createdAt: { gte: $startDate, lte: $endDate }
      }
    ) {
      id total createdAt
    }
    storeSettings { currencyCode locale timezone }
  }
`

const ROLES = [
  { value: 'all', label: 'All Roles' },
  { value: 'server', label: 'Server' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'host', label: 'Host' },
  { value: 'busser', label: 'Busser' },
  { value: 'cook', label: 'Cook' },
  { value: 'dishwasher', label: 'Dishwasher' },
  { value: 'manager', label: 'Manager' },
]

export function LaborReportPage() {
  const [entries, setEntries] = useState<LaborShift[]>([])
  const [tipPools, setTipPools] = useState<TipPool[]>([])
  const [totalSales, setTotalSales] = useState(0)
  const [loading, setLoading] = useState(true)
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  })
  const [roleFilter, setRoleFilter] = useState('all')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      // Fetch a timezone-independent envelope, then apply venue calendar dates.
      const startDate = new Date(Date.parse(dateRange.start + 'T00:00:00Z') - 2 * 86400000)
      const endDate = new Date(Date.parse(dateRange.end + 'T00:00:00Z') + 3 * 86400000)
      const data = await request('/api/graphql', GET_LABOR_DATA, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        fromDate: dateRange.start, toDate: dateRange.end,
      })
      const attendance = (data as any).restaurantAttendance;
      const actualEntries = [...attendance.entries]; let offset = 200; let more = attendance.hasMore;
      while (more) {
        const response: any = await request('/api/graphql', `query($fromDate:String!,$toDate:String!,$skip:Int!){restaurantAttendance(fromDate:$fromDate,toDate:$toDate,skip:$skip,take:200)}`, { fromDate: dateRange.start, toDate: dateRange.end, skip: offset });
        actualEntries.push(...response.restaurantAttendance.entries); more = response.restaurantAttendance.hasMore; offset += 200;
      }
      const inRange = (value: string) => new Date(value).getTime() >= Date.parse(attendance.windowStart) && new Date(value).getTime() < Date.parse(attendance.windowEnd);
      setEntries(actualEntries.map((entry: any) => ({ ...entry, startTime: entry.clockIn, endTime: entry.clockOut, status: entry.clockOut ? 'completed' : 'started', hoursWorked: entry.paidHours, laborCost: entry.paidHours * Number(entry.hourlyRate || 0) })));
      setTipPools(((data as any).tipPools || []).filter((pool: any) => String(pool.date).slice(0, 10) >= dateRange.start && String(pool.date).slice(0, 10) <= dateRange.end))
      const orders = ((data as any).restaurantOrders || []).filter((order: any) => inRange(order.createdAt))
      setTotalSales(orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0))
      if ((data as any).storeSettings) {
        setCurrencyConfig({
          currencyCode: (data as any).storeSettings.currencyCode || 'USD',
          locale: (data as any).storeSettings.locale || 'en-US',
        })
      }
    } catch (err) {
      console.error('Error fetching labor data:', err)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredEntries = roleFilter === 'all'
    ? entries
    : entries.filter((e) => e.role === roleFilter)

  const distributedTipsByStaff = new Map<string, number>()
  tipPools.forEach((pool) => {
    ;(pool.distributions || []).forEach((distribution) => {
      if (!distribution.staffId) return
      const amountCents = Math.round(Number(distribution.amount || 0))
      distributedTipsByStaff.set(distribution.staffId, (distributedTipsByStaff.get(distribution.staffId) || 0) + amountCents)
    })
  })

  const staffHours = new Map<string, number>()
  entries.forEach((entry) => {
    if (!entry.staff?.id) return
    staffHours.set(entry.staff.id, (staffHours.get(entry.staff.id) || 0) + (entry.hoursWorked || 0))
  })

  const getTipCentsForEntry = (entry: LaborShift) => {
    if (!entry.staff?.id) return 0
    const staffTipCents = distributedTipsByStaff.get(entry.staff.id) || 0
    const hours = staffHours.get(entry.staff.id) || 0
    if (hours <= 0) return 0
    return Math.round(staffTipCents * ((entry.hoursWorked || 0) / hours))
  }

  const totalHours = filteredEntries.reduce((s, e) => s + (e.hoursWorked || 0), 0)
  const totalLaborCostCents = filteredEntries.reduce((s, e) => s + toMinorUnits(e.laborCost || 0, currencyConfig.currencyCode), 0)
  const totalTips = Array.from(distributedTipsByStaff.values()).reduce((s, amount) => s + amount, 0)
  const laborPercentage = totalSales > 0 ? (totalLaborCostCents / totalSales) * 100 : 0
  const salesPerLaborHour = totalHours > 0 ? totalSales / totalHours : 0

  const roleBreakdown = ROLES.filter((r) => r.value !== 'all').map((role) => {
    const roleEntries = entries.filter((e) => e.role === role.value)
    return {
      role: role.label,
      hours: roleEntries.reduce((s, e) => s + (e.hoursWorked || 0), 0),
      cost: roleEntries.reduce((s, e) => s + toMinorUnits(e.laborCost || 0, currencyConfig.currencyCode), 0),
      staff: new Set(roleEntries.map((e) => e.staff?.id).filter(Boolean)).size,
    }
  }).filter((r) => r.hours > 0).sort((a, b) => b.cost - a.cost)

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'link' as const, label: 'Reports', href: '/platform/reports' },
    { type: 'page' as const, label: 'Labor' },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Labor Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Recorded attendance by restaurant business date and estimated labor cost. Employee attestation and manager approval are shown in Time Clock. Tip amounts include pending allocations.
          </p>
        </div>
        {/* Date + role controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <PlatformDatePicker
              value={new Date(dateRange.start + 'T12:00:00')}
              onChange={(d) => d && setDateRange({ ...dateRange, start: d.toISOString().slice(0, 10) })}
              shortFormat
            />
            <ArrowRight size={11} className="text-muted-foreground shrink-0" />
            <PlatformDatePicker
              value={new Date(dateRange.end + 'T12:00:00')}
              onChange={(d) => d && setDateRange({ ...dateRange, end: d.toISOString().slice(0, 10) })}
              shortFormat
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 divide-x border-b border-border shrink-0">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Hours</p>
          <p className="text-xl font-semibold mt-1 tabular-nums">
            {loading ? '—' : totalHours.toFixed(1)}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Payroll Cost</p>
          <p className="text-xl font-semibold mt-1">
            {loading ? '—' : formatCurrency(totalLaborCostCents, currencyConfig)}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Labor %</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn(
              "text-xl font-semibold tabular-nums",
              !loading && laborPercentage > 30 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
            )}>
              {loading ? '—' : `${laborPercentage.toFixed(1)}%`}
            </p>
            <span className="text-[11px] text-muted-foreground">tgt 28%</span>
          </div>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sales / Labor Hr</p>
          <p className="text-xl font-semibold mt-1">
            {loading ? '—' : formatCurrency(salesPerLaborHour, currencyConfig)}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tips Pool</p>
          <p className="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">
            {loading ? '—' : formatCurrency(totalTips, currencyConfig)}
          </p>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-4 gap-6 p-4 md:p-6 overflow-auto">

          {/* Time entry table */}
          <div className="lg:col-span-3 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
              <Clock size={13} className="text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
                Shift Labor Audit
              </p>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {filteredEntries.length} record{filteredEntries.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider h-10 text-muted-foreground font-semibold">Staff</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider h-10 text-muted-foreground font-semibold">Role</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider h-10 text-muted-foreground font-semibold">Scheduled</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider h-10 text-muted-foreground font-semibold">Status</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider h-10 text-muted-foreground font-semibold text-right">Hours</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider h-10 text-muted-foreground font-semibold text-right">Labor Cost</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider h-10 text-muted-foreground font-semibold text-right">Tips</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                        No shifts for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => (
                      <TableRow key={entry.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="font-medium text-sm py-3">
                          {entry.staff?.name || 'Unassigned'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium">
                            {entry.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(entry.startTime).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "text-[9px] uppercase tracking-wider font-semibold border-none",
                            entry.status === 'completed' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' :
                            entry.status === 'started' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' :
                            entry.status === 'no_show' || entry.status === 'called_out' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' :
                            'bg-muted text-muted-foreground'
                          )}>
                            {entry.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {entry.hoursWorked?.toFixed(1) || '0.0'}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm tabular-nums">
                          {formatCurrency(toMinorUnits(entry.laborCost || 0, currencyConfig.currencyCode), currencyConfig)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatCurrency(getTipCentsForEntry(entry), currencyConfig)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {/* Role breakdown sidebar */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
              <div className="px-5 py-3 bg-muted/20 flex items-center gap-2">
                <Users size={13} className="text-muted-foreground" />
                <p className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
                  By Role
                </p>
              </div>
              {roleBreakdown.length === 0 ? (
                <div className="px-5 py-6 text-xs text-muted-foreground text-center">
                  No data for this period.
                </div>
              ) : (
                roleBreakdown.map((r) => {
                  const pct = totalLaborCostCents > 0 ? (r.cost / totalLaborCostCents) * 100 : 0
                  return (
                    <div key={r.role} className="px-5 py-3.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold uppercase tracking-wider">{r.role}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{pct.toFixed(0)}%</p>
                      </div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <p className="text-sm font-semibold">{formatCurrency(r.cost, currencyConfig)}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{r.hours.toFixed(1)} hrs</p>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground/50 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {r.staff} active staff
                      </p>
                    </div>
                  )
                })
              )}
            </div>

            {/* Optimization note */}
            <div className="rounded-lg border border-border bg-card px-5 py-4">
              <p className="text-xs font-semibold mb-1.5">Optimization</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Labor cost is currently{' '}
                <span className={cn(
                  "font-semibold",
                  laborPercentage > 30 ? "text-amber-600" : "text-emerald-600"
                )}>
                  {laborPercentage > 30 ? 'above' : 'within'}
                </span>{' '}
                the 28% target. Consider shifting prep work to off-peak hours to reduce kitchen overtime.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

export default LaborReportPage

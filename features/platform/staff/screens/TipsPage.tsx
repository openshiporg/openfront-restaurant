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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DollarSign, Plus, Users, RefreshCw, Calculator, Wallet, ArrowRight, CheckCircle2, History, Banknote, Landmark, CreditCard } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { cn } from '@/lib/utils'
import { formatCurrency, toMinorUnits } from '@/features/storefront/lib/currency'
import { calculateTipDistributions } from '@/features/lib/tip-allocation'

interface TipPool {
  id: string
  date: string
  tipPoolType: string
  totalTips: string
  cashTips: string
  creditTips: string
  distributions: Distribution[] | null
  status: string
}

interface Distribution {
  staffId: string
  staffName: string
  role: string
  hoursWorked: number
  amount: number
}

interface CompletedShift {
  id: string
  staff: { id: string; name: string } | null
  role: string
  hoursWorked: number
}

const GET_TIP_POOLS = gql`
  query GetTipPools {
    tipPools(orderBy: { date: desc }, take: 30) {
      id
      date
      tipPoolType
      totalTips
      cashTips
      creditTips
      distributions
      status
    }
    storeSettings {
      currencyCode
      locale
    }
  }
`

const GET_COMPLETED_SHIFTS_FOR_DATE = gql`
  query GetCompletedShiftsForDate($startDate: DateTime!, $endDate: DateTime!) {
    shifts(
      where: {
        status: { equals: "completed" }
        clockIn: { gte: $startDate, lte: $endDate }
      }
    ) {
      id
      staff { id name }
      role
      hoursWorked
    }
  }
`

const CREATE_TIP_POOL = gql`
  mutation CreateTipPoolLedger($date: String!, $tipPoolType: String!, $cashTips: String!, $creditTips: String!) {
    createTipPoolLedger(date: $date, tipPoolType: $tipPoolType, cashTips: $cashTips, creditTips: $creditTips) { success error }
  }
`

const UPDATE_TIP_POOL = gql`
  mutation UpdateTipPoolStatus($tipPoolId: ID!, $action: String!) {
    updateTipPoolStatus(tipPoolId: $tipPoolId, action: $action) { success error }
  }
`

const TIP_POOL_TYPES = [
  { value: 'individual', label: 'Individual (Non-pooled)' },
  { value: 'pool_by_role', label: 'Pool by Role (Weighted)' },
  { value: 'house_pool', label: 'House Pool (Pro-rated by Hours)' },
]

export function TipsPage() {
  const [tipPools, setTipPools] = useState<TipPool[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [calculatedDistributions, setCalculatedDistributions] = useState<Distribution[]>([])
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })
  const [actionError, setActionError] = useState<string | null>(null)

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    tipPoolType: 'pool_by_role',
    cashTips: '0',
    creditTips: '0',
  })

  const fetchTipPools = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_TIP_POOLS)
      setTipPools((data as any).tipPools || [])
      if ((data as any).storeSettings) {
        setCurrencyConfig({
          currencyCode: (data as any).storeSettings.currencyCode || 'USD',
          locale: (data as any).storeSettings.locale || 'en-US'
        })
      }
    } catch (err) {
      console.error('Error fetching tip pools:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTipPools()
  }, [fetchTipPools])

  const calculateDistributions = async () => {
    const totalTips = parseFloat(form.cashTips || '0') + parseFloat(form.creditTips || '0')
    if (totalTips <= 0 || form.tipPoolType === 'individual') {
      setCalculatedDistributions([])
      return
    }

    try {
      const startDate = new Date(form.date)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(form.date)
      endDate.setHours(23, 59, 59, 999)

      const data = await request('/api/graphql', GET_COMPLETED_SHIFTS_FOR_DATE, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
      const entries = ((data as any).shifts || []) as CompletedShift[]
      const distributions = calculateTipDistributions(
        form.tipPoolType as 'house_pool' | 'pool_by_role',
        toMinorUnits(totalTips, currencyConfig.currencyCode),
        entries.map((entry) => ({
          staffId: entry.staff?.id || '',
          staffName: entry.staff?.name || '',
          role: entry.role || '',
          hoursWorked: Number(entry.hoursWorked || 0),
        }))
      )
      setCalculatedDistributions(distributions)
    } catch (err) {
      console.error('Error calculating distributions:', err)
    }
  }

  useEffect(() => {
    if (dialogOpen) {
      calculateDistributions()
    }
  }, [form.cashTips, form.creditTips, form.tipPoolType, form.date, dialogOpen])

  const handleCreate = async () => {
    try {
      const res: any = await request('/api/graphql', CREATE_TIP_POOL, {
        date: new Date(form.date).toISOString(),
        tipPoolType: form.tipPoolType,
        cashTips: form.cashTips || '0',
        creditTips: form.creditTips || '0',
      })
      if (!res?.createTipPoolLedger?.success) {
        throw new Error(res?.createTipPoolLedger?.error || 'Unable to create tip pool')
      }
      setActionError(null)
      setDialogOpen(false)
      fetchTipPools()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to create tip pool')
      console.error('Error creating tip pool:', err)
    }
  }

  const markDistributed = async (id: string) => {
    try {
      const res: any = await request('/api/graphql', UPDATE_TIP_POOL, {
        tipPoolId: id,
        action: 'distribute',
      })
      if (!res?.updateTipPoolStatus?.success) {
        throw new Error(res?.updateTipPoolStatus?.error || 'Unable to distribute tip pool')
      }
      setActionError(null)
      fetchTipPools()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to distribute tip pool')
      console.error('Error updating:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalDistributed = tipPools.filter(t => t.status === 'distributed').reduce((s, t) => s + Number(t.totalTips || 0), 0)
  const pendingCount = tipPools.filter(t => t.status === 'calculated').length

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Staff' },
    { type: 'page' as const, label: 'Tips' }
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {actionError ? (
        <div className="mx-6 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {actionError}
        </div>
      ) : null}

      {/* Header */}
      <div className="px-6 py-6 border-b bg-gradient-to-br from-emerald-500/5 via-background to-emerald-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-3">
              <Landmark className="size-8 text-emerald-600 dark:text-emerald-400" />
              Tip Hub
            </h1>
            <p className="text-muted-foreground font-medium">Daily tip pooling and recorded distribution status</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} size="lg" className="h-12 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 font-black uppercase tracking-widest text-xs transition-all active:scale-95">
            <Plus className="h-5 w-5 mr-2" />
            Process Daily Tips
          </Button>
        </div>

        {/* Financial Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-2 rounded-[1.5rem] bg-card shadow-sm border-emerald-500/20">
            <CardContent className="p-6 flex items-center gap-5">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10">
                <Banknote className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">30-Day Distribution</div>
                <div className="text-3xl font-black mt-1">{formatCurrency(totalDistributed, currencyConfig)}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 rounded-[1.5rem] bg-card shadow-sm">
            <CardContent className="p-6 flex items-center gap-5">
              <div className="p-3.5 rounded-2xl bg-blue-500/10">
                <History className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recorded Batches</div>
                <div className="text-3xl font-black mt-1">{tipPools.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card className={cn(
            "border-2 rounded-[1.5rem] bg-card shadow-sm transition-colors",
            pendingCount > 0 ? "border-amber-500/30 bg-amber-50/10 dark:bg-amber-950/10" : ""
          )}>
            <CardContent className="p-6 flex items-center gap-5">
              <div className={cn("p-3.5 rounded-2xl", pendingCount > 0 ? "bg-amber-500/20" : "bg-zinc-100 dark:bg-zinc-800")}>
                <Calculator className={cn("h-7 w-7", pendingCount > 0 ? "text-amber-600" : "text-muted-foreground")} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pending Payouts</div>
                <div className={cn("text-3xl font-black mt-1", pendingCount > 0 ? "text-amber-600" : "")}>{pendingCount}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* List Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 pb-20 space-y-6">
          <div className="flex items-center justify-between">
             <h2 className="text-xl font-black uppercase tracking-tight">Ledger History</h2>
             <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-xl border-2 font-bold px-4 h-9">
                   Export CSV
                </Button>
             </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
             {tipPools.length === 0 ? (
               <div className="py-24 text-center flex flex-col items-center border-2 border-dashed rounded-[2.5rem] bg-muted/20">
                 <Wallet className="size-16 text-muted-foreground opacity-10 mb-6" />
                 <h3 className="text-xl font-bold uppercase tracking-tight">No Transactions Recorded</h3>
                 <p className="text-muted-foreground max-w-xs mx-auto mt-2">Process your first end-of-shift tip pool to start tracking employee earnings.</p>
               </div>
             ) : (
               tipPools.map((pool) => (
                 <Card key={pool.id} className="border-2 rounded-[2rem] overflow-hidden hover:border-emerald-500/30 transition-all shadow-sm group">
                    <CardContent className="p-0 flex flex-col md:flex-row md:items-center">
                       {/* Date Strip */}
                       <div className="bg-muted/30 px-8 py-6 md:w-48 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r-2 border-dashed">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Date</span>
                          <span className="text-lg font-black">{new Date(pool.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                          <span className="text-xs font-bold text-muted-foreground">{new Date(pool.date).getFullYear()}</span>
                       </div>

                       {/* Main Stats */}
                       <div className="flex-1 p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Pool Methodology</div>
                             <Badge variant="outline" className="rounded-lg font-bold border-2 text-[10px] uppercase px-2 py-0">
                               {TIP_POOL_TYPES.find(t => t.value === pool.tipPoolType)?.label.split(' ')[0]}
                             </Badge>
                          </div>
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cash Intake</div>
                             <div className="font-bold text-sm text-amber-600 dark:text-amber-400">{formatCurrency(Number(pool.cashTips || 0), currencyConfig)}</div>
                          </div>
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Digital Intake</div>
                             <div className="font-bold text-sm text-blue-600 dark:text-blue-400">{formatCurrency(Number(pool.creditTips || 0), currencyConfig)}</div>
                          </div>
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Pool</div>
                             <div className="font-black text-lg">{formatCurrency(Number(pool.totalTips || 0), currencyConfig)}</div>
                          </div>
                       </div>

                       {/* Status & Actions */}
                       <div className="p-6 md:w-64 bg-muted/10 flex flex-col items-center justify-center gap-3">
                          <Badge className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border-none shadow-sm",
                            pool.status === 'distributed' ? "bg-emerald-500/20 text-emerald-600" : "bg-amber-50/20 text-amber-600"
                          )}>
                             {pool.status}
                          </Badge>
                          <div className="text-[9px] font-bold text-muted-foreground">{pool.distributions?.length || 0} Staff Members</div>
                          
                          {pool.status === 'calculated' && (
                             <Button size="sm" onClick={() => markDistributed(pool.id)} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-[10px] uppercase tracking-widest h-9">
                                Mark Distributed
                             </Button>
                          )}
                       </div>
                    </CardContent>
                 </Card>
               ))
             )}
          </div>
        </div>
      </ScrollArea>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-[2.5rem] p-8 max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Calculator className="size-6 text-emerald-600" />
              Daily Tip Reconciliation
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-8 pt-4 pb-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Business Date</Label>
                  <Input
                    type="date"
                    className="h-12 rounded-2xl border-2 font-bold"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Pooling Type</Label>
                  <Select value={form.tipPoolType} onValueChange={(v) => setForm({ ...form, tipPoolType: v })}>
                    <SelectTrigger className="h-12 rounded-2xl border-2 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {TIP_POOL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="font-medium rounded-lg">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cash Tips ($)</Label>
                  <div className="relative">
                     <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                     <Input
                        type="number"
                        step="0.01"
                        className="h-12 rounded-2xl border-2 pl-12 font-bold text-lg"
                        value={form.cashTips}
                        onChange={(e) => setForm({ ...form, cashTips: e.target.value })}
                      />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Credit Card Tips ($)</Label>
                  <div className="relative">
                     <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                     <Input
                        type="number"
                        step="0.01"
                        className="h-12 rounded-2xl border-2 pl-12 font-bold text-lg"
                        value={form.creditTips}
                        onChange={(e) => setForm({ ...form, creditTips: e.target.value })}
                      />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-muted/40 rounded-[2rem] border-2 border-dashed flex justify-between items-center">
                <span className="text-sm font-black uppercase tracking-widest opacity-60">Calculated Pool</span>
                <span className="text-4xl font-black tracking-tighter">
                  {formatCurrency(parseFloat(form.cashTips || '0') + parseFloat(form.creditTips || '0'), currencyConfig, { inputIsCents: false })}
                </span>
              </div>

              {calculatedDistributions.length > 0 && (
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Proposed Distribution</Label>
                  <div className="rounded-3xl border-2 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-10">Personnel</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-10">Role</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-10 text-right">Hours</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-10 text-right">Payout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculatedDistributions.map((d, i) => (
                          <TableRow key={i} className="hover:bg-muted/10 transition-colors">
                            <TableCell className="font-bold text-xs py-3">{d.staffName}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[9px] font-bold uppercase rounded-md h-5">{d.role}</Badge></TableCell>
                            <TableCell className="text-right text-xs font-mono">{d.hoursWorked?.toFixed(1) || '-'}</TableCell>
                            <TableCell className="text-right font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(d.amount, currencyConfig)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="pt-6 border-t mt-auto">
             <Button onClick={handleCreate} className="w-full h-14 rounded-2xl text-base font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20">
               Confirm Distribution Record
             </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TipsPage

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
import { Plus, Trash2, Package, Truck, RefreshCw, FileText, Send, CheckCircle2, XCircle, ChevronRight, Search, X } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { PlatformDatePicker } from '@/features/platform/components/PlatformDatePicker'
import { formatCurrency } from '@/features/storefront/lib/currency'
import { PurchaseEvidenceDialog } from '../components/PurchaseEvidenceDialog'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'

interface PurchaseOrder {
  id: string
  poNumber: string
  vendor: { id: string; name: string } | null
  orderDate: string
  expectedDelivery: string | null
  receivedDate: string | null
  status: string
  lineItems: LineItem[] | null
  totalCost: number | null
  notes: string | null
}

interface LineItem {
  ingredientId: string
  ingredientName: string
  quantity: number
  unit: string
  unitCost: number
  totalCost: number
}

interface Vendor {
  id: string
  name: string
}

interface Ingredient {
  id: string
  name: string
  unit: string
  costPerUnit: string | null
}

const STATUS_CONFIG: Record<string, { dot: string; text: string; label: string }> = {
  draft:     { dot: 'bg-zinc-400',    text: 'text-zinc-500',    label: 'Draft' },
  sent:      { dot: 'bg-blue-500',    text: 'text-blue-600',    label: 'Sent' },
  confirmed: { dot: 'bg-indigo-500',  text: 'text-indigo-600',  label: 'Confirmed' },
  shipped:   { dot: 'bg-purple-500',  text: 'text-purple-600',  label: 'Shipped' },
  partially_received: { dot: 'bg-amber-500', text: 'text-amber-600', label: 'Partially received' },
  received:  { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Received' },
  cancelled: { dot: 'bg-red-400',     text: 'text-red-500',     label: 'Cancelled' },
}

const GET_PO_DATA = gql`
  query GetPOData {
    purchaseOrders(orderBy: { orderDate: desc }, take: 50) {
      id poNumber vendor { id name }
      orderDate expectedDelivery receivedDate
      status lineItems totalCost notes
    }
    vendors(orderBy: { name: asc }) { id name }
    ingredients(orderBy: { name: asc }) { id name unit costPerUnit }
    storeSettings { currencyCode locale }
  }
`

const CREATE_PO = gql`
  mutation CreatePO($data: PurchaseOrderCreateInput!) {
    createPurchaseOrder(data: $data) { id }
  }
`

const UPDATE_PO = gql`
  mutation UpdatePO($id: ID!, $data: PurchaseOrderUpdateInput!) {
    updatePurchaseOrder(where: { id: $id }, data: $data) { id }
  }
`

const DELETE_PO = gql`
  mutation DeletePO($id: ID!) {
    deletePurchaseOrder(where: { id: $id }) { id }
  }
`

function generatePONumber(): string {
  return `PO-${Date.now().toString().slice(-8)}`
}

export function PurchaseOrdersPage() {
  const [evidenceOrderId, setEvidenceOrderId] = useState<string | null>(null)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })

  const [form, setForm] = useState({
    vendorId: '',
    expectedDelivery: '',
    notes: '',
    lineItems: [] as LineItem[],
  })

  const fetchData = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_PO_DATA)
      setOrders((data as any).purchaseOrders || [])
      setVendors((data as any).vendors || [])
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

  const resetForm = () => {
    setForm({ vendorId: '', expectedDelivery: '', notes: '', lineItems: [] })
    setEditingPO(null)
  }

  const openDialog = (po?: PurchaseOrder) => {
    if (po && po.status !== 'draft') { setEvidenceOrderId(po.id); return }
    if (po) {
      setEditingPO(po)
      setForm({
        vendorId: po.vendor?.id || '',
        expectedDelivery: po.expectedDelivery?.slice(0, 10) || '',
        notes: po.notes || '',
        lineItems: po.lineItems || [],
      })
    } else {
      resetForm()
    }
    setDialogOpen(true)
  }

  const addLineItem = () => {
    setForm({ ...form, lineItems: [...form.lineItems, { ingredientId: '', ingredientName: '', quantity: 1, unit: '', unitCost: 0, totalCost: 0 }] })
  }

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...form.lineItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === 'ingredientId') {
      const ing = ingredients.find(i => i.id === value)
      if (ing) {
        updated[index].ingredientName = ing.name
        updated[index].unit = ing.unit
        updated[index].unitCost = parseFloat(ing.costPerUnit || '0')
      }
    }
    if (field === 'quantity' || field === 'unitCost' || field === 'ingredientId') {
      updated[index].totalCost = updated[index].quantity * updated[index].unitCost
    }
    setForm({ ...form, lineItems: updated })
  }

  const removeLineItem = (index: number) => {
    const updated = [...form.lineItems]
    updated.splice(index, 1)
    setForm({ ...form, lineItems: updated })
  }

  const handleSave = async () => {
    try {
      const data: any = { lineItems: form.lineItems, notes: form.notes || null }
      if (form.vendorId) data.vendor = { connect: { id: form.vendorId } }
      if (form.expectedDelivery) data.expectedDelivery = new Date(form.expectedDelivery).toISOString()
      if (editingPO) {
        await request('/api/graphql', UPDATE_PO, { id: editingPO.id, data })
      } else {
        data.poNumber = generatePONumber()
        await request('/api/graphql', CREATE_PO, { data })
      }
      setDialogOpen(false)
      resetForm()
      fetchData()
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const [actionError, setActionError] = useState('')
  const updateStatus = async (id: string, status: string) => {
    try {
      if (status === 'received') {
        setEvidenceOrderId(id); return
      } else await request('/api/graphql', 'mutation($id:ID!,$status:String!){transitionPurchaseOrder(id:$id,status:$status){id status}}', { id, status })
      setActionError(''); await fetchData()
    } catch (err: any) { setActionError(err.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this purchase order?')) return
    try {
      await request('/api/graphql', DELETE_PO, { id })
      fetchData()
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const formTotal = form.lineItems.reduce((s, li) => s + li.totalCost, 0)
  const pendingValue = orders.filter(o => !['received', 'cancelled'].includes(o.status)).reduce((s, o) => s + (o.totalCost || 0), 0)
  const receivedThisMonth = orders.filter(o => o.status === 'received' && new Date(o.receivedDate || '').getMonth() === new Date().getMonth()).length
  const filteredOrders = orders.filter(o => {
    const matchesStatus = activeFilter === 'all' || o.status === activeFilter
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q ||
      o.poNumber.toLowerCase().includes(q) ||
      (o.vendor?.name || '').toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })
  const statusCounts = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc }, {} as Record<string, number>)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs
        items={[
          { type: 'link', label: 'Dashboard', href: '' },
          { type: 'page', label: 'Platform' },
          { type: 'page', label: 'Purchase Orders' },
        ]}
      />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vendor order management and receiving workflow.</p>
        </div>
        <Button size="sm" onClick={() => openDialog()} className="h-8 text-xs">
          <Plus size={13} className="mr-1.5" /> New Purchase Order
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Orders</p>
          <p className="text-xl font-semibold mt-1">{orders.length}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Pending Value</p>
          <p className="text-xl font-semibold mt-1 text-amber-600 dark:text-amber-400">
            {formatCurrency(pendingValue, currencyConfig, { inputIsCents: false })}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Received This Month</p>
          <p className="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">{receivedThisMonth}</p>
        </div>
      </div>

      {/* Underline status tabs */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex items-end px-4 md:px-6 min-w-max">
          <button
            onClick={() => setActiveFilter('all')}
            className={cn(
              'px-3 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors flex items-center gap-2',
              activeFilter === 'all'
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            All
            <span className="rounded-sm bg-background border shadow-xs px-1.5 text-[10px] leading-[14px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 inline-flex items-center h-[18px]">
              {orders.length}
            </span>
          </button>
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = statusCounts[status] || 0
            return (
              <button
                key={status}
                onClick={() => setActiveFilter(status)}
                className={cn(
                  'px-3 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors flex items-center gap-2',
                  activeFilter === status
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                {cfg.label}
                <span className="rounded-sm bg-background border shadow-xs px-1.5 text-[10px] leading-[14px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 inline-flex items-center h-[18px]">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 px-4 md:px-6 border-b border-border">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search by PO number or vendor…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 h-11 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground/50 focus:ring-0"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Orders list */}
      <ScrollArea className="flex-1">
        {filteredOrders.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center px-8">
            <FileText size={28} className="text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {orders.length === 0 ? 'No purchase orders yet.' : `No orders with status "${STATUS_CONFIG[activeFilter]?.label}".`}
            </p>
            {orders.length === 0 && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openDialog()}>
                <Plus size={12} className="mr-1.5" /> Create First PO
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredOrders.map((po) => {
              const statusCfg = STATUS_CONFIG[po.status] || STATUS_CONFIG.draft
              return (
                <div
                  key={po.id}
                  className="px-4 md:px-6 py-4 hover:bg-muted/20 transition-colors flex items-start gap-4 group cursor-pointer"
                  onClick={() => openDialog(po)}
                >
                  {/* Status dot */}
                  <div className="pt-1.5 shrink-0">
                    <span className={cn('w-2.5 h-2.5 rounded-full inline-block', statusCfg.dot)} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono font-semibold">{po.poNumber}</p>
                          <span className={cn('text-[10px] uppercase tracking-wider font-semibold', statusCfg.text)}>
                            {statusCfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {po.vendor?.name || 'No vendor'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Ordered {new Date(po.orderDate).toLocaleDateString()}
                          </span>
                          {po.expectedDelivery && (
                            <span className="text-xs text-muted-foreground">
                              Expected {new Date(po.expectedDelivery).toLocaleDateString()}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {po.lineItems?.length || 0} item{(po.lineItems?.length || 0) !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm font-semibold">
                          {formatCurrency(po.totalCost || 0, currencyConfig, { inputIsCents: false })}
                        </p>
                        {/* Action buttons — stop propagation */}
                        <div
                          className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {po.status === 'draft' && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={() => updateStatus(po.id, 'sent')}>
                                <Send size={11} className="mr-1" /> Send
                              </Button>
                              <button
                                className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors text-muted-foreground"
                                onClick={() => handleDelete(po.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                          {['sent', 'confirmed', 'shipped', 'partially_received'].includes(po.status) && (
                            <><Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={() => { if (window.confirm('Cancel the unreceived remainder? Existing received stock and receipts remain recorded.')) updateStatus(po.id, 'cancelled') }}>Cancel remainder</Button>
                            <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => updateStatus(po.id, 'received')}>
                              <Package size={11} className="mr-1" /> Receive
                            </Button></>
                          )}
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {actionError && <p role="alert" className="text-destructive p-4">{actionError}</p>}
      {evidenceOrderId && <PurchaseEvidenceDialog orderId={evidenceOrderId} currencyCode={currencyConfig.currencyCode} onClose={() => setEvidenceOrderId(null)} onChanged={fetchData} />}
      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {editingPO ? `Edit ${editingPO.poNumber}` : 'New Purchase Order'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-5 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Vendor</Label>
                  <Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id} className="text-sm">{v.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Expected Delivery</Label>
                  <PlatformDatePicker
                    value={form.expectedDelivery ? new Date(form.expectedDelivery + 'T12:00:00') : undefined}
                    onChange={(d) => setForm({ ...form, expectedDelivery: d ? d.toISOString().slice(0, 10) : '' })}
                    placeholder="Select date"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="h-7 text-xs px-2">
                    <Plus size={12} className="mr-1" /> Add Item
                  </Button>
                </div>
                {form.lineItems.length === 0 ? (
                  <div className="py-6 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                    No items — click Add Item to begin
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.lineItems.map((li, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Select value={li.ingredientId} onValueChange={(v) => updateLineItem(idx, 'ingredientId', v)}>
                            <SelectTrigger className="flex-1 min-w-[140px] h-8 text-sm"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                            <SelectContent>{ingredients.map((ing) => <SelectItem key={ing.id} value={ing.id} className="text-sm">{ing.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input type="number" className="w-20 h-8 text-sm" value={li.quantity} onChange={(e) => updateLineItem(idx, 'quantity', parseFloat(e.target.value) || 0)} placeholder="Qty" />
                          <span className="text-xs font-medium w-12 text-center text-muted-foreground">{li.unit || '—'}</span>
                          <Input type="number" step="0.01" className="w-24 h-8 text-sm" value={li.unitCost} onChange={(e) => updateLineItem(idx, 'unitCost', parseFloat(e.target.value) || 0)} placeholder="Cost/unit" />
                          <span className="text-sm font-semibold w-20 text-right">{formatCurrency(li.totalCost, currencyConfig, { inputIsCents: false })}</span>
                          <button type="button" className="text-muted-foreground hover:text-red-600 transition-colors" onClick={() => removeLineItem(idx)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-border px-1">
                      <span className="text-sm font-semibold">Order Total</span>
                      <span className="text-lg font-semibold">{formatCurrency(formTotal, currencyConfig, { inputIsCents: false })}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes…" rows={3} className="text-sm resize-none" />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 h-9" onClick={handleSave}>
                  {editingPO ? 'Save Changes' : 'Create PO'}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PurchaseOrdersPage

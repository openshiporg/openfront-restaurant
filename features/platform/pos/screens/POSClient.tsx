'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Minus,
  X,
  ShoppingCart,
  AlertCircle,
  RefreshCw,
  Check,
  Utensils,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'

interface Table {
  id: string
  tableNumber: string
  capacity: number
  status: string
}

interface MenuCategory {
  id: string
  name: string
}

interface MenuModifier {
  id: string
  name: string
  modifierGroup: string
  modifierGroupLabel?: string | null
  required: boolean
  minSelections: number
  maxSelections: number
  priceAdjustment: string
  defaultSelected: boolean
}

interface MenuItem {
  id: string
  name: string
  price: string
  available: boolean
  thumbnail?: string | null
  category: { id: string; name: string } | null
  modifiers: MenuModifier[]
}

interface CartItem {
  menuItem: MenuItem
  quantity: number
  courseNumber: number
  modifierIds: string[]
  specialInstructions: string
}

const GET_DATA = gql`
  query GetPOSData {
    tables(where: { status: { in: ["available", "occupied"] } }, orderBy: { tableNumber: asc }) {
      id tableNumber capacity status
    }
    menuCategories(orderBy: { sortOrder: asc }) { id name }
    menuItems(orderBy: { name: asc }) {
      id name price available thumbnail
      category { id name }
      modifiers {
        id name modifierGroup modifierGroupLabel required
        minSelections maxSelections priceAdjustment defaultSelected
      }
    }
    storeSettings {
      taxRate
      currencyCode
      locale
    }
  }
`

const CREATE_POS_ORDER = gql`
  mutation CreatePOSOrder(
    $orderType: String!
    $guestCount: Int
    $tableIds: [ID!]
    $isUrgent: Boolean
    $specialInstructions: String
    $items: [POSOrderItemInput!]!
  ) {
    createPOSOrder(
      orderType: $orderType
      guestCount: $guestCount
      tableIds: $tableIds
      isUrgent: $isUrgent
      specialInstructions: $specialInstructions
      items: $items
    ) {
      id
      orderNumber
    }
  }
`

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    (cents || 0) / 100
  )
}

const courseColors = { 1: 'bg-amber-500', 2: 'bg-orange-500', 3: 'bg-rose-500' } as const
const courseLabels = { 1: 'C1', 2: 'C2', 3: 'C3' } as const

const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: '' },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Point of Sale' },
]

export function POSClient() {
  const [data, setData] = useState<{
    tables: Table[]
    categories: MenuCategory[]
    items: MenuItem[]
    storeSettings: { taxRate?: string | null; currencyCode?: string | null; locale?: string | null } | null
  }>({ tables: [], categories: [], items: [], storeSettings: null })

  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout'>('dine_in')
  const [guestCount, setGuestCount] = useState(1)
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [itemInstructions, setItemInstructions] = useState('')
  const [modifierError, setModifierError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const res: any = await request('/api/graphql', GET_DATA)
      setData({
        tables: res.tables || [],
        categories: res.menuCategories || [],
        items: res.menuItems || [],
        storeSettings: res.storeSettings || null,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const i = setInterval(fetchData, 30_000)
    return () => clearInterval(i)
  }, [])

  const appendConfiguredItem = (menuItem: MenuItem, modifierIds: string[], instructions = '') => {
    const signature = [...modifierIds].sort().join(':')
    const existing = cart.findIndex(
      (item) =>
        item.menuItem.id === menuItem.id &&
        item.courseNumber === 1 &&
        [...item.modifierIds].sort().join(':') === signature &&
        item.specialInstructions === instructions
    )
    if (existing >= 0) {
      const next = [...cart]
      next[existing].quantity += 1
      setCart(next)
    } else {
      setCart([...cart, {
        menuItem,
        quantity: 1,
        courseNumber: 1,
        modifierIds,
        specialInstructions: instructions,
      }])
    }
  }

  const addToCart = (menuItem: MenuItem) => {
    if (!menuItem.available) return
    if (!menuItem.modifiers?.length) {
      appendConfiguredItem(menuItem, [])
      return
    }
    setConfiguringItem(menuItem)
    setSelectedModifierIds(
      menuItem.modifiers.filter((modifier) => modifier.defaultSelected).map((modifier) => modifier.id)
    )
    setItemInstructions('')
    setModifierError(null)
  }

  const modifierGroups = configuringItem
    ? Object.entries(
        configuringItem.modifiers.reduce<Record<string, MenuModifier[]>>((groups, modifier) => {
          const key = modifier.modifierGroup || 'addons'
          groups[key] = [...(groups[key] || []), modifier]
          return groups
        }, {})
      )
    : []

  const toggleModifier = (modifier: MenuModifier) => {
    setModifierError(null)
    setSelectedModifierIds((current) => {
      if (current.includes(modifier.id)) return current.filter((id) => id !== modifier.id)
      const groupSelected = configuringItem?.modifiers.filter(
        (candidate) => candidate.modifierGroup === modifier.modifierGroup && current.includes(candidate.id)
      ) || []
      const maximum = Math.max(1, modifier.maxSelections || 1)
      if (groupSelected.length >= maximum) {
        return current
      }
      return [...current, modifier.id]
    })
  }

  const confirmConfiguredItem = () => {
    if (!configuringItem) return
    for (const [group, modifiers] of modifierGroups) {
      const selectedCount = modifiers.filter((modifier) => selectedModifierIds.includes(modifier.id)).length
      const minimum = Math.max(
        modifiers.some((modifier) => modifier.required) ? 1 : 0,
        ...modifiers.map((modifier) => Number(modifier.minSelections || 0))
      )
      if (selectedCount < minimum) {
        setModifierError(`Select at least ${minimum} option${minimum === 1 ? '' : 's'} from ${modifiers[0]?.modifierGroupLabel || group}`)
        return
      }
    }
    appendConfiguredItem(configuringItem, selectedModifierIds, itemInstructions.trim())
    setConfiguringItem(null)
  }

  const submitOrder = async () => {
    if (cart.length === 0 || submitting || (orderType === 'dine_in' && selectedTables.length === 0)) return
    try {
      setSubmitting(true)
      const res: any = await request('/api/graphql', CREATE_POS_ORDER, {
        orderType,
        guestCount,
        tableIds: orderType === 'dine_in' ? selectedTables : [],
        isUrgent,
        specialInstructions: specialInstructions || null,
        items: cart.map((item) => ({
          menuItemId: item.menuItem.id,
          quantity: item.quantity,
          courseNumber: item.courseNumber,
          modifierIds: item.modifierIds,
          specialInstructions: item.specialInstructions || null,
        })),
      })
      setCart([])
      setSelectedTables([])
      setIsUrgent(false)
      setSpecialInstructions('')
      alert('Order sent to kitchen!')
    } catch (err) {
      alert('Error: ' + err)
    } finally {
      setSubmitting(false)
    }
  }

  const cartSubtotal = cart.reduce((sum, item) => {
    const modifierTotal = item.menuItem.modifiers
      .filter((modifier) => item.modifierIds.includes(modifier.id))
      .reduce((modifierSum, modifier) => modifierSum + Number(modifier.priceAdjustment || 0), 0)
    return sum + (Number(item.menuItem.price || 0) + modifierTotal) * item.quantity
  }, 0)
  const taxRate = Number(data.storeSettings?.taxRate || 0)
  const cartTax = Math.round(cartSubtotal * (taxRate / 100))
  const cartTotal = cartSubtotal + cartTax
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0)

  const selectedTableObjects = selectedTables
    .map((id) => data.tables.find((t) => t.id === id))
    .filter((t): t is Table => Boolean(t))

  const filteredItems =
    selectedCategory === 'all'
      ? data.items
      : data.items.filter((i) => i.category?.id === selectedCategory)

  const availableTables = data.tables.filter((t) => t.status === 'available').length

  const canSend =
    cart.length > 0 &&
    !submitting &&
    (orderType === 'takeout' || selectedTables.length > 0)

  if (loading) {
    return (
      // h-screen + overflow-hidden = self-contained viewport lock, no parent chain dependency
      <div className="flex flex-col bg-background overflow-hidden" style={{ height: '100svh' }}>
        <PageBreadcrumbs items={breadcrumbs} />
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="animate-spin text-muted-foreground h-5 w-5" />
        </div>
      </div>
    )
  }

  return (
    /*
     * Layout contract:
     * - Root is exactly 100svh, overflow-hidden → no page-level scroll ever
     * - flex-col: breadcrumbs (shrink-0) → header (shrink-0) → 3-panel (flex-1 min-h-0)
     * - 3-panel flex row: left sidebar (overflow-y-auto) | center (overflow-y-auto) | right (flex-col overflow-hidden)
     * - Right cart: fixed header/config/table rows (shrink-0) + scrollable items (flex-1 min-h-0 overflow-y-auto) + fixed footer (shrink-0)
     */
    <div className="flex flex-col bg-background overflow-hidden" style={{ height: '100svh' }}>
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Page header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Point of Sale</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.items.filter((i) => i.available).length} items available
            {' · '}
            {availableTables} table{availableTables !== 1 ? 's' : ''} open
          </p>
        </div>
      </div>

      {/* 3-panel body — flex-1 min-h-0 ensures it fills remaining height and can shrink */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: Category sidebar ── */}
        <div className="w-40 xl:w-48 shrink-0 border-r border-border overflow-y-auto flex flex-col">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'w-full text-left px-4 py-3 text-sm flex items-center justify-between border-b border-border transition-colors shrink-0',
              selectedCategory === 'all'
                ? 'bg-muted font-medium'
                : 'hover:bg-muted/30 text-muted-foreground'
            )}
          >
            <span>All Items</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {data.items.length}
            </span>
          </button>
          {data.categories.map((cat) => {
            const count = data.items.filter((i) => i.category?.id === cat.id).length
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'w-full text-left px-4 py-3 text-sm flex items-center justify-between border-b border-border transition-colors shrink-0',
                  selectedCategory === cat.id
                    ? 'bg-muted font-medium'
                    : 'hover:bg-muted/30 text-muted-foreground'
                )}
              >
                <span className="truncate">{cat.name}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums ml-2 shrink-0">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── CENTER: Item grid — only this scrolls ── */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Utensils size={28} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No items in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-x divide-y border-b border-border">
              {filteredItems.map((item) => {
                const imageSrc = item.thumbnail
                const imageAlt = item.name
                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={!item.available}
                    className={cn(
                      'flex flex-col text-left bg-card group',
                      item.available
                        ? 'cursor-pointer hover:bg-muted/20'
                        : 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <div className="aspect-video bg-muted overflow-hidden w-full">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={imageAlt}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Utensils size={20} className="text-muted-foreground/20" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold leading-tight">{item.name}</p>
                        <p className="text-sm font-semibold shrink-0">
                          {formatMoney(parseInt(item.price))}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full', item.available ? 'bg-emerald-500' : 'bg-red-400')} />
                        <span className="text-[11px] text-muted-foreground">
                          {item.available ? 'Available' : "86'd"}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: Cart panel — flex-col + overflow-hidden locks it to available height ── */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col border-l border-border bg-background overflow-hidden">

          {/* Cart header — fixed */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={14} className="text-muted-foreground" />
              <span className="text-sm font-semibold">
                Order{cartItemCount > 0 ? ` (${cartItemCount})` : ''}
              </span>
            </div>
            {cart.length > 0 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setCart([])}
              >
                Clear
              </button>
            )}
          </div>

          {/* Order config strip — fixed */}
          <div className="grid grid-cols-2 divide-x border-b border-border shrink-0">
            <div className="px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Type</p>
              <div className="flex items-center border border-border rounded overflow-hidden text-[10px]">
                <button
                  onClick={() => setOrderType('dine_in')}
                  className={cn(
                    'flex-1 py-1.5 font-semibold uppercase tracking-wider transition-colors',
                    orderType === 'dine_in' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  Dine-in
                </button>
                <button
                  onClick={() => setOrderType('takeout')}
                  className={cn(
                    'flex-1 py-1.5 font-semibold uppercase tracking-wider transition-colors border-l border-border',
                    orderType === 'takeout' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  Takeout
                </button>
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Guests</p>
              <div className="flex items-center gap-2">
                <button
                  className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                >
                  <Minus size={10} />
                </button>
                <span className="text-sm font-semibold w-6 text-center tabular-nums">{guestCount}</span>
                <button
                  className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => setGuestCount((g) => g + 1)}
                >
                  <Plus size={10} />
                </button>
              </div>
            </div>
          </div>

          {/* Table selector — fixed, dine-in only */}
          {orderType === 'dine_in' && (
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Table</p>
              <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
                <PopoverTrigger asChild>
                  <button className="w-full text-left text-xs border border-border rounded px-3 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <span className={selectedTables.length > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      {selectedTables.length > 0
                        ? selectedTableObjects.map((t) => `T${t.tableNumber}`).join(', ')
                        : 'Select table(s)…'}
                    </span>
                    <span className="text-muted-foreground text-[10px]">▾</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Tables</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {data.tables.map((t) => {
                      const sel = selectedTables.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          onClick={() =>
                            setSelectedTables((prev) =>
                              prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            )
                          }
                          className={cn(
                            'relative border rounded py-2 text-xs font-semibold transition-colors',
                            sel ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground/40'
                          )}
                        >
                          {sel && <Check size={9} className="absolute top-0.5 right-0.5" />}
                          T{t.tableNumber}
                        </button>
                      )
                    })}
                  </div>
                  <Button size="sm" className="w-full h-8 text-xs" onClick={() => setTablePopoverOpen(false)}>
                    Done
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Cart items — the ONLY scrollable section in the right panel */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 bg-muted/40">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <ShoppingCart size={28} className="text-muted-foreground/20 mb-3" />
                <p className="text-xs text-muted-foreground">Cart is empty</p>
                <p className="text-xs text-muted-foreground/50 mt-0.5">Tap an item on the left to add</p>
              </div>
            ) : (
              <div className="space-y-2 py-1">
                {cart.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    {/* Name + remove */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded overflow-hidden bg-muted shrink-0">
                          {item.menuItem.thumbnail ? (
                            <img
                              src={item.menuItem.thumbnail}
                              alt={item.menuItem.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{item.menuItem.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatMoney(
                              Number(item.menuItem.price || 0) +
                              item.menuItem.modifiers
                                .filter((modifier) => item.modifierIds.includes(modifier.id))
                                .reduce((sum, modifier) => sum + Number(modifier.priceAdjustment || 0), 0)
                            )} each
                          </p>
                          {item.modifierIds.length > 0 && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {item.menuItem.modifiers
                                .filter((modifier) => item.modifierIds.includes(modifier.id))
                                .map((modifier) => modifier.name)
                                .join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => { const n = [...cart]; n.splice(idx, 1); setCart(n) }}
                        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    {/* Qty + course + total */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                          onClick={() => { const n = [...cart]; n[idx].quantity = Math.max(1, n[idx].quantity - 1); setCart(n) }}
                        >
                          <Minus size={10} />
                        </button>
                        <span className="text-xs font-semibold w-6 text-center tabular-nums">{item.quantity}</span>
                        <button
                          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                          onClick={() => { const n = [...cart]; n[idx].quantity += 1; setCart(n) }}
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {([1, 2, 3] as const).map((c) => (
                          <button
                            key={c}
                            onClick={() => { const n = [...cart]; n[idx].courseNumber = c; setCart(n) }}
                            className={cn(
                              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors border',
                              item.courseNumber === c
                                ? 'border-foreground/30 bg-muted text-foreground'
                                : 'border-transparent text-muted-foreground hover:border-border'
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', courseColors[c])} />
                            {courseLabels[c]}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-semibold tabular-nums">
                        {formatMoney((
                          Number(item.menuItem.price || 0) +
                          item.menuItem.modifiers
                            .filter((modifier) => item.modifierIds.includes(modifier.id))
                            .reduce((sum, modifier) => sum + Number(modifier.priceAdjustment || 0), 0)
                        ) * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order footer — always pinned at bottom */}
          <div className="border-t border-border px-4 py-4 space-y-3 shrink-0 bg-background">
            {/* Urgent */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="pos-urgent"
                checked={isUrgent}
                onCheckedChange={(v: any) => setIsUrgent(v)}
              />
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle size={12} className={isUrgent ? 'text-orange-500' : ''} />
                <span className={isUrgent ? 'text-orange-600 font-semibold' : ''}>Mark as urgent</span>
              </span>
            </label>

            {/* Special instructions */}
            <Textarea
              placeholder="Special instructions…"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="h-14 text-xs resize-none"
            />

            {/* Totals */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(cartSubtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({taxRate.toFixed(2)}%)</span>
                <span className="tabular-nums">{formatMoney(cartTax)}</span>
              </div>
              <div className="flex justify-between font-semibold text-sm border-t border-border pt-1.5 mt-1.5">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(cartTotal)}</span>
              </div>
            </div>

            {/* Send to Kitchen — styled to match the Type toggle */}
            <button
              onClick={submitOrder}
              disabled={!canSend}
              className={cn(
                'w-full border border-border rounded overflow-hidden py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all',
                canSend
                  ? 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {submitting ? 'Sending…' : 'Send to Kitchen'}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(configuringItem)} onOpenChange={(open) => !open && setConfiguringItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Customize {configuringItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-5 overflow-y-auto py-2">
            {modifierGroups.map(([group, modifiers]) => {
              const minimum = Math.max(
                modifiers.some((modifier) => modifier.required) ? 1 : 0,
                ...modifiers.map((modifier) => Number(modifier.minSelections || 0))
              )
              const maximum = Math.min(
                ...modifiers.map((modifier) => Math.max(1, Number(modifier.maxSelections || 1)))
              )
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{modifiers[0]?.modifierGroupLabel || group}</Label>
                    <span className="text-xs text-muted-foreground">
                      {minimum > 0 ? `Choose ${minimum}` : 'Optional'} · max {maximum}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {modifiers.map((modifier) => {
                      const selected = selectedModifierIds.includes(modifier.id)
                      return (
                        <button
                          key={modifier.id}
                          type="button"
                          onClick={() => toggleModifier(modifier)}
                          className={cn(
                            'rounded-lg border p-3 text-left text-sm transition-colors',
                            selected ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/40'
                          )}
                        >
                          <span className="font-medium">{modifier.name}</span>
                          {Number(modifier.priceAdjustment || 0) !== 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {Number(modifier.priceAdjustment) > 0 ? '+' : ''}{formatMoney(Number(modifier.priceAdjustment))}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="space-y-2">
              <Label htmlFor="pos-item-instructions">Item instructions</Label>
              <Textarea
                id="pos-item-instructions"
                value={itemInstructions}
                maxLength={500}
                onChange={(event) => setItemInstructions(event.target.value)}
                placeholder="Preparation notes"
              />
            </div>
            {modifierError && <p className="text-sm text-destructive">{modifierError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfiguringItem(null)}>Cancel</Button>
            <Button onClick={confirmConfiguredItem}>Add item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

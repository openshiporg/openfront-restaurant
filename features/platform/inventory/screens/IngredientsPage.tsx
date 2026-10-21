'use client'

import { OperationsRecovery } from "../components/OperationsRecovery";
import { StockTransfer } from "../components/StockTransfer";
import { StockCount } from "../components/StockCount"
import React, { useState, useEffect, useCallback } from 'react'
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
import {
  Plus,
  Search,
  X,
  Boxes,
  AlertTriangle,
  Edit2,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'

interface Ingredient {
  id: string
  name: string
  unit: string
  category: string
  currentStock: number | null
  parLevel: number | null
  costPerUnit: string | null
}

const UNIT_OPTIONS = ['kg', 'lb', 'oz', 'liter', 'gallon', 'each', 'case', 'box']
const CATEGORY_OPTIONS = [
  'produce', 'meat', 'dairy', 'dry_goods', 'beverages',
  'spices', 'seafood', 'other',
]

const CATEGORY_LABEL: Record<string, string> = {
  produce: 'Produce',
  meat: 'Meat',
  dairy: 'Dairy',
  dry_goods: 'Dry Goods',
  beverages: 'Beverages',
  spices: 'Spices',
  seafood: 'Seafood',
  other: 'Other',
}

const CATEGORY_DOT: Record<string, string> = {
  produce: 'bg-lime-500',
  meat: 'bg-red-500',
  dairy: 'bg-blue-400',
  dry_goods: 'bg-amber-500',
  beverages: 'bg-cyan-500',
  spices: 'bg-orange-500',
  seafood: 'bg-teal-500',
  other: 'bg-zinc-400',
}

const GET_INGREDIENTS = gql`
  query GetIngredients {
    ingredients(orderBy: { name: asc }, take: 200) {
      id name unit category currentStock parLevel costPerUnit
    }
  }
`

const CREATE_INGREDIENT = gql`
  mutation CreateIngredient($data: IngredientCreateInput!) {
    createIngredient(data: $data) { id }
  }
`

const UPDATE_INGREDIENT = gql`
  mutation UpdateIngredient($id: ID!, $data: IngredientUpdateInput!) {
    updateIngredient(where: { id: $id }, data: $data) { id }
  }
`

const EMPTY_FORM = {
  name: '',
  unit: 'each',
  category: 'other',
  currentStock: '',
  parLevel: '',
  costPerUnit: '',
}

export function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res: any = await request('/api/graphql', GET_INGREDIENTS)
      setIngredients(res.ingredients || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  const openEdit = (item: Ingredient) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      unit: item.unit || 'each',
      category: item.category || 'other',
      currentStock: item.currentStock?.toString() ?? '',
      parLevel: item.parLevel?.toString() ?? '',
      costPerUnit: item.costPerUnit ?? '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setIsSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        ...(!editingId ? { unit: form.unit } : {}),
        category: form.category,
        parLevel: form.parLevel ? parseFloat(form.parLevel) : null,
        costPerUnit: form.costPerUnit || null,
      }
      if (editingId) {
        await request('/api/graphql', UPDATE_INGREDIENT, { id: editingId, data })
      } else {
        await request('/api/graphql', CREATE_INGREDIENT, { data })
      }
      setDialogOpen(false)
      await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  // Derived stats
  const total = ingredients.length
  const lowStock = ingredients.filter(
    (i) => i.parLevel != null && i.currentStock != null && i.currentStock < i.parLevel
  ).length
  const outOfStock = ingredients.filter(
    (i) => i.currentStock != null && i.currentStock === 0
  ).length
  const categories = Array.from(new Set(ingredients.map((i) => i.category).filter(Boolean)))

  // Filter
  const filtered = ingredients.filter((item) => {
    const matchCat = activeCategory === 'all' || item.category === activeCategory
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.category && CATEGORY_LABEL[item.category]?.toLowerCase().includes(q))
    return matchCat && matchSearch
  })

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Ingredients' },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <StockCount /><StockTransfer /><OperationsRecovery />
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ingredients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} ingredient{total !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
          <Plus size={13} className="mr-1.5" />
          New Ingredient
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="text-xl font-semibold mt-1">{total}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Categories</p>
          <p className="text-xl font-semibold mt-1">{categories.length}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Low Stock</p>
          <p className={cn('text-xl font-semibold mt-1', lowStock > 0 && 'text-amber-600')}>{lowStock}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Out of Stock</p>
          <p className={cn('text-xl font-semibold mt-1', outOfStock > 0 && 'text-red-600')}>{outOfStock}</p>
        </div>
      </div>

      {/* Category tabs + search */}
      <div className="border-b border-border">
        <div className="px-4 md:px-6 flex items-center gap-0 overflow-x-auto">
          {(['all', ...CATEGORY_OPTIONS] as string[]).map((cat) => {
            const label = cat === 'all' ? 'All' : (CATEGORY_LABEL[cat] ?? cat)
            const count = cat === 'all' ? total : ingredients.filter((i) => i.category === cat).length
            if (cat !== 'all' && count === 0) return null
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                  activeCategory === cat
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {cat !== 'all' && (
                  <span className={cn('w-1.5 h-1.5 rounded-full', CATEGORY_DOT[cat] ?? 'bg-zinc-400')} />
                )}
                {label}
                <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 md:px-6 py-2.5 border-b border-border">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ingredients…"
            className="w-full h-8 pl-8 pr-8 text-sm bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Boxes size={28} className="text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {searchQuery ? 'No ingredients match your search.' : 'No ingredients yet.'}
            </p>
            {!searchQuery && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={openCreate}>
                <Plus size={12} className="mr-1.5" /> Add First Ingredient
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="grid grid-cols-[1fr_80px_90px_80px_80px_80px_64px] border-b border-border px-4 md:px-6 py-2 bg-muted/20">
              {['Name', 'Category', 'Unit', 'Stock', 'Par Level', 'Cost/Unit', ''].map((h) => (
                <span key={h} className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {h}
                </span>
              ))}
            </div>

            <div className="divide-y divide-border">
              {filtered.map((item) => {
                const isLow = item.parLevel != null && item.currentStock != null && item.currentStock < item.parLevel
                const isOut = item.currentStock != null && item.currentStock === 0
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_80px_90px_80px_80px_80px_64px] px-4 md:px-6 py-3 items-center hover:bg-muted/20 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {(isOut || isLow) && (
                        <AlertTriangle
                          size={13}
                          className={isOut ? 'text-red-500 shrink-0' : 'text-amber-500 shrink-0'}
                        />
                      )}
                      <span className="text-sm font-medium truncate">{item.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', CATEGORY_DOT[item.category] ?? 'bg-zinc-400')} />
                        {CATEGORY_LABEL[item.category] ?? item.category}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{item.unit}</span>
                    <span className={cn(
                      'text-sm font-medium tabular-nums',
                      isOut ? 'text-red-600' : isLow ? 'text-amber-600' : ''
                    )}>
                      {item.currentStock ?? '—'}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">{item.parLevel ?? '—'}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {item.costPerUnit ? `$${item.costPerUnit}` : '—'}
                    </span>
                    <div className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>

                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Ingredient' : 'New Ingredient'}</DialogTitle>
            <p className="text-xs text-muted-foreground">Stock records are retained for receipt and lot history. Their stocking unit cannot change; create a new stock record and use a controlled transfer for unit conversion. Receipt/count actions maintain the stock balance.</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Roma Tomatoes"
                className="h-8 text-sm"
              />
            </div>

            {/* Category + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Select disabled={Boolean(editingId)} value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stock + Par */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Stock from receipt/count ledger</Label>
                <Input
                  type="number"
                  value={form.currentStock}
                  disabled
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Par Level</Label>
                <Input
                  type="number"
                  value={form.parLevel}
                  onChange={(e) => setForm((f) => ({ ...f, parLevel: e.target.value }))}
                  placeholder="10"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Cost per unit */}
            <div className="space-y-1.5">
              <Label className="text-xs">Cost Per Unit ($)</Label>
              <Input
                value={form.costPerUnit}
                onChange={(e) => setForm((f) => ({ ...f, costPerUnit: e.target.value }))}
                placeholder="e.g. 2.50"
                className="h-8 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={isSaving || !form.name.trim()}>
                {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Ingredient'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default IngredientsPage

'use client'

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
  MapPin,
  Edit2,
  Trash2,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'

interface Table {
  id: string
  tableNumber: string
  capacity: number
  status: string
  shape: string | null
  section: { id: string; name: string } | null
  floor: { id: string; name: string } | null
}

interface Section {
  id: string
  name: string
}

interface Floor {
  id: string
  name: string
  level: number
  isActive: boolean
}

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  available: { dot: 'bg-emerald-500', label: 'Available' },
  occupied:  { dot: 'bg-red-500',     label: 'Occupied'  },
  reserved:  { dot: 'bg-purple-500',  label: 'Reserved'  },
  cleaning:  { dot: 'bg-amber-500',   label: 'Cleaning'  },
}

const SHAPE_OPTIONS = ['rectangle', 'square', 'round']
const SHAPE_LABEL: Record<string, string> = {
  rectangle: 'Rectangle',
  square: 'Square',
  round: 'Round',
}
const STATUS_OPTIONS = ['available', 'occupied', 'reserved', 'cleaning']

const GET_TABLES_DATA = gql`
  query GetTablesData {
    tables(orderBy: { tableNumber: asc }, take: 200) {
      id tableNumber capacity status shape
      section { id name }
      floor { id name }
    }
    sections(orderBy: { name: asc }) { id name }
    floors(orderBy: { level: asc }) { id name level isActive }
  }
`

const CREATE_TABLE = gql`
  mutation CreateTable($data: TableCreateInput!) {
    createTable(data: $data) { id }
  }
`

const UPDATE_TABLE = gql`
  mutation UpdateTable($id: ID!, $data: TableUpdateInput!) {
    updateTable(where: { id: $id }, data: $data) { id }
  }
`

const DELETE_TABLE = gql`
  mutation DeleteTable($id: ID!) {
    deleteUnusedRestaurantTable(tableId: $id) { success error }
  }
`

const CREATE_SECTION = gql`
  mutation CreateSection($data: SectionCreateInput!) {
    createSection(data: $data) { id }
  }
`

const EMPTY_FORM = {
  tableNumber: '',
  capacity: '4',
  status: 'available',
  shape: 'rectangle',
  sectionId: '__none__',
  floorId: '__none__',
}

export function TablesPage() {
  const [tables, setTables] = useState<Table[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [floors, setFloors] = useState<Floor[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('all')
  const [activeStatus, setActiveStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [newSectionName, setNewSectionName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res: any = await request('/api/graphql', GET_TABLES_DATA)
      setTables(res.tables || [])
      setSections(res.sections || [])
      setFloors(res.floors || [])
    } catch (err) {
      console.error(err)
      window.alert(err instanceof Error ? err.message : "Unable to save table changes")
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

  const openEdit = (table: Table) => {
    setEditingId(table.id)
    setForm({
      tableNumber: table.tableNumber,
      capacity: table.capacity?.toString() ?? '4',
      status: table.status || 'available',
      shape: table.shape || 'rectangle',
      sectionId: table.section?.id || '__none__',
      floorId: table.floor?.id || '__none__',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.tableNumber.trim()) return
    setIsSaving(true)
    try {
      const data: any = {
        tableNumber: form.tableNumber.trim(),
        ...(editingId ? {} : { capacity: parseInt(form.capacity) || 4 }),
        shape: form.shape,
      }
      if (form.sectionId && form.sectionId !== '__none__') {
        data.section = { connect: { id: form.sectionId } }
      } else if (editingId) {
        data.section = { disconnect: true }
      }
      if (form.floorId && form.floorId !== '__none__') {
        data.floor = { connect: { id: form.floorId } }
      } else if (editingId) {
        data.floor = { disconnect: true }
      }

      let tableId = editingId
      if (editingId) {
        const capacityResult: any = await request('/api/graphql', `mutation($tableId:ID!,$capacity:Int!){setRestaurantTableCapacity(tableId:$tableId,capacity:$capacity){success error}}`, { tableId: editingId, capacity: parseInt(form.capacity) || 4 })
        if (!capacityResult.setRestaurantTableCapacity.success) throw new Error(capacityResult.setRestaurantTableCapacity.error)
        await request('/api/graphql', UPDATE_TABLE, { id: editingId, data })
      } else {
        const created: any = await request('/api/graphql', CREATE_TABLE, { data })
        tableId = created.createTable.id
      }
      const statusResult: any = await request('/api/graphql', `mutation($tableId:ID!,$status:String!){updateServiceFloorTableStatus(tableId:$tableId,status:$status){success error}}`, { tableId, status: form.status })
      if (!statusResult.updateServiceFloorTableStatus.success) throw new Error(statusResult.updateServiceFloorTableStatus.error)
      setDialogOpen(false)
      await fetchData()
    } catch (err) {
      console.error(err)
      window.alert(err instanceof Error ? err.message : "Unable to save table changes")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this table?')) return
    setDeletingId(id)
    try {
      const result: any = await request('/api/graphql', DELETE_TABLE, { id })
      if (!result.deleteUnusedRestaurantTable.success) throw new Error(result.deleteUnusedRestaurantTable.error)
      await fetchData()
    } catch (err) {
      console.error(err)
      window.alert(err instanceof Error ? err.message : "Unable to save table changes")
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreateSection = async () => {
    if (!newSectionName.trim()) return
    setIsSaving(true)
    try {
      await request('/api/graphql', CREATE_SECTION, { data: { name: newSectionName.trim() } })
      setNewSectionName('')
      setSectionDialogOpen(false)
      await fetchData()
    } catch (err) {
      console.error(err)
      window.alert(err instanceof Error ? err.message : "Unable to save table changes")
    } finally {
      setIsSaving(false)
    }
  }

  // Derived stats
  const total = tables.length
  const available = tables.filter((t) => t.status === 'available').length
  const occupied = tables.filter((t) => t.status === 'occupied').length
  const totalCapacity = tables.reduce((acc, t) => acc + (t.capacity || 0), 0)

  // Filter
  const filtered = tables.filter((t) => {
    const matchSection = activeSection === 'all' || t.section?.id === activeSection
    const matchStatus = activeStatus === 'all' || t.status === activeStatus
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || t.tableNumber.toLowerCase().includes(q) || t.section?.name.toLowerCase().includes(q)
    return matchSection && matchStatus && matchSearch
  })

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Tables & Sections' },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tables & Sections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} table{total !== 1 ? 's' : ''} · {sections.length} section{sections.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setSectionDialogOpen(true)}
          >
            <Layers size={13} className="mr-1.5" />
            New Section
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
            <Plus size={13} className="mr-1.5" />
            New Table
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Tables</p>
          <p className="text-xl font-semibold mt-1">{total}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Available</p>
          <p className={cn('text-xl font-semibold mt-1', available > 0 && 'text-emerald-600')}>{available}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Occupied</p>
          <p className={cn('text-xl font-semibold mt-1', occupied > 0 && 'text-red-600')}>{occupied}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Capacity</p>
          <p className="text-xl font-semibold mt-1">{totalCapacity}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-0 border-b border-border overflow-x-auto px-4 md:px-6">
        {/* Section tabs */}
        {[{ id: 'all', name: 'All Sections' }, ...sections].map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
              activeSection === s.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {s.name}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1 pl-4 shrink-0">
          {(['all', ...STATUS_OPTIONS] as string[]).map((s) => (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                activeStatus === s
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              {s !== 'all' && (
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_CONFIG[s]?.dot)} />
              )}
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 md:px-6 py-2.5 border-b border-border">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tables…"
            className="w-full h-8 pl-8 pr-8 text-sm bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin size={28} className="text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {searchQuery ? 'No tables match your search.' : 'No tables yet.'}
            </p>
            {!searchQuery && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={openCreate}>
                <Plus size={12} className="mr-1.5" /> Add First Table
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="grid grid-cols-[60px_1fr_80px_100px_80px_80px_56px] border-b border-border px-4 md:px-6 py-2 bg-muted/20">
              {['#', 'Section / Floor', 'Capacity', 'Status', 'Shape', '', ''].map((h, i) => (
                <span key={i} className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {h}
                </span>
              ))}
            </div>

            <div className="divide-y divide-border">
              {filtered.map((table) => {
                const sc = STATUS_CONFIG[table.status] ?? { dot: 'bg-zinc-400', label: table.status }
                return (
                  <div
                    key={table.id}
                    className="grid grid-cols-[60px_1fr_80px_100px_80px_80px_56px] px-4 md:px-6 py-3 items-center hover:bg-muted/20 transition-colors group"
                  >
                    <span className="text-sm font-semibold tabular-nums">{table.tableNumber}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{table.section?.name ?? '—'}</p>
                      {table.floor && (
                        <p className="text-[11px] text-muted-foreground">{table.floor.name}</p>
                      )}
                    </div>
                    <span className="text-sm tabular-nums">{table.capacity}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', sc.dot)} />
                      <span className="text-xs">{sc.label}</span>
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{table.shape ?? '—'}</span>
                    <span />
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(table)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(table.id)}
                        disabled={deletingId === table.id}
                        className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Create / Edit table dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Table' : 'New Table'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Table Number *</Label>
                <Input
                  value={form.tableNumber}
                  onChange={(e) => setForm((f) => ({ ...f, tableNumber: e.target.value }))}
                  placeholder="e.g. T1, 12, Patio-1"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Shape</Label>
                <Select value={form.shape} onValueChange={(v) => setForm((f) => ({ ...f, shape: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHAPE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{SHAPE_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Section</Label>
                <Select value={form.sectionId} onValueChange={(v) => setForm((f) => ({ ...f, sectionId: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Floor</Label>
                <Select value={form.floorId} onValueChange={(v) => setForm((f) => ({ ...f, floorId: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {floors.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleSave}
                disabled={isSaving || !form.tableNumber.trim()}
              >
                {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Table'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create section dialog */}
      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Section Name *</Label>
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="e.g. Main Dining, Patio, Bar"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSection()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSectionDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleCreateSection}
                disabled={isSaving || !newSectionName.trim()}
              >
                {isSaving ? 'Creating…' : 'Create Section'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TablesPage

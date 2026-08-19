'use client'

import { useEffect, useMemo, useState } from 'react'
import { gql, request } from 'graphql-request'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  RefreshCw,
  Users,
  Clock3,
  UtensilsCrossed,
  Plus,
  Send,
  CreditCard,
  ChefHat,
  GripVertical,
  Split,
  Layers,
  Flame,
  PauseCircle,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/features/storefront/lib/currency'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'

interface Table {
  id: string
  tableNumber: string
  capacity: number
  status: 'available' | 'occupied' | 'reserved' | 'cleaning'
}

interface ActiveOrder {
  id: string
  orderNumber: string
  status: string
  total: number
  guestCount: number
  createdAt: string
  tables: { id: string; tableNumber: string }[]
  courses: {
    id: string
    courseType: string
    courseNumber: number
    status: 'pending' | 'fired' | 'ready' | 'served'
    onHold: boolean
  }[]
  orderItems: {
    id: string
    quantity: number
    price: number
    seatNumber?: number | null
    courseNumber?: number | null
    specialInstructions?: string | null
    itemNameSnapshot: string
    modifiersSnapshot?: Array<{ name: string }> | null
    menuItem: { id: string; name: string } | null
  }[]
  payments: {
    id: string
    amount: number
    status: string
    paymentMethod?: string | null
  }[]
}

interface MenuModifier {
  id: string
  name: string
  modifierGroup: string
  modifierGroupLabel?: string | null
  required: boolean
  minSelections: number
  maxSelections: number
  priceAdjustment: number
  defaultSelected: boolean
}

interface MenuItem {
  id: string
  name: string
  price: number
  available: boolean
  modifiers: MenuModifier[]
}

const GET_SERVICE_FLOOR = gql`
  query GetServiceFloor {
    tables(orderBy: { tableNumber: asc }) {
      id tableNumber capacity status
    }
    restaurantOrders(
      where: {
        orderType: { equals: "dine_in" }
        status: { in: ["open", "sent_to_kitchen", "in_progress", "ready", "served"] }
      }
      orderBy: { createdAt: desc }
    ) {
      id orderNumber status total guestCount createdAt
      tables { id tableNumber }
      courses(orderBy: { courseNumber: asc }) { id courseType courseNumber status onHold }
      orderItems {
        id quantity price seatNumber courseNumber specialInstructions
        itemNameSnapshot modifiersSnapshot isVoided adjustmentTotal
        menuItem { id name }
      }
      payments { id amount status paymentMethod }
    }
    menuItems(where: { available: { equals: true } }, orderBy: { name: asc }) {
      id name price available
      modifiers {
        id name modifierGroup modifierGroupLabel required
        minSelections maxSelections priceAdjustment defaultSelected
      }
    }
    storeSettings { currencyCode locale taxRate }
  }
`

const UPDATE_TABLE_STATUS = gql`
  mutation UpdateServiceFloorTableStatus($tableId: ID!, $status: String!) {
    updateServiceFloorTableStatus(tableId: $tableId, status: $status) { success error }
  }
`

const ADD_SERVICE_FLOOR_ITEM = gql`
  mutation AddServiceFloorItem(
    $orderId: ID
    $tableId: ID!
    $menuItemId: ID!
    $quantity: Int!
    $courseNumber: Int
    $seatNumber: Int
    $specialInstructions: String
    $modifierIds: [ID!]
  ) {
    addServiceFloorItem(
      orderId: $orderId
      tableId: $tableId
      menuItemId: $menuItemId
      quantity: $quantity
      courseNumber: $courseNumber
      seatNumber: $seatNumber
      specialInstructions: $specialInstructions
      modifierIds: $modifierIds
    ) {
      id
      orderNumber
      status
      subtotal
      tax
      total
    }
  }
`

const UPDATE_SERVICE_FLOOR_ITEM = gql`
  mutation UpdateServiceFloorItem(
    $orderItemId: ID!
    $quantity: Int
    $courseNumber: Int
    $seatNumber: Int
    $specialInstructions: String
    $voidReason: String
  ) {
    updateServiceFloorItem(
      orderItemId: $orderItemId
      quantity: $quantity
      courseNumber: $courseNumber
      seatNumber: $seatNumber
      specialInstructions: $specialInstructions
      voidReason: $voidReason
    ) {
      id
      orderNumber
      status
      subtotal
      tax
      total
    }
  }
`

const UPDATE_CHECK_STATUS = gql`
  mutation UpdateServiceFloorCheckStatus($orderId: ID!, $action: String!) {
    updateServiceFloorCheckStatus(orderId: $orderId, action: $action) { success error }
  }
`

const SPLIT_CHECK_BY_GUEST = gql`
  mutation SplitCheckByGuest($orderId: String!, $guestCount: Int!) {
    splitCheckByGuest(orderId: $orderId, guestCount: $guestCount) { success newOrderIds error }
  }
`

const SPLIT_CHECK_BY_ITEM = gql`
  mutation SplitCheckByItem($orderId: String!, $itemIds: [String!]!) {
    splitCheckByItem(orderId: $orderId, itemIds: $itemIds) { success newOrderIds error }
  }
`

const COMBINE_TABLES = gql`
  mutation CombineTables($orderId: String!, $tableIds: [String!]!) {
    combineTables(orderId: $orderId, tableIds: $tableIds) { success error }
  }
`

const FIRE_COURSE = gql`
  mutation FireCourse($courseId: String!) {
    fireCourse(courseId: $courseId) { success error }
  }
`

const RECALL_COURSE = gql`
  mutation RecallCourse($courseId: String!) {
    recallCourse(courseId: $courseId) { success error }
  }
`

const statusOrder: Array<Table['status']> = ['available', 'occupied', 'reserved', 'cleaning']

const statusLabel: Record<Table['status'], string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
}

// Left border colors for status lanes
const statusBorderLeft: Record<Table['status'], string> = {
  available: 'border-l-emerald-500',
  occupied: 'border-l-rose-500',
  reserved: 'border-l-amber-500',
  cleaning: 'border-l-zinc-400',
}

// Dot colors for status indicators
const statusDot: Record<Table['status'], string> = {
  available: 'bg-emerald-500',
  occupied: 'bg-rose-500',
  reserved: 'bg-amber-500',
  cleaning: 'bg-zinc-400',
}

function formatCourseLabel(courseType: string, courseNumber: number) {
  return `${courseType.charAt(0).toUpperCase() + courseType.slice(1)} · C${courseNumber}`
}

function formatStatusLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function getPaidAmount(order?: ActiveOrder | null) {
  return (order?.payments || [])
    .filter(payment => payment.status === 'succeeded')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
}

function getBalanceDue(order?: ActiveOrder | null) {
  if (!order) return 0
  return Math.max(0, Number(order.total || 0) - getPaidAmount(order))
}

export function ServiceFloorClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<ActiveOrder[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US', taxRate: 0 })

  const [dragTableId, setDragTableId] = useState<string | null>(null)
  const [updatingTable, setUpdatingTable] = useState<string | null>(null)

  const [openSheet, setOpenSheet] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(1)
  const [courseNumber, setCourseNumber] = useState<number>(1)
  const [seatNumber, setSeatNumber] = useState<number>(1)
  const [itemNotes, setItemNotes] = useState<string>('')
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [addingItem, setAddingItem] = useState(false)
  const [editingItem, setEditingItem] = useState<ActiveOrder['orderItems'][number] | null>(null)
  const [editQuantity, setEditQuantity] = useState<number>(1)
  const [editCourseNumber, setEditCourseNumber] = useState<number>(1)
  const [editSeatNumber, setEditSeatNumber] = useState<number>(1)
  const [editItemNotes, setEditItemNotes] = useState<string>('')
  const [voidReason, setVoidReason] = useState<string>('')
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [sheetSuccess, setSheetSuccess] = useState<string | null>(null)

  const [splitGuests, setSplitGuests] = useState<number>(2)
  const [selectedSplitItemIds, setSelectedSplitItemIds] = useState<string[]>([])
  const [selectedMergeTableIds, setSelectedMergeTableIds] = useState<string[]>([])
  const [processingAction, setProcessingAction] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const res: any = await request('/api/graphql', GET_SERVICE_FLOOR)
      setTables(res.tables || [])
      setOrders(res.restaurantOrders || [])
      setMenuItems(res.menuItems || [])
      if (res.storeSettings) {
        setCurrencyConfig({
          currencyCode: res.storeSettings.currencyCode || 'USD',
          locale: res.storeSettings.locale || 'en-US',
          taxRate: Number(res.storeSettings.taxRate || 0),
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const i = setInterval(fetchData, 10000)
    return () => clearInterval(i)
  }, [])

  const orderByTable = useMemo(() => {
    const map: Record<string, ActiveOrder> = {}
    orders.forEach(o => { o.tables?.forEach(t => { map[t.id] = o }) })
    return map
  }, [orders])

  const counts = useMemo(() => ({
    total: tables.length,
    available: tables.filter(t => t.status === 'available').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    activeChecks: orders.length,
  }), [tables, orders])

  const selectedOrder = selectedTable ? orderByTable[selectedTable.id] : null

  useEffect(() => {
    setSelectedSplitItemIds([])
    setSelectedMergeTableIds([])
    setSheetSuccess(null)
    setSheetError(null)
  }, [selectedOrder?.id])

  const mergeCandidates = useMemo(() => {
    if (!selectedOrder) return []
    const selectedTableIds = new Set((selectedOrder.tables || []).map(t => t.id))
    return tables.filter(t => !selectedTableIds.has(t.id) && ['occupied', 'reserved'].includes(t.status))
  }, [tables, selectedOrder])

  const pendingCourses = useMemo(
    () => (selectedOrder?.courses || []).filter(c => c.status === 'pending').sort((a, b) => a.courseNumber - b.courseNumber),
    [selectedOrder]
  )
  const firedCourses = useMemo(
    () => (selectedOrder?.courses || []).filter(c => c.status === 'fired').sort((a, b) => a.courseNumber - b.courseNumber),
    [selectedOrder]
  )

  const menuItemMap = useMemo(() => {
    const map: Record<string, MenuItem> = {}
    menuItems.forEach(m => { map[m.id] = m })
    return map
  }, [menuItems])

  const selectedMenuItem = selectedMenuItemId ? menuItemMap[selectedMenuItemId] : null
  const modifierGroups = useMemo(() => {
    return Object.entries((selectedMenuItem?.modifiers || []).reduce<Record<string, MenuModifier[]>>((groups, modifier) => {
      const key = modifier.modifierGroup || 'addons'
      groups[key] = [...(groups[key] || []), modifier]
      return groups
    }, {}))
  }, [selectedMenuItem])

  const selectMenuItem = (id: string) => {
    setSelectedMenuItemId(id)
    setSelectedModifierIds(
      (menuItemMap[id]?.modifiers || []).filter((modifier) => modifier.defaultSelected).map((modifier) => modifier.id)
    )
  }

  const toggleModifier = (modifier: MenuModifier) => {
    setSelectedModifierIds((current) => {
      if (current.includes(modifier.id)) return current.filter((id) => id !== modifier.id)
      const selectedInGroup = (selectedMenuItem?.modifiers || []).filter(
        (candidate) => candidate.modifierGroup === modifier.modifierGroup && current.includes(candidate.id)
      )
      if (selectedInGroup.length >= Math.max(1, Number(modifier.maxSelections || 1))) return current
      return [...current, modifier.id]
    })
  }

  const withAction = async (key: string, fn: () => Promise<void>) => {
    try {
      setProcessingAction(key)
      setSheetError(null)
      setSheetSuccess(null)
      await fn()
    } catch (err: any) {
      setSheetError(err?.message || 'Action failed')
    } finally {
      setProcessingAction(null)
    }
  }

  const updateTableStatus = async (tableId: string, nextStatus: Table['status']) => {
    await withAction(`table:${tableId}`, async () => {
      setUpdatingTable(tableId)
      const res: any = await request('/api/graphql', UPDATE_TABLE_STATUS, { tableId, status: nextStatus })
      if (!res?.updateServiceFloorTableStatus?.success) {
        throw new Error(res?.updateServiceFloorTableStatus?.error || 'Unable to update table status')
      }
      await fetchData()
    })
    setUpdatingTable(null)
  }

  const onDropToStatus = async (nextStatus: Table['status']) => {
    if (!dragTableId) return
    const table = tables.find(t => t.id === dragTableId)
    if (!table || table.status === nextStatus) return
    await updateTableStatus(dragTableId, nextStatus)
    setDragTableId(null)
  }

  const addItemToTable = async () => {
    if (!selectedTable || !selectedMenuItemId || quantity < 1) return
    await withAction('add-item', async () => {
      setAddingItem(true)
      const menuItem = menuItemMap[selectedMenuItemId]
      if (!menuItem) throw new Error('Select a valid menu item')

      const orderId = selectedOrder?.id || null

      const res: any = await request('/api/graphql', ADD_SERVICE_FLOOR_ITEM, {
        orderId,
        tableId: selectedTable.id,
        menuItemId: selectedMenuItemId,
        quantity,
        courseNumber,
        seatNumber,
        specialInstructions: itemNotes.trim() || null,
        modifierIds: selectedModifierIds,
      })

      if (!res?.addServiceFloorItem?.id) {
        throw new Error('Unable to add item to this check')
      }
      await fetchData()
      setQuantity(1)
      setCourseNumber(1)
      setSeatNumber(1)
      setItemNotes('')
      setSelectedMenuItemId('')
      setSelectedModifierIds([])
      setSheetSuccess('Item added to check')
    })
    setAddingItem(false)
  }

  const openEditItem = (item: ActiveOrder['orderItems'][number]) => {
    setEditingItem(item)
    setEditQuantity(Math.max(1, item.quantity || 1))
    setEditCourseNumber(Math.max(1, item.courseNumber || 1))
    setEditSeatNumber(Math.max(1, item.seatNumber || 1))
    setEditItemNotes(item.specialInstructions || '')
    setVoidReason('')
  }

  const saveEditItem = async () => {
    if (!editingItem) return
    await withAction(`edit-item:${editingItem.id}`, async () => {
      const res: any = await request('/api/graphql', UPDATE_SERVICE_FLOOR_ITEM, {
        orderItemId: editingItem.id,
        quantity: editQuantity,
        courseNumber: editCourseNumber,
        seatNumber: editSeatNumber,
        specialInstructions: editItemNotes.trim() || '',
      })
      if (!res?.updateServiceFloorItem?.id) throw new Error('Unable to update item')
      await fetchData()
      setEditingItem(null)
      setSheetSuccess('Item updated')
    })
  }

  const voidEditItem = async () => {
    if (!editingItem) return
    const reason = voidReason.trim()
    if (!reason) {
      setSheetError('Void reason is required')
      return
    }
    await withAction(`void-item:${editingItem.id}`, async () => {
      const res: any = await request('/api/graphql', UPDATE_SERVICE_FLOOR_ITEM, {
        orderItemId: editingItem.id,
        voidReason: reason,
      })
      if (!res?.updateServiceFloorItem?.id) throw new Error('Unable to void item')
      await fetchData()
      setEditingItem(null)
      setSheetSuccess('Item voided from check')
    })
  }

  const updateCheckStatus = async (orderId: string, action: 'send_to_kitchen' | 'mark_served' | 'close_check' | 'cancel_check') => {
    await withAction(`check:${action}`, async () => {
      const res: any = await request('/api/graphql', UPDATE_CHECK_STATUS, { orderId, action })
      if (!res?.updateServiceFloorCheckStatus?.success) {
        throw new Error(res?.updateServiceFloorCheckStatus?.error || 'Unable to update check')
      }
      await fetchData()
      const labels: Record<string, string> = {
        send_to_kitchen: 'Order sent to kitchen',
        mark_served: 'Check marked served',
        close_check: 'Check closed',
        cancel_check: 'Check cancelled',
      }
      setSheetSuccess(labels[action])
    })
  }

  const sendOrderToKitchen = async (orderId: string) => updateCheckStatus(orderId, 'send_to_kitchen')

  const splitByGuests = async () => {
    if (!selectedOrder) return
    await withAction('split-guests', async () => {
      const res: any = await request('/api/graphql', SPLIT_CHECK_BY_GUEST, {
        orderId: selectedOrder.id, guestCount: Math.max(2, splitGuests),
      })
      if (!res?.splitCheckByGuest?.success) throw new Error(res?.splitCheckByGuest?.error || 'Failed to split by guests')
      await fetchData()
      setSheetSuccess(`Check split into ${Math.max(2, splitGuests)} guests`)
    })
  }

  const splitByItems = async () => {
    if (!selectedOrder || selectedSplitItemIds.length === 0) return
    await withAction('split-items', async () => {
      const res: any = await request('/api/graphql', SPLIT_CHECK_BY_ITEM, {
        orderId: selectedOrder.id, itemIds: selectedSplitItemIds,
      })
      if (!res?.splitCheckByItem?.success) throw new Error(res?.splitCheckByItem?.error || 'Failed to split items')
      await fetchData()
      setSelectedSplitItemIds([])
      setSheetSuccess('Selected items moved to a new check')
    })
  }

  const mergeTablesIntoCheck = async () => {
    if (!selectedOrder || selectedMergeTableIds.length === 0) return
    await withAction('merge-tables', async () => {
      const res: any = await request('/api/graphql', COMBINE_TABLES, {
        orderId: selectedOrder.id, tableIds: selectedMergeTableIds,
      })
      if (!res?.combineTables?.success) throw new Error(res?.combineTables?.error || 'Failed to combine tables')
      await fetchData()
      setSelectedMergeTableIds([])
      setSheetSuccess('Tables merged')
    })
  }

  const toggleCourseFireHold = async (courseId: string, status: string) => {
    await withAction(`course:${courseId}`, async () => {
      if (status === 'pending') {
        const res: any = await request('/api/graphql', FIRE_COURSE, { courseId })
        if (!res?.fireCourse?.success) throw new Error(res?.fireCourse?.error || 'Failed to fire course')
        setSheetSuccess('Course fired to kitchen')
      } else {
        const res: any = await request('/api/graphql', RECALL_COURSE, { courseId })
        if (!res?.recallCourse?.success) throw new Error(res?.recallCourse?.error || 'Failed to hold/recall course')
        setSheetSuccess('Course moved to hold')
      }
      await fetchData()
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <PageBreadcrumbs
        items={[
          { type: 'link', label: 'Dashboard', href: '' },
          { type: 'page', label: 'Platform' },
          { type: 'page', label: 'Service Floor' },
        ]}
      />

      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Service Floor</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Drag tables between lanes to update status. Click any table to manage its check.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={fetchData} className="h-8 text-xs">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 text-xs">
              <Link href="/dashboard/platform/pos/tables">Floor map</Link>
            </Button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-4 divide-x border-b border-border">
          <div className="px-5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tables</p>
            <p className="text-xl font-semibold mt-0.5">{counts.total}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Available</p>
            <p className="text-xl font-semibold mt-0.5 text-emerald-600 dark:text-emerald-400">{counts.available}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Occupied</p>
            <p className="text-xl font-semibold mt-0.5 text-rose-600 dark:text-rose-400">{counts.occupied}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active Checks</p>
            <p className="text-xl font-semibold mt-0.5">{counts.activeChecks}</p>
          </div>
        </div>

        {/* Kanban */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 h-full min-h-[400px]">
            {statusOrder.map(laneStatus => {
              const laneTables = tables.filter(t => t.status === laneStatus)
              return (
                <div
                  key={laneStatus}
                  className="rounded-lg border border-border bg-muted/20 overflow-hidden flex flex-col"
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDropToStatus(laneStatus)}
                >
                  {/* Lane header */}
                  <div className="px-3 py-2.5 border-b border-border bg-background flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[laneStatus]}`} />
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
                        {statusLabel[laneStatus]}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{laneTables.length}</span>
                  </div>

                  {/* Table cards */}
                  <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                    {laneTables.map(table => {
                      const activeOrder = orderByTable[table.id]
                      const ageMins = activeOrder
                        ? Math.max(0, Math.floor((Date.now() - new Date(activeOrder.createdAt).getTime()) / 60000))
                        : 0

                      return (
                        <div
                          key={table.id}
                          draggable
                          onDragStart={() => setDragTableId(table.id)}
                          className={`rounded-md border border-border bg-card border-l-2 ${statusBorderLeft[laneStatus]} cursor-pointer hover:shadow-sm transition-shadow p-3`}
                          onClick={() => {
                            setSelectedTable(table)
                            setOpenSheet(true)
                          }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-semibold">Table {table.tableNumber}</p>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Users size={10} />
                                {table.capacity} seats
                              </p>
                            </div>
                            <GripVertical size={13} className="text-muted-foreground/40 mt-0.5" />
                          </div>

                          {activeOrder ? (
                            <div className="rounded border border-border bg-background/70 p-2 space-y-1">
                              <p className="text-xs font-medium">#{activeOrder.orderNumber}</p>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock3 size={9} />{ageMins}m
                                </span>
                                <span className="uppercase text-[10px] tracking-wider">{formatStatusLabel(activeOrder.status)}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{activeOrder.guestCount || 1} guests</span>
                                <span className="font-medium text-foreground">{formatCurrency(activeOrder.total || 0, currencyConfig)}</span>
                              </div>
                              {getPaidAmount(activeOrder) > 0 ? (
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>Paid {formatCurrency(getPaidAmount(activeOrder), currencyConfig)}</span>
                                  <span>Due {formatCurrency(getBalanceDue(activeOrder), currencyConfig)}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">No active check</p>
                          )}

                          {updatingTable === table.id && (
                            <p className="text-[11px] text-muted-foreground mt-1">Updating…</p>
                          )}
                        </div>
                      )
                    })}

                    {laneTables.length === 0 && (
                      <div className="text-center py-8 text-[11px] text-muted-foreground/50 uppercase tracking-wider">
                        Drop here
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Table sheet */}
      <Sheet open={openSheet} onOpenChange={setOpenSheet}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold">
              {selectedTable ? `Table ${selectedTable.tableNumber}` : 'Table'}
            </SheetTitle>
          </SheetHeader>

          {selectedTable && (
            <div className="mt-5 space-y-5 pb-8">
              {/* Active check summary */}
              {selectedOrder ? (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Check #{selectedOrder.orderNumber}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wider">{formatStatusLabel(selectedOrder.status)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
                      <p className="text-sm font-semibold">{formatCurrency(getBalanceDue(selectedOrder), currencyConfig)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border bg-background p-2 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                      <p className="text-xs font-semibold">{formatCurrency(selectedOrder.total || 0, currencyConfig)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</p>
                      <p className="text-xs font-semibold text-emerald-600">{formatCurrency(getPaidAmount(selectedOrder), currencyConfig)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Due</p>
                      <p className="text-xs font-semibold text-primary">{formatCurrency(getBalanceDue(selectedOrder), currencyConfig)}</p>
                    </div>
                  </div>
                  {(selectedOrder.orderItems || []).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      {(selectedOrder.orderItems || []).slice(0, 3).map(i => `${i.quantity}× ${i.menuItem?.name || 'Item'}`).join(', ')}
                      {(selectedOrder.orderItems || []).length > 3 ? ' …' : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  No active check. Adding an item creates a new dine-in order.
                </div>
              )}

              {/* Feedback messages */}
              {sheetError && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {sheetError}
                </div>
              )}
              {sheetSuccess && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  {sheetSuccess}
                </div>
              )}

              {/* Quick add item */}
              <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Quick Add Item</p>
                <Select value={selectedMenuItemId} onValueChange={selectMenuItem}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select menu item" />
                  </SelectTrigger>
                  <SelectContent>
                    {menuItems.map(item => (
                      <SelectItem key={item.id} value={item.id} className="text-xs">
                        {item.name} · {formatCurrency(item.price, currencyConfig)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {modifierGroups.map(([group, modifiers]) => (
                  <div key={group} className="space-y-1.5 rounded-md border border-border p-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>{modifiers[0]?.modifierGroupLabel || group}</span>
                      <span>{modifiers.some((modifier) => modifier.required) ? 'Required' : 'Optional'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {modifiers.map((modifier) => (
                        <label key={modifier.id} className="flex cursor-pointer items-center gap-2 rounded border p-2 text-xs">
                          <Checkbox
                            checked={selectedModifierIds.includes(modifier.id)}
                            onCheckedChange={() => toggleModifier(modifier)}
                          />
                          <span className="min-w-0 truncate">{modifier.name}</span>
                          {Number(modifier.priceAdjustment || 0) !== 0 && (
                            <span className="ml-auto text-muted-foreground">
                              {Number(modifier.priceAdjustment) > 0 ? '+' : ''}{formatCurrency(modifier.priceAdjustment, currencyConfig)}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Qty</p>
                    <Input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={e => setQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Course</p>
                    <Select value={String(courseNumber)} onValueChange={value => setCourseNumber(parseInt(value, 10))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1" className="text-xs">1 · Apps</SelectItem>
                        <SelectItem value="2" className="text-xs">2 · Mains</SelectItem>
                        <SelectItem value="3" className="text-xs">3 · Dessert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Seat</p>
                    <Input
                      type="number"
                      min={1}
                      value={seatNumber}
                      onChange={e => setSeatNumber(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <Textarea
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  placeholder="Item notes, allergies, fire timing…"
                  className="min-h-16 text-xs"
                />
                <Button
                  size="sm"
                  onClick={addItemToTable}
                  disabled={!selectedMenuItemId || addingItem}
                  className="h-8 w-full text-xs"
                >
                  <Plus size={12} className="mr-1" />
                  {addingItem ? 'Adding item…' : selectedOrder ? 'Add to check' : 'Start check with item'}
                </Button>
              </div>

              {/* Check items */}
              {selectedOrder && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Check Items</p>
                    <span className="text-[11px] text-muted-foreground">{selectedOrder.orderItems?.length || 0} items</span>
                  </div>
                  {(selectedOrder.orderItems || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No items on this check yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(selectedOrder.orderItems || []).map(item => (
                        <div key={item.id} className="flex items-start justify-between gap-2 rounded border border-border bg-background px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {item.quantity}× {item.itemNameSnapshot || item.menuItem?.name || 'Item'}
                            </p>
                            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                              Course {item.courseNumber || 1} · Seat {item.seatNumber || 1} · {formatCurrency((item.quantity || 0) * (item.price || 0), currencyConfig)}
                            </p>
                            {item.modifiersSnapshot?.length ? (
                              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                {item.modifiersSnapshot.map((modifier) => modifier.name).join(', ')}
                              </p>
                            ) : null}
                            {item.specialInstructions ? (
                              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.specialInstructions}</p>
                            ) : null}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEditItem(item)}
                          >
                            <Pencil size={11} className="mr-1" /> Edit
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Course control */}
              {selectedOrder && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Flame size={12} /> Course Control
                    </p>
                    <span className="text-[11px] text-muted-foreground">{selectedOrder.courses?.length || 0} courses</span>
                  </div>
                  {(selectedOrder.courses || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No courses on this check yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedOrder.courses.map(course => {
                        const canFire = course.status === 'pending'
                        return (
                          <div key={course.id} className="flex items-center justify-between rounded border border-border bg-background px-3 py-2">
                            <div>
                              <p className="text-xs font-medium">{formatCourseLabel(course.courseType, course.courseNumber)}</p>
                              <p className="text-[10px] uppercase text-muted-foreground">{course.status}</p>
                            </div>
                            <Button
                              size="sm"
                              variant={canFire ? 'default' : 'outline'}
                              onClick={() => toggleCourseFireHold(course.id, course.status)}
                              disabled={processingAction === `course:${course.id}` || !['pending', 'fired'].includes(course.status)}
                              className="h-7 text-xs"
                            >
                              {canFire ? <Flame size={11} className="mr-1" /> : <PauseCircle size={11} className="mr-1" />}
                              {canFire ? 'Fire' : 'Hold'}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!pendingCourses.length || processingAction === 'course:bulk-fire'}
                      onClick={() => pendingCourses[0] && toggleCourseFireHold(pendingCourses[0].id, 'pending')}
                    >
                      <Flame size={11} className="mr-1" /> Fire Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!firedCourses.length || processingAction === 'course:bulk-hold'}
                      onClick={() => firedCourses[0] && toggleCourseFireHold(firedCourses[0].id, 'fired')}
                    >
                      <PauseCircle size={11} className="mr-1" /> Hold Last
                    </Button>
                  </div>
                </div>
              )}

              {/* Merge tables */}
              {selectedOrder && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers size={12} /> Merge Tables
                  </p>
                  {mergeCandidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No merge candidates available.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {mergeCandidates.map(table => (
                        <label key={table.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={selectedMergeTableIds.includes(table.id)}
                            onCheckedChange={checked => {
                              setSelectedMergeTableIds(prev =>
                                checked ? [...prev, table.id] : prev.filter(id => id !== table.id)
                              )
                            }}
                          />
                          Table {table.tableNumber}
                        </label>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={mergeTablesIntoCheck}
                    disabled={selectedMergeTableIds.length === 0 || processingAction === 'merge-tables'}
                  >
                    <Layers size={11} className="mr-1" /> Merge Selected
                  </Button>
                </div>
              )}

              {/* Split check */}
              {selectedOrder && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Split size={12} /> Split Check
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={2}
                      value={splitGuests}
                      onChange={e => setSplitGuests(Math.max(2, parseInt(e.target.value || '2', 10)))}
                      className="w-20 h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={splitByGuests}
                      disabled={processingAction === 'split-guests'}
                    >
                      By Guests
                    </Button>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto rounded border border-border p-2 bg-background">
                    {(selectedOrder.orderItems || []).map(item => (
                      <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedSplitItemIds.includes(item.id)}
                          onCheckedChange={checked => {
                            setSelectedSplitItemIds(prev =>
                              checked ? [...prev, item.id] : prev.filter(id => id !== item.id)
                            )
                          }}
                        />
                        {item.quantity}× {item.menuItem?.name || 'Item'}
                      </label>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={splitByItems}
                    disabled={selectedSplitItemIds.length === 0 || processingAction === 'split-items'}
                  >
                    Split Selected Items
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {selectedOrder ? (
                  <Button
                    className="h-9 text-xs"
                    onClick={() => sendOrderToKitchen(selectedOrder.id)}
                    disabled={!['open', 'sent_to_kitchen'].includes(selectedOrder.status) || processingAction === 'send-kitchen'}
                  >
                    <Send size={12} className="mr-1.5" />
                    {selectedOrder.status === 'open' ? 'Send to Kitchen' : 'Re-send'}
                  </Button>
                ) : (
                  <Button className="h-9 text-xs" disabled>
                    <Send size={12} className="mr-1.5" /> Send to Kitchen
                  </Button>
                )}

                {selectedOrder ? (
                  <Button
                    className="h-9 text-xs"
                    variant="secondary"
                    onClick={() => router.push(`/dashboard/platform/pos/${selectedOrder.id}/payment`)}
                  >
                    <CreditCard size={12} className="mr-1.5" /> Request Bill
                  </Button>
                ) : (
                  <Button className="h-9 text-xs" variant="secondary" disabled>
                    <CreditCard size={12} className="mr-1.5" /> Request Bill
                  </Button>
                )}

                <Button
                  className="h-9 text-xs"
                  variant="outline"
                  onClick={() => router.push(`/dashboard/platform/pos?tableId=${selectedTable.id}`)}
                >
                  <UtensilsCrossed size={12} className="mr-1.5" /> Open POS
                </Button>

                {selectedOrder ? (
                  <Button
                    className="h-9 text-xs"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/platform/orders/${selectedOrder.id}`)}
                  >
                    <ChefHat size={12} className="mr-1.5" /> Open Order
                  </Button>
                ) : (
                  <Button className="h-9 text-xs" variant="outline" disabled>
                    <ChefHat size={12} className="mr-1.5" /> Open Order
                  </Button>
                )}

                {selectedOrder ? (
                  <Button
                    className="h-9 text-xs"
                    variant="outline"
                    onClick={() => updateCheckStatus(selectedOrder.id, 'mark_served')}
                    disabled={!['ready', 'served'].includes(selectedOrder.status) || processingAction === 'check:mark_served'}
                  >
                    Mark Served
                  </Button>
                ) : (
                  <Button className="h-9 text-xs" variant="outline" disabled>Mark Served</Button>
                )}

                {selectedOrder ? (
                  <Button
                    className="h-9 text-xs"
                    variant="outline"
                    onClick={() => updateCheckStatus(selectedOrder.id, 'close_check')}
                    disabled={selectedOrder.status !== 'served' || getBalanceDue(selectedOrder) > 0 || processingAction === 'check:close_check'}
                  >
                    Close Paid Check
                  </Button>
                ) : (
                  <Button className="h-9 text-xs" variant="outline" disabled>Close Paid Check</Button>
                )}

                {selectedOrder ? (
                  <Button
                    className="h-9 text-xs"
                    variant="destructive"
                    onClick={() => updateCheckStatus(selectedOrder.id, 'cancel_check')}
                    disabled={['completed', 'cancelled'].includes(selectedOrder.status) || processingAction === 'check:cancel_check'}
                  >
                    Cancel Check
                  </Button>
                ) : (
                  <Button className="h-9 text-xs" variant="destructive" disabled>Cancel Check</Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit check item</DialogTitle>
          </DialogHeader>
          {editingItem ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium">{editingItem.menuItem?.name || 'Item'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Current line total {formatCurrency((editingItem.quantity || 0) * (editingItem.price || 0), currencyConfig)}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Qty</p>
                  <Input
                    type="number"
                    min={1}
                    value={editQuantity}
                    onChange={e => setEditQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Course</p>
                  <Select value={String(editCourseNumber)} onValueChange={value => setEditCourseNumber(parseInt(value, 10))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1" className="text-xs">1 · Apps</SelectItem>
                      <SelectItem value="2" className="text-xs">2 · Mains</SelectItem>
                      <SelectItem value="3" className="text-xs">3 · Dessert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Seat</p>
                  <Input
                    type="number"
                    min={1}
                    value={editSeatNumber}
                    onChange={e => setEditSeatNumber(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <Textarea
                value={editItemNotes}
                onChange={e => setEditItemNotes(e.target.value)}
                placeholder="Item notes, allergies, timing…"
                className="min-h-20 text-xs"
              />
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-destructive">Void item</p>
                <Input
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  placeholder="Reason required to void"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={voidEditItem}
              disabled={!editingItem || !voidReason.trim() || processingAction === `void-item:${editingItem?.id}`}
            >
              <Trash2 size={13} className="mr-1" /> Void
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button
                size="sm"
                onClick={saveEditItem}
                disabled={!editingItem || processingAction === `edit-item:${editingItem?.id}`}
              >
                Save changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

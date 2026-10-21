'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Users, Clock, RefreshCw, MoveHorizontal, Merge, Save, RotateCcw } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Table {
  id: string
  tableNumber: string
  capacity: number
  status: 'available' | 'occupied' | 'reserved' | 'cleaning'
  shape: 'round' | 'square' | 'rectangle'
  positionX: number
  positionY: number
  floor: {
    id: string
    name: string
  } | null
  section: {
    id: string
    name: string
  } | null
}

interface Floor {
  id: string
  name: string
  level: number
  isActive: boolean
}

interface TableOrder {
  id: string
  orderNumber: string
  status: string
  total: string
  createdAt: string
  guestCount: number
}

const GET_FLOORS = gql`
  query GetFloors {
    floors(where: { isActive: { equals: true } }, orderBy: { level: asc }) {
      id
      name
      level
      isActive
    }
  }
`

const GET_ALL_TABLES = gql`
  query GetAllTables {
    tables(orderBy: { tableNumber: asc }) {
      id
      tableNumber
      capacity
      status
      shape
      positionX
      positionY
      floor {
        id
        name
      }
      section {
        id
        name
      }
    }
  }
`

const GET_TABLE_ORDER = gql`
  query GetTableOrder($tableId: ID!) {
    restaurantOrders(
      where: {
        tables: { some: { id: { equals: $tableId } } }
        status: { in: ["open", "sent_to_kitchen", "in_progress", "ready", "served"] }
      }
      orderBy: { createdAt: desc }
      take: 1
    ) {
      id
      orderNumber
      status
      total
      createdAt
      guestCount
    }
  }
`

const UPDATE_TABLE_STATUS = gql`
  mutation UpdateTableStatus($id: ID!, $status: String!) {
    updateServiceFloorTableStatus(tableId: $id, status: $status) { success error }
  }
`

const UPDATE_TABLE_POSITION = gql`
  mutation UpdateTablePosition($id: ID!, $x: Float!, $y: Float!) {
    updateTable(where: { id: $id }, data: { positionX: $x, positionY: $y }) {
      id
      positionX
      positionY
    }
  }
`

const TRANSFER_TABLE = gql`
  mutation TransferTable($orderId: String!, $fromTableId: String!, $toTableId: String!) {
    transferTable(orderId: $orderId, fromTableId: $fromTableId, toTableId: $toTableId) {
      success
      error
    }
  }
`

const COMBINE_TABLES = gql`
  mutation CombineTables($orderId: String!, $tableIds: [String!]!) {
    combineTables(orderId: $orderId, tableIds: $tableIds) {
      success
      error
    }
  }
`

const statusConfig = {
  available: {
    label: 'Available',
    dotClass: 'bg-emerald-500 dark:bg-emerald-400 outline-3 -outline-offset-1 outline-emerald-100 dark:outline-emerald-900/50',
    fill: 'hsl(142, 76%, 36%)',
    stroke: 'hsl(142, 76%, 46%)',
    glow: 'hsl(142, 76%, 66%)',
  },
  occupied: {
    label: 'Occupied',
    dotClass: 'bg-rose-500 dark:bg-rose-400 outline-3 -outline-offset-1 outline-rose-100 dark:outline-rose-900/50',
    fill: 'hsl(0, 84%, 60%)',
    stroke: 'hsl(0, 84%, 70%)',
    glow: 'hsl(0, 84%, 80%)',
  },
  reserved: {
    label: 'Reserved',
    dotClass: 'bg-amber-500 dark:bg-amber-400 outline-3 -outline-offset-1 outline-amber-100 dark:outline-amber-900/50',
    fill: 'hsl(38, 92%, 50%)',
    stroke: 'hsl(38, 92%, 60%)',
    glow: 'hsl(38, 92%, 70%)',
  },
  cleaning: {
    label: 'Cleaning',
    dotClass: 'bg-zinc-500 dark:bg-zinc-400 outline-3 -outline-offset-1 outline-zinc-100 dark:outline-zinc-900/50',
    fill: 'hsl(215, 16%, 47%)',
    stroke: 'hsl(215, 16%, 57%)',
    glow: 'hsl(215, 16%, 67%)',
  },
}

const FLOOR_PLAN_WIDTH = 1000
const FLOOR_PLAN_HEIGHT = 700
const TABLE_SIZE = 70

export function FloorPlanClient() {
  const router = useRouter()
  const [floors, setFloors] = useState<Floor[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [selectedFloor, setSelectedFloor] = useState<string>('all')
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [tableOrder, setTableOrder] = useState<TableOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [combineDialogOpen, setCombineDialogOpen] = useState(false)
  const [targetTableId, setTargetTableId] = useState<string>('')
  const [tablesToCombine, setTablesToCombine] = useState<string[]>([])
  const [editMode, setEditMode] = useState(false)
  const [draggedTable, setDraggedTable] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const fetchTables = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_ALL_TABLES)
      setTables((data as any).tables || [])
    } catch (err) {
      console.error('Error fetching tables:', err)
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [floorsData, tablesData] = await Promise.all([
          request('/api/graphql', GET_FLOORS),
          request('/api/graphql', GET_ALL_TABLES),
        ])
        setFloors((floorsData as any).floors || [])
        setTables((tablesData as any).tables || [])
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleTableClick = async (table: Table, event: React.MouseEvent) => {
    if (editMode) return
    event.stopPropagation()
    setSelectedTable(table)
    setDialogOpen(true)
    
    if (table.status === 'occupied') {
      try {
        const data = await request('/api/graphql', GET_TABLE_ORDER, { tableId: table.id })
        const orders = (data as any).restaurantOrders || []
        setTableOrder(orders[0] || null)
      } catch (err) {
        console.error('Error fetching table order:', err)
        setTableOrder(null)
      }
    } else {
      setTableOrder(null)
    }
  }

  const handleStatusChange = async (status: string) => {
    if (!selectedTable) return

    try {
      const result: any = await request('/api/graphql', UPDATE_TABLE_STATUS, {
        id: selectedTable.id,
        status,
      })
      if (!result.updateServiceFloorTableStatus.success) throw new Error(result.updateServiceFloorTableStatus.error)
      await fetchTables()
      setDialogOpen(false)
    } catch (err) {
      console.error('Error updating table status:', err)
    }
  }

  const handleDragStart = (tableId: string, event: React.DragEvent) => {
    if (!editMode) return
    setDraggedTable(tableId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (event: React.DragEvent) => {
    if (!editMode) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event: React.DragEvent) => {
    if (!editMode || !draggedTable) return
    event.preventDefault()

    const svg = event.currentTarget as SVGSVGElement
    const rect = svg.getBoundingClientRect()
    const x = Math.max(50, Math.min(FLOOR_PLAN_WIDTH - 150, event.clientX - rect.left))
    const y = Math.max(50, Math.min(FLOOR_PLAN_HEIGHT - 100, event.clientY - rect.top))

    setTables(prev => prev.map(t => 
      t.id === draggedTable ? { ...t, positionX: x, positionY: y } : t
    ))
    setDraggedTable(null)
    setHasChanges(true)
  }

  const savePositions = async () => {
    try {
      await Promise.all(
        tables.map(table =>
          request('/api/graphql', UPDATE_TABLE_POSITION, {
            id: table.id,
            x: Math.round(table.positionX),
            y: Math.round(table.positionY),
          })
        )
      )
      setHasChanges(false)
      setEditMode(false)
      alert('Table positions saved!')
    } catch (err) {
      console.error('Error saving positions:', err)
      alert('Failed to save positions')
    }
  }

  const cancelEdit = () => {
    setEditMode(false)
    setHasChanges(false)
    fetchTables()
  }

  const handleTransfer = async () => {
    if (!tableOrder || !selectedTable || !targetTableId) return

    try {
      const result: any = await request('/api/graphql', TRANSFER_TABLE, {
        orderId: tableOrder.id,
        fromTableId: selectedTable.id,
        toTableId: targetTableId
      })

      if (result.transferTable.success) {
        await fetchTables()
        setTransferDialogOpen(false)
        setDialogOpen(false)
        setTargetTableId('')
      } else {
        alert(result.transferTable.error)
      }
    } catch (err) {
      console.error('Error transferring table:', err)
    }
  }

  const handleCombine = async () => {
    if (!tableOrder || tablesToCombine.length === 0) return

    try {
      const result: any = await request('/api/graphql', COMBINE_TABLES, {
        orderId: tableOrder.id,
        tableIds: tablesToCombine
      })

      if (result.combineTables.success) {
        await fetchTables()
        setCombineDialogOpen(false)
        setDialogOpen(false)
        setTablesToCombine([])
      } else {
        alert(result.combineTables.error)
      }
    } catch (err) {
      console.error('Error combining tables:', err)
    }
  }

  const handleStartOrder = () => {
    if (selectedTable) {
      router.push(`/dashboard/platform/pos?tableId=${selectedTable.id}`)
    }
  }

  const handleViewOrder = () => {
    if (tableOrder) {
      router.push(`/dashboard/platform/pos/${tableOrder.id}/payment`)
    }
  }

  const renderTable = (table: Table) => {
    const colors = statusConfig[table.status] || statusConfig.available
    const x = table.positionX
    const y = table.positionY
    const isRound = table.shape === 'round'
    const isSquare = table.shape === 'square'
    const size = TABLE_SIZE
    const halfSize = size / 2

    const handleClick = (e: React.MouseEvent<SVGGElement>) => {
      handleTableClick(table, e as any)
    }

    const handleDragStartWrapper = (e: React.DragEvent<SVGGElement>) => {
      handleDragStart(table.id, e as any)
    }

    return (
      <g
        key={table.id}
        className={cn(
          'transition-all duration-200',
          editMode ? 'cursor-move' : 'cursor-pointer',
          draggedTable === table.id && 'opacity-50'
        )}
        {...(editMode ? { draggable: 'true' as any } : {})}
        onDragStart={handleDragStartWrapper as any}
        onClick={handleClick as any}
      >
        <defs>
          <filter id={`glow-${table.id}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`grad-${table.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.fill} stopOpacity="0.9" />
            <stop offset="100%" stopColor={colors.stroke} stopOpacity="1" />
          </linearGradient>
        </defs>

        {isRound ? (
          <>
            <circle
              cx={x}
              cy={y}
              r={halfSize - 4}
              fill={`url(#grad-${table.id})`}
              stroke={colors.glow}
              strokeWidth="3"
              filter={`url(#glow-${table.id})`}
            />
            <circle
              cx={x}
              cy={y}
              r={halfSize - 8}
              fill="none"
              stroke="white"
              strokeWidth="1"
              opacity="0.3"
            />
          </>
        ) : isSquare ? (
          <>
            <rect
              x={x - halfSize + 4}
              y={y - halfSize + 4}
              width={size - 8}
              height={size - 8}
              rx={8}
              fill={`url(#grad-${table.id})`}
              stroke={colors.glow}
              strokeWidth="3"
              filter={`url(#glow-${table.id})`}
            />
            <rect
              x={x - halfSize + 8}
              y={y - halfSize + 8}
              width={size - 16}
              height={size - 16}
              rx={6}
              fill="none"
              stroke="white"
              strokeWidth="1"
              opacity="0.3"
            />
          </>
        ) : (
          <>
            <rect
              x={x - halfSize}
              y={y - halfSize / 2}
              width={size * 1.4}
              height={halfSize}
              rx={8}
              fill={`url(#grad-${table.id})`}
              stroke={colors.glow}
              strokeWidth="3"
              filter={`url(#glow-${table.id})`}
            />
            <rect
              x={x - halfSize + 4}
              y={y - halfSize / 2 + 4}
              width={size * 1.4 - 8}
              height={halfSize - 8}
              rx={6}
              fill="none"
              stroke="white"
              strokeWidth="1"
              opacity="0.3"
            />
          </>
        )}

        <text
          x={x}
          y={y - 6}
          textAnchor="middle"
          fill="white"
          fontSize="16"
          fontWeight="700"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          T{table.tableNumber}
        </text>

        <g transform={`translate(${x - 18}, ${y + 4})`}>
          <circle cx="9" cy="6" r="9" fill="rgba(255,255,255,0.2)" />
          <svg width="18" height="12" viewBox="0 0 18 12">
            <path
              d="M9 0C6.79 0 5 1.79 5 4C5 6.21 6.79 8 9 8C11.21 8 13 6.21 13 4C13 1.79 11.21 0 9 0ZM9 10C6 10 0 11.34 0 14V16H18V14C18 11.34 12 10 9 10Z"
              transform="scale(0.5)"
              fill="white"
            />
          </svg>
        </g>
        <text
          x={x + 12}
          y={y + 14}
          textAnchor="start"
          fill="white"
          fontSize="11"
          fontWeight="600"
        >
          {table.capacity}
        </text>
      </g>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="animate-spin" />
      </div>
    )
  }

  const statusCounts = tables.reduce((acc, table) => {
    acc[table.status] = (acc[table.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex flex-col h-full gap-6 px-4 md:px-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={fetchTables}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          {!editMode ? (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              Rearrange Tables
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={savePositions} disabled={!hasChanges}>
                <Save className="h-4 w-4 mr-2" />
                Save Layout
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              {editMode && (
                <span className="text-xs text-muted-foreground">Drag tables to reposition</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(statusConfig).map(([status, config]) => (
            <div
              key={status}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent"
            >
              <span className={cn('inline-block size-1.5 rounded-full outline', config.dotClass)} />
              {config.label} ({statusCounts[status] || 0})
            </div>
          ))}
        </div>
      </div>

      <Card className="flex-1 rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle>Floor Plan {editMode && <span className="text-sm font-normal text-muted-foreground ml-2">(Edit Mode)</span>}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="p-6 flex justify-center">
              <svg
                width={FLOOR_PLAN_WIDTH}
                height={FLOOR_PLAN_HEIGHT}
                className="border rounded-2xl bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 shadow-inner"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <defs>
                  <pattern
                    id="grid"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="0" cy="0" r="1" fill="currentColor" opacity="0.1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                {tables.map(renderTable)}
              </svg>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Table {selectedTable?.tableNumber}
              {selectedTable && (
                <Badge
                  style={{
                    backgroundColor: statusConfig[selectedTable.status]?.fill,
                    color: 'white',
                  }}
                >
                  {statusConfig[selectedTable.status]?.label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedTable && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>Capacity: {selectedTable.capacity}</span>
                </div>
              </div>

              {tableOrder && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Active Order</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium">#{tableOrder.orderNumber}</div>
                        <div className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(tableOrder.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${parseFloat(tableOrder.total).toFixed(2)}</div>
                        <Badge variant="outline">{tableOrder.status}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setTransferDialogOpen(true)}>
                        <MoveHorizontal className="h-4 w-4 mr-2" />
                        Transfer
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCombineDialogOpen(true)}>
                        <Merge className="h-4 w-4 mr-2" />
                        Combine
                      </Button>
                    </div>
                    <Button className="w-full" size="sm" onClick={handleViewOrder}>
                      View Order
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium">Change Status</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(statusConfig).map(([status, colors]) => (
                    <Button
                      key={status}
                      variant={selectedTable.status === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleStatusChange(status)}
                      disabled={selectedTable.status === status}
                      style={selectedTable.status === status ? { backgroundColor: colors.fill, color: 'white' } : {}}
                    >
                      {colors.label}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedTable.status === 'available' && (
                <Button className="w-full" onClick={handleStartOrder}>
                  Start New Order
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Table {selectedTable?.tableNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Target Table</Label>
              <Select value={targetTableId} onValueChange={setTargetTableId}>
                <SelectTrigger>
                  <SelectValue placeholder="Target table" />
                </SelectTrigger>
                <SelectContent>
                  {tables.filter(t => t.status === 'available' && t.id !== selectedTable?.id).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      Table {t.tableNumber} (Cap: {t.capacity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleTransfer} disabled={!targetTableId}>
              Transfer Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={combineDialogOpen} onOpenChange={setCombineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Combine Tables with {selectedTable?.tableNumber}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
            <div className="grid grid-cols-2 gap-4">
              {tables.filter(t => t.status === 'available' && t.id !== selectedTable?.id).map(t => (
                <div key={t.id} className="flex items-center space-x-2 p-2 border rounded-md hover:bg-muted cursor-pointer" onClick={() => {
                  setTablesToCombine(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])
                }}>
                  <Checkbox checked={tablesToCombine.includes(t.id)} />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Table {t.tableNumber}</span>
                    <span className="text-xs text-muted-foreground">Cap: {t.capacity}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <Button className="w-full mt-4" onClick={handleCombine} disabled={tablesToCombine.length === 0}>
            Combine {tablesToCombine.length} Table(s)
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{children}</label>
}

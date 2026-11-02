'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Search,
  X,
  Users,
  Edit2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { EditItemDrawerClientWrapper } from '@/features/platform/components/EditItemDrawerClientWrapper'
import { CreateItemDrawerClientWrapper } from '@/features/platform/components/CreateItemDrawerClientWrapper'

interface StaffMember {
  id: string
  name: string
  email: string
  staffRole: string | null
  employeeId: string | null
  isActive: boolean | null
  hireDate: string | null
  role: { id: string; name: string } | null
}

const ROLE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  server:    { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Server'    },
  bartender: { bg: 'bg-purple-50',  text: 'text-purple-700',  label: 'Bartender' },
  host:      { bg: 'bg-pink-50',    text: 'text-pink-700',    label: 'Host'      },
  cook:      { bg: 'bg-orange-50',  text: 'text-orange-700',  label: 'Cook'      },
  manager:   { bg: 'bg-indigo-50',  text: 'text-indigo-700',  label: 'Manager'   },
  admin:     { bg: 'bg-zinc-100',   text: 'text-zinc-700',    label: 'Admin'     },
  busser:    { bg: 'bg-lime-50',    text: 'text-lime-700',    label: 'Busser'    },
  chef:      { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Chef'      },
}

const STAFF_ROLES = Object.keys(ROLE_CONFIG)

const GET_STAFF = gql`
  query GetStaff {
    users(orderBy: { name: asc }, take: 200) {
      id name email staffRole employeeId isActive hireDate
      role { id name }
    }
  }
`

export function StaffListPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [activeRole, setActiveRole] = useState<string>('all')
  const [activeStatus, setActiveStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res: any = await request('/api/graphql', GET_STAFF)
      setStaff(res.users || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Derived stats
  const total = staff.length
  const active = staff.filter((s) => s.isActive !== false).length
  const inactive = total - active
  const roleCounts = STAFF_ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r] = staff.filter((s) => s.staffRole === r).length
    return acc
  }, {})

  // Filter
  const filtered = staff.filter((member) => {
    const matchRole = activeRole === 'all' || member.staffRole === activeRole
    const matchStatus =
      activeStatus === 'all' ||
      (activeStatus === 'active' && member.isActive !== false) ||
      (activeStatus === 'inactive' && member.isActive === false)
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      member.name.toLowerCase().includes(q) ||
      member.email.toLowerCase().includes(q) ||
      (member.employeeId && member.employeeId.toLowerCase().includes(q))
    return matchRole && matchStatus && matchSearch
  })

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Staff' },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} team member{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setIsCreateOpen(true)}>
          <Plus size={13} className="mr-1.5" />
          Add Staff Member
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-xs md:text-[11px] uppercase tracking-wider text-muted-foreground">Total Staff</p>
          <p className="text-xl font-semibold mt-1">{total}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-xs md:text-[11px] uppercase tracking-wider text-muted-foreground">Active</p>
          <p className={cn('text-xl font-semibold mt-1', active > 0 && 'text-emerald-600')}>{active}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-xs md:text-[11px] uppercase tracking-wider text-muted-foreground">Inactive</p>
          <p className={cn('text-xl font-semibold mt-1', inactive > 0 && 'text-zinc-500')}>{inactive}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-xs md:text-[11px] uppercase tracking-wider text-muted-foreground">Roles</p>
          <p className="text-xl font-semibold mt-1">
            {STAFF_ROLES.filter((r) => roleCounts[r] > 0).length}
          </p>
        </div>
      </div>

      {/* Role filter tabs */}
      <div className="border-b border-border">
        <div className="px-4 md:px-6 flex items-center gap-0 overflow-x-auto">
          <button
            onClick={() => setActiveRole('all')}
            className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
              activeRole === 'all'
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            All
            <span className="ml-1.5 text-xs md:text-[10px] text-muted-foreground">{total}</span>
          </button>
          {STAFF_ROLES.filter((r) => roleCounts[r] > 0).map((role) => (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={cn(
                'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                activeRole === role
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {ROLE_CONFIG[role]?.label ?? role}
              <span className="ml-1.5 text-xs md:text-[10px] text-muted-foreground">{roleCounts[role]}</span>
            </button>
          ))}

          {/* Status toggle on right */}
          <div className="ml-auto flex items-center gap-0 pl-4 shrink-0">
            <div className="border border-border rounded overflow-hidden flex text-xs md:text-[11px] uppercase tracking-wider font-semibold">
              {(['all', 'active', 'inactive'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setActiveStatus(s)}
                  className={cn(
                    'px-3 py-1.5 transition-colors',
                    activeStatus === s
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 md:px-6 py-2.5 border-b border-border">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or employee ID…"
            className="w-full h-8 pl-8 pr-8 text-sm bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Staff list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={28} className="text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {searchQuery ? 'No staff members match your search.' : 'No staff members yet.'}
            </p>
            {!searchQuery && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsCreateOpen(true)}>
                <Plus size={12} className="mr-1.5" /> Add First Staff Member
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Column header */}
            <div className="hidden md:grid grid-cols-[1fr_160px_120px_100px_80px_44px] border-b border-border px-4 md:px-6 py-2 bg-muted/20">
              {['Name', 'Email', 'Role', 'Employee ID', 'Status', ''].map((h, i) => (
                <span key={i} className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {h}
                </span>
              ))}
            </div>

            <div className="divide-y divide-border">
              {filtered.map((member) => {
                const rc = member.staffRole ? ROLE_CONFIG[member.staffRole] : null
                const isActive = member.isActive !== false
                return (
                  <div
                    key={member.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1 md:gap-y-0 md:grid-cols-[1fr_160px_120px_100px_80px_44px] px-4 md:px-6 py-3 items-center hover:bg-muted/20 transition-colors group"
                  >
                    {/* Name + hire date */}
                    <div className="min-w-0 max-md:order-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium truncate">{member.name}</span>
                      </div>
                    </div>

                    <span className="text-xs text-muted-foreground truncate max-md:order-3 max-md:col-span-2">{member.email}</span>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 max-md:order-4 max-md:col-span-2 md:contents">
                    <span className={cn(!rc && 'max-md:hidden')}>
                      {rc ? (
                        <span className={cn('text-xs md:text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded', rc.bg, rc.text)}>
                          {rc.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </span>

                    <span className={cn('text-xs text-muted-foreground font-mono', !member.employeeId && 'max-md:hidden')}>{member.employeeId ?? '—'}</span>

                    <span className="flex items-center gap-1">
                      {isActive ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : (
                        <XCircle size={14} className="text-zinc-400" />
                      )}
                      <span className={cn('text-xs md:text-[11px]', isActive ? 'text-emerald-600' : 'text-zinc-400')}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </span>
                    </div>

                    <div className="flex items-center justify-end max-md:order-2 max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingId(member.id)}
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

      {/* Edit drawer */}
      {editingId && (
        <EditItemDrawerClientWrapper
          listKey="users"
          itemId={editingId}
          open={!!editingId}
          onClose={() => setEditingId(null)}
          onSave={() => fetchData()}
        />
      )}

      {/* Create drawer */}
      <CreateItemDrawerClientWrapper
        listKey="users"
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={() => fetchData()}
      />
    </div>
  )
}

export default StaffListPage

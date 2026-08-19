/**
 * PaymentProviderListPageClient - Payment Providers Platform Page
 */

'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, CreditCard, CheckCircle2, Circle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlatformFilterBar } from '../../components/PlatformFilterBar'
import { CreateItemDrawerClientWrapper } from '@/features/platform/components/CreateItemDrawerClientWrapper'
import { EditItemDrawerClientWrapper } from '@/features/platform/components/EditItemDrawerClientWrapper'
import { useDashboard } from '../../../dashboard/context/DashboardProvider'
import { useListItemsQuery } from '../../../dashboard/hooks/useListItems.query'
import { buildOrderByClause } from '../../../dashboard/lib/buildOrderByClause'
import { buildWhereClause } from '../../../dashboard/lib/buildWhereClause'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { cn } from '@/lib/utils'

interface PaymentProviderListPageClientProps {
  list: any
  initialData: { items: any[], count: number }
  initialError: string | null
  initialSearchParams: {
    page: number
    pageSize: number
    search: string
  }
  statusCounts: {
    all: number
    installed: number
    notInstalled: number
  } | null
}

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  pp_stripe_stripe: 'Stripe',
  pp_paypal_paypal: 'PayPal',
  pp_system_default: 'Manual / Cash',
}

export function PaymentProviderListPageClient({
  list,
  initialData,
  initialError,
  initialSearchParams,
  statusCounts
}: PaymentProviderListPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { basePath } = useDashboard()
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)

  const currentSearchParams = useMemo(() => {
    const params: Record<string, string> = {}
    searchParams?.forEach((value, key) => { params[key] = value })
    return params
  }, [searchParams])

  const currentPage = parseInt(currentSearchParams.page || '1', 10) || 1
  const pageSize = parseInt(currentSearchParams.pageSize || list.pageSize?.toString() || '50', 10)
  const searchString = currentSearchParams.search || ''

  const variables = useMemo(() => {
    const orderBy = buildOrderByClause(list, currentSearchParams)
    const filterWhere = buildWhereClause(list, currentSearchParams)
    const searchParameters = searchString ? { search: searchString } : {}
    const searchWhere = buildWhereClause(list, searchParameters)
    const whereConditions = []
    if (Object.keys(searchWhere).length > 0) whereConditions.push(searchWhere)
    if (Object.keys(filterWhere).length > 0) whereConditions.push(filterWhere)
    const where = whereConditions.length > 0 ? { AND: whereConditions } : {}
    return { where, take: pageSize, skip: (currentPage - 1) * pageSize, orderBy }
  }, [list, currentSearchParams, currentPage, pageSize, searchString])

  const querySelectedFields = `id name code isInstalled credentials metadata createdAt`

  const { data: queryData, error: queryError } = useListItemsQuery(
    { listKey: list.key, variables, selectedFields: querySelectedFields },
    { initialData: initialError ? undefined : initialData }
  )

  const data = queryData || initialData
  const error = queryError ? queryError.message : initialError

  const handleResetFilters = useCallback(() => { router.push(window.location.pathname) }, [router])

  const isEmpty = data?.count === 0 && !searchString
  const connectedCount = data?.items?.filter((p: any) => p.isInstalled).length || 0

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs
        items={[
          { type: 'link', label: 'Dashboard', href: '' },
          { type: 'page', label: 'Platform' },
          { type: 'page', label: 'Payment Providers' },
        ]}
      />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payment Providers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect payment processors to accept orders online and in-person.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setIsCreateDrawerOpen(true)}>
          <Plus size={13} className="mr-1.5" />
          Connect Provider
        </Button>
      </div>

      {/* Stat Strip */}
      <div className="grid grid-cols-3 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Providers</p>
          <p className="text-xl font-semibold mt-1">{data?.count || 0}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Connected</p>
          <p className="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">{connectedCount}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Not Connected</p>
          <p className="text-xl font-semibold mt-1">{(data?.count || 0) - connectedCount}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 md:px-6 py-3 border-b border-border">
        <PlatformFilterBar list={list} showDisplayButton={false} />
      </div>

      {/* Provider list */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {error ? (
            <div className="p-4 md:p-6">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : isEmpty ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-8">
              <CreditCard size={28} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium mb-1">No payment providers yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mb-4">
                Connect a payment provider to start accepting payments online and in-person.
              </p>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsCreateDrawerOpen(true)}>
                <Plus size={12} className="mr-1.5" /> Connect Provider
              </Button>
            </div>
          ) : (
            data?.items?.map((provider: any) => {
              const isConnected = provider.isInstalled
              const typeLabel = PROVIDER_TYPE_LABELS[provider.code] || provider.name || 'Unknown'
              const hasCredentials = provider.credentials && Object.keys(provider.credentials).length > 0

              return (
                <div
                  key={provider.id}
                  className="px-4 md:px-6 py-4 hover:bg-muted/20 transition-colors flex items-center gap-4 group"
                >
                  {/* Icon */}
                  <div className="w-9 h-9 rounded border border-border bg-card flex items-center justify-center shrink-0">
                    <CreditCard size={16} className="text-muted-foreground" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{provider.name}</p>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
                            {typeLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {/* Connection status */}
                          <span className={cn(
                            'text-[11px] flex items-center gap-1 font-medium',
                            isConnected ? 'text-emerald-600' : 'text-muted-foreground'
                          )}>
                            {isConnected
                              ? <CheckCircle2 size={11} />
                              : <Circle size={11} />
                            }
                            {isConnected ? 'Connected' : 'Not connected'}
                          </span>

                          {/* Credentials status */}
                          <span className="text-[11px] text-muted-foreground">
                            {hasCredentials ? 'Credentials configured' : 'No credentials'}
                          </span>

                        </div>
                      </div>

                      {/* Actions (visible on hover) */}
                      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-3"
                          onClick={() => setEditingProviderId(provider.id)}
                        >
                          Manage
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      <CreateItemDrawerClientWrapper
        listKey="payment-providers"
        open={isCreateDrawerOpen}
        onClose={() => setIsCreateDrawerOpen(false)}
        onCreate={() => window.location.reload()}
      />

      {editingProviderId && (
        <EditItemDrawerClientWrapper
          listKey="payment-providers"
          itemId={editingProviderId}
          open={!!editingProviderId}
          onClose={() => setEditingProviderId(null)}
          onSave={() => window.location.reload()}
        />
      )}
    </div>
  )
}

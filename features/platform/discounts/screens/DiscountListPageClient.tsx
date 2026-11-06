/**
 * DiscountListPageClient - Client Component  
 * Redesigned for a modern hospitality aesthetic
 */

'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Plus,
  Search,
  Ticket,
  RefreshCw
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { PlatformFilterBar } from '../../components/PlatformFilterBar'
import { StatusTabs } from '../components/StatusTabs'
import { DiscountDetailsComponent } from '../components/DiscountDetailsComponent'
import { Pagination } from '../../../dashboard/components/Pagination'
import { FilterList } from '../../../dashboard/components/FilterList'
import { CreateItemDrawerClientWrapper } from '@/features/platform/components/CreateItemDrawerClientWrapper'
import { useDashboard } from '../../../dashboard/context/DashboardProvider'
import { useSelectedFields } from '../../../dashboard/hooks/useSelectedFields'
import { useSort } from '../../../dashboard/hooks/useSort'
import { useListItemsQuery } from '../../../dashboard/hooks/useListItems.query'
import { buildOrderByClause } from '../../../dashboard/lib/buildOrderByClause'
import { buildWhereClause } from '../../../dashboard/lib/buildWhereClause'
import { ScrollArea } from '@/components/ui/scroll-area'

interface DiscountListPageClientProps {
  list: any
  initialData: { items: any[], count: number }
  initialError: string | null
  initialSearchParams: {
    page: number
    pageSize: number  
    search: string
  }
  statusCounts: {
    active: number
    all: number
    disabled: number
  } | null
}

export function DiscountListPageClient({
  list,
  initialData,
  initialError,
  initialSearchParams,
  statusCounts
}: DiscountListPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { basePath } = useDashboard()
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false)

  // Hooks for sorting and field selection
  const selectedFields = useSelectedFields(list)
  const sort = useSort(list)

  // Extract current search params
  const currentSearchParams = useMemo(() => {
    const params: Record<string, string> = {}
    searchParams?.forEach((value, key) => {
      params[key] = value
    })
    return params
  }, [searchParams])

  const currentPage = parseInt(currentSearchParams.page || '1', 10) || 1
  const pageSize = parseInt(currentSearchParams.pageSize || list.pageSize?.toString() || '50', 10)
  const searchString = currentSearchParams.search || ''

  // Build query variables
  const variables = useMemo(() => {
    const orderBy = buildOrderByClause(list, currentSearchParams)
    const filterWhere = buildWhereClause(list, currentSearchParams)
    const searchParameters = searchString ? { search: searchString } : {}
    const searchWhere = buildWhereClause(list, searchParameters)

    const whereConditions = []
    if (Object.keys(searchWhere).length > 0) {
      whereConditions.push(searchWhere)
    }
    if (Object.keys(filterWhere).length > 0) {
      whereConditions.push(filterWhere)
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {}

    return {
      where,
      take: pageSize,
      skip: (currentPage - 1) * pageSize,
      orderBy
    }
  }, [list, currentSearchParams, currentPage, pageSize, searchString])

  const querySelectedFields = `
    id code isDynamic isDisabled stackable startsAt endsAt usageLimit usageCount validDuration createdAt updatedAt
    discountRule {
      id type value description allocation
    }
    orders {
      id orderNumber createdAt status total
    }
  `

  const { data: queryData, error: queryError, isLoading, isFetching } = useListItemsQuery(
    {
      listKey: list.key,
      variables,
      selectedFields: querySelectedFields
    },
    {
      initialData: initialError ? undefined : initialData,
    }
  )

  const data = queryData || initialData
  const error = queryError ? queryError.message : initialError

  const handleResetFilters = useCallback(() => {
    router.push(window.location.pathname)
  }, [router])

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Discounts' }
  ]

  const isEmpty = data?.count === 0 && !searchString

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discounts & Promos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure and manage active promotions.</p>
        </div>
        <Button
          onClick={() => setIsCreateDrawerOpen(true)}
          size="sm"
          className="h-8 text-xs"
        >
          <Plus className="size-3.5 mr-1.5" />
          Create Discount
        </Button>
      </div>

      {/* Stats/Tabs Section */}
      {statusCounts && (
        <div className="border-b border-border">
          <StatusTabs statusCounts={statusCounts} />
        </div>
      )}

      {/* Filter/Search Bar */}
      <div className="px-4 md:px-6 py-2.5 border-b border-border">
        <PlatformFilterBar
          list={list}
          showDisplayButton={true}
          selectedFields={selectedFields}
        />
        <FilterList list={list} />
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="pb-8">
          {error ? (
            <div className="p-4 md:p-6">
              <Alert variant="destructive">
                <AlertDescription>Failed to load discounts: {error}</AlertDescription>
              </Alert>
            </div>
          ) : isEmpty ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-8">
              <Ticket size={28} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium mb-1">No active promotions</p>
              <p className="text-xs text-muted-foreground max-w-xs mb-4">
                Start growing your sales by creating your first discount or coupon code.
              </p>
              <Button onClick={() => setIsCreateDrawerOpen(true)} size="sm" variant="outline" className="h-8 text-xs">
                <Plus className="size-3 mr-1.5" /> Create First Discount
              </Button>
            </div>
          ) : data?.count === 0 ? (
            <div className="py-12 text-center flex flex-col items-center">
              <Search className="size-8 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No results matching your filter.</p>
              <button onClick={handleResetFilters} className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground mt-2">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {data?.items?.map((discount: any) => (
                  <DiscountDetailsComponent key={discount.id} discount={discount} list={list} />
                ))}
              </div>
              {data && data.count > pageSize && (
                <div className="px-4 md:px-6 py-6">
                  <Pagination
                    currentPage={currentPage}
                    total={data.count}
                    pageSize={pageSize}
                    list={{ singular: 'discount', plural: 'discounts' }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <CreateItemDrawerClientWrapper
        listKey="discounts"
        open={isCreateDrawerOpen}
        onClose={() => setIsCreateDrawerOpen(false)}
        onCreate={() => { window.location.reload() }}
      />
    </div>
  )
}

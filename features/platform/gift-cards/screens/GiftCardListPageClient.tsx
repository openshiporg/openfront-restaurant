/**
 * GiftCardListPageClient - Client Component  
 * Redesigned with a premium card-focused aesthetic
 */

'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Plus,
  Search,
  CreditCard,
  RefreshCw
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { PlatformFilterBar } from '../../components/PlatformFilterBar'
import { StatusTabs } from '../components/StatusTabs'
import { GiftCardDetailsComponent } from '../components/GiftCardDetailsComponent'
import { Pagination } from '../../../dashboard/components/Pagination'
import { FilterList } from '../../../dashboard/components/FilterList'
import { RestaurantNotifications } from '@/features/platform/payments/components/RestaurantNotifications'
import { IssueGiftCard } from '@/features/platform/payments/components/IssueGiftCard'
import { useDashboard } from '../../../dashboard/context/DashboardProvider'
import { useSelectedFields } from '../../../dashboard/hooks/useSelectedFields'
import { useSort } from '../../../dashboard/hooks/useSort'
import { useListItemsQuery } from '../../../dashboard/hooks/useListItems.query'
import { buildOrderByClause } from '../../../dashboard/lib/buildOrderByClause'
import { buildWhereClause } from '../../../dashboard/lib/buildWhereClause'
import { ScrollArea } from '@/components/ui/scroll-area'

interface GiftCardListPageClientProps {
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
  currencyCode?: string
  locale?: string
}

export function GiftCardListPageClient({
  list,
  initialData,
  initialError,
  initialSearchParams,
  statusCounts,
  currencyCode = "USD",
  locale = "en-US"
}: GiftCardListPageClientProps) {
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
    id code value balance isDisabled endsAt metadata createdAt updatedAt
    order {
      id orderNumber total
    }
    giftCardTransactions {
      id amount createdAt
      order { id orderNumber total }
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

  const isEmpty = data?.count === 0 && !searchString

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'GiftCards' }
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gift Cards</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Issue and track stored value cards for your customers.</p>
        </div>
        <Button
          onClick={() => setIsCreateDrawerOpen(true)}
          size="sm"
          className="h-8 text-xs"
        >
          <Plus className="size-3.5 mr-1.5" />
          Issue New Card
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
                <AlertDescription>Failed to load gift cards: {error}</AlertDescription>
              </Alert>
            </div>
          ) : isEmpty ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-8">
              <CreditCard size={28} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium mb-1">No gift cards issued</p>
              <p className="text-xs text-muted-foreground max-w-xs mb-4">
                Gift cards are a great way to increase customer loyalty and upfront cash flow.
              </p>
              <Button onClick={() => setIsCreateDrawerOpen(true)} size="sm" variant="outline" className="h-8 text-xs">
                <Plus className="size-3 mr-1.5" /> Issue First Card
              </Button>
            </div>
          ) : data?.count === 0 ? (
            <div className="py-12 text-center flex flex-col items-center">
              <Search className="size-8 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No gift cards match your search.</p>
              <button onClick={handleResetFilters} className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground mt-2">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {data?.items?.map((giftcard: any) => (
                  <GiftCardDetailsComponent
                    key={giftcard.id}
                    giftcard={giftcard}
                    list={list}
                    currencyCode={currencyCode}
                    locale={locale}
                  />
                ))}
              </div>
              {data && data.count > pageSize && (
                <div className="px-4 md:px-6 py-6">
                  <Pagination
                    currentPage={currentPage}
                    total={data.count}
                    pageSize={pageSize}
                    list={{ singular: 'giftcard', plural: 'giftcards' }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 space-y-4"><RestaurantNotifications /></div>
      {isCreateDrawerOpen && <div className="p-4"><IssueGiftCard /><Button variant="outline" onClick={() => { setIsCreateDrawerOpen(false); window.location.reload(); }}>Close and refresh</Button></div>}
    </div>
  )
}

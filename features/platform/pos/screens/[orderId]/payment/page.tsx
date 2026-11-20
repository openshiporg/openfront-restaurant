/**
 * Payment Page - Server Component
 * Payment processing interface for POS orders
 */

import React from 'react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { notFound } from 'next/navigation'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PaymentClient } from './PaymentClient'

interface PaymentPageProps {
  params: Promise<{ orderId: string }>
}

export async function PaymentPage({ params }: PaymentPageProps) {
  const { orderId } = await params
  const found = await keystoneClient<{ restaurantOrder: { id: string } | null }>(
    `query PosPaymentOrder($id: ID!) { restaurantOrder(where: { id: $id }) { id } }`,
    { id: orderId },
  )
  if (found.success && !found.data?.restaurantOrder) notFound()

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Payment</h1>
      <p className="text-muted-foreground">Process payment for order</p>
    </div>
  )

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'link' as const, label: 'POS', href: '/platform/pos' },
    { type: 'page' as const, label: 'Payment' }
  ]

  return (
    <PageContainer title="Payment" header={header} breadcrumbs={breadcrumbs}>
      <PaymentClient orderId={orderId} />
    </PageContainer>
  )
}

export default PaymentPage

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Banknote,
  CreditCard,
  Gift,
  SplitSquareVertical,
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { formatCurrency, fromMinorUnits, toMinorUnits } from '@/features/storefront/lib/currency'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

interface OrderItem {
  id: string
  quantity: number
  price: string
  itemNameSnapshot: string
  menuItem: {
    id: string
    name: string
  } | null
}

interface Payment {
  id: string
  amount: string
  status: string
  paymentMethod: string
}

interface Order {
  id: string
  orderNumber: string
  status: string
  subtotal: string
  tax: string
  tip: string
  discount: string
  total: string
  orderItems: OrderItem[]
  payments: Payment[]
  tables: {
    id: string
    tableNumber: string
  }[]
}

interface SplitPayment {
  id: string
  amount: number
  method: 'cash' | 'card' | 'gift_card'
  status: 'pending' | 'processing' | 'completed'
  giftCardCode?: string
}

const GET_ORDER = gql`
  query GetOrder($id: ID!) {
    restaurantOrder(where: { id: $id }) {
      id
      orderNumber
      status
      subtotal
      tax
      tip
      discount
      total
      orderItems {
        id
        quantity
        price
        itemNameSnapshot
        menuItem {
          id
          name
        }
      }
      payments {
        id
        amount
        status
        paymentMethod
      }
      tables {
        id
        tableNumber
      }
    }
    storeSettings {
      currencyCode
      locale
      paymentProviders { provider publishableKey }
    }
  }
`

const PROCESS_PAYMENT = gql`
  mutation ProcessPayment($orderId: String!, $amount: Int, $paymentMethod: String!, $tipAmount: Int, $idempotencyKey: String!) {
    processPayment(
      orderId: $orderId
      amount: $amount
      paymentMethod: $paymentMethod
      tipAmount: $tipAmount
      idempotencyKey: $idempotencyKey
    ) {
      success paymentId clientSecret amount remainingBalance error
    }
  }
`

const RECONCILE_PAYMENT = gql`
  mutation ReconcilePayment($paymentId: ID!) {
    reconcilePayment(paymentId: $paymentId) { success status error }
  }
`

function WebCardConfirmation({ paymentId, onComplete }: { paymentId: string; onComplete: () => Promise<void> }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (result.error) {
      setError(result.error.message || 'Card confirmation failed')
      setSubmitting(false)
      return
    }
    const reconciliation: any = await request('/api/graphql', RECONCILE_PAYMENT, { paymentId })
    if (!reconciliation?.reconcilePayment?.success) {
      setError(reconciliation?.reconcilePayment?.error || 'Payment is still awaiting provider confirmation')
      setSubmitting(false)
      return
    }
    await onComplete()
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={confirm} disabled={!stripe || !elements || submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Confirm secure web card payment
      </Button>
    </div>
  )
}

const GET_GIFT_CARD = gql`
  query LookupGiftCard($code: String!) {
    lookupGiftCard(code: $code)
  }
`

const REDEEM_GIFT_CARD = gql`
  mutation RedeemGiftCard($orderId: String!, $code: String!, $tipAmount: Int, $idempotencyKey: String!) {
    redeemGiftCard(
      orderId: $orderId
      code: $code
      tipAmount: $tipAmount
      idempotencyKey: $idempotencyKey
    ) { success paymentId amount remainingBalance error }
  }
`

interface PaymentClientProps {
  orderId: string
}

export function PaymentClient({ orderId }: PaymentClientProps) {
  const router = useRouter()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('cash')
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null)
  const [cardSession, setCardSession] = useState<{ clientSecret: string; paymentId: string; splitId?: string } | null>(null)

  // Cash payment state
  const [cashReceived, setCashReceived] = useState<string>('')

  // Tip state
  const [tipAmount, setTipAmount] = useState<string>('0.00')

  // Gift card state
  const [giftCardCode, setGiftCardCode] = useState<string>('')
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null)
  const [giftCardId, setGiftCardId] = useState<string | null>(null)
  const [giftCardError, setGiftCardError] = useState<string | null>(null)
  const [checkingGiftCard, setCheckingGiftCard] = useState(false)

  // Split payment state
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([])
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [newSplitAmount, setNewSplitAmount] = useState<string>('')
  const [newSplitMethod, setNewSplitMethod] = useState<'cash' | 'card' | 'gift_card'>('cash')

  // Success dialog
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [changeAmount, setChangeAmount] = useState<number>(0)
  const attemptKeys = useRef<Record<string, string>>({})
  const getAttemptKey = (scope: string) => {
    if (!attemptKeys.current[scope]) attemptKeys.current[scope] = crypto.randomUUID()
    return attemptKeys.current[scope]
  }

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    try {
      setLoading(true)
      const data = await request('/api/graphql', GET_ORDER, { id: orderId })
      const nextOrder = (data as any).restaurantOrder
      const nextStoreSettings = (data as any).storeSettings || {}
      const nextCurrencyCode = nextStoreSettings.currencyCode || 'USD'
      const nextLocale = nextStoreSettings.locale || 'en-US'

      setOrder(nextOrder)
      setCurrencyConfig({
        currencyCode: nextCurrencyCode,
        locale: nextLocale,
      })
      const stripeConfig = nextStoreSettings.paymentProviders?.find((provider: any) => provider.provider === 'stripe')
      setStripePublishableKey(stripeConfig?.publishableKey || null)
      setTipAmount(fromMinorUnits(Number(nextOrder?.tip || 0), nextCurrencyCode).toFixed(2))
    } catch (err) {
      console.error('Error fetching order:', err)
    } finally {
      setLoading(false)
    }
  }

  const getCurrentTipCents = (): number => {
    if (!order) return 0
    return Number(order.tip || 0)
  }

  const getDesiredTipCents = (): number => {
    const currentTip = getCurrentTipCents()
    const requestedTip = toMinorUnits(tipAmount || '0', currencyConfig.currencyCode)
    return Math.max(currentTip, requestedTip)
  }

  const getOrderTotal = (): number => {
    if (!order) return 0
    const currentTip = getCurrentTipCents()
    const baseTotal = Math.max(0, Number(order.total || 0) - currentTip)
    return baseTotal + getDesiredTipCents()
  }

  const getAmountPaid = (): number => {
    if (!order) return 0
    return order.payments
      .filter((p) => p.status === 'succeeded')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  }

  const getRemainingBalance = (): number => {
    return Math.max(0, getOrderTotal() - getAmountPaid())
  }

  const getSplitTotal = (): number => {
    return splitPayments.reduce((sum, p) => sum + p.amount, 0)
  }

  const getSplitRemaining = (): number => {
    return Math.max(0, getRemainingBalance() - getSplitTotal())
  }

  // Cash payment
  const processCashPayment = async () => {
    if (!order) return

    const total = getRemainingBalance()
    const receivedInCents = toMinorUnits(cashReceived || '0', currencyConfig.currencyCode)
    
    if (receivedInCents < total) {
      alert('Cash received is less than the total amount')
      return
    }

    setProcessing(true)
    try {
      const amountInCents = total
      const tipInCents = getDesiredTipCents()

      const result = await request('/api/graphql', PROCESS_PAYMENT, {
        orderId: order.id,
        amount: amountInCents,
        paymentMethod: 'cash',
        tipAmount: tipInCents,
        idempotencyKey: getAttemptKey('cash'),
      })

      const { success, error } = (result as any).processPayment

      if (success) {
        await fetchOrder()
        setChangeAmount(receivedInCents - total)
        setSuccessDialogOpen(true)
      } else {
        alert(`Payment failed: ${error}`)
      }
    } catch (err) {
      console.error('Error processing cash payment:', err)
      alert('Failed to process payment')
    } finally {
      setProcessing(false)
    }
  }

  // Card payment
  const processCardPayment = async () => {
    if (!order) return

    const total = getRemainingBalance()
    setProcessing(true)

    try {
      const amountInCents = total
      const tipInCents = getDesiredTipCents()

      const result = await request('/api/graphql', PROCESS_PAYMENT, {
        orderId: order.id,
        amount: amountInCents,
        paymentMethod: 'credit_card',
        tipAmount: tipInCents,
        idempotencyKey: getAttemptKey('card'),
      })

      const { success, paymentId, clientSecret, error } = (result as any).processPayment

      if (success && clientSecret && paymentId && stripePublishableKey) {
        setCardSession({ clientSecret, paymentId })
      } else if (success && !stripePublishableKey) {
        alert('Stripe publishable configuration is unavailable. The payment remains reserved for recovery.')
      } else {
        alert(`Payment failed: ${error || 'Secure card session could not be created'}`)
      }
    } catch (err) {
      console.error('Error processing card payment:', err)
      alert('Failed to process card payment')
    } finally {
      setProcessing(false)
    }
  }

  // Gift card lookup
  const lookupGiftCard = async () => {
    if (!giftCardCode.trim()) return

    setCheckingGiftCard(true)
    setGiftCardError(null)
    setGiftCardBalance(null)
    setGiftCardId(null)

    try {
      const data = await request('/api/graphql', GET_GIFT_CARD, {
        code: giftCardCode.trim(),
      })

      const card = (data as any).lookupGiftCard
      if (card) {
        setGiftCardBalance(Number(card.balance || 0))
        setGiftCardId(card.id)
      } else {
        setGiftCardError('Gift card not found or is disabled')
      }
    } catch (err) {
      console.error('Error looking up gift card:', err)
      setGiftCardError('Failed to lookup gift card')
    } finally {
      setCheckingGiftCard(false)
    }
  }

  // Gift card payment
  const processGiftCardPayment = async () => {
    if (!order || !giftCardId || giftCardBalance === null) return

    const total = getRemainingBalance()
    const amountToCharge = Math.min(giftCardBalance, total)

    setProcessing(true)
    try {
      const amountInCents = amountToCharge
      const tipInCents = getDesiredTipCents()

      const result = await request('/api/graphql', REDEEM_GIFT_CARD, {
        orderId: order.id,
        code: giftCardCode.trim().toUpperCase(),
        tipAmount: tipInCents,
        idempotencyKey: getAttemptKey(`gift:${giftCardCode.trim().toUpperCase()}`),
      })
      const redemption = (result as any).redeemGiftCard

      if (redemption.success) {
        const chargedAmount = Number(redemption.amount || amountInCents)
        if (Number(redemption.remainingBalance || 0) === 0) {
          await fetchOrder()
          setChangeAmount(0)
          setSuccessDialogOpen(true)
        } else {
          await fetchOrder()
          setGiftCardBalance(Math.max(0, giftCardBalance - chargedAmount))
          const msg = formatCurrency(chargedAmount, currencyConfig) + " charged to gift card. Remaining balance: " + formatCurrency(Number(redemption.remainingBalance || 0), currencyConfig)
          alert(msg)
        }
      } else {
        alert(`Payment failed: ${redemption.error}`)
      }
    } catch (err) {
      console.error('Error processing gift card payment:', err)
      alert('Failed to process gift card payment')
    } finally {
      setProcessing(false)
    }
  }

  // Split payment functions
  const addSplitPayment = () => {
    if (newSplitMethod === 'gift_card') {
      alert('Apply gift cards from the Gift Card tab before adding remaining split tenders')
      return
    }
    const amount = toMinorUnits(newSplitAmount || '0', currencyConfig.currencyCode)
    if (amount <= 0) return
    if (amount > getSplitRemaining()) {
      alert('Amount exceeds remaining balance')
      return
    }

    setSplitPayments([
      ...splitPayments,
      {
        id: Date.now().toString(),
        amount,
        method: newSplitMethod,
        status: 'pending',
      },
    ])
    setNewSplitAmount('')
    setSplitDialogOpen(false)
  }

  const removeSplitPayment = (id: string) => {
    setSplitPayments(splitPayments.filter((p) => p.id !== id))
  }

  const processSplitPayments = async () => {
    if (!order || splitPayments.length === 0) return

    setProcessing(true)
    try {
      for (let i = 0; i < splitPayments.length; i++) {
        const split = splitPayments[i]
        if (split.status === 'completed') continue
        const amountInCents = split.amount
        
        // Update status to processing
        setSplitPayments((prev) =>
          prev.map((p) => (p.id === split.id ? { ...p, status: 'processing' } : p))
        )

        if (split.method === 'gift_card') {
          throw new Error('Apply gift cards from the Gift Card tab before processing remaining split tenders')
        }
        const result = await request('/api/graphql', PROCESS_PAYMENT, {
          orderId: order.id,
          amount: amountInCents,
          paymentMethod: split.method === 'card' ? 'credit_card' : split.method,
          tipAmount: i === 0 ? getDesiredTipCents() : 0,
          idempotencyKey: getAttemptKey(`split:${split.id}`),
        })

        const { success, paymentId, clientSecret, error } = (result as any).processPayment

        if (success) {
          if (split.method === 'card') {
            if (!clientSecret || !paymentId || !stripePublishableKey) {
              throw new Error('Secure Stripe configuration is required for split card tenders')
            }
            setCardSession({ clientSecret, paymentId, splitId: split.id })
            return
          }
          setSplitPayments((prev) =>
            prev.map((p) => (p.id === split.id ? { ...p, status: 'completed' } : p))
          )
        } else {
          alert(`Payment ${i + 1} failed: ${error}`)
          setProcessing(false)
          return
        }
      }

      // All payments processed; backend decides if the order is fully paid/completed
      await fetchOrder()
      setChangeAmount(0)
      setSuccessDialogOpen(true)
    } catch (err) {
      console.error('Error processing split payments:', err)
      alert('Failed to process split payments')
    } finally {
      setProcessing(false)
    }
  }

  const handleSuccessClose = () => {
    setSuccessDialogOpen(false)
    router.push('/dashboard/platform/pos')
  }

  const quickCashAmounts = [20, 50, 100]

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Order not found</p>
        <Button className="mt-4" onClick={() => router.push('/dashboard/platform/pos')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to POS
        </Button>
      </div>
    )
  }

  const remaining = getRemainingBalance()

  return (
    <div className="flex h-[calc(100vh-200px)] gap-4 p-4">
      {/* Order Summary */}
      <Card className="w-96 flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Order #{order.orderNumber}</CardTitle>
            <Badge variant={order.status === 'completed' ? 'default' : 'secondary'}>
              {order.status}
            </Badge>
          </div>
          {order.tables?.length > 0 && (
            <p className="text-sm text-muted-foreground">Table: {order.tables.map((table) => table.tableNumber).join(', ')}</p>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          <div className="space-y-2">
            {order.orderItems.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.quantity}x {item.itemNameSnapshot || item.menuItem?.name || 'Unknown Item'}
                </span>
                <span>{formatCurrency(item.price, currencyConfig)}</span>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal, currencyConfig)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>{formatCurrency(order.tax, currencyConfig)}</span>
            </div>
            {parseFloat(order.discount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatCurrency(order.discount, currencyConfig)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span>Tip</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="w-24 h-8 text-right"
              />
            </div>
            <Separator />
            <div className="flex justify-between text-muted-foreground">
              <span>Applied Tip</span>
              <span>{formatCurrency(getDesiredTipCents(), currencyConfig)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(getOrderTotal(), currencyConfig)}</span>
            </div>
            {getAmountPaid() > 0 && (
              <>
                <div className="flex justify-between text-green-600">
                  <span>Paid</span>
                  <span>-{formatCurrency(getAmountPaid(), currencyConfig)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-primary">
                  <span>Remaining</span>
                  <span>{formatCurrency(remaining, currencyConfig)}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="cash" className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Cash
              </TabsTrigger>
              <TabsTrigger value="card" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Card
              </TabsTrigger>
              <TabsTrigger value="gift_card" className="flex items-center gap-2">
                <Gift className="h-4 w-4" />
                Gift Card
              </TabsTrigger>
              <TabsTrigger value="split" className="flex items-center gap-2">
                <SplitSquareVertical className="h-4 w-4" />
                Split
              </TabsTrigger>
            </TabsList>

            {/* Cash Payment */}
            <TabsContent value="cash" className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div>
                  <Label>Amount Due</Label>
                  <div className="text-3xl font-bold">{formatCurrency(remaining, currencyConfig)}</div>
                </div>

                <div>
                  <Label>Cash Received</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="text-2xl h-14"
                  />
                </div>

                <div className="flex gap-2">
                  {quickCashAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      className="flex-1"
                      onClick={() => setCashReceived(amount.toString())}
                    >
                      {formatCurrency(amount, currencyConfig, { inputIsCents: false })}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCashReceived(fromMinorUnits(remaining, currencyConfig.currencyCode).toFixed(2))}
                  >
                    Exact
                  </Button>
                </div>

                {toMinorUnits(cashReceived || '0', currencyConfig.currencyCode) >= remaining && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Change Due</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(toMinorUnits(cashReceived || '0', currencyConfig.currencyCode) - remaining, currencyConfig)}
                    </p>
                  </div>
                )}
              </div>

              <Button
                size="lg"
                className="w-full mt-4"
                onClick={processCashPayment}
                disabled={processing || toMinorUnits(cashReceived || '0', currencyConfig.currencyCode) < remaining}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Complete Cash Payment
              </Button>
            </TabsContent>

            {/* Card Payment */}
            <TabsContent value="card" className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div>
                  <Label>Amount to Charge</Label>
                  <div className="text-3xl font-bold">{formatCurrency(remaining, currencyConfig)}</div>
                </div>

                <div className="p-8 border-2 border-dashed rounded-lg text-center">
                  <CreditCard className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Secure web card payment</p>
                  <p className="text-sm text-muted-foreground">
                    Uses the configured Stripe web payment form. This is not a card-present terminal.
                  </p>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full mt-4"
                onClick={processCardPayment}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Open Secure Card Form
              </Button>
            </TabsContent>

            {/* Gift Card Payment */}
            <TabsContent value="gift_card" className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div>
                  <Label>Amount Due</Label>
                  <div className="text-3xl font-bold">{formatCurrency(remaining, currencyConfig)}</div>
                </div>

                <div className="space-y-2">
                  <Label>Gift Card Code</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter gift card code"
                      value={giftCardCode}
                      onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                    />
                    <Button
                      variant="outline"
                      onClick={lookupGiftCard}
                      disabled={checkingGiftCard || !giftCardCode.trim()}
                    >
                      {checkingGiftCard ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lookup'}
                    </Button>
                  </div>
                </div>

                {giftCardError && (
                  <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <p className="text-red-600">{giftCardError}</p>
                  </div>
                )}

                {giftCardBalance !== null && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Gift Card Balance</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(giftCardBalance, currencyConfig)}
                    </p>
                    {giftCardBalance < remaining && (
                      <p className="text-sm text-yellow-600 mt-2">
                        Partial payment: {formatCurrency(giftCardBalance, currencyConfig)} will be charged, 
                        {formatCurrency(remaining - giftCardBalance, currencyConfig)} remaining
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Button
                size="lg"
                className="w-full mt-4"
                onClick={processGiftCardPayment}
                disabled={processing || !giftCardId}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Gift className="mr-2 h-4 w-4" />
                )}
                Apply Gift Card
              </Button>
            </TabsContent>

            {/* Split Payment */}
            <TabsContent value="split" className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div className="flex justify-between">
                  <div>
                    <Label>Total to Split</Label>
                    <div className="text-2xl font-bold">{formatCurrency(remaining, currencyConfig)}</div>
                  </div>
                  <div>
                    <Label>Remaining</Label>
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(getSplitRemaining(), currencyConfig)}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  {splitPayments.map((payment, index) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <span className="capitalize">{payment.method.replace('_', ' ')}</span>
                        <span className="font-medium">{formatCurrency(payment.amount, currencyConfig)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {payment.status === 'completed' && (
                          <Badge variant="default" className="bg-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Paid
                          </Badge>
                        )}
                        {payment.status === 'processing' && (
                          <Badge variant="secondary">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Processing
                          </Badge>
                        )}
                        {payment.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSplitPayment(payment.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {getSplitRemaining() > 0 && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setSplitDialogOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Split Payment
                    </Button>
                  )}
                </div>
              </div>

              <Button
                size="lg"
                className="w-full mt-4"
                onClick={processSplitPayments}
                disabled={processing || splitPayments.length === 0 || getSplitRemaining() > 0.01}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Process All Payments ({splitPayments.length})
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={Boolean(cardSession)} onOpenChange={(open) => !open && setCardSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Secure web card payment</DialogTitle>
          </DialogHeader>
          {cardSession && stripePublishableKey && (
            <Elements
              stripe={loadStripe(stripePublishableKey)}
              options={{ clientSecret: cardSession.clientSecret }}
            >
              <WebCardConfirmation
                paymentId={cardSession.paymentId}
                onComplete={async () => {
                  const completedSplitId = cardSession.splitId
                  setCardSession(null)
                  if (completedSplitId) {
                    setSplitPayments((previous) => previous.map((payment) =>
                      payment.id === completedSplitId ? { ...payment, status: 'completed' } : payment
                    ))
                    await fetchOrder()
                  } else {
                    await fetchOrder()
                    setChangeAmount(0)
                    setSuccessDialogOpen(true)
                  }
                }}
              />
            </Elements>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Split Payment Dialog */}
      <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Split Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input
                step="0.01"
                min="0"
                max={getSplitRemaining()}
                placeholder={`Max: ${formatCurrency(getSplitRemaining(), currencyConfig)}`}
                value={newSplitAmount}
                onChange={(e) => setNewSplitAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Button
                  variant={newSplitMethod === 'cash' ? 'default' : 'outline'}
                  onClick={() => setNewSplitMethod('cash')}
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  Cash
                </Button>
                <Button
                  variant={newSplitMethod === 'card' ? 'default' : 'outline'}
                  onClick={() => setNewSplitMethod('card')}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Card
                </Button>
                <Button
                  variant="outline"
                  disabled
                  title="Apply gift cards from the Gift Card tab first"
                >
                  <Gift className="mr-2 h-4 w-4" />
                  Gift via tab
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addSplitPayment} disabled={!newSplitAmount || toMinorUnits(newSplitAmount, currencyConfig.currencyCode) <= 0}>
              Add Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <AlertDialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-6 w-6" />
              Payment Successful!
            </AlertDialogTitle>
            <AlertDialogDescription>
              Order #{order.orderNumber} has been paid and completed.
              {changeAmount > 0 && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <p className="text-sm text-muted-foreground">Change Due</p>
                  <p className="text-3xl font-bold text-green-600">
                    {formatCurrency(changeAmount, currencyConfig)}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleSuccessClose}>
              Return to POS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

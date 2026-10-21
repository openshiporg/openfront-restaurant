'use client'
import { useCallback, useEffect, useState } from 'react'
import { request } from 'graphql-request'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/features/storefront/lib/currency'
import { toCsv } from '@/features/lib/financial-ledger'
const QUERY = `query($id:ID!){restaurantPurchaseEvidence(id:$id)}`
const RECEIVE = `mutation($id:ID!,$lines:JSON!,$reference:String!,$currencyCode:String!,$idempotencyKey:String!){receivePurchaseOrder(id:$id,lines:$lines,reference:$reference,currencyCode:$currencyCode,idempotencyKey:$idempotencyKey)}`
const INVOICE = `mutation($id:ID!,$reference:String!,$currencyCode:String!,$lines:JSON!,$varianceReason:String,$idempotencyKey:String!){recordRestaurantPurchaseInvoice(id:$id,reference:$reference,currencyCode:$currencyCode,lines:$lines,varianceReason:$varianceReason,idempotencyKey:$idempotencyKey)}`
const CREDIT = `mutation($id:ID!,$invoiceId:ID!,$reference:String!,$lines:JSON!,$reason:String!,$idempotencyKey:String!){recordRestaurantPurchaseCredit(id:$id,invoiceId:$invoiceId,reference:$reference,lines:$lines,reason:$reason,idempotencyKey:$idempotencyKey)}`
const HOLD = `mutation($receiptId:ID!,$onHold:Boolean!,$reason:String!,$idempotencyKey:String!){setRestaurantLotHold(receiptId:$receiptId,onHold:$onHold,reason:$reason,idempotencyKey:$idempotencyKey)}`
export function PurchaseEvidenceDialog({ orderId, currencyCode, onClose, onChanged }: { orderId: string; currencyCode: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [reference, setReference] = useState(''), [currency, setCurrency] = useState(currencyCode), [reason, setReason] = useState('')
  const [receiving, setReceiving] = useState<Record<string, any>>({}), [invoiceLines, setInvoiceLines] = useState<Record<string, any>>({})
  const [credit, setCredit] = useState<any>(null), [lots, setLots] = useState<any>(null)
  const load = useCallback(async () => { const result: any = await request('/api/graphql', QUERY, { id: orderId }); setData(result.restaurantPurchaseEvidence); if (result.restaurantPurchaseEvidence.currencyCode) setCurrency(result.restaurantPurchaseEvidence.currencyCode) }, [orderId])
  useEffect(() => { load().catch(error => setError(error.message)) }, [load])
  const loadLots = async (ingredientId: string) => { const result: any = await request('/api/graphql', 'query($id:ID!){restaurantIngredientLots(ingredientId:$id)}', { id: ingredientId }); setLots(result.restaurantIngredientLots) }
  const act = async (operation: string, variables: any) => {
    setBusy(true); setError('')
    try {
    const storageKey = `restaurant-purchase:${operation.split('{')[0]}:${JSON.stringify(variables)}`
    const idempotencyKey = sessionStorage.getItem(storageKey) || crypto.randomUUID(); sessionStorage.setItem(storageKey, idempotencyKey)
      await request('/api/graphql', operation, { ...variables, idempotencyKey }); sessionStorage.removeItem(storageKey)
      if (operation === RECEIVE) setReceiving({})
      if (operation === INVOICE) setInvoiceLines({})
      setCredit(null)
      await load(); onChanged(); if (lots) await loadLots(lots.ingredient.id)
    } catch (error: any) { setError(error.message || 'Unable to save; retry retains the same request key') } finally { setBusy(false) }
  }
  const submitInvoice = () => {
    try {
      const lines = (data.receipts || []).filter((row: any) => Number(invoiceLines[row.id]?.quantity) > 0).map((row: any) => ({ receiptId: row.id, quantity: Number(invoiceLines[row.id].quantity), unitCost: String(invoiceLines[row.id].unitCost ?? row.metadata?.unitCost ?? '0') }))
      void act(INVOICE, { id: orderId, reference, currencyCode: currency, varianceReason: reason, lines })
    } catch (error: any) { setError(error.message) }
  }
  const exportEvidence = () => {
    const rows: unknown[][] = [['Event ID', 'Type', 'Supplier', 'Reference', 'Currency', 'Receipt', 'Quantity', 'Amount minor units', 'Reason']]
    for (const event of data.events) for (const line of event.after.lines) rows.push([event.id, event.eventType, event.after.vendorId, event.after.reference, event.after.currencyCode, line.receiptId, line.quantity, line.amountMinor, event.reason])
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${data.order.poNumber}-matching.csv`; link.click(); URL.revokeObjectURL(url)
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Receiving, invoice matching and lot trace · {data?.order.poNumber || orderId}</DialogTitle></DialogHeader>
    {error && <p role="alert" className="text-destructive whitespace-pre-wrap">{error}</p>}
    {!data ? <p>Loading purchase evidence…</p> : <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{data.order.vendor?.name} · Goods-only invoice matching excludes tax/freight and does not send supplier payments. Original records remain immutable; credit then rebill to correct an invoice. Received quantity and stock are unaffected by a financial credit.</p>
      <div className="grid gap-3 sm:grid-cols-3"><Label>Receipt / invoice / credit reference<Input value={reference} onChange={event => setReference(event.target.value)} /></Label><Label>Declared currency<Input maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} /></Label><Label>Variance, credit or hold reason<Input value={reason} onChange={event => setReason(event.target.value)} /></Label></div>
      <Card><CardHeader><CardTitle className="text-base">Receive goods</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-xs">Enter only units physically received now. Optional supplier lot and expiry attach to these exact units; unlabelled stock remains untracked. Currency must match a new purchase order’s recorded policy; legacy receipt currency is an explicit receiving declaration.</p>
        {(data.order.lineItems || []).map((line: any) => <div key={line.ingredientId} className="grid sm:grid-cols-4 gap-2 items-end"><div><strong>{line.ingredientName}</strong><p className="text-xs">Ordered {line.quantity} {line.unit}</p></div><Label>Received now<Input type="number" min="0" step="0.01" value={receiving[line.ingredientId]?.quantity || ''} onChange={event => setReceiving({ ...receiving, [line.ingredientId]: { ...receiving[line.ingredientId], quantity: event.target.value } })} /></Label><Label>Supplier lot code<Input value={receiving[line.ingredientId]?.lotCode || ''} onChange={event => setReceiving({ ...receiving, [line.ingredientId]: { ...receiving[line.ingredientId], lotCode: event.target.value } })} /></Label><Label>Expiry date (inclusive)<Input type="date" value={receiving[line.ingredientId]?.expiryDate || ''} onChange={event => setReceiving({ ...receiving, [line.ingredientId]: { ...receiving[line.ingredientId], expiryDate: event.target.value } })} /></Label></div>)}
        <Button disabled={busy || !['sent', 'confirmed', 'shipped', 'partially_received'].includes(data.order.status)} onClick={() => act(RECEIVE, { id: orderId, reference, currencyCode: currency, lines: Object.entries(receiving).filter(([, line]) => Number(line.quantity) > 0).map(([ingredientId, line]) => ({ ingredientId, quantity: Number(line.quantity), lotCode: line.lotCode || '', expiryDate: line.expiryDate || '' })) })}>Post actual receipt</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Match invoice to received goods</CardTitle></CardHeader><CardContent className="space-y-3">
        {(data.receipts || []).map((row: any) => <div key={row.id} className="grid sm:grid-cols-4 gap-2 border-b pb-3"><div className="text-xs"><strong>{data.order.lineItems?.find((line: any) => line.ingredientId === row.ingredientId)?.ingredientName || row.ingredientId}</strong><p>Receipt {row.id}</p><p>{row.quantity} {row.metadata?.unit}; unmatched {row.unbilledQuantity}</p><p>Lot {row.metadata?.lotCode || 'untracked'}; expires {row.metadata?.expiryDate || 'unknown'}</p><Button variant="outline" size="sm" onClick={() => loadLots(row.ingredientId).catch(error => setError(error.message))}>Lot trace</Button></div><Label>Quantity invoiced<Input type="number" min="0" step="0.01" value={invoiceLines[row.id]?.quantity || ''} onChange={event => setInvoiceLines({ ...invoiceLines, [row.id]: { ...invoiceLines[row.id], quantity: event.target.value } })} /></Label><Label>Invoiced unit cost ({currency})<Input type="number" min="0" step="0.000001" value={invoiceLines[row.id]?.unitCost ?? row.metadata?.unitCost ?? ''} onChange={event => setInvoiceLines({ ...invoiceLines, [row.id]: { ...invoiceLines[row.id], unitCost: event.target.value } })} /></Label><p className="text-xs">Recorded cost {row.metadata?.unitCost} {row.metadata?.currencyCode || 'currency requires review'}. Receipt ID, units and cost are preserved with the match.</p></div>)}
        <Button disabled={busy} onClick={submitInvoice}>Record invoice match</Button><Button variant="outline" onClick={exportEvidence}>Export match CSV</Button>
      </CardContent></Card>
      {data.events.map((event: any) => <Card key={event.id}><CardContent className="pt-4 space-y-2"><strong>{event.eventType === 'purchase.invoice_matched' ? 'Invoice' : 'Credit'} {event.after.reference}</strong><p>{formatCurrency(event.after.totalMinor, { currencyCode: event.after.currencyCode })} · {event.after.status}</p><p className="text-sm">{event.reason}</p>{event.eventType === 'purchase.invoice_matched' && <Button variant="outline" onClick={() => setCredit({ invoiceId: event.id, lines: event.after.lines.map((line: any, invoiceLineIndex: number) => ({ invoiceLineIndex, receiptId: line.receiptId, quantity: 0, amountMinor: 0 })) })}>Record supplier credit / correction</Button>}</CardContent></Card>)}
      {credit && <Card><CardHeader><CardTitle className="text-base">Credit original invoice</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs">Enter amount in integer minor units. Zero quantity records a price-only credit. Quantity credits must proportionally reverse remaining billed value; full quantity/value credit permits a separately recorded corrected invoice.</p>{credit.lines.map((line: any, index: number) => <div key={index} className="grid grid-cols-3 gap-2"><span className="text-xs">{line.receiptId}</span><Label>Quantity credit<Input type="number" step="0.01" min="0" value={line.quantity} onChange={event => setCredit({ ...credit, lines: credit.lines.map((row: any, i: number) => i === index ? { ...row, quantity: Number(event.target.value) } : row) })} /></Label><Label>Credit minor units<Input type="number" step="1" min="0" value={line.amountMinor} onChange={event => setCredit({ ...credit, lines: credit.lines.map((row: any, i: number) => i === index ? { ...row, amountMinor: Number(event.target.value) } : row) })} /></Label></div>)}<Button disabled={busy} onClick={() => act(CREDIT, { id: orderId, invoiceId: credit.invoiceId, reference, reason, lines: credit.lines.filter((line: any) => line.amountMinor > 0).map(({ invoiceLineIndex, quantity, amountMinor }: any) => ({ invoiceLineIndex, quantity, amountMinor })) })}>Record credit evidence</Button></CardContent></Card>}
      {lots && <Card><CardHeader><CardTitle className="text-base">Lot trace · {lots.ingredient.name}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs">{lots.scope}. Untracked balance: {lots.untrackedQuantity} {lots.ingredient.unit}. Holds follow the original receipt through transfers. Expiry blocks production reconciliation after the supplier date; verify physical batches before preparation.</p>{lots.lots.map((lot: any) => <div key={lot.lotId} className="border p-3 rounded text-sm"><strong>{lot.lotCode}</strong><p>Received {lot.quantity}; remaining {lot.remainingQuantity} {lot.unit}; expiry {lot.expiryDate || 'unknown'} {lot.expired ? '(expired)' : ''} {lot.onHold ? '(held)' : ''}</p><p className="text-xs">Original receipt {lot.rootReceiptId}; lot {lot.lotId}</p><Button disabled={busy} variant="outline" onClick={() => act(HOLD, { receiptId: lot.rootReceiptId, onHold: !lot.onHold, reason, })}>{lot.onHold ? 'Release hold with reason' : 'Hold this receipt lot'}</Button></div>)}<details><summary>Allocation and transfer history</summary><pre className="overflow-auto text-xs max-h-80">{JSON.stringify(lots.events, null, 2)}</pre></details></CardContent></Card>}
    </div>}
  </DialogContent></Dialog>
}

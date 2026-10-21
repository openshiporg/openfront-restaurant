"use client";
import { useState } from "react";
import { request } from "graphql-request";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;
const PAGE_QUERY = `query CheckoutRecoveryPage($skip: Int, $take: Int) {
  unplacedCheckoutAttempts(skip: $skip, take: $take) {
    items { id cartId customerName amount createdAt state providerCode canRecover requiresManualReview canCancel }
    totalCount skip take hasMore activeReservations activeOnlineOrders capacityUsed capacityLimit capacityLimitConfigured capacityLimitValid capacityAtLimit
  }
}`;

function ageLabel(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "age unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

export function CheckoutRecovery() {
  const [page, setPage] = useState<any>({ items: [], totalCount: 0, skip: 0, take: PAGE_SIZE, hasMore: false, activeReservations: 0, activeOnlineOrders: 0, capacityUsed: 0, capacityLimit: 0, capacityLimitConfigured: false, capacityLimitValid: true, capacityAtLimit: false });
  const [message, setMessage] = useState("");
  const load = async (skip = 0) => {
    try {
      const result: any = await request("/api/graphql", PAGE_QUERY, { skip, take: PAGE_SIZE });
      setPage(result.unplacedCheckoutAttempts);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load checkout recovery");
    }
  };
  const recover = async (paymentSessionId: string) => {
    try {
      const result: any = await request("/api/graphql", `mutation($paymentSessionId:ID!){recoverCheckoutPayment(paymentSessionId:$paymentSessionId){id orderNumber status}}`, { paymentSessionId });
      setMessage(`Recovered order ${result.recoverCheckoutPayment.orderNumber}`);
      await load(page.skip);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery pending");
    }
  };
  const cancel = async (row: any) => {
    try {
      const result: any = await request("/api/graphql", `mutation($cartId:ID!,$paymentSessionId:ID!){cancelCheckoutPaymentSession(cartId:$cartId,paymentSessionId:$paymentSessionId){success error}}`, { cartId: row.cartId, paymentSessionId: row.id });
      if (!result.cancelCheckoutPaymentSession.success) throw new Error(result.cancelCheckoutPaymentSession.error || "Attempt was not cancelled");
      setMessage("Unplaced checkout attempt cancelled; a new quote can be created.");
      await load(page.skip);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancellation needs provider reconciliation");
    }
  };
  const pageCount = Math.max(1, Math.ceil(page.totalCount / PAGE_SIZE));
  const pageNumber = Math.floor(page.skip / PAGE_SIZE) + 1;
  const capacityStatus = !page.capacityLimitConfigured
    ? `${page.capacityUsed} active online orders/reservations · capacity limit disabled`
    : !page.capacityLimitValid
      ? `${page.capacityUsed} active online orders/reservations · invalid capacity setting`
      : `${page.capacityUsed}/${page.capacityLimit} capacity (${page.activeOnlineOrders} orders, ${page.activeReservations} reservations)${page.capacityAtLimit ? " · at limit" : ""}`;

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => load(0)}>Load unplaced checkout attempts</Button>
      <span className="text-sm text-muted-foreground">{page.totalCount} unresolved · page {pageNumber} of {pageCount} · {capacityStatus}</span>
    </div>
    {page.items.map((row: any) => <div className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm" key={row.id}>
      <p>{row.customerName || "Guest"} · {row.amount} minor units · {row.providerCode} · {row.state} · {row.createdAt} ({ageLabel(row.createdAt)})</p>
      <div className="flex flex-wrap items-center gap-2">
        {row.canRecover ? <Button size="sm" onClick={() => recover(row.id)}>Reconcile original payment</Button> : null}
        {row.canCancel ? <Button size="sm" variant="outline" onClick={() => cancel(row)}>Cancel / release attempt</Button> : null}
        {row.requiresManualReview ? <span className="self-center text-xs text-muted-foreground">Legacy attempt has no saved quote; automated payment recovery is disabled. {row.canCancel ? "A manual attempt can be safely released." : "Manual review is required before payment action."}</span> : null}
        {!row.canCancel && !row.requiresManualReview ? <span className="self-center text-xs text-muted-foreground">Provider outcome needs reconciliation before cancellation.</span> : null}
      </div>
    </div>)}
    {page.items.length === 0 && page.totalCount === 0 ? <p className="text-sm text-muted-foreground">No unplaced attempts need resolution.</p> : null}
    <div className="flex gap-2">
      <Button variant="outline" disabled={page.skip <= 0} onClick={() => load(Math.max(0, page.skip - PAGE_SIZE))}>Previous</Button>
      <Button variant="outline" disabled={!page.hasMore} onClick={() => load(page.skip + PAGE_SIZE)}>Next</Button>
    </div>
    <p role="status">{message}</p>
  </section>;
}

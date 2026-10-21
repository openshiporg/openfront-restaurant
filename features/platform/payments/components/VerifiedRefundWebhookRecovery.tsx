"use client";
import { useState } from "react";
import { request } from "graphql-request";
import { Button } from "@/components/ui/button";
import {
  confirmAndReplayVerifiedRefundWebhook,
  isEligibleVerifiedRefundWebhook,
  RETRY_VERIFIED_REFUND_WEBHOOK_MUTATION,
  VERIFIED_REFUND_WEBHOOK_PAGE_SIZE,
  VERIFIED_REFUND_WEBHOOK_WHERE,
  VERIFIED_REFUND_WEBHOOKS_QUERY,
} from "./verifiedRefundWebhookRecoveryContract";

export function VerifiedRefundWebhookRecovery() {
  const [rows, setRows] = useState<any[]>([]);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load(nextSkip = 0, preserveMessage = false) {
    setLoading(true);
    setRows([]);
    setSkip(nextSkip);
    setLoaded(false);
    if (!preserveMessage) setMessage("");
    try {
      const result: any = await request("/api/graphql", VERIFIED_REFUND_WEBHOOKS_QUERY, {
        where: VERIFIED_REFUND_WEBHOOK_WHERE,
        take: VERIFIED_REFUND_WEBHOOK_PAGE_SIZE,
        skip: nextSkip,
      });
      setRows((result.paymentWebhookEvents || []).filter(isEligibleVerifiedRefundWebhook));
      setTotal(Number(result.paymentWebhookEventsCount || 0));
      setLoaded(true);
    } catch {
      setTotal(0);
      setMessage("Could not load eligible refund events. Check access and refresh the list.");
    } finally {
      setLoading(false);
    }
  }

  async function replay(row: any) {
    if (!isEligibleVerifiedRefundWebhook(row) || loading || busyId) return;
    setBusyId(row.id);
    await confirmAndReplayVerifiedRefundWebhook({
      eventId: row.id,
      confirm: (confirmation) => window.confirm(confirmation),
      replay: async (eventId) => {
        const result: any = await request("/api/graphql", RETRY_VERIFIED_REFUND_WEBHOOK_MUTATION, { eventId });
        return result.retryVerifiedRefundWebhookEvent;
      },
      refresh: () => load(0, true),
      setMessage,
    });
    setBusyId(null);
  }

  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer font-medium">Verified Stripe refund events</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          Manually replay only signature-verified Stripe refund events that failed payment correlation. Replay is local and does not contact Stripe.
        </p>
        <Button variant="outline" disabled={loading || Boolean(busyId)} onClick={() => void load(0)}>
          {loading ? "Loading eligible events…" : "Load eligible events"}
        </Button>
        {loaded && rows.length === 0 ? <p className="text-sm">No eligible events on this page.</p> : null}
        {rows.map((row) => (
          <article key={row.id} className="space-y-2 rounded border p-3 text-sm">
            <p>
              {row.eventType} · received {row.receivedAt ? new Date(row.receivedAt).toLocaleString() : "time unavailable"}
            </p>
            <p>Event {row.providerEventId || row.id} · previous attempts {row.attempts || 0}</p>
            <Button size="sm" disabled={loading || Boolean(busyId)} onClick={() => void replay(row)}>
              {busyId === row.id ? "Processing locally…" : "Replay stored refund event"}
            </Button>
          </article>
        ))}
        {total > VERIFIED_REFUND_WEBHOOK_PAGE_SIZE || skip > 0 ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={loading || Boolean(busyId) || skip === 0} onClick={() => void load(Math.max(0, skip - VERIFIED_REFUND_WEBHOOK_PAGE_SIZE))}>Previous</Button>
            <span className="text-xs text-muted-foreground">Showing {rows.length ? skip + 1 : 0}–{Math.min(skip + rows.length, total)} of {total}</span>
            <Button variant="outline" size="sm" disabled={loading || Boolean(busyId) || skip + VERIFIED_REFUND_WEBHOOK_PAGE_SIZE >= total} onClick={() => void load(skip + VERIFIED_REFUND_WEBHOOK_PAGE_SIZE)}>Next</Button>
          </div>
        ) : null}
        <p role="status" aria-live="polite">{message}</p>
      </div>
    </details>
  );
}

"use client";
import { useState } from "react";
import { request } from "graphql-request";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;
const PAGE_QUERY = `query RestaurantNotificationPage($status: String, $limit: Int, $cursor: String) {
  restaurantNotifications(status: $status, limit: $limit, cursor: $cursor) {
    items { id recipient subject entityId status error }
    status limit hasMore nextCursor
  }
}`;
const STATUS_FILTERS = [
  ["unresolved", "Unresolved"],
  ["all", "All statuses"],
  ["queued", "Queued"],
  ["processing", "In progress"],
  ["unknown", "Unknown outcome"],
  ["failed", "Failed"],
  ["accepted", "SMTP accepted"],
  ["acknowledged", "Manually acknowledged"],
  ["suppressed", "Suppressed"],
] as const;

export function RestaurantNotifications() {
  const [page, setPage] = useState<any>({ items: [], status: "unresolved", limit: PAGE_SIZE, hasMore: false, nextCursor: null });
  const [status, setStatus] = useState("unresolved");
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [message, setMessage] = useState("");
  const currentCursor = cursors[cursors.length - 1];

  const load = async (cursor = currentCursor, filter = status) => {
    try {
      const result: any = await request("/api/graphql", PAGE_QUERY, { status: filter, limit: PAGE_SIZE, cursor });
      setPage(result.restaurantNotifications);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load notifications");
    }
  };
  const loadFirstPage = async () => {
    setCursors([null]);
    await load(null);
  };
  const setFilter = async (filter: string) => {
    setStatus(filter);
    setCursors([null]);
    await load(null, filter);
  };
  const nextPage = async () => {
    if (!page.hasMore || !page.nextCursor) return;
    setCursors((current) => [...current, page.nextCursor]);
    await load(page.nextCursor, status);
  };
  const previousPage = async () => {
    if (cursors.length <= 1) return;
    const previous = cursors.slice(0, -1);
    setCursors(previous);
    await load(previous[previous.length - 1], status);
  };
  const send = async (row: any) => {
    const uncertain = ["unknown", "processing"].includes(row.status);
    if (uncertain && !window.confirm("The earlier message may have been sent. Retry may send a duplicate. Continue?")) return;
    try {
      const result: any = await request("/api/graphql", `mutation($notificationId:ID!,$retryUnknown:Boolean){sendRestaurantNotification(notificationId:$notificationId,retryUnknown:$retryUnknown){id status error}}`, { notificationId: row.id, retryUnknown: uncertain });
      setMessage(`${result.sendRestaurantNotification.status}: ${result.sendRestaurantNotification.error || "SMTP acceptance is not proof of delivery."}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notification failed");
    }
  };
  const acknowledge = async (row: any) => {
    const reason = window.prompt("Record how you contacted the customer or verified delivery:");
    if (!reason?.trim()) return;
    try {
      await request("/api/graphql", `mutation($notificationId:ID!,$reason:String!){acknowledgeRestaurantNotification(notificationId:$notificationId,reason:$reason){id status error}}`, { notificationId: row.id, reason });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to acknowledge contact");
    }
  };

  return <section className="space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <Button variant="outline" onClick={() => void loadFirstPage()}>Load notifications</Button>
      <label className="grid gap-1 text-sm">
        <span>Status</span>
        <select className="h-9 rounded-md border bg-background px-3" value={status} onChange={(event) => void setFilter(event.target.value)}>
          {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <span className="pb-2 text-sm text-muted-foreground">{page.items.length} shown · {status}</span>
    </div>
    {page.items.map((row: any) => <div key={row.id} className="space-y-1 rounded border p-3 text-sm">
      <p>{row.subject} · {row.recipient}</p>
      <p>{row.status} · {row.error || "No error recorded. SMTP acceptance is not proof of recipient delivery."}</p>
      <div className="flex flex-wrap gap-2">
        {!(["accepted", "acknowledged", "suppressed"].includes(row.status)) && <Button size="sm" onClick={() => send(row)}>Send / reconcile and retry</Button>}
        {row.status !== "acknowledged" && <Button size="sm" variant="outline" onClick={() => acknowledge(row)}>Record manual contact</Button>}
      </div>
    </div>)}
    {page.items.length === 0 ? <p className="text-sm text-muted-foreground">No notifications match this status filter.</p> : null}
    <div className="flex gap-2">
      <Button variant="outline" disabled={cursors.length <= 1} onClick={() => void previousPage()}>Previous</Button>
      <Button variant="outline" disabled={!page.hasMore} onClick={() => void nextPage()}>Next</Button>
    </div>
    <p role="status">{message}</p>
  </section>;
}

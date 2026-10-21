"use client";
import { useState } from "react";
import { request } from "graphql-request";
import { Button } from "@/components/ui/button";
import { VerifiedRefundWebhookRecovery } from "./VerifiedRefundWebhookRecovery";
export function RefundRecovery() {
  const [rows, setRows] = useState<any[]>([]); const [message, setMessage] = useState("");
  const load = async () => { try { const result: any = await request("/api/graphql", `{refunds(where:{status:{in:["processing","unknown"]}},orderBy:[{createdAt:asc}],take:50){id amount currencyCode status reason order{id orderNumber}}}`); setRows(result.refunds); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load refund recovery"); } };
  const reconcile = async (refundId: string) => { try { const result: any = await request("/api/graphql", `mutation($refundId:ID!){reconcileRefund(refundId:$refundId){success refundId status error}}`, { refundId }); setMessage(`${result.reconcileRefund.status || "pending"}: ${result.reconcileRefund.error || "Refund receipt recorded"}`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Reconciliation pending"); } };
  return <div className="space-y-3"><section className="space-y-2"><Button variant="outline" onClick={load}>Load unresolved refunds</Button>{rows.map(row => <div key={row.id} className="rounded border p-3 text-sm"><p>{row.order?.orderNumber} · {row.amount} {row.currencyCode} minor units · {row.status}</p><p>{row.reason}</p><Button size="sm" onClick={() => reconcile(row.id)}>Reconcile original refund attempt</Button></div>)}<p role="status">{message}</p></section><VerifiedRefundWebhookRecovery /></div>;
}

"use client";
import { useRef, useState } from "react";
import { request } from "graphql-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { actionType: "refund_payment" | "void_item" | "comp_item" | "void_order"; targetId: string; onExecute?: (approvalId: string, reason: string, idempotencyKey: string) => Promise<void>; onComplete?: () => void };
/** Approval belongs to a different authenticated manager; no PIN or actor spoofing. */
export function CorrectionActions({ actionType, targetId, onExecute, onComplete }: Props) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [approval, setApproval] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  const run = async (work: () => Promise<void>) => { setBusy(true); try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Correction failed"); } finally { setBusy(false); } };
  const requestedAmount = amount === "" ? null : Number(amount);
  const requestApproval = () => run(async () => {
    if (!reason.trim()) throw new Error("Enter a reason");
    if (requestedAmount !== null && (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0)) throw new Error("Amount must be positive integer minor units");
    const data: any = await request("/api/graphql", `mutation($actionType:String!,$targetId:ID!,$reason:String!,$amount:Int){requestManagerApproval(actionType:$actionType,targetId:$targetId,reason:$reason,amount:$amount){id status}}`, { actionType, targetId, reason: reason.trim(), amount: requestedAmount });
    key.current ||= crypto.randomUUID(); setApproval(data.requestManagerApproval); setMessage("Awaiting a different manager with staff-management permission.");
  });
  const refresh = () => run(async () => {
    const data: any = await request("/api/graphql", `query($id:ID!){managerApproval(where:{id:$id}){id status consumedEntityType consumedEntityId}}`, { id: approval.id });
    setApproval(data.managerApproval); setMessage(`Approval ${data.managerApproval?.status || "unavailable"}`);
  });
  const execute = () => run(async () => {
    if (onExecute) await onExecute(approval.id, reason.trim(), key.current!);
    else {
      const data: any = await request("/api/graphql", `mutation($paymentId:ID!,$amount:Int,$reason:String!,$idempotencyKey:String!,$managerApprovalId:ID!){refundPayment(paymentId:$paymentId,amount:$amount,reason:$reason,idempotencyKey:$idempotencyKey,managerApprovalId:$managerApprovalId){success refundId status error}}`, { paymentId: targetId, amount: requestedAmount, reason: reason.trim(), idempotencyKey: key.current, managerApprovalId: approval.id });
      const result = data.refundPayment;
      setMessage(`Refund ${result.refundId || ""}: ${result.status || "rejected"}. ${result.error || "Receipt recorded."}`);
      if (!result.success) return; // Retry retains the exact attempt and approval.
    }
    setApproval({ ...approval, status: "consumed" }); onComplete?.();
  });
  return <div className="space-y-2 rounded border p-3">
    <p className="text-sm font-medium">{actionType.replaceAll("_", " ")}</p>
    <Input aria-label="Correction reason" placeholder="Reason" value={reason} disabled={!!approval || busy} onChange={e => setReason(e.target.value)} />
    {actionType === "refund_payment" && <Input aria-label="Refund amount in minor units" placeholder="Minor units; blank refunds remaining balance" value={amount} disabled={!!approval || busy} onChange={e => setAmount(e.target.value)} />}
    {!approval ? <Button size="sm" disabled={busy} onClick={requestApproval}>Request manager approval</Button> : <>
      <Button size="sm" variant="outline" disabled={busy} onClick={refresh}>Refresh approval</Button>
      {approval.status === "approved" && <Button size="sm" disabled={busy} onClick={execute}>Execute approved correction / retry</Button>}
    </>}
    <p role="status" className="text-sm">{message}</p>
  </div>;
}

export function ManagerApprovalQueue() {
  const [rows, setRows] = useState<any[]>([]); const [message, setMessage] = useState("");
  const load = async () => { try { const data: any = await request("/api/graphql", `{managerApprovals(where:{status:{equals:"pending"}},orderBy:[{requestedAt:asc}],take:50){id actionType targetId reason amount requestedBy{id name} expiresAt}}`); setRows(data.managerApprovals); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load approvals"); } };
  const approve = async (approvalId: string) => { try { await request("/api/graphql", `mutation($approvalId:ID!){approveManagerApproval(approvalId:$approvalId){id status}}`, { approvalId }); setMessage("Approved. The requester can now execute this correction."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Approval failed"); } };
  return <section className="space-y-2"><Button variant="outline" onClick={load}>Load pending manager approvals</Button>{rows.map(row => <div key={row.id} className="rounded border p-3 text-sm"><p>{row.actionType} · {row.targetId} · {row.amount ?? "remaining amount"}</p><p>{row.reason} · Requested by {row.requestedBy?.name}</p><Button size="sm" onClick={() => approve(row.id)}>Approve as current manager</Button></div>)}<p role="status">{message}</p></section>;
}

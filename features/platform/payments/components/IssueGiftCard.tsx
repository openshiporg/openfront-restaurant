"use client";
import { useRef, useState } from "react";
import { request } from "graphql-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function IssueGiftCard() {
  const [code, setCode] = useState(""); const [amount, setAmount] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const attempt = useRef<string | null>(null);
  const issue = async () => { setBusy(true); try { attempt.current ||= crypto.randomUUID(); const data: any = await request("/api/graphql", `mutation($code:String!,$amount:Int!,$idempotencyKey:String!){issueGiftCard(code:$code,amount:$amount,idempotencyKey:$idempotencyKey){id code balance}}`, { code, amount: Number(amount), idempotencyKey: attempt.current }); setMessage(`Issued ${data.issueGiftCard.code}; balance ${data.issueGiftCard.balance} minor units. Cash receipt recorded.`); setCode(""); setAmount(""); attempt.current = null; } catch (error) { setMessage(error instanceof Error ? error.message : "Issuance failed; retry retains the original attempt"); } finally { setBusy(false); } };
  return <section className="space-y-2 rounded border p-3"><p className="font-medium">Sell a gift card for cash</p><p className="text-sm">Collect the displayed amount before issuing. This records cash received and a stored-value liability.</p><Input aria-label="Gift card code" placeholder="Card code (8–64 characters)" value={code} onChange={e => { if (!attempt.current) setCode(e.target.value); }} disabled={busy} /><Input aria-label="Gift value in minor units" placeholder="Amount in minor units" value={amount} onChange={e => { if (!attempt.current) setAmount(e.target.value); }} disabled={busy} /><Button disabled={busy || !code || !amount} onClick={issue}>Cash collected — issue gift card / retry</Button><p role="status">{message}</p></section>;
}

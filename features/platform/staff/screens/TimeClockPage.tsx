"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "graphql-request";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCsv } from "@/features/lib/financial-ledger";

const QUERY = `query($fromDate:String,$toDate:String,$skip:Int,$take:Int) { restaurantAttendance(fromDate:$fromDate,toDate:$toDate,skip:$skip,take:$take) }`;
const RECORD = `mutation($action:String!,$entryId:ID,$idempotencyKey:String!){ recordRestaurantAttendance(action:$action,entryId:$entryId,idempotencyKey:$idempotencyKey) }`;
const CORRECT = `mutation($entryId:ID!,$clockIn:String!,$clockOut:String!,$breakMinutes:Int!,$reason:String!,$idempotencyKey:String!){requestRestaurantTimeCorrection(entryId:$entryId,clockIn:$clockIn,clockOut:$clockOut,breakMinutes:$breakMinutes,reason:$reason,idempotencyKey:$idempotencyKey)}`;
const APPROVE = `mutation($requestId:ID!,$idempotencyKey:String!){approveRestaurantTimeCorrection(requestId:$requestId,idempotencyKey:$idempotencyKey)}`;
function localTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function TimeClockPage() {
  const [data, setData] = useState<any>({ entries: [] });
  const [range, setRange] = useState({ fromDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), toDate: new Date().toISOString().slice(0, 10) });
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState<any>(null);
  const keys = useRef(new Map<string, string>());
  const load = useCallback(async () => { const result: any = await request("/api/graphql", QUERY, { ...range, skip, take: 100 }); setData(result.restaurantAttendance); }, [range, skip]);
  useEffect(() => { load().catch(error => setError(error.message)); }, [load]);
  const act = async (query: string, variables: any) => {
    setBusy(true); setError("");
    const fingerprint = JSON.stringify({ query, variables });
    const key = keys.current.get(fingerprint) || crypto.randomUUID(); keys.current.set(fingerprint, key);
    try { await request("/api/graphql", query, { ...variables, idempotencyKey: key }); keys.current.delete(fingerprint); await load(); setCorrection(null); }
    catch (error: any) { setError(error.message || "Unable to save attendance. Retry uses the same request."); }
    finally { setBusy(false); }
  };
  const record = (action: string, entryId?: string) => act(RECORD, { action, entryId });
  const ownOpen = data.activeEntry || data.entries.find((entry: any) => entry.staffId === data.actorId && !entry.clockOut);
  const download = async () => {
    setBusy(true); setError("");
    try {
      const entries = []; let offset = 0;
      while (true) {
        const response: any = await request("/api/graphql", QUERY, { ...range, skip: offset, take: 200 });
        const page = response.restaurantAttendance; entries.push(...page.entries);
        if (!page.hasMore) break; offset += 200;
      }
      const rows = [["Entry ID", "Employee", "Clock in", "Clock out", "Unpaid break minutes", "Paid hours", "Attested", "Approved", "Revision"], ...entries.map((e: any) => [e.id, e.staff?.name, e.clockIn, e.clockOut, e.breakMinutes, e.paidHours, e.state.attested, e.state.approved, e.state.revision])];
      const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `attendance-${range.fromDate}-${range.toDate}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error: any) { setError(error.message || "Unable to export attendance"); } finally { setBusy(false); }
  };

  return <main className="p-6 space-y-6">
    <div className="flex flex-wrap gap-3 items-center"><h1 className="text-2xl font-semibold mr-auto">Time clock and approved attendance</h1><Button disabled={busy} variant="outline" onClick={download}>Export time CSV</Button><Button variant="outline" onClick={() => load().catch(e => setError(e.message))}>Refresh</Button></div>
    <p className="text-sm text-muted-foreground">Clock times are recorded when you act. Review and attest each completed entry; a different manager approves it for tip allocation. Corrections preserve the original record and require separate approval.</p>
    <div className="flex flex-wrap gap-3"><Label>From business date<Input type="date" value={range.fromDate} onChange={event => { setRange({ ...range, fromDate: event.target.value }); setSkip(0); }} /></Label><Label>Through business date<Input type="date" value={range.toDate} onChange={event => { setRange({ ...range, toDate: event.target.value }); setSkip(0); }} /></Label><Button disabled={!skip || busy} onClick={() => setSkip(Math.max(0, skip - 100))}>Previous</Button><Button disabled={!data.hasMore || busy} onClick={() => setSkip(skip + 100)}>Next</Button></div>
    <p className="text-xs text-muted-foreground">Dates follow the recorded business-day cutoff (restaurant midnight before any business-day policy). Export includes every page in the selected range; live edits during export require rerunning it before payroll approval.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!ownOpen ? <Button disabled={busy} onClick={() => record("clock_in")}>Clock in</Button> : <div className="flex gap-3"><Button disabled={busy} onClick={() => record(ownOpen.state.breakStartedAt ? "end_break" : "start_break", ownOpen.id)}>{ownOpen.state.breakStartedAt ? "End break" : "Start unpaid break"}</Button><Button disabled={busy || Boolean(ownOpen.state.breakStartedAt)} onClick={() => record("clock_out", ownOpen.id)}>Clock out</Button></div>}
    {correction && <Card><CardHeader><CardTitle>Request a time correction</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm">Times below use your device timezone. A different manager must approve; the employee then reviews the corrected time.</p>
      <Label>Clock in<Input type="datetime-local" value={correction.clockIn} onChange={e => setCorrection({ ...correction, clockIn: e.target.value })} /></Label>
      <Label>Clock out<Input type="datetime-local" value={correction.clockOut} onChange={e => setCorrection({ ...correction, clockOut: e.target.value })} /></Label>
      <Label>Unpaid break minutes<Input type="number" min="0" value={correction.breakMinutes} onChange={e => setCorrection({ ...correction, breakMinutes: e.target.value })} /></Label>
      <Label>Reason<Input value={correction.reason} onChange={e => setCorrection({ ...correction, reason: e.target.value })} /></Label>
      <div className="flex gap-3"><Button disabled={busy || !correction.reason.trim() || !Number.isFinite(new Date(correction.clockIn).getTime()) || !Number.isFinite(new Date(correction.clockOut).getTime())} onClick={() => act(CORRECT, { ...correction, clockIn: new Date(correction.clockIn).toISOString(), clockOut: new Date(correction.clockOut).toISOString(), breakMinutes: Number(correction.breakMinutes) })}>Request correction</Button><Button variant="outline" onClick={() => setCorrection(null)}>Cancel</Button></div>
    </CardContent></Card>}
    {data.entries.map((entry: any) => <Card key={entry.id}><CardHeader><CardTitle className="text-base">{entry.staff?.name || "Employee"} · {entry.role}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p>{new Date(entry.clockIn).toLocaleString()} → {entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "Clocked in"}</p>
      <p className="text-sm">Unpaid break: {entry.breakMinutes || 0} min · Paid hours: {Number(entry.paidHours).toFixed(2)} · {entry.state.approved ? "Approved" : entry.state.attested ? "Awaiting manager approval" : "Awaiting employee attestation"}</p>
      <div className="flex flex-wrap gap-3">
        {entry.staffId === data.actorId && entry.clockOut && !entry.state.attested && <Button disabled={busy} onClick={() => record("attest", entry.id)}>I attest this time is accurate</Button>}
        {data.canManageStaff && entry.staffId !== data.actorId && entry.state.attested && !entry.state.approved && <Button disabled={busy} onClick={() => record("approve_time", entry.id)}>Approve time</Button>}
        <Button disabled={busy} variant="outline" onClick={() => setCorrection({ entryId: entry.id, clockIn: localTime(entry.clockIn), clockOut: localTime(entry.clockOut || new Date().toISOString()), breakMinutes: entry.breakMinutes || "0", reason: "" })}>Request correction</Button>
      </div>
      {entry.corrections.map((proposal: any) => <div key={proposal.id} className="border rounded p-3"><p>{proposal.reason}</p><p className="text-sm">{new Date(proposal.proposed.clockIn).toLocaleString()} → {new Date(proposal.proposed.clockOut).toLocaleString()} · unpaid breaks {proposal.proposed.breakMinutes} min</p>{data.canManageStaff && proposal.actorId !== data.actorId && entry.staffId !== data.actorId && <Button disabled={busy} onClick={() => act(APPROVE, { requestId: proposal.id })}>Approve correction</Button>}</div>)}
    </CardContent></Card>)}
  </main>;
}

export default TimeClockPage;

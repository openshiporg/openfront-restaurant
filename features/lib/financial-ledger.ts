export function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Amount must be a nonnegative integer in minor units');
  return amount;
}
export const settledStatuses = ['succeeded', 'partially_refunded', 'refunded'];
export function tenderTotals(payments: any[], refunds: any[]) {
  const byMethod: Record<string, { gross: number; refunds: number; net: number; tips: number }> = {};
  for (const p of payments) {
    if (!settledStatuses.includes(p.status)) continue;
    const row = byMethod[p.paymentMethod] ||= { gross: 0, refunds: 0, net: 0, tips: 0 };
    row.gross += money(p.amount); row.tips += money(p.tipAmount || 0);
  }
  for (const r of refunds) {
    if (r.status !== 'succeeded') continue;
    const method = r.payment?.paymentMethod || 'unknown';
    const row = byMethod[method] ||= { gross: 0, refunds: 0, net: 0, tips: 0 };
    row.refunds += money(r.amount);
    row.tips -= money(r.providerData?.refundedTipAmount || 0);
  }
  for (const row of Object.values(byMethod)) row.net = row.gross - row.refunds;
  return byMethod;
}
export function businessDate(now: Date, timezone: string, cutoffMinutes = 0) {
  if (!Number.isInteger(cutoffMinutes) || cutoffMinutes < 0 || cutoffMinutes >= 1440) throw new Error('Invalid business-day cutoff');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (Number(parts.hour) * 60 + Number(parts.minute) < cutoffMinutes) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
/** Quoting alone does not prevent spreadsheet formula execution. */
export function toCsv(rows: unknown[][]) {
  return rows.map(row => row.map(value => {
    let cell = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell)) cell = `'${cell}`;
    return `"${cell.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}

/** First-close coverage starts at the venue cutoff, including sales before drawer opening. */
export function businessDayStart(date: string, timezone: string, cutoffMinutes: number): Date {
  const center = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(center)) throw new Error('Invalid business date');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let exact: Date | undefined, fallback: Date | undefined;
  for (let t = center - 18 * 3600000; t <= center + 42 * 3600000; t += 60000) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(t)).map(part => [part.type, part.value]));
    if (`${p.year}-${p.month}-${p.day}` !== date) continue;
    const minute = Number(p.hour) * 60 + Number(p.minute);
    if (minute === cutoffMinutes) exact = new Date(t); // later repeated cutoff during fall-back
    if (!fallback && minute >= cutoffMinutes) fallback = new Date(t); // first valid minute after a spring gap
  }
  if (!exact && !fallback) throw new Error('Business cutoff could not be resolved');
  return (exact || fallback)!;
}

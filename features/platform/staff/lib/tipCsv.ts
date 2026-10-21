import { toCsv } from "@/features/lib/financial-ledger";
export function tipPoolCsv(pools: any[]) {
  const rows: unknown[][] = [["Pool ID", "Business date", "Status", "Employee ID", "Employee", "Role", "Paid hours", "Tip minor units", "Source evidence"]];
  for (const pool of pools) for (const entry of pool.distributions || []) rows.push([pool.id, String(pool.date).slice(0, 10), pool.status, entry.staffId, entry.staffName, entry.role, entry.hoursWorked, entry.amount, pool.notes || ""]);
  return toCsv(rows);
}

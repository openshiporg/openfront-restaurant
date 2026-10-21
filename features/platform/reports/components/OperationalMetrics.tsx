"use client";

import { formatNumber, formatPercentage } from "../lib/reportHelpers";
import { Clock, Users, Table2, ChefHat, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface OperationalMetricsProps {
  currentOrders: number;
  tableOccupancy: number;
  totalTables: number;
  averageTicketTime: number;
  targetTicketTime: number;
  ordersInKitchen: number;
  ordersReady: number;
  voidCount: number;
  serverCount: number;
  revenuePerLaborHour?: number;
  currencyCode?: string;
  locale?: string;
}

export function OperationalMetrics({
  tableOccupancy,
  totalTables,
  averageTicketTime,
  targetTicketTime,
  ordersInKitchen,
  ordersReady,
  voidCount,
  serverCount,
}: OperationalMetricsProps) {
  const occupancyPercent = totalTables > 0 ? (tableOccupancy / totalTables) * 100 : 0;
  const hasTicketTime = averageTicketTime > 0;
  const ticketOk = !hasTicketTime || averageTicketTime <= targetTicketTime;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Operational Metrics</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 border-b border-border">
        {/* Table occupancy */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <Table2 size={13} />
            <p className="text-[11px] uppercase tracking-wider">Tables</p>
          </div>
          <p className="text-xl font-semibold">
            {tableOccupancy}/{totalTables}
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                occupancyPercent > 80 ? "bg-emerald-500" : occupancyPercent > 50 ? "bg-amber-400" : "bg-zinc-400"
              )}
              style={{ width: `${occupancyPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{formatPercentage(occupancyPercent)} occupied</p>
        </div>

        {/* Avg ticket time */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <Clock size={13} />
            <p className="text-[11px] uppercase tracking-wider">Avg Ticket Time</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className={cn("text-xl font-semibold", ticketOk ? "" : "text-amber-600")}>{hasTicketTime ? formatNumber(averageTicketTime) : '—'}</p>
            <p className="text-xs text-muted-foreground">min</p>
          </div>
          <p className={cn("text-xs mt-1 font-medium", ticketOk ? "text-emerald-600" : "text-amber-600")}>
            {!hasTicketTime ? "No completed tickets" : ticketOk ? "On target" : "Slow"} · target {targetTicketTime}m
          </p>
        </div>

        {/* Kitchen */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <ChefHat size={13} />
            <p className="text-[11px] uppercase tracking-wider">Kitchen</p>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xl font-semibold text-amber-600">{ordersInKitchen}</p>
              <p className="text-xs text-muted-foreground">In progress</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-xl font-semibold text-emerald-600">{ordersReady}</p>
              <p className="text-xs text-muted-foreground">Ready</p>
            </div>
          </div>
        </div>

        {/* Void rate + staff */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <AlertTriangle size={13} />
            <p className="text-[11px] uppercase tracking-wider">Recorded Order Voids</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-semibold">{formatNumber(voidCount)}</p>
          </div>
          <p className="text-xs mt-1 text-muted-foreground">Whole-order correction records today; excludes check merges.</p>
        </div>
      </div>

      {/* Staff row */}
      <div className="px-5 py-3 flex items-center gap-3">
        <Users size={13} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Active Staff</span>
        <span className="text-sm font-semibold ml-2">{serverCount}</span>
        <span className="text-xs text-muted-foreground">floor staff clocked in</span>
      </div>
    </div>
  );
}

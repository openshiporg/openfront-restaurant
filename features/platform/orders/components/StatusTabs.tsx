"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { StatusDot, statusConfig } from "./StatusDot";

interface StatusTabsProps {
  statusCounts: {
    all: number;
    open: number;
    sent_to_kitchen: number;
    in_progress: number;
    ready: number;
    served: number;
    completed: number;
    cancelled: number;
  };
}

export function StatusTabs({ statusCounts }: StatusTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeSearchParams = searchParams ?? new URLSearchParams();
  const pathname = usePathname();

  const tabs = [
    { value: "all", label: "All", count: statusCounts.all },
    { value: "open", label: "Open", count: statusCounts.open },
    { value: "sent_to_kitchen", label: "Sent", count: statusCounts.sent_to_kitchen },
    { value: "in_progress", label: "Cooking", count: statusCounts.in_progress },
    { value: "ready", label: "Ready", count: statusCounts.ready },
    { value: "served", label: "Served", count: statusCounts.served },
    { value: "completed", label: "Closed", count: statusCounts.completed },
    { value: "cancelled", label: "Cancelled", count: statusCounts.cancelled },
  ] as const;

  const statusFilter = safeSearchParams.get("!status_matches");
  let currentStatus = "all";
  if (statusFilter) {
    try {
      const parsed = JSON.parse(decodeURIComponent(statusFilter));
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentStatus = typeof parsed[0] === "object" ? parsed[0].value : parsed[0];
      }
    } catch {}
  }

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(safeSearchParams.toString());
    if (status === "all") params.delete("!status_matches");
    else params.set("!status_matches", JSON.stringify([status]));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="px-4 md:px-6 py-4 border-b bg-gradient-to-r from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const active = currentStatus === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                active
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-background text-foreground border-border hover:border-zinc-400"
              }`}
            >
              {tab.value !== "all" && (
                <StatusDot
                  status={tab.value as keyof typeof statusConfig}
                  size="sm"
                />
              )}
              <span className="uppercase tracking-wide">{tab.label}</span>
              <span
                className={`text-[11px] tabular-nums ${
                  active ? "text-background/80" : "text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

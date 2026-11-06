"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StatusTabs } from "../components/StatusTabs";
import { OrderDetailsComponent } from "../components/OrderDetailsComponent";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { EmptyState } from "@/components/ui/empty-state";
import { Ticket, Search, CircleDashed, Flame, Timer, Store, Globe } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OrderListPageClientProps {
  initialData: {
    items: any[];
    count: number;
  };
  statusCounts: any;
  error?: string | null;
  currencyCode?: string;
  locale?: string;
}

export function OrderListPageClient({
  initialData,
  statusCounts,
  error,
  currencyCode = "USD",
  locale = "en-US",
}: OrderListPageClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const safeSearchParams = searchParams ?? new URLSearchParams();
  const searchString = safeSearchParams.get("search") || "";
  const activeView = safeSearchParams.get("view") || "all";
  const activeSource = safeSearchParams.get("source") || "all";

  const setQueryFilter = (key: string, value: string) => {
    const params = new URLSearchParams(safeSearchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  };

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "" },
    { type: "page" as const, label: "Platform" },
    { type: "page" as const, label: "Orders" },
  ];

  const activeCount =
    (statusCounts.open || 0) +
    (statusCounts.sent_to_kitchen || 0) +
    (statusCounts.in_progress || 0) +
    (statusCounts.ready || 0);

  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Service Order Board</h1>
        <p className="text-muted-foreground text-sm">
          A clean command center for online + in-house order orchestration.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium tabular-nums text-muted-foreground">
        <span>Active: {activeCount}</span>
        <span>Ready: {statusCounts.ready || 0}</span>
        <span>Closed: {statusCounts.completed || 0}</span>
      </div>
    </div>
  );

  return (
    <PageContainer title="Orders" header={header} breadcrumbs={breadcrumbs}>
      <div className="flex flex-col h-full bg-background">
        <div className="px-4 md:px-6 py-3 border-b bg-background/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">Board</span>
            {([
              { id: "all", label: "All" },
              { id: "kitchen", label: "Kitchen" },
              { id: "expedite", label: "Expedite" },
              { id: "cashier", label: "Cashier" },
            ] as const).map((view) => (
              <button
                key={view.id}
                onClick={() => setQueryFilter("view", view.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  activeView === view.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border hover:border-zinc-400"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">Source</span>
            {([
              { id: "all", label: "All", icon: Ticket },
              { id: "online", label: "Online", icon: Globe },
              { id: "pos", label: "In-store", icon: Store },
            ] as const).map((source) => (
              <button
                key={source.id}
                onClick={() => setQueryFilter("source", source.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold inline-flex items-center gap-1 ${
                  activeSource === source.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border hover:border-zinc-400"
                }`}
              >
                <source.icon className="h-3 w-3" /> {source.label}
              </button>
            ))}
          </div>
        </div>

        <StatusTabs statusCounts={statusCounts} />

        <div className="flex-1">
          {error ? (
            <div className="p-4 md:p-6">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : initialData.items.length === 0 ? (
            <div className="p-8 md:p-12">
              {searchString ? (
                <EmptyState
                  title="No matching orders"
                  description={`No orders matched "${searchString}"`}
                  icons={[Search, CircleDashed]}
                />
              ) : (
                <EmptyState
                  title="No orders in queue"
                  description="New website and POS orders will appear here in real time."
                  icons={[Ticket, Flame, Timer]}
                />
              )}
            </div>
          ) : (
            <div className="border-t divide-y">
              {initialData.items.map((order) => (
                <OrderDetailsComponent
                  key={order.id}
                  order={order}
                  currencyCode={currencyCode}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

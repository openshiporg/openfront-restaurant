import { getOperationalMetrics, getSalesOverview, getDayFinancialActivity } from "../actions";
import { venueTodayRange, operationalDaySummary, recordedOrderVoidCount, formatCurrency } from "../lib/reportHelpers";
import { getStoreSettings } from "@/features/storefront/lib/data/menu";
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs";
import { OperationalMetrics } from "../components/OperationalMetrics";
import { Button } from "@/components/ui/button";
import { RefreshCw, Receipt, ChefHat, ListOrdered, BarChart3 } from "lucide-react";
import Link from "next/link";

export async function OperationalDashboard() {
  try {
    const storeSettings = await getStoreSettings();
    const today = venueTodayRange(storeSettings?.timezone || 'UTC');
    const [metricsResponse, salesResponse, financialResponse] = await Promise.all([
      getOperationalMetrics(today.startDate, today.endDate),
      getSalesOverview(today.startDate, today.endDate),
      getDayFinancialActivity(today.startDate, today.endDate),
    ]);
    if (!metricsResponse.success || !salesResponse.success || !financialResponse.success) throw new Error('Operational data could not be loaded with the current permissions');

    const currencyConfig = {
      currencyCode: storeSettings?.currencyCode || "USD",
      locale: storeSettings?.locale || "en-US",
    };

    const metrics = metricsResponse.success ? metricsResponse.data : null;
    const salesData = salesResponse.success ? salesResponse.data : null;

    const currentOrders = metrics?.openOrders || 0;
    const ordersInKitchen = metrics?.inProgressOrders || 0;
    const ordersReady = metrics?.readyOrders || 0;
    const occupiedTables = metrics?.occupiedTables || 0;
    const totalTables = metrics?.totalTables || 0;
    const cancelledOrders = metrics?.cancelledOrders || 0;
    const voidCount = recordedOrderVoidCount(metrics?.voidAdjustments || []);

    const recentOrders = metrics?.recentOrders || [];
    const recentTickets = metrics?.recentTickets || [];
    const completedTicketDurations = recentTickets
      .map((ticket: any) => {
        if (!ticket.firedAt || !ticket.completedAt) return null;
        const fired = new Date(ticket.firedAt).getTime();
        const completed = new Date(ticket.completedAt).getTime();
        if (Number.isNaN(fired) || Number.isNaN(completed) || completed <= fired) return null;
        return Math.round((completed - fired) / 60000);
      })
      .filter((duration: number | null): duration is number => duration !== null);
    const averageTicketTime = completedTicketDurations.length > 0
      ? completedTicketDurations.reduce((sum: number, minutes: number) => sum + minutes, 0) / completedTicketDurations.length
      : 0;

    const todayOrders = salesData?.restaurantOrders || [];
    const summary = operationalDaySummary(todayOrders, financialResponse.data?.payments || [], financialResponse.data?.refunds || []);
    const todayRevenue = summary.netCollections, coversToday = summary.covers, dineInTurns = summary.dineInChecksWithGuests;
    const activeFloorStaff = metrics?.activeFloorStaff || 0;
    const openReservations = metrics?.openReservations || 0;
    const waitingGuests = metrics?.waitingGuests || 0;

    const kitchenLoad = ordersInKitchen > 10 ? "High" : ordersInKitchen > 5 ? "Moderate" : "Normal";
    const kitchenLoadColor = ordersInKitchen > 10 ? "text-red-600" : ordersInKitchen > 5 ? "text-amber-600" : "text-emerald-600";

    return (
      <section aria-label="Operational Dashboard" className="flex flex-col h-full">
        <PageBreadcrumbs
          items={[
            { type: "link", label: "Dashboard", href: "" },
            { type: "page", label: "Operations" },
          ]}
        />

        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-emerald-600 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Snapshot
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Restaurant operations as loaded. Today uses the restaurant’s local calendar date.</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh the page to update
          </div>
        </div>

        {/* Key Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Today's net food collections</p>
            <p className="text-xl font-semibold mt-1">{formatCurrency(todayRevenue, currencyConfig)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.completedChecks} closed checks opened today · {coversToday} covers</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Open Checks</p>
            <p className="text-xl font-semibold mt-1">{currentOrders}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{ordersReady} ready to serve</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Kitchen Queue</p>
            <p className={`text-xl font-semibold mt-1 ${kitchenLoadColor}`}>{ordersInKitchen}</p>
            <p className={`text-xs mt-0.5 ${kitchenLoadColor}`}>{kitchenLoad}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tables</p>
            <p className="text-xl font-semibold mt-1">{occupiedTables}/{totalTables}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0}% occupied
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">
          {/* Operational metrics component */}
          <OperationalMetrics
            currentOrders={currentOrders}
            tableOccupancy={occupiedTables}
            totalTables={totalTables}
            averageTicketTime={averageTicketTime}
            targetTicketTime={18}
            ordersInKitchen={ordersInKitchen}
            ordersReady={ordersReady}
            voidCount={voidCount}
            serverCount={activeFloorStaff}
            currencyCode={currencyConfig.currencyCode}
            locale={currencyConfig.locale}
          />

          {/* Status + Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Status */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold">Current Status</h2>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Kitchen Load</span>
                  <span className={`text-sm font-medium ${kitchenLoadColor}`}>{kitchenLoad}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Dine-in checks completed</span>
                  <span className="text-sm font-medium text-emerald-600">{dineInTurns} checks with guests opened today</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Recorded order voids today</span>
                  <span className="text-sm font-medium">{voidCount}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Cancelled checks, including merges</span>
                  <span className="text-sm font-medium">{cancelledOrders}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Host Stand</span>
                  <span className="text-sm font-medium">{openReservations} active reservations · {waitingGuests} waiting</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold">Quick Actions</h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                <Link href="/dashboard/platform/pos">
                  <div className="rounded-md border border-border hover:border-foreground/30 bg-background hover:bg-muted/30 p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors text-center">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium">New Order</span>
                  </div>
                </Link>
                <Link href="/dashboard/platform/kds">
                  <div className="rounded-md border border-border hover:border-foreground/30 bg-background hover:bg-muted/30 p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors text-center">
                    <ChefHat className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium">Kitchen Display</span>
                  </div>
                </Link>
                <Link href="/dashboard/platform/orders">
                  <div className="rounded-md border border-border hover:border-foreground/30 bg-background hover:bg-muted/30 p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors text-center">
                    <ListOrdered className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium">All Orders</span>
                  </div>
                </Link>
                <Link href="/dashboard/platform/reports/sales">
                  <div className="rounded-md border border-border hover:border-foreground/30 bg-background hover:bg-muted/30 p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors text-center">
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium">Reports</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error("Error loading operational dashboard:", error);
    return (
      <div className="px-4 md:px-6 py-8">
        <h1 className="text-xl font-semibold text-destructive">Dashboard Error</h1>
        <p className="mt-2 text-sm text-muted-foreground">Failed to load operational data. Please try again.</p>
      </div>
    );
  }
}

import {
  getSalesOverview,
  getPaymentBreakdown,
} from "../actions";
import {
  getDateRange,
  getPreviousPeriodRange,
  calculateSalesMetrics,
  calculateDaypartMetrics,
  calculatePaymentMethodBreakdown,
  calculatePercentageChange,
  generateTimeSeriesData,
  formatCurrency,
  formatNumber,
  formatPercentage,
} from "../lib/reportHelpers";
import { getStoreSettings } from "@/features/storefront/lib/data/menu";
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs";
import { StatsCards } from "../components/StatsCards";
import { PeriodSelector } from "../components/PeriodSelector";
import { DateRangePickerWrapper } from "../components/DateRangePickerWrapper";
import { RevenueChart } from "../components/RevenueChart";
import { DaypartChart } from "../components/DaypartChart";
import { OrderTypeChart } from "../components/OrderTypeChart";
import { PaymentMethodChart } from "../components/PaymentMethodChart";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function SalesReportPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const selectedPeriod = (resolvedSearchParams.period as string) || "30d";

  const customStartDate = resolvedSearchParams.startDate as string;
  const customEndDate = resolvedSearchParams.endDate as string;

  let startDate: string;
  let endDate: string;

  if (customStartDate && customEndDate) {
    startDate = customStartDate;
    endDate = customEndDate;
  } else {
    const range = getDateRange(selectedPeriod);
    startDate = range.startDate;
    endDate = range.endDate;
  }

  const previousRange = getPreviousPeriodRange(
    selectedPeriod,
    customStartDate,
    customEndDate
  );
  const previousStartDate = previousRange.startDate;
  const previousEndDate = previousRange.endDate;

  try {
    const [salesResponse, paymentResponse, storeSettings] = await Promise.all([
      getSalesOverview(startDate, endDate, previousStartDate, previousEndDate),
      getPaymentBreakdown(startDate, endDate),
      getStoreSettings(),
    ]);

    const currencyConfig = {
      currencyCode: storeSettings?.currencyCode || "USD",
      locale: storeSettings?.locale || "en-US",
    };

    const salesData = salesResponse.success ? salesResponse.data : null;
    const paymentData = paymentResponse.success ? paymentResponse.data : null;

    const orders = salesData?.restaurantOrders || [];
    const previousOrders = salesData?.previousOrders || [];
    const payments = paymentData?.payments || [];

    const salesMetrics = calculateSalesMetrics(orders, previousOrders);
    const daypartMetrics = calculateDaypartMetrics(orders);
    const paymentBreakdown = calculatePaymentMethodBreakdown(payments);
    const timeSeriesData = generateTimeSeriesData(
      orders.filter((o: any) => o.status === 'completed'),
      new Date(startDate),
      new Date(endDate),
      selectedPeriod === "12m" ? "month" : "day"
    );

    const statsData = [
      {
        name: "Net Collected (Completed Checks)",
        value: formatCurrency(salesMetrics.totalRevenue, currencyConfig),
        previous: formatCurrency(salesMetrics.previousRevenue, currencyConfig),
        change: salesMetrics.previousRevenue > 0
          ? `${calculatePercentageChange(salesMetrics.totalRevenue, salesMetrics.previousRevenue).value.toFixed(1)}%`
          : undefined,
        changeType: salesMetrics.previousRevenue > 0
          ? (calculatePercentageChange(salesMetrics.totalRevenue, salesMetrics.previousRevenue).isPositive
            ? "positive" as const
            : "negative" as const)
          : "neutral" as const,
      },
      {
        name: "Total Orders",
        value: formatNumber(salesMetrics.completedOrders),
        previous: formatNumber(salesMetrics.previousOrders),
        change: salesMetrics.previousOrders > 0
          ? `${calculatePercentageChange(salesMetrics.completedOrders, salesMetrics.previousOrders).value.toFixed(1)}%`
          : undefined,
        changeType: salesMetrics.previousOrders > 0
          ? (calculatePercentageChange(salesMetrics.completedOrders, salesMetrics.previousOrders).isPositive
            ? "positive" as const
            : "negative" as const)
          : "neutral" as const,
      },
      {
        name: "Average Check",
        value: formatCurrency(salesMetrics.averageCheckSize, currencyConfig),
        previous: formatCurrency(salesMetrics.previousAverageCheck, currencyConfig),
        change: salesMetrics.previousAverageCheck > 0
          ? `${calculatePercentageChange(salesMetrics.averageCheckSize, salesMetrics.previousAverageCheck).value.toFixed(1)}%`
          : undefined,
        changeType: salesMetrics.previousAverageCheck > 0
          ? (calculatePercentageChange(salesMetrics.averageCheckSize, salesMetrics.previousAverageCheck).isPositive
            ? "positive" as const
            : "negative" as const)
          : "neutral" as const,
      },
      {
        name: "Total Guests",
        value: formatNumber(salesMetrics.totalGuests),
        previous: formatNumber(salesMetrics.previousGuests),
        change: salesMetrics.previousGuests > 0
          ? `${calculatePercentageChange(salesMetrics.totalGuests, salesMetrics.previousGuests).value.toFixed(1)}%`
          : undefined,
        changeType: salesMetrics.previousGuests > 0
          ? (calculatePercentageChange(salesMetrics.totalGuests, salesMetrics.previousGuests).isPositive
            ? "positive" as const
            : "negative" as const)
          : "neutral" as const,
      },
    ];

    return (
      <div className="flex flex-col h-full bg-background">
        <PageBreadcrumbs
          items={[
            { type: "link", label: "Dashboard", href: "" },
            { type: "link", label: "Reports", href: "/platform/reports" },
            { type: "page", label: "Sales" },
          ]}
        />

        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sales Report</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Net collected on completed checks after refunds. Tax and tips show original check charges; cash-close reports attribute money to its actual processing period.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PeriodSelector />
            <DateRangePickerWrapper />
          </div>
        </div>

        {/* Stat strip */}
        <StatsCards data={statsData} />

        {/* Charts */}
        <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueChart
              timeSeriesData={timeSeriesData}
              totalRevenue={salesMetrics.totalRevenue}
              totalOrders={salesMetrics.completedOrders}
              totalGuests={salesMetrics.totalGuests}
              currencyCode={currencyConfig.currencyCode}
              locale={currencyConfig.locale}
            />
            <DaypartChart
              data={daypartMetrics}
              currencyCode={currencyConfig.currencyCode}
              locale={currencyConfig.locale}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <OrderTypeChart
              data={{
                ordersByType: salesMetrics.ordersByType,
                revenueByType: salesMetrics.revenueByType,
              }}
              currencyCode={currencyConfig.currencyCode}
              locale={currencyConfig.locale}
            />
            <PaymentMethodChart
              data={paymentBreakdown}
              currencyCode={currencyConfig.currencyCode}
              locale={currencyConfig.locale}
            />
          </div>

          {/* Additional metrics — cell grid */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
                Additional Metrics
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Tax</p>
                <p className="text-sm font-semibold mt-1">{formatCurrency(salesMetrics.totalTax, currencyConfig)}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Tips</p>
                <p className="text-sm font-semibold mt-1 text-emerald-600 dark:text-emerald-400">{formatCurrency(salesMetrics.totalTips, currencyConfig)}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Discounts</p>
                <p className="text-sm font-semibold mt-1 text-amber-600 dark:text-amber-400">{formatCurrency(salesMetrics.totalDiscounts, currencyConfig)}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Revenue / Guest</p>
                <p className="text-sm font-semibold mt-1">{formatCurrency(salesMetrics.revenuePerGuest, currencyConfig)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error loading sales report:", error);
    return (
      <div className="flex flex-col h-full bg-background">
        <PageBreadcrumbs
          items={[
            { type: "link", label: "Dashboard", href: "" },
            { type: "link", label: "Reports", href: "/platform/reports" },
            { type: "page", label: "Sales" },
          ]}
        />
        <div className="px-4 md:px-6 py-8">
          <p className="text-sm text-red-600 font-medium">Failed to load sales report data.</p>
          <p className="text-xs text-muted-foreground mt-1">Try selecting a different date range.</p>
        </div>
      </div>
    );
  }
}

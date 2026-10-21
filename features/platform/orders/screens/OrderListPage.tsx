import { getOrders, getOrderStatusCounts } from "../actions";
import { OrderListPageClient } from "./OrderListPageClient";
import { getStoreSettings } from "@/features/storefront/lib/data/menu";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function OrderListPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  
  const statusFilter = resolvedSearchParams["!status_matches"];
  const viewFilter = typeof resolvedSearchParams.view === 'string' ? resolvedSearchParams.view : 'all';
  const sourceFilter = typeof resolvedSearchParams.source === 'string' ? resolvedSearchParams.source : 'all';

  let status = null;
  if (statusFilter) {
    try {
      const parsed = JSON.parse(decodeURIComponent(statusFilter as string));
      if (Array.isArray(parsed) && parsed.length > 0) {
        status = typeof parsed[0] === "object" ? parsed[0].value : parsed[0];
      }
    } catch (e) {}
  }

  const where: any = {};

  // View presets inspired by simpler operational boards
  if (viewFilter === 'kitchen') {
    where.status = { in: ['open', 'sent_to_kitchen', 'in_progress', 'ready'] };
  } else if (viewFilter === 'expedite') {
    where.status = { in: ['ready', 'dispatched', 'served'] };
  } else if (viewFilter === 'cashier') {
    where.status = { in: ['served', 'completed'] };
  }

  // Explicit status filter takes priority over view preset
  if (status && status !== "all") {
    where.status = { equals: status };
  }

  if (sourceFilter !== 'all') {
    where.orderSource = { equals: sourceFilter };
  }

  const [response, statusCountsResponse, storeSettings] = await Promise.all([
    getOrders(where, 50, 0),
    getOrderStatusCounts(),
    getStoreSettings(),
  ]);

  let fetchedData = { items: [], count: 0 };
  if (response.success) {
    fetchedData = response.data;
  }

  let statusCounts = {
    all: 0,
    open: 0,
    sent_to_kitchen: 0,
    in_progress: 0,
    ready: 0,
    dispatched: 0,
    served: 0,
    completed: 0,
    cancelled: 0,
  };

  if (statusCountsResponse.success) {
    statusCounts = statusCountsResponse.data;
  }

  return (
    <OrderListPageClient 
      initialData={fetchedData} 
      statusCounts={statusCounts}
      currencyCode={storeSettings?.currencyCode || "USD"}
      locale={storeSettings?.locale || "en-US"}
    />
  );
}

export default OrderListPage;

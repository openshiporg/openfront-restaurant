import { ScheduledTime } from "../components/scheduled-time";
import { OrderStatusTimeline, OrderStatus, OrderType } from "../components/order-status-timeline";
import { OrderItemsList } from "../components/order-items-list";
import { OrderSummary } from "../components/order-summary";
import { OrderDetailsCard } from "../components/order-details-card";
import Link from "next/link";
import { OrderLiveRefresh } from "../components/order-live-refresh";
import { ArrowLeft } from "lucide-react";
import { withDishCutouts } from "./order-details-template";

interface RestaurantOrder {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  orderSource: string;
  status: OrderStatus;
  guestCount?: number;
  specialInstructions?: string;
  subtotal: number;
  tax: number;
  tip: number;
  discount: number;
  total: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryAddress2?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryCountryCode?: string;
  createdAt: string;
  scheduledFor?: string | null;
  updatedAt: string;
  checkAllocation?: { sourceOrderNumber: string; ordinal: number; guestCount: number; allocatedTotals: { total: number } } | null;
  orderItems: any[];
  payments?: any[];
}

interface OrderCompletedTemplateProps {
  order: RestaurantOrder;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Received",
  sent_to_kitchen: "Sent to kitchen",
  in_progress: "Preparing",
  ready: "Ready",
  dispatched: "On the way",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  takeout: "Takeout",
  delivery: "Delivery",
};

export default function OrderCompletedTemplate({ order }: OrderCompletedTemplateProps) {
  const statusLabel = order.orderType === "delivery" && order.status === "served" ? "Delivered" : STATUS_LABEL[order.status] ?? order.status;
  const typeLabel = ORDER_TYPE_LABEL[order.orderType] ?? order.orderType;

  return (
    <div className="py-5 sm:py-10 lg:py-14">
      <div className="storefront-shell">
        <Link href="/menu" className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-mint hover:text-leaf">
          <ArrowLeft size={14} />
          Back to the menu
        </Link>

        <OrderLiveRefresh status={order.status} />
        <div className="mt-3 pb-2 sm:mt-6 sm:pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="break-words sf-section-title text-foreground sm:text-[2rem]">Order #{order.orderNumber}</h2>
              <p className="mt-1 text-[0.85rem] text-muted-foreground sm:text-base">
                {typeLabel} · {new Date(order.createdAt).toLocaleDateString()}
              </p>
              {order.scheduledFor ? (
                <p className="mt-1 text-sm font-semibold text-foreground" data-testid="order-scheduled-for">
                  {order.orderType === "delivery" ? "Delivery" : "Pickup"} scheduled for <ScheduledTime value={order.scheduledFor} />
                </p>
              ) : null}
            </div>
            <div className="rounded-full bg-mint px-3 py-1 text-[0.8rem] font-medium text-leaf">
              {statusLabel}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="storefront-surface bg-card p-4 sm:p-6">
              <OrderStatusTimeline status={order.status} orderType={order.orderType} />
            </div>
            <div className="storefront-surface bg-card p-4 sm:p-6">
              <OrderDetailsCard
                orderNumber={order.orderNumber}
                orderType={order.orderType}
                createdAt={order.createdAt}
                customerName={order.customerName}
                customerEmail={order.customerEmail}
                customerPhone={order.customerPhone}
                deliveryAddress={order.deliveryAddress}
                deliveryAddress2={order.deliveryAddress2}
                deliveryCity={order.deliveryCity}
                deliveryState={order.deliveryState}
                deliveryZip={order.deliveryZip}
                deliveryCountryCode={order.deliveryCountryCode}
                specialInstructions={order.specialInstructions}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="storefront-surface bg-card p-4 sm:p-6">
              {order.checkAllocation && <p className="mb-3 rounded-xl bg-muted p-3">Independent check {order.checkAllocation.ordinal} of {order.checkAllocation.guestCount} from service {order.checkAllocation.sourceOrderNumber}. Your allocated charge is shown in the total. Any food details below describe the original service and are not charged again in full.</p>}
              <OrderItemsList items={withDishCutouts(order.orderItems)} />
            </div>
            <div className="storefront-surface bg-card p-4 sm:p-6">
              <OrderSummary
                orderType={order.orderType}
                subtotal={order.subtotal}
                tax={order.tax}
                tip={order.tip}
                discount={order.discount}
                total={order.total}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

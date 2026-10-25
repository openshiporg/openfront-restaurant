import { OrderStatusTimeline, OrderStatus, OrderType } from "../components/order-status-timeline";
import { OrderItemsList } from "../components/order-items-list";
import { OrderSummary } from "../components/order-summary";
import { OrderDetailsCard } from "../components/order-details-card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
    <div className="py-8 sm:py-10 lg:py-14">
      <div className="storefront-shell">
        <Link href="/account/orders" className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
          <ArrowLeft size={14} />
          Back to orders
        </Link>

        <div className="mt-8 pb-6">
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-4xl font-semibold text-foreground">Order #{order.orderNumber}</h1>
              <p className="mt-2 text-base text-muted-foreground">
                {typeLabel} · {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className=" bg-background px-4 py-2 text-sm font-medium text-foreground">
              {statusLabel}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="storefront-surface bg-card p-6">
              <OrderStatusTimeline status={order.status} orderType={order.orderType} />
            </div>
            <div className="storefront-surface bg-card p-6">
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
            <div className="storefront-surface bg-card p-6">
              {order.checkAllocation && <p className="mb-3 bg-steel p-3">Independent check {order.checkAllocation.ordinal} of {order.checkAllocation.guestCount} from service {order.checkAllocation.sourceOrderNumber}. Your allocated charge is shown in the total. Any food details below describe the original service and are not charged again in full.</p>}
              <OrderItemsList items={order.orderItems} />
            </div>
            <div className="storefront-surface bg-card p-6">
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

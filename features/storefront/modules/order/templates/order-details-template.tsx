import { OrderStatusTimeline, OrderType, OrderStatus } from "../components/order-status-timeline";
import { OrderItemsList } from "../components/order-items-list";
import { OrderSummary } from "../components/order-summary";
import { OrderDetailsCard } from "../components/order-details-card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

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

interface OrderDetailsTemplateProps {
  order: RestaurantOrder;
}

export default function OrderDetailsTemplate({ order }: OrderDetailsTemplateProps) {
  return (
    <div className="py-8">
      <div className="grid gap-6">
        <div className=" pb-6">
          <Link href="/account" className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
            <ArrowLeft className="size-4" />
            Back to account
          </Link>
          <h1 className="mt-6 font-serif text-4xl font-semibold text-foreground">Order #{order.orderNumber}</h1>
          <Link href={`/order/confirmed/${order.id}`} className="mt-2 inline-block text-sm text-primary hover:underline">
            View confirmation
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="storefront-surface bg-background p-6">
              <OrderStatusTimeline status={order.status} orderType={order.orderType} />
            </div>
            <div className="storefront-surface bg-background p-6">
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
            <div className="storefront-surface bg-background p-6">
              {order.checkAllocation && <p className="mb-3 bg-steel p-3">Independent check {order.checkAllocation.ordinal} of {order.checkAllocation.guestCount} from service {order.checkAllocation.sourceOrderNumber}. Your allocated charge is shown in the total. Any food details below describe the original service and are not charged again in full.</p>}
              <OrderItemsList items={order.orderItems} />
            </div>
            <div className="storefront-surface bg-background p-6">
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

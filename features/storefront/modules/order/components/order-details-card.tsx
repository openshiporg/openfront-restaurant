"use client";

interface OrderDetailsCardProps {
  orderNumber: string;
  orderType: "dine_in" | "takeout" | "delivery";
  createdAt: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryAddress2?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryCountryCode?: string;
  specialInstructions?: string;
}

function formatOrderType(type: string): string {
  switch (type) {
    case "dine_in":
      return "Dine-in";
    case "takeout":
      return "Takeout";
    case "delivery":
      return "Delivery";
    default:
      return type;
  }
}

export function OrderDetailsCard({
  orderNumber,
  orderType,
  createdAt,
  customerName,
  customerEmail,
  customerPhone,
  deliveryAddress,
  deliveryAddress2,
  deliveryCity,
  deliveryState,
  deliveryZip,
  deliveryCountryCode,
  specialInstructions,
}: OrderDetailsCardProps) {
  const formattedDate = new Date(createdAt).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Order details</p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <span className="text-muted-foreground">Order #</span>
        <span className="text-right font-medium text-foreground">{orderNumber}</span>

        <span className="text-muted-foreground">Type</span>
        <span className="text-right font-medium text-foreground">{formatOrderType(orderType)}</span>

        <span className="text-muted-foreground">Placed</span>
        <span className="text-right text-foreground">{formattedDate}</span>
      </div>

      {(customerName || customerEmail || customerPhone) ? (
        <div className=" pt-5">
          <p className="text-sm font-medium text-primary">Customer</p>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {customerName ? <p>{customerName}</p> : null}
            {customerEmail ? <p>{customerEmail}</p> : null}
            {customerPhone ? <p>{customerPhone}</p> : null}
          </div>
        </div>
      ) : null}

      {orderType === "delivery" && deliveryAddress ? (
        <div className=" pt-5">
          <p className="text-sm font-medium text-primary">Delivery address</p>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p>{deliveryAddress}</p>
            {deliveryAddress2 ? <p>{deliveryAddress2}</p> : null}
            <p>{[deliveryCity, deliveryState, deliveryZip, deliveryCountryCode].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      ) : null}

      {specialInstructions ? (
        <div className=" pt-5">
          <p className="text-sm font-medium text-primary">Special instructions</p>
          <p className="mt-3 text-sm text-muted-foreground">{specialInstructions}</p>
        </div>
      ) : null}
    </div>
  );
}

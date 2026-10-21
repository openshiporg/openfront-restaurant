"use client";

import { CheckAllocationNotice } from "@/features/platform/payments/components/CheckAllocationNotice";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock3,
  CreditCard,
  MapPin,
  Phone,
  User,
  UtensilsCrossed,
  CheckCircle2,
  Printer,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { formatCurrency } from "@/features/storefront/lib/currency";
import { updateOrderStatus } from "../actions";
import { toast } from "sonner";
import { StatusDot, statusConfig } from "../components/StatusDot";
import { cn } from "@/lib/utils";
import { getOrderPriceAdjustments } from "@/features/lib/restaurant-order-pricing";

interface OrderPageClientProps {
  order: any;
  currencyCode?: string;
  locale?: string;
}

const NEXT_STATUS: Record<string, string | null> = {
  open: "sent_to_kitchen",
  sent_to_kitchen: "in_progress",
  in_progress: "ready",
  ready: "served",
  dispatched: "served",
  served: "completed",
  completed: null,
  cancelled: null,
};

function prettyStatus(value: string) {
  return value.replace(/_/g, " ");
}

export function OrderPageClient({ order, currencyCode = "USD", locale = "en-US" }: OrderPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(order.status);

  const handleStatusChange = (newStatus: string) => {
    startTransition(async () => {
      const reason = order.orderType === "delivery" && (["dispatched", "served"].includes(newStatus) || currentStatus === "dispatched")
        ? window.prompt(newStatus === "dispatched" ? "Courier name / handoff reference" : newStatus === "ready" ? "Failed delivery / return-to-restaurant reference" : "Delivery confirmation reference / recipient acknowledgement")?.trim() : undefined;
      if (order.orderType === "delivery" && (["dispatched", "served"].includes(newStatus) || currentStatus === "dispatched") && !reason) return;
      const result = await updateOrderStatus(order.id, newStatus, reason);
      if (result.success) {
        setCurrentStatus(newStatus);
        toast.success(`Order updated to ${prettyStatus(newStatus)}`);
      } else {
        toast.error("Failed to update order status");
      }
    });
  };

  const statusOptions = Object.entries(statusConfig).map(([value, config]) => ({
    value,
    ...config,
  }));

  const activeStatus =
    statusConfig[currentStatus as keyof typeof statusConfig] || statusConfig.open;

  const suggestedNextStatus = currentStatus === "ready" && order.orderType === "delivery" ? "dispatched" : NEXT_STATUS[currentStatus] || null;

  const nextActionLabel = useMemo(() => {
    if (!suggestedNextStatus) return null;
    if (suggestedNextStatus === "sent_to_kitchen") return "Send to kitchen";
    if (suggestedNextStatus === "in_progress") return "Mark preparing";
    if (suggestedNextStatus === "ready") return "Mark ready";
    if (suggestedNextStatus === "dispatched") return "Mark dispatched";
    if (suggestedNextStatus === "served") {
      if (order.orderType === "takeout") return "Mark handed off";
      if (order.orderType === "delivery") return "Confirm delivered";
      return "Mark served";
    }
    if (suggestedNextStatus === "completed") return "Close order";
    return `Set ${prettyStatus(suggestedNextStatus)}`;
  }, [suggestedNextStatus, order.orderType]);

  const currencyConfig = { currencyCode, locale };
  const { deliveryFee, pickupDiscount, remainingDiscount } = getOrderPriceAdjustments({
    orderType: order.orderType,
    subtotal: order.subtotal,
    tax: order.tax,
    tip: order.tip,
    discount: order.discount,
    total: order.total,
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <CheckAllocationNotice orderId={order.id} />
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/dashboard/platform/orders"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft size={12} /> Back to orders
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight break-all sm:break-normal">
              Order #{order.orderNumber}
            </h1>
            <span className="text-[10px] uppercase tracking-wider border border-border rounded-full px-2 py-0.5 text-muted-foreground">
              {order.orderSource || "online"}
            </span>
            <span className="text-[10px] uppercase tracking-wider border border-border rounded-full px-2 py-0.5 text-muted-foreground">
              {order.orderType?.replace("_", " ") || "order"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 sm:h-8 px-3 text-xs"
            asChild
          >
            <Link href="/dashboard/platform/kds" className="inline-flex items-center gap-1.5">
              <UtensilsCrossed size={13} /> KDS
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 sm:h-8 sm:w-8"
            aria-label="Print order"
          >
            <Printer size={14} />
          </Button>
          <Select value={currentStatus} onValueChange={handleStatusChange} disabled={isPending}>
            <SelectTrigger className="h-9 sm:h-8 w-[calc(50%-0.25rem)] min-w-[150px] flex-1 sm:w-auto sm:flex-none sm:min-w-[155px] text-xs px-3 rounded-full [&>svg]:h-3 [&>svg]:w-3">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status={currentStatus as keyof typeof statusConfig} size="sm" />
                <span className="uppercase tracking-wider text-[11px] font-semibold truncate">{activeStatus.label}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <StatusDot status={opt.value as keyof typeof statusConfig} size="sm" />
                    <span className="text-sm">{opt.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suggestedNextStatus && nextActionLabel && (
            <Button
              size="sm"
              className="h-9 sm:h-8 px-3 text-xs flex-1 sm:flex-none whitespace-nowrap"
              onClick={() => handleStatusChange(suggestedNextStatus)}
              disabled={isPending}
            >
              <CheckCircle2 size={13} className="mr-1.5" />
              {nextActionLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="text-xl font-semibold mt-1">
            {formatCurrency(order.total, currencyConfig)}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Order Type</p>
          <p className="text-sm font-semibold mt-1 capitalize">
            {order.orderType?.replace("_", " ") || "—"}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Placed</p>
          <p className="text-sm font-semibold mt-1">
            {new Date(order.createdAt).toLocaleDateString()} {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Guests</p>
          <p className="text-sm font-semibold mt-1">
            {order.guestCount || 1} · {order.tables?.length ? order.tables.map((t: any) => `T${t.tableNumber}`).join(", ") : "No table"}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] divide-x h-full">
          {/* Left: Items + Payment */}
          <div className="overflow-auto">
            {/* Items */}
            <div className="border-b border-border">
              <div className="px-4 md:px-6 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-semibold">
                  Items ({order.orderItems?.length || 0})
                </p>
              </div>
              <div className="divide-y">
                {order.orderItems?.map((item: any) => (
                  <div key={item.id} className="px-4 md:px-6 py-3 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-sm font-semibold text-muted-foreground shrink-0 w-6 text-right">
                        {item.quantity}×
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.menuItem?.name || "—"}</p>
                        {item.specialInstructions && (
                          <p className="text-xs text-amber-600 mt-0.5">↳ {item.specialInstructions}</p>
                        )}
                        {item.courseNumber && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">Course {item.courseNumber}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">
                        {formatCurrency(item.price * item.quantity, currencyConfig)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatCurrency(item.price, currencyConfig)} ea
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Special instructions */}
            {order.specialInstructions && (
              <div className="px-4 md:px-6 py-4 border-b border-border bg-amber-50/40 dark:bg-amber-950/10">
                <p className="text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Kitchen Note</p>
                <p className="text-sm">{order.specialInstructions}</p>
              </div>
            )}

            {/* Payment summary */}
            <div>
              <div className="px-4 md:px-6 py-3 border-b border-border">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard size={14} className="text-muted-foreground" /> Payment Summary
                </p>
              </div>
              <div className="px-4 md:px-6 py-3 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(order.subtotal, currencyConfig)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatCurrency(order.tax, currencyConfig)}</span>
                </div>
                {order.tip > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tip</span>
                    <span>{formatCurrency(order.tip, currencyConfig)}</span>
                  </div>
                )}
                {pickupDiscount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Pickup Discount</span>
                    <span>−{formatCurrency(pickupDiscount, currencyConfig)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivery Fee</span>
                    <span>{formatCurrency(deliveryFee, currencyConfig)}</span>
                  </div>
                )}
                {remainingDiscount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span>−{formatCurrency(remainingDiscount, currencyConfig)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base pt-2 border-t border-border">
                  <span>Total</span>
                  <span>{formatCurrency(order.total, currencyConfig)}</span>
                </div>
              </div>

              {order.payments?.length > 0 && (
                <div className="px-4 md:px-6 pb-4 space-y-2">
                  {order.payments.map((payment: any) => (
                    <div key={payment.id} className="rounded-lg border border-border px-3 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">
                        {payment.paymentMethod} · {payment.status}
                      </span>
                      <span className="text-sm font-semibold">
                        {formatCurrency(payment.amount, currencyConfig)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Customer + Context */}
          <div className="overflow-auto">
            {/* Customer */}
            <div className="border-b border-border">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <User size={14} className="text-muted-foreground" /> Customer
                </p>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <p className="font-medium">{order.customerName || "Guest"}</p>
                {order.customerEmail && (
                  <p className="text-muted-foreground text-xs">{order.customerEmail}</p>
                )}
                {order.customerPhone && (
                  <p className="text-muted-foreground text-xs flex items-center gap-1">
                    <Phone size={11} /> {order.customerPhone}
                  </p>
                )}
              </div>
            </div>

            {/* Service context */}
            <div className="border-b border-border">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <UtensilsCrossed size={14} className="text-muted-foreground" /> Service
                </p>
              </div>
              <div className="divide-y">
                <div className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Server</span>
                  <span className="font-medium">{order.server?.name || order.createdBy?.name || "Unassigned"}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Guests</span>
                  <span className="font-medium">{order.guestCount || 1}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Tables</span>
                  <span className="font-medium">
                    {order.tables?.length ? order.tables.map((t: any) => `T${t.tableNumber}`).join(", ") : "None"}
                  </span>
                </div>
                {order.isUrgent && (
                  <div className="px-4 py-2.5 flex justify-between text-sm">
                    <span className="text-muted-foreground">Priority</span>
                    <span className="font-semibold text-orange-600">Urgent</span>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery address */}
            {order.orderType === "delivery" && (
              <div className="border-b border-border">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <MapPin size={14} className="text-muted-foreground" /> Delivery
                  </p>
                </div>
                <div className="px-4 py-3 text-sm">
                  <p>{order.deliveryAddress}</p>
                  {order.deliveryAddress2 ? <p>{order.deliveryAddress2}</p> : null}
                  <p className="text-muted-foreground mt-0.5">
                    {[order.deliveryCity, order.deliveryState, order.deliveryZip, order.deliveryCountryCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Courses */}
            {order.courses?.length > 0 && (
              <div>
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold">Courses</p>
                </div>
                <div className="divide-y">
                  {order.courses.map((course: any) => (
                    <div key={course.id} className="px-4 py-2.5 flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">
                        Course {course.courseNumber} · {course.courseType}
                      </span>
                      <span className={cn(
                        "text-[11px] font-semibold uppercase tracking-wider",
                        course.status === "served" ? "text-emerald-600" :
                        course.status === "ready" ? "text-blue-600" :
                        course.status === "fired" ? "text-amber-600" : "text-muted-foreground"
                      )}>
                        {course.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { ViewerTime } from '@/features/dashboard/components/ViewerTime';

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { MoreVertical, User, Utensils } from "lucide-react";
import { formatCurrency } from "@/features/storefront/lib/currency";
import { StatusDot, statusConfig } from "./StatusDot";
import { updateOrderStatus } from "../actions";
import { toast } from "sonner";

export function OrderDetailsComponent({
  order,
  currencyCode = "USD",
  locale = "en-US",
}: {
  order: any
  currencyCode?: string
  locale?: string
}) {
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(order.status);

  const activeStatus =
    statusConfig[currentStatus as keyof typeof statusConfig] || statusConfig.open;

  const statusOptions = Object.entries(statusConfig).map(([value, config]) => ({
    value,
    ...config,
  }));

  const handleStatusChange = (newStatus: string) => {
    startTransition(async () => {
      const result = await updateOrderStatus(order.id, newStatus);
      if (result.success) {
        setCurrentStatus(newStatus);
        toast.success(`Order updated to ${newStatus.replace("_", " ")}`);
      } else {
        toast.error("Failed to update order status");
      }
    });
  };

  const itemsPreview = (order.orderItems || [])
    .slice(0, 2)
    .map((i: any) => i.itemNameSnapshot || i.menuItem?.name)
    .filter(Boolean)
    .join(", ");
  const extraCount = Math.max(0, (order.orderItems?.length || 0) - 2);

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={order.id} className="border-0">
        <div className="px-4 md:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 hover:bg-muted/30 transition-colors">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/dashboard/platform/orders/${order.id}`}
                className="break-all font-semibold text-base tracking-tight hover:text-blue-600 transition-colors sm:text-lg"
              >
                #{order.orderNumber}
              </Link>

              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <ViewerTime value={order.createdAt} style="datetime" />
              </span>

              <Badge
                variant="secondary"
                className="text-xs py-0.5 px-2.5 tracking-wide font-semibold rounded-full uppercase"
              >
                {order.orderSource || "online"}
              </Badge>

              <Badge
                variant="outline"
                className="text-xs py-0.5 px-2.5 tracking-wide font-semibold rounded-full uppercase"
              >
                {order.orderType?.replace("_", " ")}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-foreground font-medium">
                <User size={14} className="text-muted-foreground" />
                <span className="truncate max-w-[240px]">
                  {order.customerName || order.customerEmail || "Guest"}
                </span>
              </div>

              {order.tables?.length > 0 && (
                <div className="flex items-center gap-1.5 text-foreground font-medium">
                  <Utensils size={14} className="text-muted-foreground" />
                  <span>
                    Table {order.tables.map((t: any) => t.tableNumber).join(", ")}
                  </span>
                </div>
              )}

              {(order.orderItems?.length || 0) > 0 && (
                <div className="text-muted-foreground truncate max-w-[360px]">
                  {itemsPreview}
                  {extraCount > 0 ? ` +${extraCount} more` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-row items-center justify-between gap-2 shrink-0 sm:flex-col sm:items-end">
            <div className="flex items-center gap-3">
              <span className="font-bold text-xl text-foreground">
                {formatCurrency(order.total, { currencyCode, locale })}
              </span>

              <Select
                value={currentStatus}
                onValueChange={handleStatusChange}
                disabled={isPending}
              >
                <SelectTrigger className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted border shadow-xs text-muted-foreground h-auto w-auto focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                  <StatusDot status={currentStatus as keyof typeof statusConfig} size="sm" />
                  <span className="uppercase tracking-wide">{activeStatus.label}</span>
                </SelectTrigger>
                <SelectContent align="end">
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="py-2">
                      <div className="flex items-center gap-2.5">
                        <StatusDot status={opt.value as keyof typeof statusConfig} size="sm" />
                        <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" className="border h-7 w-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/platform/orders/${order.id}`}>View Details</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/platform/orders/${order.id}/fulfill`}>Service Management</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AccordionTrigger className="border h-7 w-7 rounded-md bg-secondary hover:bg-secondary/80 p-0 flex items-center justify-center [&>svg]:h-3 [&>svg]:w-3" />
            </div>
          </div>
        </div>

        <AccordionContent className="bg-muted/20 border-t">
          <div className="p-4 md:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground mb-4">
                Items
              </h4>
              <div className="space-y-3">
                {order.orderItems?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div className="flex gap-3">
                      <span className="font-semibold text-muted-foreground">{item.quantity}x</span>
                      <span className="font-medium">{item.menuItem?.name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {formatCurrency(item.price * item.quantity, { currencyCode, locale })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:border-l md:pl-8">
              <h4 className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground mb-4">
                Service Info
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span className="capitalize font-medium">{order.orderSource || 'online'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Server</span>
                  <span className="font-medium">{order.server?.name || order.createdBy?.name || "Unassigned"}</span>
                </div>
                {order.orderType === 'delivery' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Address</span>
                    <div className="text-right max-w-[220px] font-medium">
                      <p className="truncate">{order.deliveryAddress}</p>
                      {order.deliveryAddress2 ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {order.deliveryAddress2}
                        </p>
                      ) : null}
                      {(order.deliveryCity || order.deliveryState || order.deliveryZip || order.deliveryCountryCode) && (
                        <p className="text-xs text-muted-foreground">
                          {[order.deliveryCity, order.deliveryState, order.deliveryZip, order.deliveryCountryCode]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

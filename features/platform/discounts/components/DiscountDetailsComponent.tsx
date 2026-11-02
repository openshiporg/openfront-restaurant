"use client";
import { ViewerTime } from '@/features/dashboard/components/ViewerTime';
import { formatInZone } from '@/features/dashboard/lib/storeTime';

import { useState } from "react";
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
import { MoreVertical, Tag, Edit, Trash, Users, Ticket, Calendar, BarChart, Percent, DollarSign } from "lucide-react";
import Link from "next/link";
import { EditItemDrawerClientWrapper } from "../../components/EditItemDrawerClientWrapper";
import { Discount } from "../actions";
import { cn } from "@/lib/utils";

interface DiscountDetailsComponentProps {
  discount: Discount;
  list: any;
}

export function DiscountDetailsComponent({ discount, list }: DiscountDetailsComponentProps) {
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  const isActive = !discount.isDisabled && (!discount.endsAt || new Date(discount.endsAt) > new Date());
  const statusColor = isActive ? "emerald" : discount.isDisabled ? "zinc" : "red";
  const statusText = isActive ? "ACTIVE" : discount.isDisabled ? "DISABLED" : "EXPIRED";

  const usagePercentage = discount.usageLimit ? (discount.usageCount || 0) / discount.usageLimit * 100 : 0;

  const isPercentage = discount.discountRule?.type === 'percentage';
  const isFixed = discount.discountRule?.type === 'fixed';

  return (
    <>
      <div className="px-6 py-3">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value={discount.id} className="border-2 rounded-2xl overflow-hidden bg-card hover:border-blue-500/50 transition-all shadow-sm">
            <div className="flex flex-col md:flex-row w-full min-h-[100px] relative">
              {/* Left Side: Ticket Style Badge */}
              <div className={cn(
                "w-full md:w-32 flex flex-col items-center justify-center p-4 text-white shrink-0 relative overflow-hidden",
                isActive ? "bg-gradient-to-br from-blue-600 to-indigo-700" : "bg-zinc-500"
              )}>
                {/* Decorative Circles for Ticket Look */}
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-background rounded-full hidden md:block" />
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-background rounded-full hidden md:block" />
                
                <div className="text-2xl font-black tracking-tighter">
                  {isPercentage ? (
                    <div className="flex items-center">
                      {discount.discountRule?.value}<Percent className="size-5 ml-0.5" />
                    </div>
                  ) : isFixed ? (
                    <div className="flex items-center">
                      <DollarSign className="size-5 mr-0.5" />{discount.discountRule?.value}
                    </div>
                  ) : (
                    <Ticket className="size-8" />
                  )}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
                  Discount
                </div>
              </div>

              {/* Main Info */}
              <div className="flex-1 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold tracking-tight font-mono truncate">
                      {discount.code}
                    </h3>
                    <Badge
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider",
                        isActive 
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                          : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                      )}
                      variant="outline"
                    >
                      {statusText}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {discount.discountRule?.description || "No description provided"}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <BarChart className="size-3.5" />
                      <span>{discount.usageCount || 0} Uses</span>
                      {discount.usageLimit && <span className="opacity-60">/ {discount.usageLimit} Max</span>}
                    </div>
                    {discount.endsAt && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Calendar className="size-3.5" />
                        <span>Exp: <ViewerTime value={discount.endsAt} style="date" /></span>
                      </div>
                    )}
                    {discount.orders && discount.orders.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Users className="size-3.5" />
                        <span>{discount.orders.length} Applied</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-muted">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl p-2">
                      <DropdownMenuItem onClick={() => setIsEditDrawerOpen(true)} className="rounded-lg gap-2 cursor-pointer">
                        <Edit className="size-4 text-blue-500" />
                        Edit Discount
                      </DropdownMenuItem>
                      <DropdownMenuItem className="rounded-lg gap-2 cursor-pointer text-destructive focus:text-destructive">
                        <Trash className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <AccordionTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 px-4 rounded-xl border-2 font-bold hover:bg-muted">
                      Details
                    </Button>
                  </AccordionTrigger>
                </div>
              </div>
            </div>

            <AccordionContent>
              <div className="p-6 pt-0 border-t-2 border-dashed bg-muted/30">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                  {/* Left: Configuration */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Configuration</h4>
                    <div className="space-y-3 bg-card p-4 rounded-2xl border shadow-sm">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-bold capitalize">{discount.discountRule?.type || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Allocation</span>
                        <span className="font-bold capitalize">{discount.discountRule?.allocation || 'Across Order'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Stackable</span>
                        <Badge variant={discount.stackable ? "default" : "outline"} className="h-5 text-[10px]">
                          {discount.stackable ? "YES" : "NO"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Usage Analytics */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Usage Tracking</h4>
                    <div className="space-y-4 bg-card p-4 rounded-2xl border shadow-sm">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground font-medium">Limit Reached</span>
                          <span className="font-bold">{Math.round(usagePercentage)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all",
                              usagePercentage > 90 ? "bg-rose-500" : "bg-blue-600"
                            )}
                            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between text-sm pt-2">
                        <span className="text-muted-foreground">Valid Duration</span>
                        <span className="font-bold">{discount.validDuration || 'Unlimited'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Timeline */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Timeline</h4>
                    <div className="space-y-3 bg-card p-4 rounded-2xl border shadow-sm">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Created</span>
                        <span className="font-medium text-xs"><ViewerTime value={discount.createdAt} style="datetime" /></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Last Used</span>
                        <span className="font-medium text-xs">{discount.orders?.[0] ? formatInZone(discount.orders[0].createdAt, undefined, "datetime") : 'Never'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Application History */}
                {discount.orders && discount.orders.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent Applications</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {discount.orders.slice(0, 6).map((order) => (
                        <Link 
                          href={`/dashboard/platform/orders/${order.id}`}
                          key={order.id} 
                          className="flex items-center justify-between p-3 bg-card border rounded-xl hover:bg-muted/50 transition-colors shadow-sm"
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">#{order.orderNumber}</span>
                            <span className="text-[10px] text-muted-foreground"><ViewerTime value={order.createdAt} style="date" /></span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-black">${order.total}</span>
                            <Badge variant="outline" className="h-4 text-[9px] px-1">{order.status}</Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <EditItemDrawerClientWrapper
        listKey="discounts"
        itemId={discount.id}
        open={isEditDrawerOpen}
        onClose={() => setIsEditDrawerOpen(false)}
      />
    </>
  );
}
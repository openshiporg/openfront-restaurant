"use client";

import React, { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ShoppingBag, CreditCard, History, Calendar, ExternalLink } from "lucide-react";
import Link from "next/link";
import { EditItemDrawerClientWrapper } from "../../components/EditItemDrawerClientWrapper";
import { GiftCard } from "../actions";
import { cn } from "@/lib/utils";

interface GiftCardDetailsComponentProps {
  giftcard: GiftCard;
  list: any;
  currencyCode?: string;
  locale?: string;
}

type TabType = 'transactions';

interface ItemPaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (newPage: number) => void;
}

function ItemPagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}: ItemPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  return (
    <div className="flex items-center gap-2 text-xs">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="h-7 px-2 rounded-lg"
      >
        Prev
      </Button>
      <span className="text-muted-foreground font-medium">
        {currentPage} / {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="h-7 px-2 rounded-lg"
      >
        Next
      </Button>
    </div>
  );
}

export function GiftCardDetailsComponent({
  giftcard,
  list,
  currencyCode = "USD",
  locale = "en-US",
}: GiftCardDetailsComponentProps) {
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [currentPages, setCurrentPages] = useState<Record<TabType, number>>({
    transactions: 1
  });
  const [editItemId, setEditItemId] = useState<string>('');
  const [editItemOpen, setEditItemOpen] = useState(false);
  const itemsPerPage = 6;

  const isActive = !giftcard.isDisabled && (!giftcard.endsAt || new Date(giftcard.endsAt) > new Date());
  const hasBeenUsed = giftcard.value !== giftcard.balance;
  const usagePercentage = giftcard.value > 0 ? ((giftcard.value - giftcard.balance) / giftcard.value) * 100 : 0;

  // Prepare data for tabs
  const transactionsData = giftcard.giftCardTransactions || [];

  const handlePageChange = (tabKey: TabType, newPage: number) => {
    setCurrentPages(prev => ({
      ...prev,
      [tabKey]: newPage
    }));
  };

  const formatCurrency = (amount: number) => {
    // Use provided locale and currency
    const NO_DIVISION_CURRENCIES = [
      "krw", "jpy", "vnd", "clp", "pyg", "xaf", "xof", "bif", "djf", "gnf", "kmf", "mga", "rwf", "xpf", "htg", "vuv", "xag", "xdr", "xau"
    ];
    const shouldDivideBy100 = !NO_DIVISION_CURRENCIES.includes(currencyCode.toLowerCase());
    const value = shouldDivideBy100 ? amount / 100 : amount;

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(value);
  };

  const handleEditItem = (itemId: string) => {
    setEditItemId(itemId);
    setEditItemOpen(true);
  };

  return (
    <>
      <div className="px-6 py-3">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value={giftcard.id} className="border-2 rounded-3xl overflow-hidden bg-card hover:border-emerald-500/30 transition-all shadow-md group">
            <div className="flex flex-col md:flex-row w-full min-h-[140px] relative">
              {/* Left Side: Physical Card Aesthetic */}
              <div className="p-6 shrink-0 flex items-center justify-center">
                <div className={cn(
                  "w-56 h-32 rounded-2xl p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden transition-transform group-hover:scale-105 duration-500",
                  isActive 
                    ? "bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-white border border-white/10" 
                    : "bg-zinc-300 text-zinc-600 border border-zinc-400"
                )}>
                  {/* Decorative Chip */}
                  <div className={cn(
                    "w-10 h-8 rounded-md mb-2 opacity-80",
                    isActive ? "bg-gradient-to-br from-amber-200 to-amber-500" : "bg-zinc-400"
                  )} />
                  
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Balance</div>
                    <div className="text-2xl font-black tracking-tighter">
                      {formatCurrency(giftcard.balance)}
                    </div>
                  </div>

                  <div className="flex items-end justify-between">
                    <div className="font-mono text-[10px] tracking-widest opacity-70">
                      {giftcard.code.match(/.{1,4}/g)?.join(' ') || giftcard.code}
                    </div>
                    <CreditCard className="size-5 opacity-40" />
                  </div>

                  {/* Glassmorphism Shine */}
                  <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[45deg] group-hover:left-[100%] transition-all duration-1000" />
                </div>
              </div>

              {/* Main Info */}
              <div className="flex-1 p-6 flex flex-col justify-center gap-4 border-l-2 border-dashed border-muted">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-black tracking-tight font-mono truncate">
                        {giftcard.code}
                      </h3>
                      <Badge
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-wider",
                          isActive 
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                            : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                        )}
                        variant="outline"
                      >
                        {isActive ? "ACTIVE" : giftcard.isDisabled ? "DISABLED" : "EXPIRED"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        <span>Issued: {new Date(giftcard.createdAt).toLocaleDateString()}</span>
                      </div>
                      {giftcard.endsAt && (
                        <div className="flex items-center gap-1.5">
                          <History className="size-3.5" />
                          <span>Exp: {new Date(giftcard.endsAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-left md:text-right shrink-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Value</div>
                    <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(giftcard.value)}
                    </div>
                  </div>
                </div>

                {/* Progress Tracking */}
                {hasBeenUsed && (
                  <div className="space-y-2 max-w-md">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                      <span className="text-muted-foreground">Depletion</span>
                      <span className="text-emerald-600">{usagePercentage.toFixed(0)}% Used</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-1000" 
                        style={{ width: `${usagePercentage}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Bottom Bar */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-4">
                    {giftcard.order && (
                      <Link 
                        href={`/dashboard/platform/orders/${giftcard.order.id}`}
                        className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-muted/80 transition-colors"
                      >
                        <ShoppingBag className="size-3" />
                        Order #{giftcard.order.orderNumber}
                        <ExternalLink className="size-2.5 opacity-50" />
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                          <MoreVertical className="size-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl p-2">
                        <DropdownMenuItem onClick={() => setIsEditDrawerOpen(true)} className="rounded-lg gap-2 cursor-pointer">
                          <History className="size-4 text-blue-500" />
                          View Full History
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsEditDrawerOpen(true)} className="rounded-lg gap-2 cursor-pointer">
                          <ExternalLink className="size-4 text-blue-500" />
                          Edit Gift Card
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <AccordionTrigger className="h-9 flex-none gap-2 rounded-xl border-2 px-4 py-0 text-[10px] font-black uppercase tracking-widest hover:bg-muted hover:no-underline [&>svg]:size-3.5">
                      Timeline
                    </AccordionTrigger>
                  </div>
                </div>
              </div>
            </div>

            <AccordionContent>
              <div className="p-8 pt-0 border-t-2 border-dashed bg-muted/30">
                <div className="flex items-center justify-between mb-6 pt-6">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <History className="size-4" />
                    Transaction History
                  </h4>
                  {transactionsData.length > itemsPerPage && (
                    <ItemPagination
                      currentPage={currentPages.transactions}
                      totalItems={transactionsData.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={(newPage) => handlePageChange('transactions', newPage)}
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {transactionsData.length > 0 ? (
                    transactionsData.slice(
                      (currentPages.transactions - 1) * itemsPerPage,
                      currentPages.transactions * itemsPerPage
                    ).map((transaction) => (
                      <div key={transaction.id} className="bg-card border-2 border-muted rounded-2xl p-4 shadow-sm hover:border-emerald-500/20 transition-all group/tx relative overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2 rounded-xl bg-muted group-hover/tx:bg-emerald-500/10 transition-colors">
                            <History className="size-4 text-muted-foreground group-hover/tx:text-emerald-600" />
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Used</div>
                            <div className="text-sm font-black text-rose-600">
                              -{formatCurrency(transaction.amount)}
                            </div>
                          </div>
                        </div>

                        {transaction.order && (
                          <div className="space-y-2 mt-4">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                              <span className="text-muted-foreground">Order</span>
                              <Link 
                                href={`/dashboard/platform/orders/${transaction.order.id}`}
                                className="text-blue-600 hover:underline"
                              >
                                #{transaction.order.orderNumber}
                              </Link>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                              <span className="text-muted-foreground">Date</span>
                              <span className="text-zinc-600 dark:text-zinc-400">
                                {new Date(transaction.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {/* Interactive Shine */}
                        <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent skew-x-[45deg] group-hover/tx:left-[100%] transition-all duration-1000" />
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-center bg-card border-2 border-dashed rounded-3xl">
                      <ShoppingBag className="size-12 text-muted-foreground opacity-20 mb-4" />
                      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">No Transactions Recorded</p>
                    </div>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <EditItemDrawerClientWrapper
        listKey="gift-cards"
        itemId={giftcard.id}
        open={isEditDrawerOpen}
        onClose={() => setIsEditDrawerOpen(false)}
      />

      {/* Edit Item Drawer */}
      {editItemId && (
        <EditItemDrawerClientWrapper
          listKey="gift-card-transactions"
          itemId={editItemId}
          open={editItemOpen}
          onClose={() => {
            setEditItemOpen(false);
            setEditItemId('');
          }}
        />
      )}
    </>
  );
}
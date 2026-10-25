"use client";

import Image from "next/image";
import { formatCurrency } from "@/features/storefront/lib/currency";

interface OrderItem {
  id: string;
  thumbnail?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
  menuItem: {
    id: string;
    name: string;
    price: number;
  };
  modifiers?: {
    id: string;
    name: string;
    priceAdjustment: number;
  }[];
}

interface OrderItemsListProps {
  items: OrderItem[];
  currencyCode?: string;
  locale?: string;
}

export function OrderItemsList({ items, currencyCode = "USD", locale = "en-US" }: OrderItemsListProps) {
  const currencyConfig = { currencyCode, locale };
  if (!items || items.length === 0) {
    return <div className="text-sm text-muted-foreground">No items in this order.</div>;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-primary">Order items</p>
      <div>
        {items.map((item) => (
          <div key={item.id} className="flex gap-4 py-4 first:pt-0 last:-0 last:pb-0">
            <div className="relative size-18 shrink-0 overflow-hidden bg-muted">
              {item.thumbnail ? (
                <Image src={item.thumbnail} alt={item.menuItem.name} fill className="object-cover" sizes="72px" />
              ) : (
                <div className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                  {item.menuItem.name}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{item.menuItem.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Quantity {item.quantity}</p>
                </div>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(item.totalPrice, currencyConfig)}
                </p>
              </div>

              {item.modifiers?.length ? (
                <div className="mt-2 space-y-1">
                  {item.modifiers.map((mod) => (
                    <p key={mod.id} className="text-sm text-muted-foreground">
                      + {mod.name} {mod.priceAdjustment > 0 ? `(${formatCurrency(mod.priceAdjustment, currencyConfig)})` : ""}
                    </p>
                  ))}
                </div>
              ) : null}

              {item.specialInstructions ? (
                <p className="mt-2 text-sm italic text-muted-foreground">Note: {item.specialInstructions}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

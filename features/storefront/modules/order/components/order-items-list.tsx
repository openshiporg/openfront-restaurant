"use client";

import Image from "next/image";
import { formatCurrency } from "@/features/storefront/lib/currency";

interface OrderItem {
  id: string;
  thumbnail?: string | null;
  itemNameSnapshot?: string | null;
  itemThumbnailSnapshot?: string | null;
  modifiersSnapshot?: { id: string; name: string; priceAdjustment: number }[] | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
  menuItem?: {
    id: string;
    name: string;
    price: number;
    thumbnail?: string | null;
  } | null;
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
      <p className="ord-label text-sm font-medium text-primary">Order items</p>
      <div>
        {items.map((item) => {
          // Paid orders keep what was bought as a snapshot; the live menu item may be gone or changed.
          const name = item.itemNameSnapshot || item.menuItem?.name || "Item";
          const thumbnail = item.itemThumbnailSnapshot || item.thumbnail || item.menuItem?.thumbnail || null;
          const cutout = !!thumbnail && thumbnail.startsWith("/images/dishes/");
          const modifiers = item.modifiers?.length ? item.modifiers : Array.isArray(item.modifiersSnapshot) ? item.modifiersSnapshot : [];
          return (
          <div key={item.id} className="flex gap-4 py-4 first:pt-0 last:-0 last:pb-0">
            <div className={`relative size-18 shrink-0 overflow-hidden rounded-xl ${cutout ? "" : "bg-muted"}`}>
              {thumbnail ? (
                <Image src={thumbnail} alt={name} fill className={cutout ? "object-contain" : "object-cover"} sizes="72px" />
              ) : (
                <div className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                  {name}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Quantity {item.quantity}</p>
                </div>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(item.totalPrice, currencyConfig)}
                </p>
              </div>

              {modifiers.length ? (
                <div className="mt-2 space-y-1">
                  {modifiers.map((mod) => (
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
          );
        })}
      </div>
    </div>
  );
}

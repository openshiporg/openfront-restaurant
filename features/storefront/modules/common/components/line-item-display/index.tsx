"use client";

import Image from "next/image";
import { Minus, Plus, X } from "lucide-react";
import { formatCurrency } from "@/features/storefront/lib/currency";
import { cn } from "@/lib/utils";

type Modifier = {
  id: string;
  name: string;
  priceAdjustment?: number;
};

type MenuItem = {
  id: string;
  name: string;
  price?: number;
  thumbnail?: string | null;
};

type LineItem = {
  id: string;
  quantity: number;
  thumbnail?: string | null;
  specialInstructions?: string;
  menuItem: MenuItem;
  modifiers?: Modifier[];
};

interface LineItemDisplayProps {
  item: LineItem;
  currencyCode: string;
  locale: string;
  editable?: boolean;
  onRemove?: (lineItemId: string) => void;
  onIncrease?: (lineItemId: string, quantity: number) => void;
  onDecrease?: (lineItemId: string, quantity: number) => void;
  isUpdating?: boolean;
  className?: string;
}

export default function LineItemDisplay({
  item,
  currencyCode,
  locale,
  editable = false,
  onRemove,
  onIncrease,
  onDecrease,
  isUpdating = false,
  className,
}: LineItemDisplayProps) {
  const modifiers = item.modifiers || [];
  const modifiersTotal = modifiers.reduce(
    (sum, modifier) => sum + (modifier.priceAdjustment || 0),
    0
  );
  const lineTotal = ((Number(item.menuItem?.price) || 0) + modifiersTotal) * item.quantity;
  const currencyConfig = { currencyCode, locale };
  const thumbnail = item.menuItem?.thumbnail || item.thumbnail || null;

  return (
    <div className={cn("flex gap-4 py-4", className)}>
      {thumbnail ? (
      <div className="relative size-16 shrink-0 overflow-hidden bg-steel">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={item.menuItem?.name || "Item"}
            fill
            className="object-cover"
            sizes="72px"
          />
        ) : null}
      </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-serif text-xl font-extrabold leading-tight text-ink">
              <span className="text-ink-soft">{item.quantity} ×</span> {item.menuItem?.name}
            </h4>
          </div>

          <div className="flex items-start gap-3">
            <span className="whitespace-nowrap pt-0.5 text-base font-semibold tabular-nums text-ink">
              {formatCurrency(lineTotal, currencyConfig)}
            </span>
            {editable && onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                disabled={isUpdating}
                className="-m-2 p-2 text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
                aria-label={`Remove ${item.menuItem?.name}`}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {modifiers.length > 0 ? (
          <div className="mt-1.5 space-y-0.5">
            {modifiers.map((modifier) => (
              <p key={modifier.id} className="text-[0.95rem] text-ink-soft">
                + {modifier.name}
                {(modifier.priceAdjustment || 0) > 0
                  ? ` (${formatCurrency(modifier.priceAdjustment || 0, currencyConfig)})`
                  : ""}
              </p>
            ))}
          </div>
        ) : null}

        {item.specialInstructions ? (
          <p className="mt-1.5 text-[0.95rem] text-ink-soft">Note: {item.specialInstructions}</p>
        ) : null}

        {editable && onIncrease && onDecrease ? (
          <div className="mt-3">
            <div className="inline-flex items-center bg-steel">
              <button
                type="button"
                className="flex size-10 items-center justify-center text-ink transition-colors hover:bg-steel-shade disabled:opacity-40"
                onClick={() => onDecrease(item.id, item.quantity - 1)}
                disabled={isUpdating || item.quantity <= 1}
                aria-label={`Decrease quantity of ${item.menuItem?.name}`}
              >
                <Minus className="size-4" />
              </button>
              <span className="w-10 text-center text-base font-semibold tabular-nums text-ink">
                {item.quantity}
              </span>
              <button
                type="button"
                className="flex size-10 items-center justify-center text-ink transition-colors hover:bg-steel-shade disabled:opacity-40"
                onClick={() => onIncrease(item.id, item.quantity + 1)}
                disabled={isUpdating}
                aria-label={`Increase quantity of ${item.menuItem?.name}`}
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

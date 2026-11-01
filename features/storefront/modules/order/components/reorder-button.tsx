"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorderPastOrder } from "@/features/storefront/lib/data/reorder";

export function ReorderButton({ orderId, className }: { orderId: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        className={className || "pass-action w-full sm:w-auto"}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await reorderPastOrder(orderId);
            if (!result.success) return setMessage(result.message);
            if (result.skipped > 0) setMessage(`${result.skipped} item${result.skipped === 1 ? " is" : "s are"} no longer available.`);
            router.push("/checkout?step=contact");
          });
        }}
      >
        {pending ? "Adding to your order…" : "Order again"}
      </button>
      {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
    </div>
  );
}

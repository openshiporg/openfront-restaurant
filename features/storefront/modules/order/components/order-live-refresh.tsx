"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const FINISHED = new Set(["served", "completed", "cancelled"]);

/** Re-reads the order while the kitchen is still working on it. */
export function OrderLiveRefresh({ status, intervalMs = 15000 }: { status: string; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (FINISHED.has(status)) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [status, intervalMs, router]);
  return null;
}

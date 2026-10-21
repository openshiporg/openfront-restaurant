import React from "react";
import { cn } from "@/lib/utils";

export const statusConfig = {
  open: { 
    label: "Open", 
    dotClass: "bg-blue-500 dark:bg-blue-400 outline-3 -outline-offset-1 outline-blue-100 dark:outline-blue-900/50",
    color: "blue" 
  },
  sent_to_kitchen: { 
    label: "Sent", 
    dotClass: "bg-orange-500 dark:bg-orange-400 outline-3 -outline-offset-1 outline-orange-100 dark:outline-orange-900/50",
    color: "orange" 
  },
  in_progress: { 
    label: "Preparing", 
    dotClass: "bg-yellow-500 dark:bg-yellow-400 outline-3 -outline-offset-1 outline-yellow-100 dark:outline-yellow-900/50",
    color: "yellow" 
  },
  ready: { 
    label: "Ready", 
    dotClass: "bg-emerald-500 dark:bg-emerald-400 outline-3 -outline-offset-1 outline-emerald-100 dark:outline-emerald-900/50",
    color: "emerald" 
  },
  dispatched: { label: "Dispatched", dotClass: "bg-indigo-500 outline-3 -outline-offset-1 outline-indigo-100", color: "indigo" },
  served: { 
    label: "Served", 
    dotClass: "bg-purple-500 dark:bg-purple-400 outline-3 -outline-offset-1 outline-purple-100 dark:outline-purple-900/50",
    color: "purple" 
  },
  completed: { 
    label: "Completed", 
    dotClass: "bg-zinc-500 dark:bg-zinc-400 outline-3 -outline-offset-1 outline-zinc-100 dark:outline-zinc-900/50",
    color: "zinc" 
  },
  cancelled: { 
    label: "Cancelled", 
    dotClass: "bg-rose-500 dark:bg-rose-400 outline-3 -outline-offset-1 outline-rose-100 dark:outline-rose-900/50",
    color: "rose" 
  },
} as const;

export const StatusDot = ({ status, size = "md" }: { status: keyof typeof statusConfig, size?: "sm" | "md" | "lg" }) => {
  const config = statusConfig[status];
  
  let sizeClass = "size-2";
  if (size === "sm") {
    sizeClass = "size-1.5";
  } else if (size === "lg") {
    sizeClass = "size-2.5";
  }

  return (
    <span className={cn(
      "inline-block shrink-0 rounded-full outline",
      sizeClass,
      config.dotClass
    )} />
  );
};

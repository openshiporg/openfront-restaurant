"use client";

export type OrderStatus =
  | "open"
  | "sent_to_kitchen"
  | "in_progress"
  | "ready"
  | "dispatched"
  | "served"
  | "completed"
  | "cancelled";

export type OrderType = "dine_in" | "takeout" | "delivery";

interface StatusStep {
  status: OrderStatus;
  label: string;
}

const PICKUP_STEPS: StatusStep[] = [
  { status: "open", label: "Received" },
  { status: "sent_to_kitchen", label: "Kitchen" },
  { status: "in_progress", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "served", label: "Picked up" },
  { status: "completed", label: "Closed" },
];

const DELIVERY_STEPS: StatusStep[] = [
  { status: "open", label: "Received" },
  { status: "sent_to_kitchen", label: "Kitchen" },
  { status: "in_progress", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "dispatched", label: "On the way" },
  { status: "served", label: "Delivered" },
  { status: "completed", label: "Closed" },
];

const DINE_IN_STEPS: StatusStep[] = [
  { status: "open", label: "Received" },
  { status: "sent_to_kitchen", label: "Kitchen" },
  { status: "in_progress", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "served", label: "Served" },
  { status: "completed", label: "Completed" },
];

function getStepsForOrderType(orderType: OrderType): StatusStep[] {
  switch (orderType) {
    case "delivery":
      return DELIVERY_STEPS;
    case "takeout":
      return PICKUP_STEPS;
    case "dine_in":
    default:
      return DINE_IN_STEPS;
  }
}

function getStepIndex(steps: StatusStep[], status: OrderStatus): number {
  const index = steps.findIndex((s) => s.status === status);
  return index === -1 ? 0 : index;
}

interface OrderStatusTimelineProps {
  status: OrderStatus;
  orderType: OrderType;
}

export function OrderStatusTimeline({ status, orderType }: OrderStatusTimelineProps) {
  const steps = getStepsForOrderType(orderType);
  const currentIndex = getStepIndex(steps, status);
  const isCancelled = status === "cancelled";

  if (isCancelled) {
    return (
      <div>
        <p className="ord-label text-sm font-medium text-primary">Status</p>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm font-medium text-destructive">
          Order cancelled
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="ord-label text-sm font-medium text-primary">Status</p>
      {/* One segmented bar at every width; on the phone only the current step is named. */}
      <div className="mt-4 flex gap-1.5" aria-hidden="true">
        {steps.map((step, index) => (
          <div key={step.status} className={`h-1.5 flex-1 rounded-full ${index <= currentIndex ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <p className="ord-now mt-3 text-[0.95rem] font-medium text-foreground sm:hidden">
        {steps[currentIndex]?.label}
        <span className="font-normal text-muted-foreground"> · step {currentIndex + 1} of {steps.length}</span>
      </p>
      <ol className="ord-all mt-3 hidden gap-1.5 sm:flex">
        {steps.map((step, index) => (
          <li
            key={step.status}
            aria-current={index === currentIndex ? "step" : undefined}
            className={`flex-1 text-sm ${index === currentIndex ? "font-medium text-foreground" : index < currentIndex ? "text-foreground" : "text-muted-foreground"}`}
          >
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

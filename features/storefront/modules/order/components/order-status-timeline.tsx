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
        <p className="text-sm font-medium text-primary">Status</p>
        <div className="mt-4 border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          Order cancelled
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-primary">Status</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-none xl:grid-flow-col xl:auto-cols-fr">
        {steps.map((step, index) => {
          const isCompleted = index <= currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={step.status} className="space-y-3">
              <div className={`h-1.5 w-full ${isCompleted ? "bg-primary" : "bg-muted"}`} />
              <div>
                <p className={`text-sm ${isCurrent ? "font-medium text-foreground" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

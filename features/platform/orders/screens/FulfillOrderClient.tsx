"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChefHat, Utensils, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { updateOrderStatus } from "../actions";

interface FulfillOrderClientProps {
  order: any;
}

const NEXT_STATUS: Record<string, string | null> = {
  open: "sent_to_kitchen",
  sent_to_kitchen: "in_progress",
  in_progress: "ready",
  ready: "served",
  dispatched: "served",
  served: "completed",
  completed: null,
  cancelled: null,
};

const NEXT_LABEL: Record<string, string> = {
  sent_to_kitchen: "Send order to kitchen",
  in_progress: "Mark as preparing",
  ready: "Mark as ready",
  dispatched: "Mark dispatched",
  served: "Mark as served",
  completed: "Close order",
};

export function FulfillOrderClient({ order }: FulfillOrderClientProps) {
  const nextStatus = order.status === "ready" && order.orderType === "delivery" ? "dispatched" : NEXT_STATUS[order.status] || null;

  const handleAdvanceOrder = async () => {
    if (!nextStatus) {
      toast.error("This order cannot advance any further from here.");
      return;
    }

    const reason = order.orderType === "delivery" && ["dispatched", "served"].includes(nextStatus)
      ? window.prompt(nextStatus === "dispatched" ? "Courier name / handoff reference" : "Delivery confirmation reference / recipient acknowledgement")?.trim() : undefined;
    if (order.orderType === "delivery" && ["dispatched", "served"].includes(nextStatus) && !reason) return;
    const result = await updateOrderStatus(order.id, nextStatus, reason);
    if (result.success) {
      toast.success(`Order updated to ${nextStatus.replace(/_/g, " ")}`);
    } else {
      toast.error("Failed to update order status");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Service Management</h1>
          <p className="text-muted-foreground">
            This screen currently supports whole-order status progression, not item-level kitchen firing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={!nextStatus}
            onClick={handleAdvanceOrder}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <ChefHat className="h-4 w-4 mr-2" />
            {nextStatus === "served" && order.orderType === "delivery" ? "Confirm delivered" : nextStatus ? NEXT_LABEL[nextStatus] || "Advance order" : "No next action"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Order Items
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {order.orderItems?.map((item: any) => (
              <div key={item.id} className="p-4 flex items-center gap-4 transition-colors hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{item.quantity}x</span>
                    <span className="font-medium">{item.menuItem?.name}</span>
                  </div>
                  {item.specialInstructions && (
                    <p className="text-sm text-muted-foreground italic ml-7">
                      "{item.specialInstructions}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Card className="border-emerald-100 bg-emerald-50/20">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Service Status
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-emerald-900 space-y-2">
            <div>
              Current order status:
              <Badge className="bg-emerald-600 ml-1">{order.status?.replace(/_/g, " ")}</Badge>
            </div>
            <p className="opacity-80">
              This workflow advances the full order through service stages. Item-level kitchen controls are not implemented on this screen yet.
            </p>
            {nextStatus ? (
              <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
                <ArrowRight className="h-3 w-3" />
                Next: {nextStatus.replace(/_/g, " ")}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-blue-50/20">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase flex items-center gap-2 text-blue-800">
              <Utensils className="h-4 w-4" />
              Dining Info
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-900">
            Table: {order.tables?.map((t: any) => t.tableNumber).join(", ") || "N/A"}
            <br />
            Server: {order.server?.name || "Unassigned"}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

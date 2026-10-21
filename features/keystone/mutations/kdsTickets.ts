import type { Context } from ".keystone/types";
import { permissions } from "../access";
import {
  isExpediterStation,
  reconcileRestaurantOrderStatus,
  syncKitchenTicketsForActiveOrders,
} from "../utils/kitchenTicketSync";
import { appendKitchenTicketEventWithClient } from "../utils/kitchenTicketEvents";

type TicketItem = {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  station: string;
  status: "new" | "in_progress" | "fulfilled" | "cancelled";
  fulfilledAt?: string | null;
};

interface MutationResult {
  success: boolean;
  error: string | null;
}

interface SyncResult extends MutationResult {
  created: number;
  updated: number;
}

export async function syncKitchenTickets(_root: unknown, _args: unknown, context: Context): Promise<SyncResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized", created: 0, updated: 0 };
  }
  try {
    const result = await syncKitchenTicketsForActiveOrders(context);
    return { success: true, error: null, created: result.created, updated: result.updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error", created: 0, updated: 0 };
  }
}

export async function updateKitchenTicketStatus(
  _root: unknown,
  args: { ticketId: string; status: "new" | "in_progress" | "ready" | "served" | "cancelled" },
  context: Context
): Promise<MutationResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }

  try {
    const prisma = context.prisma as any;
    const actorId = context.session?.itemId;
    const result = await prisma.$transaction(async (tx: any) => {
      const ticket = await tx.kitchenTicket.findUnique({
        where: { id: args.ticketId },
        include: {
          order: { select: { id: true, status: true, onHold: true } },
          station: { select: { name: true } },
          orderItems: { select: { id: true } },
        },
      });
      if (!ticket) throw new Error("Ticket not found");
      if (ticket.status === args.status) return { orderId: ticket.orderId, replay: true };
      if (!ticket.order || ["completed", "cancelled", "dispatched", "served"].includes(ticket.order.status)) throw new Error("This order is no longer active in the kitchen");
      if (ticket.order.onHold) throw new Error("Release the order hold before preparing work");
      const transitions: Record<string, string[]> = { new: ["in_progress", "ready", "cancelled"], in_progress: ["ready", "cancelled"], ready: ["in_progress", "served", "cancelled"], served: [], cancelled: [] };
      if (!(transitions[ticket.status] || []).includes(args.status)) throw new Error("Invalid kitchen ticket transition");

      if (args.status === "served" && isExpediterStation(ticket.station?.name) && ticket.orderId) {
        const siblings = await tx.kitchenTicket.findMany({
          where: { orderId: ticket.orderId, status: { in: ["new", "in_progress"] }, id: { not: ticket.id } },
          include: { station: { select: { name: true } } },
        });
        const blockingPrep = siblings.filter((candidate: any) => !isExpediterStation(candidate.station?.name));
        if (blockingPrep.length) {
          const stations = blockingPrep.map((candidate: any) => candidate.station?.name).filter(Boolean).join(", ");
          throw new Error(stations ? `Prep stations still working: ${stations}` : "Prep tickets must be completed before expediter can bump served");
        }
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const terminalItems = ((ticket.items as TicketItem[] | null) || []).map((item) =>
        args.status === "served" && item.status !== "cancelled"
          ? { ...item, status: "fulfilled" as const, fulfilledAt: item.fulfilledAt || nowIso }
          : args.status === "cancelled"
            ? { ...item, status: "cancelled" as const }
            : item
      );
      await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: {
          status: args.status,
          items: ["served", "cancelled"].includes(args.status) ? terminalItems : undefined,
          completedAt: args.status === "ready" ? now : args.status === "in_progress" ? null : undefined,
          servedAt: args.status === "served" ? now : undefined,
          recalledAt: args.status === "in_progress" && ticket.status === "ready" ? now : undefined,
        },
      });
      const itemState = args.status === "served"
        ? "fulfilled"
        : args.status === "ready"
          ? "ready"
          : args.status === "cancelled"
            ? "voided"
            : args.status;
      await tx.orderItem.updateMany({
        where: { id: { in: ticket.orderItems.map((item: any) => item.id) }, isVoided: false,
          ...(!["served", "cancelled"].includes(args.status) ? { fulfilledAt: null } : {}) },
        data: {
          kitchenStatus: itemState,
          kitchenStartedAt: args.status === "in_progress" ? now : undefined,
          kitchenReadyAt: args.status === "ready" ? now : undefined,
          fulfilledAt: args.status === "served" ? now : undefined,
          recalledAt: args.status === "in_progress" && ticket.status === "ready" ? now : undefined,
        },
      });
      await appendKitchenTicketEventWithClient(tx, actorId, {
        eventType: args.status === "cancelled" ? "cancel" : args.status === "in_progress" && ticket.status === "ready" ? "recall" : "status",
        ticketId: ticket.id,
        orderId: ticket.orderId,
        payload: { from: ticket.status, to: args.status, orderItemIds: ticket.orderItems.map((item: any) => item.id) },
      });
      return { orderId: ticket.orderId, replay: false };
    }, { isolationLevel: "Serializable" });

    if (result.orderId) await reconcileRestaurantOrderStatus(result.orderId, context);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function fulfillKitchenTicketItem(
  _root: unknown,
  args: { ticketId: string; itemId: string; fulfilled: boolean },
  context: Context
): Promise<MutationResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }

  try {
    const prisma = context.prisma as any;
    const actorId = context.session?.itemId;
    const result = await prisma.$transaction(async (tx: any) => {
      const ticket = await tx.kitchenTicket.findUnique({
        where: { id: args.ticketId },
        include: { orderItems: { select: { id: true, isVoided: true } }, order: { select: { status: true, onHold: true } } },
      });
      if (!ticket) throw new Error("Ticket not found");
      if (!ticket.order || ["completed", "cancelled", "dispatched", "served"].includes(ticket.order.status) || ["served", "cancelled"].includes(ticket.status)) throw new Error("Terminal kitchen work cannot be changed");
      if (ticket.order.onHold) throw new Error("Release the order hold before preparing work");
      const currentItems = (ticket.items as TicketItem[] | null) || [];
      const selectedItem = currentItems.find((item) => item.id === args.itemId);
      const normalizedItem = ticket.orderItems.find((item: any) => item.id === args.itemId);
      if (!selectedItem || !normalizedItem) throw new Error("Ticket item not found");
      if (selectedItem.status === "cancelled" || normalizedItem.isVoided) throw new Error("Cancelled kitchen items cannot be fulfilled");
      const now = new Date();
      const nowIso = now.toISOString();
      const items = currentItems.map((item) => item.id === args.itemId
        ? { ...item, status: args.fulfilled ? "fulfilled" as const : "in_progress" as const, fulfilledAt: args.fulfilled ? nowIso : null }
        : item
      );
      const activeItems = items.filter(item => item.status !== "cancelled");
      const allFulfilled = activeItems.length > 0 && activeItems.every((item) => item.status === "fulfilled");

      await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: { items, status: allFulfilled ? "ready" : "in_progress", completedAt: allFulfilled ? now : null },
      });
      if (normalizedItem) {
        await tx.orderItem.update({
          where: { id: normalizedItem.id },
          data: {
            kitchenStatus: args.fulfilled ? "fulfilled" : "in_progress",
            fulfilledAt: args.fulfilled ? now : null,
            kitchenStartedAt: args.fulfilled ? undefined : now,
          },
        });
      }
      await appendKitchenTicketEventWithClient(tx, actorId, {
        eventType: "item_status",
        ticketId: ticket.id,
        orderId: ticket.orderId,
        orderItemId: args.itemId,
        payload: { fulfilled: args.fulfilled, at: nowIso },
      });
      return { orderId: ticket.orderId };
    }, { isolationLevel: "Serializable" });

    if (result.orderId) await reconcileRestaurantOrderStatus(result.orderId, context);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

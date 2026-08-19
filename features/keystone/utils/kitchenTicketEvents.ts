import crypto from "node:crypto";
import type { Context } from ".keystone/types";

export type KitchenTicketEventInput = {
  eventType: "dispatch" | "delta" | "status" | "item_status" | "recall" | "cancel";
  ticketId?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  payload: unknown;
  eventKey?: string;
};

export async function appendKitchenTicketEventWithClient(
  prisma: any,
  actorId: string | null | undefined,
  input: KitchenTicketEventInput
) {
  const eventKey = input.eventKey || crypto.randomUUID();
  return prisma.kitchenTicketEvent.upsert({
    where: { eventKey },
    update: {},
    create: {
      eventKey,
      eventType: input.eventType,
      payload: input.payload,
      ticketId: input.ticketId || null,
      orderId: input.orderId || null,
      orderItemId: input.orderItemId || null,
      actorId: actorId || null,
    },
  });
}

export async function appendKitchenTicketEvent(context: Context, input: KitchenTicketEventInput) {
  return appendKitchenTicketEventWithClient(context.prisma as any, context.session?.itemId, input);
}

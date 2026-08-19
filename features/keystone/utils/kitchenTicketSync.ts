import crypto from "crypto";
import type { Context } from ".keystone/types";
import { appendKitchenTicketEventWithClient } from "./kitchenTicketEvents";

export type TicketItem = {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  station: string;
  status: "new" | "in_progress" | "fulfilled" | "cancelled";
  fulfilledAt?: string | null;
  /** Stable kitchen-work fingerprint; unlike updatedAt it ignores KDS status writes. */
  workSignature?: string | null;
  /** Legacy payload field retained for already-dispatched tickets. */
  sourceVersion?: string | null;
};

type TicketProjection = {
  status?: string | null;
  items?: TicketItem[] | null;
};

const ACTIVE_ORDER_STATUSES = ["sent_to_kitchen", "in_progress", "ready"] as const;
const ACTIVE_TICKET_STATUSES = ["new", "in_progress", "ready"] as const;

async function mutateKitchenState(
  context: Context,
  operation: (tx: any, actorId: string | null) => Promise<void>
) {
  await (context.prisma as any).$transaction(
    (tx: any) => operation(tx, context.session?.itemId || null),
    { isolationLevel: "Serializable" }
  );
}

function normalizeStationName(name: string) {
  return name.trim().toLowerCase();
}

function displayStationName(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isExpediterStation(stationName?: string | null) {
  const n = (stationName || "").toLowerCase();
  return n.includes("expo") || n.includes("expediter");
}

export function isKitchenActiveOrderStatus(status?: string | null) {
  return ACTIVE_ORDER_STATUSES.includes((status || "") as (typeof ACTIVE_ORDER_STATUSES)[number]);
}

function getTicketStatusForOrderStatus(orderStatus?: string | null) {
  if (orderStatus === "ready") return "ready";
  if (orderStatus === "in_progress") return "in_progress";
  return "new";
}

async function getOrCreateStation(
  stationKey: string,
  context: Context,
  cachedStations: Array<{ id: string; name: string; displayOrder?: number | null }>
) {
  const normalized = normalizeStationName(stationKey);
  const existing = cachedStations.find((s) => normalizeStationName(s.name) === normalized);
  if (existing) return existing;

  const created = await context.sudo().db.KitchenStation.createOne({
    data: {
      name: displayStationName(stationKey),
      isActive: true,
      displayOrder: cachedStations.length,
    },
  });

  const createdStation = {
    id: created.id,
    name: displayStationName(stationKey),
    displayOrder: cachedStations.length,
  };

  cachedStations.push(createdStation);
  return createdStation;
}

function normalizeKitchenWork(item: {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  station: string;
  modifiersSnapshot?: unknown;
}) {
  return {
    id: item.id,
    name: item.name,
    quantity: Number(item.quantity || 1),
    notes: item.notes || null,
    station: normalizeStationName(item.station || "expo"),
    modifiersSnapshot: item.modifiersSnapshot ?? null,
  };
}

export function createKitchenWorkSignature(item: Parameters<typeof normalizeKitchenWork>[0]) {
  return crypto.createHash("sha256").update(JSON.stringify(normalizeKitchenWork(item))).digest("hex");
}

function isSameKitchenWork(historical: TicketItem, desired: TicketItem) {
  if (historical.workSignature && desired.workSignature) {
    return historical.workSignature === desired.workSignature;
  }

  // Tickets dispatched before workSignature existed still suppress unchanged
  // work using the immutable facts present in their JSON payload.
  return (
    historical.id === desired.id &&
    historical.name === desired.name &&
    Number(historical.quantity || 1) === Number(desired.quantity || 1) &&
    (historical.notes || null) === (desired.notes || null) &&
    normalizeStationName(historical.station || "expo") === normalizeStationName(desired.station || "expo")
  );
}

export function getUncoveredKitchenWorkItems(
  desiredItems: TicketItem[],
  stationTickets: TicketProjection[]
) {
  const handledItems = stationTickets
    .filter((ticket) => ["served", "completed"].includes(ticket.status || ""))
    .flatMap((ticket) => ticket.items || []);
  const activeItems = stationTickets
    .filter((ticket) => (ACTIVE_TICKET_STATUSES as readonly string[]).includes(ticket.status || ""))
    .flatMap((ticket) => ticket.items || []);
  const cancelledItems = stationTickets
    .filter((ticket) => ticket.status === "cancelled")
    .flatMap((ticket) => ticket.items || []);

  return desiredItems.filter((desired) => {
    // Served/completed work always wins over a stale active replacement.
    if (handledItems.some((historical) => isSameKitchenWork(historical, desired))) return false;
    // A canonical active projection must survive the cancellation of a
    // duplicate ticket that happened to contain the same work.
    if (activeItems.some((active) => isSameKitchenWork(active, desired))) return true;
    // Cancelled-only history prevents an unchanged item being re-fired.
    return !cancelledItems.some((historical) => isSameKitchenWork(historical, desired));
  });
}

function mapOrderItemsByStation(order: any): Record<string, TicketItem[]> {
  const grouped: Record<string, TicketItem[]> = {};

  for (const item of order.orderItems || []) {
    if (!item?.id || item.isVoided) continue;
    const station = item.kitchenStationSnapshot || item.menuItem?.kitchenStation || "expo";
    const name = item.itemNameSnapshot || item.menuItem?.name || "Item";
    const quantity = item.quantity || 1;
    const notes = item.specialInstructions || null;
    if (!grouped[station]) grouped[station] = [];
    grouped[station].push({
      id: item.id,
      name,
      quantity,
      notes,
      station,
      status: "new",
      fulfilledAt: null,
      workSignature: createKitchenWorkSignature({
        id: item.id,
        name,
        quantity,
        notes,
        station,
        modifiersSnapshot: item.modifiersSnapshot,
      }),
    });
  }

  return grouped;
}

export async function reconcileRestaurantOrderStatus(orderId: string, context: Context) {
  const sudo = context.sudo();
  const [order, tickets] = await Promise.all([
    sudo.query.RestaurantOrder.findOne({
      where: { id: orderId },
      query: "id status",
    }),
    sudo.query.KitchenTicket.findMany({
      where: { order: { id: { equals: orderId } } },
      query: "id status",
    }),
  ]);

  if (!order || !tickets.length) return;

  const hasNew = tickets.some((t: any) => t.status === "new");
  const hasInProgress = tickets.some((t: any) => t.status === "in_progress");
  const hasReady = tickets.some((t: any) => t.status === "ready");
  const hasServed = tickets.some((t: any) => t.status === "served");
  const allServed = tickets.every((t: any) => ["served", "cancelled"].includes(t.status));

  let nextStatus: string | null = null;
  if (hasInProgress) nextStatus = "in_progress";
  else if (hasReady && !hasNew) nextStatus = "ready";
  else if (hasReady || hasNew) nextStatus = "sent_to_kitchen";
  else if (allServed || hasServed) nextStatus = "served";

  if (nextStatus && nextStatus !== order.status) {
    await sudo.db.RestaurantOrder.updateOne({
      where: { id: orderId },
      data: { status: nextStatus },
    });
  }
}

export async function syncKitchenTicketsForOrder(orderId: string, context: Context) {
  const sudo = context.sudo();

  const order = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: `
      id
      status
      isUrgent
      onHold
      createdAt
      orderItems {
        id
        quantity
        specialInstructions
        itemNameSnapshot
        kitchenStationSnapshot
        modifiersSnapshot
        isVoided
        menuItem { id name kitchenStation }
      }
    `,
  });

  if (!order) {
    return { created: 0, updated: 0, removed: 0 };
  }

  const existingTickets = await sudo.query.KitchenTicket.findMany({
    where: {
      order: { id: { equals: order.id } },
      status: { in: [...ACTIVE_TICKET_STATUSES, "served", "cancelled"] },
    },
    query: "id items status priority ticketType firedAt station { id name }",
    orderBy: { firedAt: "asc" },
  });

  if (order.status === "completed" || order.status === "cancelled") {
    const now = new Date().toISOString();
    let updated = 0;

    for (const ticket of existingTickets.filter((t: any) => ACTIVE_TICKET_STATUSES.includes(t.status))) {
      const nextStatus = order.status === "completed" ? "served" : "cancelled";
      await mutateKitchenState(context, async (tx, actorId) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: {
            status: nextStatus,
            completedAt: order.status === "completed" ? new Date(now) : undefined,
            servedAt: order.status === "completed" ? new Date(now) : undefined,
          },
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: order.status === "completed" ? "status" : "cancel",
          ticketId: ticket.id,
          orderId: order.id,
          payload: { from: ticket.status, to: nextStatus, source: "order_terminal_state" },
          eventKey: `ticket-terminal:${ticket.id}:${nextStatus}`,
        });
      });
      updated += 1;
    }

    return { created: 0, updated, removed: 0 };
  }

  if (!isKitchenActiveOrderStatus(order.status)) {
    return { created: 0, updated: 0, removed: 0 };
  }

  const stations = await sudo.query.KitchenStation.findMany({
    query: "id name displayOrder",
    where: { isActive: { equals: true } },
    orderBy: { displayOrder: "asc" },
  });

  const stationItemMap = mapOrderItemsByStation(order);
  let created = 0;
  let updated = 0;
  let removed = 0;

  const desiredStationKeys = new Set(Object.keys(stationItemMap).map(normalizeStationName));

  if (desiredStationKeys.size === 0) {
    for (const ticket of existingTickets.filter((t: any) => ACTIVE_TICKET_STATUSES.includes(t.status))) {
      await mutateKitchenState(context, async (tx, actorId) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: {
            status: "cancelled",
            items: ((ticket.items as TicketItem[] | null) || []).map((item) => ({ ...item, status: "cancelled" })),
          },
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: "cancel",
          ticketId: ticket.id,
          orderId: order.id,
          payload: { reason: "No active order items remain", previousItems: ticket.items || [] },
          eventKey: `ticket-cancel-empty:${ticket.id}`,
        });
      });
      updated += 1;
    }
    return { created, updated, removed };
  }

  for (const [stationKey, items] of Object.entries(stationItemMap)) {
    const station = await getOrCreateStation(stationKey, context, stations as any);
    const stationTickets = existingTickets.filter(
      (ticket: any) =>
        normalizeStationName(ticket.station?.name || "") === normalizeStationName(station.name)
    );
    const matchingTickets = stationTickets.filter((ticket: any) =>
      ACTIVE_TICKET_STATUSES.includes(ticket.status)
    );
    const workItems = getUncoveredKitchenWorkItems(items, stationTickets);

    const priority = order.isUrgent ? 100 : order.onHold ? -10 : 0;
    const ticketType = isExpediterStation(station.name) ? "expediter" : "prep";

    // A terminal ticket is immutable proof that identical kitchen work was
    // already handled. Cancel any stale active replacement rather than
    // dispatching it again. Changed/new work remains uncovered and continues
    // through the normal delta/create path below.
    if (workItems.length === 0) {
      for (const stale of matchingTickets) {
        await mutateKitchenState(context, async (tx, actorId) => {
          await tx.kitchenTicket.update({
            where: { id: stale.id },
            data: {
              status: "cancelled",
              items: ((stale.items as TicketItem[] | null) || []).map((item) => ({
                ...item,
                status: "cancelled",
              })),
            },
          });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "cancel",
            ticketId: stale.id,
            orderId: order.id,
            payload: { reason: "Terminal ticket already covers unchanged kitchen work" },
            eventKey: `ticket-terminal-covered-cancel:${stale.id}`,
          });
        });
        updated += 1;
      }
      continue;
    }

    if (matchingTickets.length > 0) {
      const existing = matchingTickets[0];
      const existingItems = (existing.items as TicketItem[] | null) || [];
      const existingMap = new Map(existingItems.map((i) => [i.id, i]));

      const currentIds = new Set(workItems.map((item) => item.id));
      const cancelledItems = existingItems
        .filter((item) => !currentIds.has(item.id))
        .map((item) => ({ ...item, status: "cancelled" as const }));
      const mergedItems = [
        ...workItems.map((item) => {
          const prev = existingMap.get(item.id);
          if (!prev) return item;
          return {
            ...item,
            status: prev.status === "cancelled" ? "new" : prev.status || "new",
            fulfilledAt: prev.fulfilledAt || null,
          };
        }),
        ...cancelledItems,
      ];

      const projectionChanged =
        JSON.stringify(existingItems) !== JSON.stringify(mergedItems) ||
        Number(existing.priority || 0) !== priority ||
        existing.ticketType !== ticketType ||
        !existing.firedAt;
      if (projectionChanged) {
        const digest = crypto.createHash("sha256").update(JSON.stringify({ mergedItems, priority, ticketType })).digest("hex");
        await mutateKitchenState(context, async (tx, actorId) => {
          await tx.kitchenTicket.update({
            where: { id: existing.id },
            data: {
              items: mergedItems,
              orderItems: { set: mergedItems.map((item) => ({ id: item.id })) },
              priority,
              ticketType,
              firedAt: existing.firedAt ? new Date(existing.firedAt) : new Date(order.createdAt),
            },
          });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "delta",
            ticketId: existing.id,
            orderId: order.id,
            payload: { before: existingItems, after: mergedItems, priority, ticketType },
            eventKey: `ticket-delta:${existing.id}:${digest}`,
          });
        });
        updated += 1;
      }

      for (const duplicate of matchingTickets.slice(1)) {
        await mutateKitchenState(context, async (tx, actorId) => {
          await tx.kitchenTicket.update({ where: { id: duplicate.id }, data: { status: "cancelled" } });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "cancel",
            ticketId: duplicate.id,
            orderId: order.id,
            payload: { reason: "Duplicate active projection superseded", canonicalTicketId: existing.id },
            eventKey: `ticket-duplicate-cancel:${duplicate.id}`,
          });
        });
        updated += 1;
      }
    } else {
      await mutateKitchenState(context, async (tx, actorId) => {
        const createdTicket = await tx.kitchenTicket.create({
          data: {
            orderId: order.id,
            stationId: station.id,
            items: workItems,
            orderItems: { connect: workItems.map((item) => ({ id: item.id })) },
            priority,
            ticketType,
            status: getTicketStatusForOrderStatus(order.status),
            firedAt: new Date(order.createdAt),
          },
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: "dispatch",
          ticketId: createdTicket.id,
          orderId: order.id,
          payload: { station: station.name, items: workItems, priority, ticketType },
          eventKey: `ticket-dispatch:${createdTicket.id}`,
        });
      });
      created += 1;
    }
  }

  for (const ticket of existingTickets.filter((ticket: any) => ACTIVE_TICKET_STATUSES.includes(ticket.status))) {
    const stationName = normalizeStationName(ticket.station?.name || "");
    if (!desiredStationKeys.has(stationName)) {
      await mutateKitchenState(context, async (tx, actorId) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: {
            status: "cancelled",
            items: ((ticket.items as TicketItem[] | null) || []).map((item) => ({ ...item, status: "cancelled" })),
          },
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: "cancel",
          ticketId: ticket.id,
          orderId: order.id,
          payload: { reason: "Station no longer has active items", previousItems: ticket.items || [] },
          eventKey: `ticket-station-cancel:${ticket.id}`,
        });
      });
      updated += 1;
    }
  }

  await reconcileRestaurantOrderStatus(order.id, context);

  return { created, updated, removed };
}

export async function syncKitchenTicketsForActiveOrders(context: Context) {
  const orders = await context.sudo().query.RestaurantOrder.findMany({
    where: {
      status: { in: [...ACTIVE_ORDER_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
    query: "id",
  });

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const order of orders) {
    const result = await syncKitchenTicketsForOrder(order.id, context);
    created += result.created;
    updated += result.updated;
    removed += result.removed;
  }

  return { created, updated, removed };
}

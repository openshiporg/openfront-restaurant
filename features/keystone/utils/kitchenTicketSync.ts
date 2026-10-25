import { snapshotOrderRecipes } from "./inventoryRecipeSnapshot";
import crypto from "crypto";
import type { Context } from ".keystone/types";
import { hasKitchenWorkCoverage, serviceTransaction } from "./serviceOrderState";
import { appendKitchenTicketEventWithClient } from "./kitchenTicketEvents";

export type TicketItem = {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  station: string;
  modifiers?: Array<{ name?: string; label?: string; value?: string }>;
  seatNumber?: number | null;
  courseNumber?: number | null;
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

async function mutateKitchenState<T>(
  context: Context,
  expectedOrder: any,
  operation: (tx: any, actorId: string | null) => Promise<T>
): Promise<T | undefined> {
  const orderId = expectedOrder.id;
  return serviceTransaction(context.prisma, async tx => {
    const currentOrder = await tx.restaurantOrder.findUnique({ where: { id: orderId }, include: { orderItems: { include: { course: true, menuItem: true } } } });
    if (!currentOrder || ["completed", "dispatched", "served"].includes(currentOrder.status)) return undefined;
    assertKitchenProjectionCurrent(expectedOrder, currentOrder);
    // Every projection write re-reads the aggregate inside its serializable commit.
    // A concurrent close/cancellation conflicts with this read instead of resurrecting work.
    // Prisma's transaction client is a Proxy whose set trap
    // writes onto the transaction itself, so assigning guarded.kitchenTicket replaced
    // tx.kitchenTicket and the guard's create/update called themselves forever
    // ("Maximum call stack size exceeded" on completeActiveCart). Keep the original
    // delegate and expose the guard through a read-only proxy instead.
    const tickets = tx.kitchenTicket;
    const guardedTickets = Object.create(tickets, {
      update: { value: async (args: any) => {
        const current = await tickets.findUnique({ where: args.where });
        if (current && ["served", "cancelled"].includes(current.status)) return current;
        if (currentOrder.status === "cancelled" && args.data.status !== "cancelled") return current;
        return tickets.update(args);
      } },
      create: { value: async (args: any) => {
        if (currentOrder.status === "cancelled") throw new Error("Order was cancelled before kitchen dispatch");
        return tickets.create(args);
      } },
    });
    const guarded = new Proxy(tx, { get: (target, prop) => (prop === "kitchenTicket" ? guardedTickets : Reflect.get(target, prop)) });
    return operation(guarded, context.session?.itemId || null);
  });
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

export function getKitchenProjectionTicketStatus(currentStatus: string, items: TicketItem[]) {
  if (currentStatus === "ready" && items.some((item) => ["new", "in_progress"].includes(item.status))) {
    return "in_progress";
  }
  return currentStatus;
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
  seatNumber?: number | null;
  courseNumber?: number | null;
  dispatchVersion?: string | null;
}) {
  return {
    id: item.id,
    name: item.name,
    quantity: Number(item.quantity || 1),
    notes: item.notes || null,
    station: normalizeStationName(item.station || "expo"),
    modifiersSnapshot: item.modifiersSnapshot ?? null,
    seatNumber: item.seatNumber ?? null, courseNumber: item.courseNumber ?? null,
    dispatchVersion: item.dispatchVersion ?? null,
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

/** Coalescing split/merged check tickets retains the most advanced state for
 * identical production work. A deliberately refired signature starts fresh. */
export function mergeKitchenProjectionItems(desiredItems: TicketItem[], tickets: TicketProjection[]): TicketItem[] {
  const history = tickets.flatMap(ticket => ticket.items || []);
  const rank = { cancelled: 0, new: 1, in_progress: 2, fulfilled: 3 };
  const desiredIds = new Set(desiredItems.map(item => item.id));
  const cancelled = new Map<string, TicketItem>();
  for (const item of history) if (!desiredIds.has(item.id)) cancelled.set(item.id, { ...item, status: "cancelled" });
  return [...desiredItems.map(item => {
    const previous = history.filter(candidate => candidate.id === item.id && isSameKitchenWork(candidate, item))
      .sort((a, b) => rank[b.status] - rank[a.status])[0];
    if (!previous || previous.status === "cancelled") return item;
    return { ...item, status: previous.status, fulfilledAt: previous.fulfilledAt || null };
  }), ...cancelled.values()];
}

export function mapOrderItemsByStation(order: any): Record<string, TicketItem[]> {
  const grouped: Record<string, TicketItem[]> = {};

  if (order.onHold) return grouped;
  for (const item of order.orderItems || []) {
    if (!item?.id || item.isVoided || item.course?.onHold || (item.course && item.course.status !== "fired")) continue;
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
      modifiers: Array.isArray(item.modifiersSnapshot) ? item.modifiersSnapshot : [],
      seatNumber: item.seatNumber ?? null, courseNumber: item.courseNumber ?? null,
      status: "new",
      fulfilledAt: null,
      workSignature: createKitchenWorkSignature({
        id: item.id,
        name,
        quantity,
        notes,
        station,
        modifiersSnapshot: item.modifiersSnapshot,
        seatNumber: item.seatNumber, courseNumber: item.courseNumber,
        dispatchVersion: item.firedAt || null,
      }),
    });
  }

  return grouped;
}

/** The desired projection was read before this commit; reject intervening
 * course/hold/item changes instead of reviving stale work. The next sync reloads. */
export function assertKitchenProjectionCurrent(expected: any, current: any) {
  const fingerprint = (order: any) => JSON.stringify({
    cancelled: order.status === "cancelled", onHold: Boolean(order.onHold), urgent: Boolean(order.isUrgent),
    work: Object.values(mapOrderItemsByStation(order)).flat().map(item => [item.id, item.workSignature]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  if (fingerprint(expected) !== fingerprint(current)) throw new Error("Kitchen work changed during synchronization; refresh and retry");
}

export async function reconcileRestaurantOrderStatus(orderId: string, context: Context) {
  await serviceTransaction(context.prisma, async tx => {
    const order = await tx.restaurantOrder.findUnique({ where: { id: orderId }, include: { orderItems: { select: { id: true, isVoided: true } }, courses: { where: { orderItems: { some: { isVoided: false } } } } } });
    if (!order || ["completed", "cancelled", "dispatched", "served", "open"].includes(order.status)) return;
    const tickets = await tx.kitchenTicket.findMany({ where: { orderId }, include: { orderItems: { select: { id: true } } } });
    if (!tickets.length) return;
    const active = tickets.filter((ticket: any) => ticket.status !== "cancelled");
    if (!active.length) return;
    const held = order.onHold || order.courses.some((course: any) => course.onHold || course.status === "pending");
    const nextStatus = active.some((ticket: any) => ticket.status === "in_progress") ? "in_progress"
      : active.some((ticket: any) => ticket.status === "new") ? "sent_to_kitchen"
      : active.some((ticket: any) => ticket.status === "ready") ? "ready"
      : !held && active.every((ticket: any) => ticket.status === "served") ? (["delivery", "takeout"].includes(order.orderType) ? "ready" : "served") : "in_progress";
    if (["ready", "served"].includes(nextStatus) && !hasKitchenWorkCoverage(order, tickets, ["ready", "served"])) return;
    if (nextStatus !== order.status) await tx.restaurantOrder.update({ where: { id: orderId }, data: { status: nextStatus } });
  });
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
        seatNumber
        courseNumber
        firedAt
        course { id status onHold }
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

  // Completion cannot rewrite unfinished preparation as served. Closure validates this invariant.
  if (order.status === "completed") return { created: 0, updated: 0, removed: 0 };
  if (order.status === "cancelled") {
    const now = new Date().toISOString();
    let updated = 0;

    for (const ticket of existingTickets.filter((t: any) => ACTIVE_TICKET_STATUSES.includes(t.status))) {
      const nextStatus = "cancelled";
      await mutateKitchenState(context, order, async (tx, actorId) => {
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

  await snapshotOrderRecipes(order.id, context);

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
      await mutateKitchenState(context, order, async (tx, actorId) => {
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
    const priority = order.isUrgent ? 100 : order.onHold ? -10 : 0;
    const ticketType = isExpediterStation(station.name) ? "expediter" : "prep";

    const projection = await mutateKitchenState(context, order, async (tx, actorId) => {
      // Re-read station history inside the serializable transaction. Parallel
      // syncs that both observed an empty projection must converge on one ticket.
      const stationHistory = await tx.kitchenTicket.findMany({
        where: { orderId: order.id, stationId: station.id },
        orderBy: { firedAt: "asc" },
      });
      const workItems = getUncoveredKitchenWorkItems(items, stationHistory);
      const activeTickets = stationHistory.filter((ticket: any) => ACTIVE_TICKET_STATUSES.includes(ticket.status));

      if (workItems.length === 0) {
        for (const stale of activeTickets) {
          await tx.kitchenTicket.update({
            where: { id: stale.id },
            data: {
              status: "cancelled",
              items: ((stale.items as TicketItem[] | null) || []).map((item) => ({ ...item, status: "cancelled" })),
            },
          });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "cancel", ticketId: stale.id, orderId: order.id,
            payload: { reason: "Terminal ticket already covers unchanged kitchen work" },
            eventKey: `ticket-terminal-covered-cancel:${stale.id}`,
          });
        }
        return { created: 0, updated: activeTickets.length };
      }

      if (activeTickets.length > 0) {
        const current = activeTickets[0];
        const mergedItems = mergeKitchenProjectionItems(workItems, stationHistory);
        const nextStatus = getKitchenProjectionTicketStatus(current.status, mergedItems);
        const projectionChanged = JSON.stringify(current.items || []) !== JSON.stringify(mergedItems) ||
          Number(current.priority || 0) !== priority || current.ticketType !== ticketType ||
          !current.firedAt || nextStatus !== current.status;
        if (projectionChanged) {
          const digest = crypto.createHash("sha256").update(JSON.stringify({ mergedItems, priority, ticketType, nextStatus })).digest("hex");
          const resumed = nextStatus !== current.status;
          await tx.kitchenTicket.update({ where: { id: current.id }, data: {
            items: mergedItems,
            orderItems: { set: mergedItems.map(item => ({ id: item.id })) },
            priority,
            ticketType,
            status: nextStatus,
            completedAt: resumed ? null : undefined,
            recalledAt: resumed ? new Date() : undefined,
            firedAt: current.firedAt || new Date(order.createdAt),
          } });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "delta", ticketId: current.id, orderId: order.id,
            payload: { before: current.items, after: mergedItems, fromStatus: current.status, toStatus: nextStatus, priority, ticketType },
            eventKey: `ticket-delta:${current.id}:${digest}`,
          });
        }
        for (const duplicate of activeTickets.filter((ticket: any) => ticket.id !== current.id)) {
          await tx.kitchenTicket.update({ where: { id: duplicate.id }, data: { status: "cancelled" } });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "cancel", ticketId: duplicate.id, orderId: order.id,
            payload: { reason: "Duplicate active projection superseded", canonicalTicketId: current.id },
            eventKey: `ticket-duplicate-cancel:${duplicate.id}`,
          });
        }
        return { created: 0, updated: Number(projectionChanged || activeTickets.length > 1) };
      }

      const createdTicket = await tx.kitchenTicket.create({
        data: {
          orderId: order.id,
          stationId: station.id,
          items: workItems,
          orderItems: { connect: workItems.map((item) => ({ id: item.id })) },
          priority,
          ticketType,
          status: order.status === "ready" ? "new" : getTicketStatusForOrderStatus(order.status),
          firedAt: new Date(order.createdAt),
        },
      });
      await appendKitchenTicketEventWithClient(tx, actorId, {
        eventType: "dispatch", ticketId: createdTicket.id, orderId: order.id,
        payload: { station: station.name, items: workItems, priority, ticketType },
        eventKey: `ticket-dispatch:${createdTicket.id}`,
      });
      return { created: 1, updated: 0 };
    });
    created += projection?.created || 0;
    updated += projection?.updated || 0;
  }

  for (const ticket of existingTickets.filter((ticket: any) => ACTIVE_TICKET_STATUSES.includes(ticket.status))) {
    const stationName = normalizeStationName(ticket.station?.name || "");
    if (!desiredStationKeys.has(stationName)) {
      await mutateKitchenState(context, order, async (tx, actorId) => {
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

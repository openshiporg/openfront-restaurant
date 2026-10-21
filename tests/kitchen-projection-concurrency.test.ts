import test from 'node:test';
import assert from 'node:assert/strict';
import { syncKitchenTicketsForOrder, getKitchenProjectionTicketStatus, type TicketItem } from '../features/keystone/utils/kitchenTicketSync';
import { assertServiceTransition } from '../features/keystone/utils/serviceOrderState';

function kitchenHarness(existingTickets: any[] = []) {
  const station = { id: 'station-grill', name: 'Grill', displayOrder: 1 };
  const order: any = {
    id: 'order',
    status: 'ready',
    isUrgent: false,
    onHold: false,
    orderType: 'dine_in',
    createdAt: new Date('2026-09-26T12:00:00.000Z'),
    courses: [],
    orderItems: [
      { id: 'item-1', quantity: 1, specialInstructions: '', itemNameSnapshot: 'Burger', kitchenStationSnapshot: 'Grill', modifiersSnapshot: [], seatNumber: 1, courseNumber: 1, firedAt: '2026-09-26T12:00:00.000Z', course: { id: 'course-1', status: 'fired', onHold: false }, isVoided: false, menuItem: { id: 'menu-1', name: 'Burger', kitchenStation: 'Grill' } },
      { id: 'item-2', quantity: 1, specialInstructions: '', itemNameSnapshot: 'Fries', kitchenStationSnapshot: 'Grill', modifiersSnapshot: [], seatNumber: 1, courseNumber: 2, firedAt: '2026-09-26T12:05:00.000Z', course: { id: 'course-2', status: 'fired', onHold: false }, isVoided: false, menuItem: { id: 'menu-2', name: 'Fries', kitchenStation: 'Grill' } },
    ],
  };
  let state: any = { order, tickets: structuredClone(existingTickets), ticketEvents: new Map(), auditEvents: new Map(), nextTicketId: 1 };
  let queue = Promise.resolve();

  function delegates(draft: any) {
    return {
      restaurantOrder: {
        findUnique: async () => structuredClone({ ...draft.order, orderItems: draft.order.orderItems }),
        update: async ({ data }: any) => Object.assign(draft.order, data),
      },
      orderItem: { findMany: async () => draft.order.orderItems },
      kitchenTicket: {
        findMany: async ({ where = {} }: any = {}) => draft.tickets.filter((ticket: any) =>
          (!where.orderId || ticket.orderId === where.orderId) &&
          (!where.stationId || ticket.stationId === where.stationId) &&
          (!where.id?.in || where.id.in.includes(ticket.id)) &&
          (!where.status?.in || where.status.in.includes(ticket.status))
        ).map((ticket: any) => structuredClone(ticket)),
        findUnique: async ({ where }: any) => structuredClone(draft.tickets.find((ticket: any) => ticket.id === where.id) || null),
        create: async ({ data }: any) => {
          const ticket = { ...data, id: `ticket-${draft.nextTicketId++}`, station: structuredClone(station), completedAt: null, recalledAt: null };
          draft.tickets.push(ticket);
          return structuredClone(ticket);
        },
        update: async ({ where, data }: any) => {
          const ticket = draft.tickets.find((row: any) => row.id === where.id);
          if (!ticket) throw new Error('Ticket not found');
          for (const [key, value] of Object.entries(data)) if (value !== undefined && key !== 'orderItems') ticket[key] = value;
          return structuredClone(ticket);
        },
      },
      kitchenTicketEvent: { upsert: async ({ where, create }: any) => {
        if (!draft.ticketEvents.has(where.eventKey)) draft.ticketEvents.set(where.eventKey, create);
        return draft.ticketEvents.get(where.eventKey);
      } },
      auditEvent: {
        findUnique: async ({ where }: any) => draft.auditEvents.get(where.eventKey) || null,
        upsert: async ({ where, create }: any) => {
          if (!draft.auditEvents.has(where.eventKey)) draft.auditEvents.set(where.eventKey, create);
          return draft.auditEvents.get(where.eventKey);
        },
      },
      recipe: { findMany: async () => [] },
      ingredient: { findUnique: async () => null },
    };
  }

  const prisma: any = {
    $transaction: async (operation: any) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const draft = structuredClone(state);
      try {
        const result = await operation(delegates(draft));
        state = draft;
        return result;
      } finally {
        release();
      }
    },
  };
  const context: any = {
    prisma,
    session: { itemId: 'cook' },
    sudo: () => ({
      query: {
        RestaurantOrder: { findOne: async () => structuredClone(order) },
        KitchenTicket: {
          findMany: async ({ where }: any) => state.tickets.filter((ticket: any) =>
            ticket.orderId === where.order.id.equals && where.status.in.includes(ticket.status)
          ).map((ticket: any) => structuredClone(ticket)),
        },
        KitchenStation: { findMany: async () => [structuredClone(station)] },
      },
      db: { KitchenStation: { createOne: async () => structuredClone(station) } },
    }),
  };
  return { context, state: () => state };
}

test('adding a later course reopens a ready station ticket and prevents handoff of new work', async () => {
  const oldItem: TicketItem = {
    id: 'item-1', name: 'Burger', quantity: 1, station: 'grill', status: 'fulfilled',
    fulfilledAt: '2026-09-26T12:04:00.000Z',
  };
  const h = kitchenHarness([{ id: 'ticket-ready', orderId: 'order', stationId: 'station-grill', station: { id: 'station-grill', name: 'Grill' }, status: 'ready', items: [oldItem], priority: 0, ticketType: 'prep', firedAt: new Date('2026-09-26T12:00:00.000Z') }]);

  await syncKitchenTicketsForOrder('order', h.context);

  const ticket = h.state().tickets[0];
  assert.equal(ticket.status, 'in_progress');
  assert.equal(ticket.items.find((item: TicketItem) => item.id === 'item-1')?.status, 'fulfilled');
  assert.equal(ticket.items.find((item: TicketItem) => item.id === 'item-2')?.status, 'new');
  assert.equal(h.state().order.status, 'in_progress');
  assert.throws(() => assertServiceTransition({ ...h.state().order, payments: [] }, 'served', [ticket]), /transition/);
});

test('concurrent syncs that both observe no station ticket converge on one active projection', async () => {
  const h = kitchenHarness();
  await Promise.all([
    syncKitchenTicketsForOrder('order', h.context),
    syncKitchenTicketsForOrder('order', h.context),
  ]);
  assert.equal(h.state().tickets.length, 1);
  assert.equal(h.state().tickets.filter((ticket: any) => ['new', 'in_progress', 'ready'].includes(ticket.status)).length, 1);
  assert.equal(h.state().tickets[0].items.length, 2);
});

test('ready projections resume only when the merged ticket actually contains outstanding work', () => {
  const completed: TicketItem = { id: 'done', name: 'Done', quantity: 1, station: 'grill', status: 'fulfilled' };
  const pending: TicketItem = { id: 'pending', name: 'Pending', quantity: 1, station: 'grill', status: 'new' };
  assert.equal(getKitchenProjectionTicketStatus('ready', [completed, pending]), 'in_progress');
  assert.equal(getKitchenProjectionTicketStatus('ready', [completed]), 'ready');
  assert.equal(getKitchenProjectionTicketStatus('in_progress', [pending]), 'in_progress');
});

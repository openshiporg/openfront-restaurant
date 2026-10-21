import type { Context } from ".keystone/types";

/** Prisma is intentional: allocation readers/writers share Serializable isolation. */
export async function reconcileClosedOrderTables(orderId: string, context: Context) {
  return (context.prisma as any).$transaction(async (tx: any) => {
    const order = await tx.restaurantOrder.findUnique({ where: { id: orderId }, include: { tables: true } });
    if (!order || !["completed", "cancelled"].includes(order.status)) return;
    for (const table of order.tables) {
      const active = await tx.restaurantOrder.count({ where: {
        tables: { some: { id: table.id } }, status: { notIn: ["completed", "cancelled"] },
      } });
      const seated = await tx.reservation.count({ where: { assignedTableId: table.id, status: "seated" } });
      const waitingParty = await tx.waitlistEntry.count({ where: { tableId: table.id, status: "seated" } });
      if (active || seated || waitingParty) continue;
      await tx.table.updateMany({ where: { id: table.id, status: "occupied" }, data: { status: "cleaning" } });
    }
  }, { isolationLevel: "Serializable" });
}

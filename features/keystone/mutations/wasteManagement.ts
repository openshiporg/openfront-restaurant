import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEvent } from "../utils/audit";
import { getOrCreateIdempotencyAttempt, updateIdempotencyAttempt } from "../utils/idempotency";

interface WasteResult {
  success: boolean;
  wasteLogId: string | null;
  error: string | null;
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Waste quantity must be greater than zero");
  }
  return Math.round(quantity * 100) / 100;
}

export async function recordWaste(
  _root: unknown,
  args: {
    ingredientId: string;
    quantity: string;
    reason: string;
    notes?: string | null;
    idempotencyKey: string;
  },
  context: Context
): Promise<WasteResult> {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, wasteLogId: null, error: "Not authorized to record inventory waste" };
  }

  try {
    const quantity = normalizeQuantity(args.quantity);
    if (!args.reason?.trim()) throw new Error("Waste reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma as any;
    const priorWaste = await prisma.wasteLog.findUnique({ where: { eventKey: args.idempotencyKey } });
    if (priorWaste && (
      priorWaste.ingredientId !== args.ingredientId ||
      Number(priorWaste.quantity) !== quantity ||
      priorWaste.reason !== args.reason.trim() ||
      (priorWaste.notes || "") !== (args.notes || "").trim()
    )) {
      throw new Error("Idempotency key was already used with a different waste request");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `record-waste:${args.idempotencyKey.trim()}`,
      requestPath: "recordWaste",
      requestParams: {
        ingredientId: args.ingredientId,
        quantity,
        reason: args.reason.trim(),
        notes: (args.notes || "").trim(),
      },
    });
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.wasteLog.findUnique({ where: { eventKey: args.idempotencyKey } });
      if (existing) {
        if (
          existing.ingredientId !== args.ingredientId ||
          Number(existing.quantity) !== quantity ||
          existing.reason !== args.reason.trim() ||
          (existing.notes || "") !== (args.notes || "").trim()
        ) {
          throw new Error("Idempotency key was already used with a different waste request");
        }
        return { wasteLog: existing, replay: true };
      }

      const ingredient = await tx.ingredient.findUnique({ where: { id: args.ingredientId } });
      if (!ingredient) throw new Error("Ingredient not found");
      const nextStock = Number(ingredient.currentStock || 0) - quantity;
      const wasteLog = await tx.wasteLog.create({
        data: {
          eventKey: args.idempotencyKey,
          ingredientId: args.ingredientId,
          quantity: quantity.toFixed(2),
          reason: args.reason.trim(),
          notes: (args.notes || "").trim(),
          loggedById: context.session?.itemId || null,
        },
      });
      await tx.stockMovement.create({
        data: {
          eventKey: `waste:${wasteLog.id}`,
          referenceType: "WasteLog",
          referenceId: wasteLog.id,
          ingredientId: args.ingredientId,
          type: "waste",
          quantity: (-quantity).toFixed(2),
          reason: args.reason.trim(),
          createdById: context.session?.itemId || null,
        },
      });
      await tx.ingredient.update({
        where: { id: args.ingredientId },
        data: { currentStock: nextStock.toFixed(2) },
      });
      return { wasteLog, replay: false };
    }, { isolationLevel: "Serializable" });

    if (!result.replay) {
      await appendAuditEvent(context, {
        eventType: "inventory.waste_recorded",
        entityType: "WasteLog",
        entityId: result.wasteLog.id,
        reason: args.reason,
        after: { ingredientId: args.ingredientId, quantity },
        metadata: { idempotencyKey: args.idempotencyKey },
      }).catch((error) => console.error("Waste audit event failed:", error));
    }
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      wasteLogId: result.wasteLog.id,
    }, 200);
    return { success: true, wasteLogId: result.wasteLog.id, error: null };
  } catch (error) {
    return { success: false, wasteLogId: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function adjustInventory(
  _root: unknown,
  args: { ingredientId: string; quantity: string; reason: string; idempotencyKey: string },
  context: Context
): Promise<WasteResult> {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, wasteLogId: null, error: "Not authorized to adjust inventory" };
  }
  try {
    const quantity = Number(args.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) throw new Error("Adjustment quantity must be non-zero");
    if (!args.reason?.trim()) throw new Error("Adjustment reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma as any;
    const priorMovement = await prisma.stockMovement.findUnique({ where: { eventKey: args.idempotencyKey } });
    if (priorMovement && (
      priorMovement.ingredientId !== args.ingredientId ||
      Number(priorMovement.quantity) !== quantity ||
      priorMovement.reason !== args.reason.trim() ||
      priorMovement.referenceType !== "ManualAdjustment"
    )) {
      throw new Error("Idempotency key was already used with a different inventory adjustment");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `adjust-inventory:${args.idempotencyKey.trim()}`,
      requestPath: "adjustInventory",
      requestParams: {
        ingredientId: args.ingredientId,
        quantity,
        reason: args.reason.trim(),
      },
    });
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.stockMovement.findUnique({ where: { eventKey: args.idempotencyKey } });
      if (existing) {
        if (
          existing.ingredientId !== args.ingredientId ||
          Number(existing.quantity) !== quantity ||
          existing.reason !== args.reason.trim() ||
          existing.referenceType !== "ManualAdjustment"
        ) {
          throw new Error("Idempotency key was already used with a different inventory adjustment");
        }
        return { movement: existing, replay: true };
      }
      const ingredient = await tx.ingredient.findUnique({ where: { id: args.ingredientId } });
      if (!ingredient) throw new Error("Ingredient not found");
      const movement = await tx.stockMovement.create({
        data: {
          eventKey: args.idempotencyKey,
          referenceType: "ManualAdjustment",
          referenceId: args.ingredientId,
          ingredientId: args.ingredientId,
          type: "adjustment",
          quantity: quantity.toFixed(2),
          reason: args.reason.trim(),
          createdById: context.session?.itemId || null,
        },
      });
      await tx.ingredient.update({
        where: { id: args.ingredientId },
        data: { currentStock: (Number(ingredient.currentStock || 0) + quantity).toFixed(2) },
      });
      return { movement, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result.replay) {
      await appendAuditEvent(context, {
        eventType: "inventory.adjusted",
        entityType: "StockMovement",
        entityId: result.movement.id,
        reason: args.reason,
        after: { ingredientId: args.ingredientId, quantity },
        metadata: { idempotencyKey: args.idempotencyKey },
      }).catch((error) => console.error("Inventory adjustment audit event failed:", error));
    }
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      stockMovementId: result.movement.id,
      ingredientId: args.ingredientId,
    }, 200);
    return { success: true, wasteLogId: null, error: null };
  } catch (error) {
    return { success: false, wasteLogId: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function reverseWaste(
  _root: unknown,
  args: { wasteLogId: string; reason: string; idempotencyKey: string },
  context: Context
): Promise<WasteResult> {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, wasteLogId: null, error: "Not authorized to reverse inventory waste" };
  }

  try {
    if (!args.reason?.trim()) throw new Error("Reversal reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma as any;
    const priorMovement = await prisma.stockMovement.findUnique({ where: { eventKey: args.idempotencyKey } });
    if (priorMovement && (
      priorMovement.referenceId !== args.wasteLogId ||
      priorMovement.referenceType !== "WasteLogReversal" ||
      priorMovement.reason !== args.reason.trim()
    )) {
      throw new Error("Idempotency key was already used with a different waste reversal");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `reverse-waste:${args.idempotencyKey.trim()}`,
      requestPath: "reverseWaste",
      requestParams: { wasteLogId: args.wasteLogId, reason: args.reason.trim() },
    });
    const result = await prisma.$transaction(async (tx: any) => {
      const waste = await tx.wasteLog.findUnique({ where: { id: args.wasteLogId } });
      if (!waste) throw new Error("Waste log not found");
      if (waste.reversedAt) return { waste, replay: true };
      const ingredient = await tx.ingredient.findUnique({ where: { id: waste.ingredientId } });
      if (!ingredient) throw new Error("Ingredient not found");
      const quantity = Number(waste.quantity || 0);
      await tx.stockMovement.create({
        data: {
          eventKey: args.idempotencyKey,
          referenceType: "WasteLogReversal",
          referenceId: waste.id,
          ingredientId: waste.ingredientId,
          type: "adjustment",
          quantity: quantity.toFixed(2),
          reason: args.reason.trim(),
          createdById: context.session?.itemId || null,
        },
      });
      await tx.ingredient.update({
        where: { id: waste.ingredientId },
        data: { currentStock: (Number(ingredient.currentStock || 0) + quantity).toFixed(2) },
      });
      const updated = await tx.wasteLog.update({
        where: { id: waste.id },
        data: {
          reversedAt: new Date(),
          reversedById: context.session?.itemId || null,
          reversalReason: args.reason.trim(),
        },
      });
      return { waste: updated, replay: false };
    }, { isolationLevel: "Serializable" });

    if (!result.replay) {
      await appendAuditEvent(context, {
        eventType: "inventory.waste_reversed",
        entityType: "WasteLog",
        entityId: result.waste.id,
        reason: args.reason,
        metadata: { idempotencyKey: args.idempotencyKey },
      }).catch((error) => console.error("Waste reversal audit event failed:", error));
    }
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      wasteLogId: result.waste.id,
    }, 200);
    return { success: true, wasteLogId: result.waste.id, error: null };
  } catch (error) {
    return { success: false, wasteLogId: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

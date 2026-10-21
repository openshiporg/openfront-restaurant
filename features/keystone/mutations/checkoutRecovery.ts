import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { assertCanAccessCart } from "../utils/cartAccess";
import { cancelPayment } from "../utils/paymentProviderAdapter";
import completeActiveCart from "./completeActiveCart";

const RECOVERABLE_CHECKOUT_STATES = ["initializing", "provider_pending", "ready", "unknown", "finalizing", "cancelling"];

export async function unplacedCheckoutAttempts(_root: unknown, args: { skip?: number | null; take?: number | null }, context: Context) {
  if (!permissions.canManagePayments({ session: context.session }) || !permissions.canManageOrders({ session: context.session })) {
    throw new Error("Order and payment management are required for checkout recovery");
  }
  const skip = args.skip ?? 0;
  const take = args.take ?? 50;
  if (!Number.isInteger(skip) || skip < 0 || skip > 1000000 || !Number.isInteger(take) || take < 1 || take > 100) {
    throw new Error("Checkout recovery pagination is invalid");
  }
  const reservationWhere = {
    isSelected: true,
    paymentCollection: { cart: { orderId: null } },
    OR: RECOVERABLE_CHECKOUT_STATES.map((state) => ({ data: { path: ["state"], equals: state } })),
  };
  const prisma = context.prisma as any;
  const [sessions, activeReservations, activeOnlineOrders, settings] = await Promise.all([
    prisma.paymentSession.findMany({
      where: reservationWhere,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take,
      include: {
        paymentProvider: { select: { code: true } },
        paymentCollection: { include: { cart: { select: { id: true, customerName: true } } } },
      },
    }),
    prisma.paymentSession.count({ where: reservationWhere }),
    prisma.restaurantOrder.count({ where: { orderSource: "online", status: { in: ["open", "sent_to_kitchen", "in_progress", "ready", "dispatched"] } } }),
    prisma.storeSettings.findUnique({ where: { id: 1 }, select: { hours: true } }),
  ]);
  const totalCount = activeReservations;
  const rawCapacityLimit = settings?.hours?._ordering?.maxActiveOnlineOrders;
  const capacityLimitConfigured = rawCapacityLimit != null && rawCapacityLimit !== 0;
  const parsedCapacityLimit = Number(rawCapacityLimit);
  const capacityLimitValid = !capacityLimitConfigured || (Number.isInteger(parsedCapacityLimit) && parsedCapacityLimit >= 1 && parsedCapacityLimit <= 1000);
  const capacityLimit = capacityLimitConfigured && capacityLimitValid ? parsedCapacityLimit : 0;
  const items = sessions.flatMap((session: any) => {
    const cart = session.paymentCollection?.cart;
    if (!cart?.id) return [];
    const state = String(session.data?.state || "unknown");
    const providerCode = String(session.paymentProvider?.code || session.data?.providerCode || "");
    const manual = providerCode === "pp_system_default" || providerCode.startsWith("pp_manual");
    const hasProviderReference = Boolean(session.data?.paymentIntentId || session.data?.orderId);
    const hasImmutableQuote = session.data?.checkoutQuote?.version === 1;
    return [{
      id: session.id,
      cartId: cart.id,
      customerName: cart.customerName || "",
      amount: Number(session.amount || 0),
      createdAt: session.createdAt,
      state,
      providerCode,
      canRecover: hasImmutableQuote,
      requiresManualReview: !hasImmutableQuote,
      canCancel: !["finalizing", "cancelling"].includes(state) && (manual || (hasImmutableQuote && hasProviderReference)),
    }];
  });
  return {
    items,
    totalCount,
    skip,
    take,
    hasMore: skip + sessions.length < totalCount,
    activeReservations,
    activeOnlineOrders,
    capacityUsed: activeReservations + activeOnlineOrders,
    capacityLimit,
    capacityLimitConfigured,
    capacityLimitValid,
    capacityAtLimit: capacityLimit > 0 && activeReservations + activeOnlineOrders >= capacityLimit,
  };
}

/** Operator recovery uses the original quote/provider attempt; it never initiates a new charge. */
export async function recoverCheckoutPayment(_root: unknown, { paymentSessionId }: { paymentSessionId: string }, context: Context) {
  if (!permissions.canManagePayments({ session: context.session }) || !permissions.canManageOrders({ session: context.session })) throw new Error("Order and payment management are required for checkout recovery");
  const session = await context.sudo().query.PaymentSession.findOne({ where: { id: paymentSessionId }, query: "id paymentCollection { cart { id } }" });
  if (!session?.paymentCollection?.cart?.id) throw new Error("Checkout cart is missing");
  return completeActiveCart(null, { cartId: session.paymentCollection.cart.id, paymentSessionId }, context);
}

export async function cancelCheckoutPaymentSession(_root: unknown, { cartId, paymentSessionId }: { cartId: string; paymentSessionId: string }, context: Context) {
  await assertCanAccessCart(context, cartId, "checkout");
  const cart = await context.sudo().query.Cart.findOne({ where: { id: cartId }, query: "id order { id } paymentCollection { id paymentSessions { id isSelected data paymentProvider { id code getPaymentStatusFunction } } }" });
  if (cart?.order?.id) throw new Error("Placed orders require the order correction workflow");
  const session = cart?.paymentCollection?.paymentSessions?.find((row: any) => row.id === paymentSessionId);
  if (!session) throw new Error("Payment session does not belong to this cart");
  if (!session.isSelected && session.data?.state === "cancelled") return { success: true, error: null };
  const manual = session.paymentProvider?.code === "pp_system_default" || session.paymentProvider?.code?.startsWith("pp_manual");
  const reference = session.data?.paymentIntentId || session.data?.orderId;
  if (!manual && !reference) throw new Error("Provider outcome is uncertain; recover the original initiation before cancellation");
  await (context.prisma as any).$transaction(async (tx: any) => {
    const current = await tx.paymentSession.findUnique({ where: { id: session.id } });
    if (current?.data?.state === "finalizing") throw new Error("Checkout capture is in flight; retry order completion to reconcile it first");
    await tx.paymentSession.update({ where: { id: session.id }, data: { data: { ...current.data, state: "cancelling" } } });
  }, { isolationLevel: "Serializable" });
  let outcome;
  try { outcome = manual ? { status: "cancelled" } : await cancelPayment({ provider: session.paymentProvider, paymentId: reference, idempotencyKey: `cancel:${session.id}` }); }
  catch (error) {
    const current = await (context.prisma as any).paymentSession.findUnique({ where: { id: session.id } });
    await (context.prisma as any).paymentSession.update({ where: { id: session.id }, data: { data: { ...current.data, state: "unknown" } } });
    throw error;
  }
  if (!["cancelled", "abandoned"].includes(outcome.status)) {
    const current = await (context.prisma as any).paymentSession.findUnique({ where: { id: session.id } });
    await (context.prisma as any).paymentSession.update({ where: { id: session.id }, data: { data: { ...current.data, state: "ready" } } });
    throw new Error("Payment is authorized or paid; reconcile the original checkout instead of changing its quote");
  }
  await (context.prisma as any).$transaction(async (tx: any) => {
    const currentCart = await tx.cart.findUnique({ where: { id: cartId } });
    if (currentCart?.orderId) throw new Error("Checkout completed concurrently; use the order correction workflow");
    const current = await tx.paymentSession.findUnique({ where: { id: session.id } });
    await tx.paymentSession.update({ where: { id: session.id }, data: { isSelected: false, isInitiated: false, data: { ...current.data, state: "cancelled", cancellation: outcome.status } } });
  }, { isolationLevel: "Serializable" });
  return { success: true, error: null };
}

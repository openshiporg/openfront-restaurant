import crypto from "node:crypto";
import { throttleClient } from "../utils/throttleClient";
import Stripe from "stripe";
import { GraphQLError } from "graphql";
import type { Context } from ".keystone/types";
import { appendAuditEventWithClient } from "../utils/audit";
import { enqueueRestaurantNotification } from "../utils/restaurantNotifications";
import { issueReceiptWithClient } from "../utils/receipt";
import { assertCanAccessCart } from "../utils/cartAccess";
import { assertReservationWindow } from "../utils/serviceSeating";
import { serviceTransaction } from "../utils/serviceOrderState";
import { isPaymentProviderConfigured } from "../utils/paymentProviderConfig";
import { addDays, pickTable, reservationCode, reservationSlots, venueDateString } from "../../lib/venue-time";
import { normalizePromoCode, priceWithPromo } from "../../lib/storefront-promo";

/** Expected, guest-facing failure. Keystone masks plain errors, so these travel as results. */
class UserError extends Error {}
function guarded<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R | { success: false; message: string }> => {
    try { return await fn(...args); }
    catch (error) {
      if (error instanceof UserError || isRateLimited(error)) return { success: false, message: (error as Error).message };
      throw error;
    }
  };
}

const RESERVATION_DURATION = 90;
const MAX_ADVANCE_DAYS = 60;
const GIFT_MIN = 1000;
const GIFT_MAX = 50000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a minute and try again.";
/** A GraphQLError is not masked as "Unexpected error." by Yoga, so unwrapped lookups get a clear refusal. */
function rateLimited() {
  return new GraphQLError(RATE_LIMIT_MESSAGE, { extensions: { code: "RATE_LIMITED" } });
}
function isRateLimited(error: unknown) {
  return error instanceof GraphQLError && error.extensions?.code === "RATE_LIMITED";
}

const hits = new Map<string, number[]>();
/** Small per-client limiter for unauthenticated lookups; one process, best effort. */
function throttle(context: Context, bucket: string, limit: number, windowMs = 60_000) {
  const client = throttleClient(context.req);
  const key = `${bucket}:${client}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) throw rateLimited();
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}

/** Guest confirmations go out right after the commit (only with SMTP configured); staff can still resend. */
async function sendGuestEmailNow(context: Context, eventKey: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return;
  try {
    const [{ deliverSystemNotificationNow }, { smtpNotificationTransport }] = await Promise.all([
      import("../utils/restaurantNotifications"),
      import("../../integrations/notifications/smtp"),
    ]);
    await deliverSystemNotificationNow(context.sudo() as Context, eventKey, smtpNotificationTransport);
  } catch { /* stays queued in Notifications */ }
}

async function venue(context: Context) {
  const settings: any = await context.sudo().query.StoreSettings.findOne({ where: { id: "1" }, query: "name timezone hours currencyCode" });
  if (!settings?.timezone || !settings?.hours) throw new UserError("Reservations are not available right now.");
  return settings;
}

async function dayData(prisma: any, date: string, timezone: string) {
  const from = new Date(Date.parse(`${addDays(date, -1)}T00:00:00Z`) - 36 * 3600_000);
  const to = new Date(Date.parse(`${addDays(date, 2)}T00:00:00Z`) + 36 * 3600_000);
  const [tables, reservations] = await Promise.all([
    prisma.table.findMany({ select: { id: true, capacity: true, status: true } }),
    prisma.reservation.findMany({
      where: { status: { in: ["pending", "confirmed", "seated"] }, reservationDate: { gte: from, lt: to } },
      select: { assignedTableId: true, reservationDate: true, duration: true },
      take: 5000,
    }),
  ]);
  void timezone;
  return { tables, reservations };
}

function checkDate(date: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Choose a valid date.");
  const today = venueDateString(new Date(), timezone);
  if (date < today || date > addDays(today, MAX_ADVANCE_DAYS)) throw new UserError("Choose a date within the next two months.");
}

async function reservationAvailabilityRaw(_root: unknown, { date, partySize }: { date: string; partySize: number }, context: Context) {
  const settings = await venue(context);
  checkDate(date, settings.timezone);
  const prisma = context.prisma as any;
  const { tables, reservations } = await dayData(prisma, date, settings.timezone);
  const maxParty = tables.reduce((max: number, t: any) => Math.max(max, t.capacity), 0);
  if (!Number.isInteger(partySize) || partySize < 1) throw new UserError("Choose a party size.");
  if (partySize > maxParty) return { slots: [], maxParty, duration: RESERVATION_DURATION, timezone: settings.timezone };
  const slots = reservationSlots({ date, hours: settings.hours, timezone: settings.timezone, partySize, duration: RESERVATION_DURATION, tables, reservations });
  return { slots: slots.map(({ time, startsAt }) => ({ time, startsAt })), maxParty, duration: RESERVATION_DURATION, timezone: settings.timezone };
}

async function createGuestReservationRaw(
  _root: unknown,
  args: { date: string; startsAt: string; partySize: number; name: string; email: string; phone: string; notes?: string | null },
  context: Context,
) {
  throttle(context, "reserve", 8);
  const settings = await venue(context);
  const name = args.name?.trim(), email = args.email?.trim().toLowerCase(), phone = args.phone?.trim();
  if (!name) throw new UserError("Please enter your name.");
  if (!EMAIL.test(email || "")) throw new UserError("Please enter a valid email.");
  if (!phone || phone.replace(/\D/g, "").length < 7) throw new UserError("Please enter a phone number.");
  checkDate(args.date, settings.timezone);
  const start = new Date(args.startsAt);
  const prisma = context.prisma as any;
  const created = await serviceTransaction(prisma, async (tx) => {
    const { tables, reservations } = await dayData(tx, args.date, settings.timezone);
    const slots = reservationSlots({ date: args.date, hours: settings.hours, timezone: settings.timezone, partySize: args.partySize, duration: RESERVATION_DURATION, tables, reservations });
    if (!Number.isFinite(start.getTime()) || !slots.some((s) => s.startsAt === start.toISOString())) throw new UserError("That time was just taken. Please choose another.");
    const table = pickTable(tables, reservations, start, RESERVATION_DURATION, args.partySize);
    if (!table) throw new UserError("That time was just taken. Please choose another.");
    await assertReservationWindow(tx, table.id, args.partySize, start, RESERVATION_DURATION);
    const reservation = await tx.reservation.create({
      data: { customerName: name.slice(0, 120), customerEmail: email, customerPhone: phone.slice(0, 40), reservationDate: start, partySize: args.partySize, duration: RESERVATION_DURATION, status: "confirmed", specialRequests: (args.notes || "").trim().slice(0, 500), assignedTableId: table.id },
    });
    const code = reservationCode(reservation.id);
    const storeName = settings.name?.trim() || "the restaurant";
    const when = new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone, dateStyle: "full", timeStyle: "short" }).format(start);
    await appendAuditEventWithClient(tx, null, { eventKey: `guest.reservation_created:${reservation.id}`, eventType: "guest.reservation_created", entityType: "Reservation", entityId: reservation.id, metadata: { email, code } });
    await enqueueRestaurantNotification(tx, null, {
      eventKey: `reservation-confirmation:${reservation.id}`, entityType: "Reservation", entityId: reservation.id, to: email,
      subject: `Your table at ${storeName} is confirmed`,
      text: `Hi ${name},\n\nYour table for ${args.partySize} at ${storeName} is confirmed for ${when}.\nConfirmation code: ${code}\n\nNeed to change it? Call us and quote your code.`,
    });
    return { reservation, code };
  });
  await sendGuestEmailNow(context, `reservation-confirmation:${created.reservation.id}`);
  return { success: true, code: created.code, startsAt: start.toISOString(), partySize: args.partySize, name, timezone: settings.timezone };
}

export async function lookupGiftCardBalance(_root: unknown, { code }: { code: string }, context: Context) {
  throttle(context, "gift-balance", 10);
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !/^[A-Z0-9-]{8,64}$/.test(normalized)) return null;
  const card: any = (await context.sudo().query.GiftCard.findMany({ where: { code: { equals: normalized }, isDisabled: { equals: false } }, query: "balance value endsAt", take: 1 }))[0];
  if (!card || (card.endsAt && new Date(card.endsAt) <= new Date())) return null;
  const settings: any = await context.sudo().query.StoreSettings.findOne({ where: { id: "1" }, query: "currencyCode" });
  return { balance: card.balance, value: card.value, currencyCode: settings?.currencyCode || "USD" };
}

function stripeClient() {
  if (!isPaymentProviderConfigured("pp_stripe")) throw new UserError("Gift cards aren't available online right now.");
  return new Stripe(process.env.STRIPE_SECRET_KEY as string);
}

/** A short order number for a gift-card sale, stable per payment like the card code. */
function giftOrderNumber(paymentIntentId: string) {
  const digest = crypto.createHash("sha256").update(`gift-order:${paymentIntentId}`).digest("hex").toUpperCase();
  return `GC-${digest.slice(0, 8)}-${digest.slice(8, 14)}`;
}

function giftCode(paymentIntentId: string) {
  const digest = crypto.createHash("sha256").update(`gift:${paymentIntentId}`).digest("hex").toUpperCase();
  return `GC-${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}`;
}

async function startGiftCardPurchaseRaw(
  _root: unknown,
  args: { amount: number; purchaserEmail: string; recipientName?: string | null; recipientEmail?: string | null; message?: string | null },
  context: Context,
) {
  throttle(context, "gift-buy", 6);
  const stripe = stripeClient();
  const email = args.purchaserEmail?.trim().toLowerCase();
  const recipientEmail = (args.recipientEmail || "").trim().toLowerCase();
  if (!Number.isSafeInteger(args.amount) || args.amount < GIFT_MIN || args.amount > GIFT_MAX) throw new UserError("Choose an amount between 10 and 500.");
  if (!EMAIL.test(email || "")) throw new UserError("Please enter your email.");
  if (recipientEmail && !EMAIL.test(recipientEmail)) throw new UserError("Please enter a valid recipient email.");
  const settings: any = await context.sudo().query.StoreSettings.findOne({ where: { id: "1" }, query: "currencyCode" });
  const currency = (settings?.currencyCode || "USD").toLowerCase();
  const intent = await stripe.paymentIntents.create({
    amount: args.amount, currency, automatic_payment_methods: { enabled: true }, receipt_email: email,
    metadata: { purpose: "gift_card", purchaserEmail: email, recipientEmail, recipientName: (args.recipientName || "").trim().slice(0, 120), message: (args.message || "").trim().slice(0, 300) },
  });
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id, amount: args.amount, currencyCode: currency.toUpperCase() };
}

/** Issues the card once Stripe reports the payment as succeeded. Safe to call repeatedly. */
async function completeGiftCardPurchaseRaw(_root: unknown, { paymentIntentId }: { paymentIntentId: string }, context: Context) {
  throttle(context, "gift-complete", 20);
  const stripe = stripeClient();
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId || "")) throw new UserError("Payment not found.");
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.metadata?.purpose !== "gift_card") throw new UserError("Payment not found.");
  if (intent.status !== "succeeded") return { status: intent.status === "processing" ? "processing" : "pending", code: null, amount: intent.amount, currencyCode: intent.currency.toUpperCase(), recipientEmail: intent.metadata.recipientEmail || "" };
  const amount = intent.amount_received, currencyCode = intent.currency.toUpperCase(), code = giftCode(intent.id);
  const key = `gift-purchase:${intent.id}`;
  const prisma = context.prisma as any;
  const card = await serviceTransaction(prisma, async (tx) => {
    const existing = await tx.giftCardTransaction.findUnique({ where: { idempotencyKey: key }, include: { giftCard: true } });
    if (existing) return existing.giftCard;
    const order = await tx.restaurantOrder.create({ data: { orderNumber: giftOrderNumber(intent.id), orderType: "takeout", orderSource: "gift_card", status: "completed", subtotal: amount, tax: 0, tip: 0, discount: 0, total: amount, currencyCode, guestCount: 1, customerEmail: intent.metadata.purchaserEmail || "" } });
    const giftCard = await tx.giftCard.create({ data: { code, value: amount, balance: amount, isDisabled: false, orderId: order.id, metadata: { fundingMethod: "stripe", liability: true, currencyCode, paymentIntentId: intent.id, purchaserEmail: intent.metadata.purchaserEmail || "", recipientName: intent.metadata.recipientName || "" } } });
    const tender = await tx.payment.create({ data: { idempotencyKey: key, orderId: order.id, amount, paymentMethod: "credit_card", status: "succeeded", currencyCode, reservedAt: new Date(), processedAt: new Date(), providerPaymentId: intent.id, data: { giftCardId: giftCard.id, purpose: "stored_value_issuance", paymentIntentId: intent.id } } });
    await tx.giftCardTransaction.create({ data: { idempotencyKey: key, type: "issue", amount, balanceAfter: amount, giftCardId: giftCard.id, orderId: order.id } });
    await appendAuditEventWithClient(tx, null, { eventKey: key, eventType: "gift_card.issued", entityType: "GiftCard", entityId: giftCard.id, after: { amount, currencyCode }, metadata: { paymentId: tender.id, orderId: order.id, fundingMethod: "stripe" } });
    await issueReceiptWithClient(tx, null, { kind: "sale", entityId: tender.id, paymentId: tender.id, orderId: order.id, amount, currencyCode, snapshot: { purpose: "stored_value_issuance", giftCardId: giftCard.id, amount, currencyCode, tender: "card" } });
    const store: any = await tx.storeSettings.findUnique({ where: { id: "1" } });
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount / 100);
    const recipient = intent.metadata.recipientEmail || "";
    const note = intent.metadata.message ? `\n\n"${intent.metadata.message}"` : "";
    if (recipient) await enqueueRestaurantNotification(tx, null, { eventKey: `gift-delivery:${giftCard.id}`, entityType: "GiftCard", entityId: giftCard.id, to: recipient, subject: `You've received a ${money} gift card for ${store?.name || "our restaurant"}`, text: `${intent.metadata.recipientName ? `Hi ${intent.metadata.recipientName},\n\n` : ""}You've been given a ${money} gift card for ${store?.name || "our restaurant"}.${note}\n\nYour code: ${code}\n\nEnter it at checkout or show it when you visit.` });
    if (intent.metadata.purchaserEmail) await enqueueRestaurantNotification(tx, null, { eventKey: `gift-receipt:${giftCard.id}`, entityType: "GiftCard", entityId: giftCard.id, to: intent.metadata.purchaserEmail, subject: `Your ${money} gift card`, text: `Thank you for your purchase.\n\nGift card code: ${code}\nValue: ${money}${recipient ? `\nSent to: ${recipient}` : ""}` });
    return giftCard;
  });
  await sendGuestEmailNow(context, `gift-delivery:${card.id}`);
  await sendGuestEmailNow(context, `gift-receipt:${card.id}`);
  return { status: "issued", code: card.code, amount: card.value, currencyCode, recipientEmail: intent.metadata.recipientEmail || "" };
}

export async function lookupGuestOrder(_root: unknown, { orderNumber, email }: { orderNumber: string; email: string }, context: Context) {
  throttle(context, "order-lookup", 10);
  const number = orderNumber?.trim().toUpperCase().replace(/^#/, "");
  const address = email?.trim().toLowerCase();
  if (!number || !EMAIL.test(address || "")) return null;
  const order: any = (await context.sudo().query.RestaurantOrder.findMany({ where: { orderNumber: { equals: number } }, query: "id secretKey customerEmail customer { id }", take: 1 }))[0];
  if (!order || String(order.customerEmail || "").trim().toLowerCase() !== address) return null;
  let secretKey = order.secretKey || "";
  if (!secretKey) {
    // Signed-in customers' orders have no key; mint one so the lookup link works for the email holder.
    secretKey = crypto.randomBytes(32).toString("hex");
    await (context.prisma as any).restaurantOrder.update({ where: { id: order.id }, data: { secretKey } });
  }
  return { id: order.id, secretKey };
}

async function currentPromo(prisma: any, cartId: string) {
  const events = await prisma.auditEvent.findMany({ where: { entityType: "Cart", entityId: cartId, eventType: { in: ["cart.promo_applied", "cart.promo_removed"] } }, orderBy: { occurredAt: "desc" }, take: 1 });
  const latest = events[0];
  return latest?.eventType === "cart.promo_applied" ? String(latest.metadata?.code || "") : null;
}

/** The promo currently on a cart, priced against its subtotal, or null when none is valid. */
export async function resolveCartPromo(prisma: any, cartId: string, subtotal: number, pickupDiscount: number) {
  const code = await currentPromo(prisma, cartId);
  if (!code) return null;
  const discount = await prisma.discount.findFirst({ where: { code }, include: { discountRule: true } });
  const priced = priceWithPromo(discount, { subtotal, pickupDiscount });
  return priced.ok ? { code, discountId: discount.id as string, amount: priced.amount } : null;
}

export async function applyPromoCode(_root: unknown, { cartId, code }: { cartId: string; code: string }, context: Context) {
  await assertCanAccessCart(context, cartId, "write");
  throttle(context, "promo", 12);
  const normalized = normalizePromoCode(code);
  if (!normalized) return { success: false, message: "Enter a code.", code: null, amount: 0 };
  const prisma = context.prisma as any;
  const cart: any = await context.sudo().query.Cart.findOne({ where: { id: cartId }, query: "id orderType order { id } subtotal paymentCollection { paymentSessions { isSelected data } }" });
  if (!cart || cart.order?.id) throw new UserError("Cart not found");
  if (cart.paymentCollection?.paymentSessions?.some((s: any) => s.isSelected && s.data?.checkoutQuote && ["initializing", "provider_pending", "ready", "unknown", "finalizing", "cancelling"].includes(s.data?.state))) {
    return { success: false, message: "Cancel the unpaid checkout to change your code.", code: null, amount: 0 };
  }
  const settings: any = await context.sudo().query.StoreSettings.findOne({ where: { id: "1" }, query: "pickupDiscount" });
  const subtotal = Number(cart.subtotal || 0);
  const pickupDiscount = cart.orderType === "pickup" ? Math.round(subtotal * (Number(settings?.pickupDiscount || 0) / 100)) : 0;
  const discount = await prisma.discount.findFirst({ where: { code: normalized }, include: { discountRule: true } });
  const priced = priceWithPromo(discount, { subtotal, pickupDiscount });
  if (!priced.ok) return { success: false, message: priced.message, code: null, amount: 0 };
  await appendAuditEventWithClient(prisma, null, { eventType: "cart.promo_applied", entityType: "Cart", entityId: cartId, metadata: { code: normalized, discountId: discount.id } });
  return { success: true, message: null, code: normalized, amount: priced.amount };
}

export async function removePromoCode(_root: unknown, { cartId }: { cartId: string }, context: Context) {
  await assertCanAccessCart(context, cartId, "write");
  const prisma = context.prisma as any;
  const cart: any = await context.sudo().query.Cart.findOne({ where: { id: cartId }, query: "id paymentCollection { paymentSessions { isSelected data } }" });
  if (cart?.paymentCollection?.paymentSessions?.some((s: any) => s.isSelected && s.data?.checkoutQuote && ["initializing", "provider_pending", "ready", "unknown", "finalizing", "cancelling"].includes(s.data?.state))) {
    return { success: false, message: "Cancel the unpaid checkout to change your code.", code: null, amount: 0 };
  }
  if (await currentPromo(prisma, cartId)) await appendAuditEventWithClient(prisma, null, { eventType: "cart.promo_removed", entityType: "Cart", entityId: cartId });
  return { success: true, message: null, code: null, amount: 0 };
}

export async function cartPromo(_root: unknown, { cartId }: { cartId: string }, context: Context) {
  await assertCanAccessCart(context, cartId, "read");
  const cart: any = await context.sudo().query.Cart.findOne({ where: { id: cartId }, query: "subtotal orderType" });
  const settings: any = await context.sudo().query.StoreSettings.findOne({ where: { id: "1" }, query: "pickupDiscount" });
  const subtotal = Number(cart?.subtotal || 0);
  const pickupDiscount = cart?.orderType === "pickup" ? Math.round(subtotal * (Number(settings?.pickupDiscount || 0) / 100)) : 0;
  const promo = await resolveCartPromo(context.prisma, cartId, subtotal, pickupDiscount);
  return promo ? { code: promo.code, amount: promo.amount } : null;
}

export const reservationAvailability = guarded(reservationAvailabilityRaw);

export const createGuestReservation = guarded(createGuestReservationRaw);

export const startGiftCardPurchase = guarded(startGiftCardPurchaseRaw);

export const completeGiftCardPurchase = guarded(completeGiftCardPurchaseRaw);

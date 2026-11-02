// Returning guests. Guest checkout creates a User per checkout (hasAccount:false, a random password
// nobody knows) and signs it in, so it can read its own addresses and carts. The email column is
// unique, so a second guest checkout with the same email used to fail with "already has an account".
//
// The old guest record is never reused or signed in to: that would hand the next visitor the first
// guest's addresses and carts. It is retired instead: its email is replaced with an unroutable
// tombstone, which frees the address for the new guest record. Its carts and orders stay on it and are
// reachable only by the browser session that created it (and by the secret-key order links already
// emailed).
//
// Only records provably created by the guest flow are retired. hasAccount arrived with this change, so
// every row created before GUEST_FLAG_EPOCH (old guests AND old sign-ups, which the data cannot tell
// apart) is left alone, as are staff and anyone with a role.
export const GUEST_FLAG_EPOCH = new Date(process.env.GUEST_FLAG_EPOCH || "2026-11-02T21:59:00.000Z");

type GuestCandidate = {
  id: string;
  hasAccount: boolean | null;
  createdAt: Date | string | null;
  roleId?: string | null;
  staffRole?: string | null;
  employeeId?: string | null;
};

export function isRetirableGuest(user: GuestCandidate | null | undefined, epoch: Date = GUEST_FLAG_EPOCH): boolean {
  if (!user || user.hasAccount !== false) return false;
  if (user.roleId || user.staffRole || user.employeeId) return false;
  const created = user.createdAt ? new Date(user.createdAt).getTime() : NaN;
  return Number.isFinite(created) && created >= epoch.getTime();
}

export function retiredGuestEmail(id: string) {
  return `retired-guest+${id}@guest.invalid`;
}

/** Frees `email` for a new guest/registration when the current holder is a retirable guest. */
export async function retireReturningGuest(prisma: any, email: unknown, epoch: Date = GUEST_FLAG_EPOCH): Promise<boolean> {
  const normalized = String(email || "").trim();
  if (!normalized) return false;
  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, hasAccount: true, createdAt: true, roleId: true, staffRole: true, employeeId: true },
  });
  if (!isRetirableGuest(existing, epoch)) return false;
  await prisma.user.update({ where: { id: existing.id }, data: { email: retiredGuestEmail(existing.id) } });
  return true;
}

/**
 * Public (non-manager) user creation: hasAccount is only ever true when the caller explicitly sends
 * true (storefront sign-up). It is a display/guest flag and grants no privileges.
 */
export function resolvePublicHasAccount(inputData: Record<string, unknown> | undefined): boolean {
  return inputData?.hasAccount === true;
}

/**
 * Guest checkout creates a NEW user per checkout after the cart exists and signs it in, so the cart's
 * user is a guest, not a customer account. The order must be marked guest (no customer link, a
 * secret-key link for its order page). A registered customer is hasAccount true, or (legacy rows) was
 * created before this cart.
 */
export function resolveOrderCustomer(cart: { createdAt?: Date | string | null; user?: { id?: string | null; hasAccount?: boolean | null; createdAt?: Date | string | null } | null }): { customerId: string | undefined; isGuest: boolean } {
  const customer = cart.user;
  if (!customer?.id) return { customerId: undefined, isGuest: true };
  const createdAt = customer.createdAt ? new Date(customer.createdAt).getTime() : NaN;
  const cartCreatedAt = cart.createdAt ? new Date(cart.createdAt).getTime() : NaN;
  const isGuest = customer.hasAccount === false && Number.isFinite(createdAt) && Number.isFinite(cartCreatedAt) && createdAt >= cartCreatedAt;
  return { customerId: isGuest ? undefined : customer.id, isGuest };
}

import type { Context } from ".keystone/types";

/** Ownership, checkout reservation checks, and child writes share one snapshot.
 * A Cart write also conflicts with checkout's claim even when only a line changes.
 * No provider operations belong in this retryable transaction. */
export async function cartMutationTransaction<T>(context: Context, operation: (tx: Context) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await (context.transaction as any)(operation, { isolationLevel: "Serializable" });
    } catch (error: any) {
      if (error?.code !== "P2034" || attempt >= 2) throw error;
    }
  }
}

export async function touchMutableCart(context: Context, cartId: string) {
  await context.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
}

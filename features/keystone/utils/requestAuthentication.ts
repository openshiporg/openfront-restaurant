const bcrypt = require("bcryptjs") as { compare(value: string, hash: string): Promise<boolean> };
import { apiKeyIsUsable } from "./apiKeyPolicy";

export async function refreshHumanSession(context: any, session: any) {
  if (session?.listKey !== "User" || !session.itemId || session.apiKeyId || session.apiKeyScopes) return undefined;
  const user = await context.sudo().db.User.findOne({ where: { id: session.itemId } });
  return user?.isActive === true ? session : undefined;
}

export async function authenticateApiKey(context: any, token: string, now = Date.now()) {
  if (!/^of_[A-Za-z0-9_-]{32,128}$/.test(token)) return undefined;
  const keys = await context.sudo().db.ApiKey.findMany({
    where: { tokenPreview: { equals: `${token.slice(0, 12)}...` }, status: { equals: "active" } }, take: 10,
  });
  for (const key of keys) {
    if (!apiKeyIsUsable(key, context.req, now) || typeof key.tokenSecret !== "string") continue;
    if (!await bcrypt.compare(token, key.tokenSecret)) continue;
    const user = await context.sudo().db.User.findOne({ where: { id: key.userId } });
    if (user?.isActive !== true) return undefined;
    // Authentication has no populated session yet: a narrow metadata update intentionally
    // bypasses list hooks that validate manager-selected scopes against the current actor.
    await context.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(now) } });
    // withAuth loads current User/Role data. Every permission is additionally intersected with these scopes.
    return { listKey: "User", itemId: user.id, apiKeyId: key.id, apiKeyScopes: key.scopes };
  }
  return undefined;
}

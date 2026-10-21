import { isSignedIn } from "../access";

async function updateActiveUser(root: any, { data }: { data: any }, context: any) {
  const profileContext = context;

  // Check if user is authenticated
  const session = context.session;
  if (!isSignedIn({ session })) {
    throw new Error("Not authenticated");
  }

  // Get current user
  const existingUser = await profileContext.query.User.findOne({
    where: { id: session.itemId }
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  const allowed = new Set(["email", "name", "phone", "password", "onboardingStatus"]);
  if (Object.keys(data || {}).some(key => !allowed.has(key))) throw new Error("Unsupported profile field");
  // Update through normal access and hooks.
  return await profileContext.db.User.updateOne({
    where: { id: session.itemId },
    data,
  });
}

export default updateActiveUser;

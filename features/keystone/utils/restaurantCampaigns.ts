/** Consent is affirmative, purpose-specific and revocable. No consent is not consent. */
export async function eligibleCampaignRecipient(tx: any, customerId: string, expectedEmail?: string) {
  const customer = await tx.user.findUnique({ where: { id: customerId }, select: { id: true, email: true, isActive: true, staffRole: true } });
  if (!customer?.isActive || customer.staffRole || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || "") || (expectedEmail && customer.email.toLowerCase() !== expectedEmail.toLowerCase())) return null;
  const latest = await tx.auditEvent.findFirst({ where: { entityType: "CustomerPrivacy", entityId: customerId, eventType: { in: ["privacy.marketing_opt_in", "privacy.marketing_opt_out", "privacy.request_erasure"] } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
  if (latest?.eventType !== "privacy.marketing_opt_in" || latest.after?.purpose !== "restaurant_marketing" || latest.after?.channel !== "authenticated_account") return null;
  return { id: customer.id, email: customer.email, consentEventId: latest.id };
}

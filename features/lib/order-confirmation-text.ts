/** Guest-facing "order received" email body: money as money, the order type in words, and a link to the order. */
export function orderReceivedText(input: {
  storeName?: string | null;
  orderType: string;
  orderNumber: string;
  total: number;
  currencyCode?: string | null;
  paid: boolean;
  scheduledLabel?: string | null;
  statusUrl?: string | null;
}) {
  const store = input.storeName?.trim() || "the restaurant";
  const kind = input.orderType === "delivery" ? "delivery" : input.orderType === "dine_in" ? "dine-in" : "pickup";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: (input.currencyCode || "USD").toUpperCase() }).format(input.total / 100);
  return [
    `Thanks for your order from ${store}.`,
    "",
    `Order ${input.orderNumber} (${kind}) is in.`,
    input.scheduledLabel ? `Scheduled for ${input.scheduledLabel}.` : null,
    `Total ${money}${input.paid ? ", paid by card" : ""}.`,
    input.statusUrl ? `\nTrack your order: ${input.statusUrl}` : null,
    "",
    "Need to change something? Contact the restaurant and quote your order number.",
  ].filter((line) => line !== null).join("\n");
}

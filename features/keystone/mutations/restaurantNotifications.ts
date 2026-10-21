import type { Context } from ".keystone/types";
import { deliverQueuedNotification } from "../utils/restaurantNotifications";
import { smtpNotificationTransport } from "../../integrations/notifications/smtp";
export { restaurantNotifications, acknowledgeRestaurantNotification } from "../utils/restaurantNotifications";
export async function sendRestaurantNotification(_root: unknown, { notificationId, retryUnknown }: { notificationId: string; retryUnknown?: boolean }, context: Context) {
  return deliverQueuedNotification(context, notificationId, smtpNotificationTransport, retryUnknown === true);
}

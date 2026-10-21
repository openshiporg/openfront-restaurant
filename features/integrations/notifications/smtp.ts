import { createTransport } from "nodemailer";
import type { NotificationTransport } from "../../keystone/utils/restaurantNotifications";
/** SMTP acceptance is recorded as accepted, never asserted as inbox delivery. */
export const smtpNotificationTransport: NotificationTransport = async message => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { accepted: false };
  const transport = createTransport({ host: process.env.SMTP_HOST, port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined, connectionTimeout: 10000, socketTimeout: 20000, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  const result = await transport.sendMail({ ...message, from: process.env.SMTP_FROM });
  return { accepted: !!result.accepted?.length, reference: result.messageId };
};

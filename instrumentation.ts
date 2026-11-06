// Fires order-ahead (scheduled) orders to the kitchen at their start time, inside the production
// server process, so no separate worker service is needed. Release is claim-safe (a conditional
// update per order), so several replicas — and the KDS poll, which also releases — can run side by side.
const INTERVAL_MS = 30_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return
  const globalState = globalThis as unknown as { scheduledOrderLoop?: boolean }
  if (globalState.scheduledOrderLoop) return
  globalState.scheduledOrderLoop = true

  let running = false
  let passes = 0
  const pass = async () => {
    if (running) return
    running = true
    try {
      const [{ keystoneContext }, { releaseDueScheduledOrders }] = await Promise.all([
        import('./features/keystone/context'),
        import('./features/keystone/utils/kitchenTicketSync'),
      ])
      await releaseDueScheduledOrders(keystoneContext.sudo() as any)
      // Reservation reminders: every 10th pass (~5 minutes), only with SMTP configured.
      passes += 1
      if (passes % 10 === 1 && process.env.SMTP_HOST && process.env.SMTP_FROM) {
        const [{ sendDueReservationReminders }, { smtpNotificationTransport }] = await Promise.all([
          import('./features/keystone/utils/restaurantNotifications'),
          import('./features/integrations/notifications/smtp'),
        ])
        await sendDueReservationReminders(keystoneContext.sudo() as any, smtpNotificationTransport)
      }
    } catch {
      console.error('[scheduled-orders] release pass failed; retrying on the next interval')
    } finally {
      running = false
    }
  }
  setInterval(() => { void pass() }, INTERVAL_MS).unref?.()
  setTimeout(() => { void pass() }, 10_000).unref?.()
}

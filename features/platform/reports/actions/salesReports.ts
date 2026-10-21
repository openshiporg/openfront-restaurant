'use server';

import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export async function getSalesOverview(
  startDate: string, 
  endDate: string, 
  previousStartDate?: string, 
  previousEndDate?: string
) {
  const query = `
    query GetSalesOverview($startDate: DateTime!, $endDate: DateTime!, $previousStartDate: DateTime, $previousEndDate: DateTime) {
      restaurantOrders(
        where: {
          createdAt: { gte: $startDate, lte: $endDate }
          status: { notIn: ["cancelled"] }
        }
        orderBy: { createdAt: desc }
      ) {
        id
        orderNumber
        orderType
        orderSource
        status
        guestCount
        physicalGuestCount
        subtotal
        tax
        tip
        discount
        total
        payments { amount status refundedAmount }
        createdAt
        tables {
          id
          tableNumber
        }
        server {
          id
          name
        }
        orderItems {
          id
          quantity
          price
          isVoided
          adjustmentTotal
          itemNameSnapshot
          modifiersSnapshot
          menuItem {
            id
            name
            category {
              id
              name
            }
          }
        }
      }
      restaurantOrdersCount(
        where: {
          createdAt: { gte: $startDate, lte: $endDate }
          status: { notIn: ["cancelled"] }
        }
      )
      previousOrders: restaurantOrders(
        where: {
          createdAt: { gte: $previousStartDate, lte: $previousEndDate }
          status: { notIn: ["cancelled"] }
        }
      ) {
        id
        orderType
        orderSource
        status
        guestCount
        physicalGuestCount
        total
        payments { amount status refundedAmount }
        createdAt
      }
      previousOrdersCount: restaurantOrdersCount(
        where: {
          createdAt: { gte: $previousStartDate, lte: $previousEndDate }
          status: { notIn: ["cancelled"] }
        }
      )
    }
  `;

  return await keystoneClient(query, { 
    startDate, 
    endDate, 
    previousStartDate: previousStartDate || startDate,
    previousEndDate: previousEndDate || endDate
  });
}

export async function getPaymentBreakdown(startDate: string, endDate: string) {
  const query = `
    query GetPaymentBreakdown($startDate: DateTime!, $endDate: DateTime!) {
      payments(
        where: {
          createdAt: { gte: $startDate, lte: $endDate }
          status: { in: ["succeeded", "partially_refunded", "refunded"] }
        }
      ) {
        id
        amount
        refundedAmount
        status
        paymentMethod
        tipAmount
        createdAt
        order {
          id
          orderNumber
        }
      }
      paymentsCount(
        where: {
          createdAt: { gte: $startDate, lte: $endDate }
          status: { in: ["succeeded", "partially_refunded", "refunded"] }
        }
      )
    }
  `;

  return await keystoneClient(query, { startDate, endDate });
}

export async function getMenuItemPerformance(startDate: string, endDate: string) {
  const query = `
    query GetMenuItemPerformance($startDate: DateTime!, $endDate: DateTime!) {
      orderItems(
        where: {
          order: {
            createdAt: { gte: $startDate, lte: $endDate }
            status: { equals: "completed" }
          }
        }
      ) {
        id
        quantity
        price
        isVoided
        adjustmentTotal
        itemNameSnapshot
        modifiersSnapshot
        menuItem {
          id
          name
          price
          category {
            id
            name
          }
        }
        order {
          id
          createdAt
        }
      }
    }
  `;

  return await keystoneClient(query, { startDate, endDate });
}

export async function getServerPerformance(startDate: string, endDate: string) {
  const query = `
    query GetServerPerformance($startDate: DateTime!, $endDate: DateTime!) {
      users(
        where: {
          restaurantOrders: { some: {
            createdAt: { gte: $startDate, lte: $endDate }
            status: { equals: "completed" }
          } }
        }
      ) {
        id
        name
        email
      }
      restaurantOrders(
        where: {
          createdAt: { gte: $startDate, lte: $endDate }
          status: { equals: "completed" }
        }
      ) {
        id
        total
        tip
        guestCount
        physicalGuestCount
        server {
          id
          name
        }
      }
    }
  `;

  return await keystoneClient(query, { startDate, endDate });
}

export async function getCategoryPerformance(startDate: string, endDate: string) {
  const query = `
    query GetCategoryPerformance($startDate: DateTime!, $endDate: DateTime!) {
      menuCategories {
        id
        name
      }
      restaurantOrders(
        where: {
          createdAt: { gte: $startDate, lte: $endDate }
          status: { equals: "completed" }
        }
      ) {
        id
        orderItems(where: { isVoided: { equals: false } }) {
          id
          quantity
          price
          adjustmentTotal
          menuItem {
            id
            name
            category { id name }
          }
        }
      }
    }
  `;

  return await keystoneClient(query, { startDate, endDate });
}

export async function getOperationalMetrics(startDate: string, endDate: string) {
  const query = `
    query GetOperationalMetrics($startDate: DateTime!, $endDate: DateTime!) {
      openOrders: restaurantOrdersCount(
        where: { status: { in: ["open", "sent_to_kitchen", "in_progress", "ready", "dispatched", "served"] } }
      )
      inProgressOrders: restaurantOrdersCount(
        where: { status: { equals: "in_progress" } }
      )
      readyOrders: restaurantOrdersCount(
        where: { status: { equals: "ready" } }
      )
      occupiedTables: tablesCount(
        where: { status: { equals: "occupied" } }
      )
      totalTables: tablesCount
      voidAdjustments: orderAdjustments(where: { type: { equals: "void" }, createdAt: { gte: $startDate, lte: $endDate } }, take: 10001) { metadata order { id } }
      cancelledOrders: restaurantOrdersCount(
        where: { 
          status: { equals: "cancelled" }
          createdAt: { gte: $startDate, lte: $endDate }
        }
      )
      totalRecentOrders: restaurantOrdersCount(
        where: { 
          createdAt: { gte: $startDate, lte: $endDate }
        }
      )
      recentOrders: restaurantOrders(
        where: { 
          status: { equals: "completed" }
          createdAt: { gte: $startDate, lte: $endDate }
        }
        orderBy: { createdAt: desc }
        take: 50
      ) {
        id
        createdAt
        status
        guestCount
        physicalGuestCount
        orderType
      }
      recentTickets: kitchenTickets(
        where: {
          completedAt: { gte: $startDate, lte: $endDate }
          firedAt: { not: null }
        }
        take: 100
      ) {
        id
        firedAt
        startedAt
        completedAt
        status
      }
      activeFloorStaff: shiftsCount(
        where: {
          status: { equals: "started" }
          role: { in: ["server", "bartender", "host", "busser"] }
        }
      )
      openReservations: reservationsCount(
        where: {
          status: { in: ["confirmed", "seated"] }
        }
      )
      waitingGuests: waitlistEntriesCount(
        where: {
          status: { equals: "waiting" }
        }
      )
    }
  `;

  return await keystoneClient(query, { startDate, endDate });
}

export async function getDayFinancialActivity(startDate: string, endDate: string) {
  return keystoneClient(`query($startDate:DateTime!,$endDate:DateTime!){
    payments(where:{processedAt:{gte:$startDate,lte:$endDate},status:{in:["succeeded","partially_refunded","refunded"]}}){id amount status order{orderSource}}
    refunds(where:{processedAt:{gte:$startDate,lte:$endDate},status:{equals:"succeeded"}}){id amount status payment{order{orderSource}}}
  }`, { startDate, endDate });
}

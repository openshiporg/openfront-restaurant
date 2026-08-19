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
        subtotal
        tax
        tip
        discount
        total
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
        status
        guestCount
        total
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
          status: { equals: "succeeded" }
        }
      ) {
        id
        amount
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
          status: { equals: "succeeded" }
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
          restaurantOrders_some: {
            createdAt: { gte: $startDate, lte: $endDate }
            status: { equals: "completed" }
          }
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
        menuItems {
          id
          name
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
          }
        }
      }
    }
  `;

  return await keystoneClient(query, { startDate, endDate });
}

export async function getOperationalMetrics() {
  const query = `
    query GetOperationalMetrics {
      openOrders: restaurantOrdersCount(
        where: { status: { in: ["open", "in_progress"] } }
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
      cancelledOrders: restaurantOrdersCount(
        where: { 
          status: { equals: "cancelled" }
          createdAt: { gte: "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}" }
        }
      )
      totalRecentOrders: restaurantOrdersCount(
        where: { 
          createdAt: { gte: "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}" }
        }
      )
      recentOrders: restaurantOrders(
        where: { 
          status: { equals: "completed" }
          createdAt: { gte: "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}" }
        }
        orderBy: { createdAt: desc }
        take: 50
      ) {
        id
        createdAt
        status
        guestCount
        orderType
      }
      recentTickets: kitchenTickets(
        where: {
          completedAt: { gte: "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}" }
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

  return await keystoneClient(query);
}

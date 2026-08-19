'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export async function getOrders(
  where: Record<string, unknown> = {},
  take: number = 10,
  skip: number = 0,
  orderBy: Array<Record<string, string>> = [{ createdAt: 'desc' }],
  selectedFields: string = `
    id
    orderNumber
    orderType
    orderSource
    status
    total
    createdAt
    updatedAt
    customerName
    customerEmail
    customerPhone
    deliveryAddress
    deliveryAddress2
    deliveryCity
    deliveryState
    deliveryZip
    deliveryCountryCode
    server {
      id
      name
    }
    createdBy {
      id
      name
    }
    tables {
      id
      tableNumber
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
      }
    }
  `
) {
  const query = `
    query GetOrders($where: RestaurantOrderWhereInput, $take: Int!, $skip: Int!, $orderBy: [RestaurantOrderOrderByInput!]) {
      items: restaurantOrders(where: $where, take: $take, skip: $skip, orderBy: $orderBy) {
        ${selectedFields}
      }
      count: restaurantOrdersCount(where: $where)
    }
  `;

  const response = await keystoneClient(query, { where, take, skip, orderBy }, {
    next: { revalidate: 0 }
  });
  return response;
}

export async function getOrder(orderId: string) {
  const query = `
    query GetOrder($id: ID!) {
      restaurantOrder(where: { id: $id }) {
        id
        orderNumber
        orderType
        orderSource
        status
        guestCount
        specialInstructions
        subtotal
        tax
        tip
        discount
        total
        customerName
        customerEmail
        customerPhone
        deliveryAddress
        deliveryAddress2
        deliveryCity
        deliveryState
        deliveryZip
        deliveryCountryCode
        createdAt
        updatedAt
        server {
          id
          name
        }
        createdBy {
          id
          name
        }
        tables {
          id
          tableNumber
        }
        orderItems {
          id
          quantity
          price
          itemNameSnapshot
          itemThumbnailSnapshot
          modifiersSnapshot
          specialInstructions
          menuItem {
            id
            name
          }
        }
        payments {
          id
          amount
          status
          paymentMethod
          createdAt
        }
      }
    }
  `;

  const response = await keystoneClient(query, { id: orderId });
  return response;
}

export async function updateOrderStatus(id: string, status: string) {
  const query = `
    mutation TransitionRestaurantOrder($id: ID!, $status: String!) {
      transitionRestaurantOrder(orderId: $id, status: $status) {
        id
        status
      }
    }
  `;

  const response = await keystoneClient(query, {
    id,
    status
  });

  if (response.success) {
    revalidatePath(`/dashboard/platform/orders/${id}`);
    revalidatePath('/dashboard/platform/orders');
  }

  return response;
}

export async function getOrderStatusCounts() {
  const query = `
    query GetOrderStatusCounts {
      open: restaurantOrdersCount(where: { status: { equals: "open" } })
      sent_to_kitchen: restaurantOrdersCount(where: { status: { equals: "sent_to_kitchen" } })
      in_progress: restaurantOrdersCount(where: { status: { equals: "in_progress" } })
      ready: restaurantOrdersCount(where: { status: { equals: "ready" } })
      served: restaurantOrdersCount(where: { status: { equals: "served" } })
      completed: restaurantOrdersCount(where: { status: { equals: "completed" } })
      cancelled: restaurantOrdersCount(where: { status: { equals: "cancelled" } })
      all: restaurantOrdersCount
    }
  `;

  const response = await keystoneClient(query, {}, {
    next: { revalidate: 0 }
  });
  return response;
}

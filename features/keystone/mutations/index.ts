import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import updateActiveUser from "./updateActiveUser";
import processPayment, { capturePaymentMutation, getPaymentStatus, reconcilePaymentMutation } from "./processPayment";
import redeemGiftCard, { lookupGiftCard } from "./redeemGiftCard";
import refundPayment from "./refundPayment";
import { splitCheckByItem, splitCheckByGuest } from "./splitCheck";
import { voidOrderItem, compOrderItem, voidOrder } from "./voidComp";
import initiatePaymentSession from "./initiatePaymentSession";
import completeActiveCart from "./completeActiveCart";
import activeCart from "./activeCart";
import createActiveCart from "./createActiveCart";
import addActiveCartItem from "./addActiveCartItem";
import updateActiveCart from "./updateActiveCart";
import updateCartItemQuantity from "./updateCartItemQuantity";
import removeCartItem from "./removeCartItem";
import getCustomerOrder from "./getCustomerOrder";
import getCustomerOrders from "./getCustomerOrders";
import activeCartPaymentProviders from "../queries/activeCartPaymentProviders";
import { transferTable, combineTables } from "./tableManagement";
import { fireCourse, recallCourse } from "./courseManagement";
import { syncKitchenTickets, updateKitchenTicketStatus, fulfillKitchenTicketItem } from "./kdsTickets";
import handlePaymentProviderWebhook from "./handlePaymentProviderWebhook";
import createPOSOrder from "./createPOSOrder";
import addServiceFloorItem from "./addServiceFloorItem";
import updateServiceFloorItem from "./updateServiceFloorItem";
import { updateServiceFloorCheckStatus, updateServiceFloorTableStatus } from "./serviceFloorTable";
import { createWaitlistEntry, updateWaitlistStatus } from "./waitlistManagement";
import { updateReservationStatus, upsertReservation } from "./reservationManagement";
import { updateShiftStatus, upsertShift } from "./shiftManagement";
import { createTipPoolLedger, updateTipPoolStatus } from "./tipManagement";
import { adjustInventory, recordWaste, reverseWaste } from "./wasteManagement";
import reconcileOrderInventory from "./reconcileOrderInventory";
import transitionRestaurantOrder from "./transitionRestaurantOrder";
import setGiftCardStatus from "./setGiftCardStatus";
import { requestManagerApproval, approveManagerApproval } from "./managerApprovals";

const graphql = String.raw;

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      input UserUpdateProfileInput {
        email: String
        name: String
        phone: String
        password: String
        onboardingStatus: String
      }

      input ActiveCartUpdateInput {
        orderType: String
        email: String
        customerName: String
        customerPhone: String
        deliveryAddress: String
        deliveryAddress2: String
        deliveryCity: String
        deliveryState: String
        deliveryZip: String
        deliveryCountryCode: String
        tipPercent: String
        userId: ID
      }

      input ActiveCartItemInput {
        menuItemId: ID!
        quantity: Int!
        modifierIds: [ID!]
        specialInstructions: String
      }

      type Query {
        redirectToInit: Boolean
        getPaymentStatus(paymentIntentId: String!): GetPaymentStatusResult
        activeCart(cartId: ID!): JSON
        activeCartPaymentProviders: [PaymentProvider!]
        getCustomerOrder(orderId: ID!, secretKey: String): JSON
        getCustomerOrders(limit: Int, offset: Int): JSON
        lookupGiftCard(code: String!): JSON
      }

      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        createActiveCart(orderType: String): Cart
        addActiveCartItem(cartId: ID!, input: ActiveCartItemInput!): Cart
        updateActiveCart(cartId: ID!, data: ActiveCartUpdateInput!): Cart
        updateCartItemQuantity(cartItemId: ID!, quantity: Int!): Cart
        removeCartItem(cartItemId: ID!): Cart

        processPayment(
          orderId: String!
          amount: Int
          paymentMethod: String!
          tipAmount: Int
          idempotencyKey: String!
        ): ProcessPaymentResult

        setGiftCardStatus(giftCardId: ID!, isDisabled: Boolean!, reason: String): GiftCard

        redeemGiftCard(
          orderId: String!
          code: String!
          tipAmount: Int
          idempotencyKey: String!
        ): GiftCardRedemptionResult

        refundPayment(
          paymentId: ID!
          amount: Int
          reason: String!
          idempotencyKey: String!
          managerApproval: Boolean @deprecated(reason: "Caller assertions do not constitute approval")
          managerApprovalId: ID
        ): RefundPaymentResult

        capturePayment(
          paymentIntentId: String!
        ): CapturePaymentResult

        reconcilePayment(paymentId: ID!): CapturePaymentResult

        splitCheckByItem(
          orderId: String!
          itemIds: [String!]!
        ): SplitCheckResult

        splitCheckByGuest(
          orderId: String!
          guestCount: Int!
        ): SplitCheckResult

        voidOrderItem(
          orderItemId: String!
          reason: String!
          managerApproval: Boolean @deprecated(reason: "Caller assertions do not constitute approval")
          managerId: String @deprecated(reason: "Use managerApprovalId")
          managerApprovalId: ID
          idempotencyKey: String
        ): VoidCompResult

        compOrderItem(
          orderItemId: String!
          reason: String!
          compAmount: Int
          managerApproval: Boolean @deprecated(reason: "Caller assertions do not constitute approval")
          managerId: String @deprecated(reason: "Use managerApprovalId")
          managerApprovalId: ID
          idempotencyKey: String
        ): VoidCompResult

        voidOrder(
          orderId: String!
          reason: String!
          managerApproval: Boolean @deprecated(reason: "Caller assertions do not constitute approval")
          managerId: String @deprecated(reason: "Use managerApprovalId")
          managerApprovalId: ID
          idempotencyKey: String
        ): VoidCompResult

        requestManagerApproval(
          actionType: String!
          targetId: ID!
          reason: String!
          amount: Int
        ): ManagerApprovalResult

        approveManagerApproval(approvalId: ID!): ManagerApprovalResult

        initiatePaymentSession(
          cartId: ID!
          paymentProviderId: String!
        ): InitiatePaymentSessionResult

        completeActiveCart(
          cartId: ID!
          paymentSessionId: ID
        ): RestaurantOrder

        transitionRestaurantOrder(
          orderId: ID!
          status: String!
          reason: String
        ): RestaurantOrder

        createPOSOrder(
          orderType: String!
          guestCount: Int
          tableIds: [ID!]
          isUrgent: Boolean
          specialInstructions: String
          items: [POSOrderItemInput!]!
        ): RestaurantOrder

        addServiceFloorItem(
          orderId: ID
          tableId: ID!
          menuItemId: ID!
          quantity: Int!
          courseNumber: Int
          seatNumber: Int
          specialInstructions: String
          modifierIds: [ID!]
        ): RestaurantOrder

        updateServiceFloorItem(
          orderItemId: ID!
          quantity: Int
          courseNumber: Int
          seatNumber: Int
          specialInstructions: String
          voidReason: String
          managerApprovalId: ID
        ): RestaurantOrder

        updateServiceFloorTableStatus(
          tableId: ID!
          status: String!
        ): ServiceFloorMutationResult

        updateServiceFloorCheckStatus(
          orderId: ID!
          action: String!
        ): ServiceFloorMutationResult

        createWaitlistGuest(
          customerName: String!
          phoneNumber: String!
          partySize: Int!
          quotedWaitTime: Int
          notes: String
        ): WaitlistMutationResult

        updateWaitlistStatus(
          entryId: ID!
          action: String!
          tableId: ID
        ): WaitlistMutationResult

        upsertReservation(
          reservationId: ID
          customerName: String!
          customerPhone: String
          customerEmail: String
          reservationDate: String!
          partySize: Int!
          duration: Int
          status: String
          specialRequests: String
          assignedTableId: ID
        ): ReservationMutationResult

        updateReservationStatus(
          reservationId: ID!
          action: String!
          tableId: ID
        ): ReservationMutationResult

        upsertShift(
          shiftId: ID
          staffId: ID
          role: String!
          startTime: String!
          endTime: String!
          hourlyRate: String
        ): ShiftMutationResult

        updateShiftStatus(
          shiftId: ID!
          action: String!
        ): ShiftMutationResult

        createTipPoolLedger(
          date: String!
          tipPoolType: String!
          cashTips: String!
          creditTips: String!
        ): TipPoolMutationResult

        updateTipPoolStatus(
          tipPoolId: ID!
          action: String!
        ): TipPoolMutationResult

        adjustInventory(
          ingredientId: ID!
          quantity: String!
          reason: String!
          idempotencyKey: String!
        ): WasteMutationResult

        recordWaste(
          ingredientId: ID!
          quantity: String!
          reason: String!
          notes: String
          idempotencyKey: String!
        ): WasteMutationResult

        reverseWaste(
          wasteLogId: ID!
          reason: String!
          idempotencyKey: String!
        ): WasteMutationResult

        reconcileOrderInventory(orderId: ID!): InventoryReconciliationResult

        transferTable(
          orderId: String!
          fromTableId: String!
          toTableId: String!
        ): TableManagementResult

        combineTables(
          orderId: String!
          tableIds: [String!]!
        ): TableManagementResult

        fireCourse(
          courseId: String!
        ): CourseManagementResult

        recallCourse(
          courseId: String!
        ): CourseManagementResult

        syncKitchenTickets: SyncKitchenTicketsResult

        updateKitchenTicketStatus(
          ticketId: String!
          status: String!
        ): KitchenTicketMutationResult

        fulfillKitchenTicketItem(
          ticketId: String!
          itemId: String!
          fulfilled: Boolean!
        ): KitchenTicketMutationResult

        handlePaymentProviderWebhook(
          providerCode: String!
          event: JSON!
          headers: JSON!
          rawBody: String
        ): HandleWebhookResult
      }

      type ProcessPaymentResult {
        success: Boolean!
        paymentId: String
        clientSecret: String
        amount: Int
        remainingBalance: Int
        error: String
      }

      type GiftCardRedemptionResult {
        success: Boolean!
        paymentId: String
        amount: Int!
        remainingBalance: Int!
        error: String
      }

      type RefundPaymentResult {
        success: Boolean!
        refundId: ID
        status: String
        error: String
      }

      type CapturePaymentResult {
        success: Boolean!
        status: String
        error: String
      }

      type GetPaymentStatusResult {
        status: String
        amount: Int
        error: String
      }

      type SplitCheckResult {
        success: Boolean!
        newOrderIds: [String!]!
        error: String
      }

      type VoidCompResult {
        success: Boolean!
        requiresManagerApproval: Boolean!
        adjustedAmount: Int
        error: String
      }

      type ManagerApprovalResult {
        id: ID
        status: String
        actionType: String
        targetId: ID
        expiresAt: String
        error: String
      }

      input POSOrderItemInput {
        menuItemId: ID!
        quantity: Int!
        courseNumber: Int
        modifierIds: [ID!]
        specialInstructions: String
      }

      type InitiatePaymentSessionResult {
        id: ID!
        data: JSON
        amount: Int
      }

      type TableManagementResult {
        success: Boolean!
        error: String
      }

      type ServiceFloorMutationResult {
        success: Boolean!
        error: String
      }

      type WaitlistMutationResult {
        success: Boolean!
        error: String
      }

      type ReservationMutationResult {
        success: Boolean!
        error: String
      }

      type ShiftMutationResult {
        success: Boolean!
        error: String
      }

      type TipPoolMutationResult {
        success: Boolean!
        error: String
      }

      type WasteMutationResult {
        success: Boolean!
        wasteLogId: ID
        error: String
      }

      type InventoryReconciliationResult {
        success: Boolean!
        created: Int!
        error: String
      }

      type CourseManagementResult {
        success: Boolean!
        error: String
      }

      type SyncKitchenTicketsResult {
        success: Boolean!
        created: Int!
        updated: Int!
        error: String
      }

      type KitchenTicketMutationResult {
        success: Boolean!
        error: String
      }

      type HandleWebhookResult {
        success: Boolean!
        error: String
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        getPaymentStatus,
        activeCart,
        activeCartPaymentProviders,
        getCustomerOrder,
        getCustomerOrders,
        lookupGiftCard,
      },
      Mutation: {
        updateActiveUser,
        createActiveCart,
        addActiveCartItem,
        updateActiveCart,
        updateCartItemQuantity,
        removeCartItem,
        processPayment,
        setGiftCardStatus,
        redeemGiftCard,
        refundPayment,
        requestManagerApproval,
        approveManagerApproval,
        capturePayment: capturePaymentMutation,
        reconcilePayment: reconcilePaymentMutation,
        splitCheckByItem,
        splitCheckByGuest,
        voidOrderItem,
        compOrderItem,
        voidOrder,
        initiatePaymentSession,
        completeActiveCart,
        transitionRestaurantOrder,
        createPOSOrder,
        addServiceFloorItem,
        updateServiceFloorItem,
        updateServiceFloorTableStatus,
        updateServiceFloorCheckStatus,
        createWaitlistGuest: createWaitlistEntry,
        updateWaitlistStatus,
        upsertReservation,
        updateReservationStatus,
        upsertShift,
        updateShiftStatus,
        createTipPoolLedger,
        updateTipPoolStatus,
        adjustInventory,
        recordWaste,
        reverseWaste,
        reconcileOrderInventory,
        transferTable,
        combineTables,
        fireCourse,
        recallCourse,
        syncKitchenTickets,
        updateKitchenTicketStatus,
        fulfillKitchenTicketItem,
        handlePaymentProviderWebhook,
      },
    },
  });
}

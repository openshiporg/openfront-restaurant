import { previewRestaurantCampaign, createRestaurantCampaign, dispatchRestaurantCampaign } from "./restaurantCampaigns";
import { restaurantPurchaseEvidence, recordRestaurantPurchaseInvoice, recordRestaurantPurchaseCredit, restaurantIngredientLots, setRestaurantLotHold } from "./purchaseEvidence";
import { restaurantCheckAllocation } from "./checkAllocation";
import { transferRestaurantStock } from "./stockTransfer";
import { restaurantOperationsRecovery, retryRestaurantOperations, reviewLegacyRestaurantRecipes } from "./operationsRecovery";
import { restaurantAttendance, recordRestaurantAttendance, requestRestaurantTimeCorrection, approveRestaurantTimeCorrection } from "./attendance";
import { exportMyRestaurantData, recordMyRestaurantPrivacy, restaurantPrivacyRequests, resolveRestaurantPrivacyRequest } from "./customerPrivacy";
import { restaurantNotifications, sendRestaurantNotification, acknowledgeRestaurantNotification } from "./restaurantNotifications";
import { ensureRestaurantOnboardingRecord } from "./ensureOnboardingRecord";
import { transitionPurchaseOrder, receivePurchaseOrder, countIngredientStock } from "./purchasing";
import { issueGiftCard } from "./issueGiftCard";
import { recoverCheckoutPayment, cancelCheckoutPaymentSession, unplacedCheckoutAttempts } from "./checkoutRecovery";
import { restaurantBusinessDays, restaurantBusinessDay, openRestaurantBusinessDay, recordRestaurantCashMovement, closeRestaurantBusinessDay, recordRestaurantSettlement } from "./businessDay";
import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import updateActiveUser from "./updateActiveUser";
import processPayment, { capturePaymentMutation, getPaymentStatus, reconcilePaymentMutation } from "./processPayment";
import redeemGiftCard, { lookupGiftCard } from "./redeemGiftCard";
import refundPayment, { reconcileRefundMutation } from "./refundPayment";
import { splitCheckByItem, splitCheckByGuest, splitCheckBySeat, recombineEqualChecks, mergeChecks } from "./splitCheck";
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
import { transferTable, combineTables, deleteUnusedRestaurantTable, setRestaurantTableCapacity } from "./tableManagement";
import { fireCourse, recallCourse } from "./courseManagement";
import { syncKitchenTickets, updateKitchenTicketStatus, fulfillKitchenTicketItem } from "./kdsTickets";
import handlePaymentProviderWebhook from "./handlePaymentProviderWebhook";
import retryVerifiedRefundWebhook from "./retryVerifiedRefundWebhook";
import createPOSOrder from "./createPOSOrder";
import addServiceFloorItem from "./addServiceFloorItem";
import updateServiceFloorItem from "./updateServiceFloorItem";
import { updateServiceFloorCheckStatus, updateServiceFloorTableStatus } from "./serviceFloorTable";
import { createWaitlistEntry, updateWaitlistStatus } from "./waitlistManagement";
import { updateReservationStatus, upsertReservation } from "./reservationManagement";
import { updateShiftStatus, upsertShift } from "./shiftManagement";
import { previewRestaurantTipPool, createTipPoolLedger, updateTipPoolStatus } from "./tipManagement";
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
      extend type Cart { accessProof: String }
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

      type CheckoutCancellationResult { success: Boolean!, error: String }
      type UnplacedCheckoutAttempt { id: ID!, cartId: ID!, customerName: String!, amount: Int!, createdAt: DateTime!, state: String!, providerCode: String!, canRecover: Boolean!, requiresManualReview: Boolean!, canCancel: Boolean! }
      type UnplacedCheckoutAttemptPage { items: [UnplacedCheckoutAttempt!]!, totalCount: Int!, skip: Int!, take: Int!, hasMore: Boolean!, activeReservations: Int!, activeOnlineOrders: Int!, capacityUsed: Int!, capacityLimit: Int!, capacityLimitConfigured: Boolean!, capacityLimitValid: Boolean!, capacityAtLimit: Boolean! }
      type Query {
        previewRestaurantCampaign: JSON!
        restaurantPurchaseEvidence(id: ID!): JSON!
        restaurantIngredientLots(ingredientId: ID!): JSON!
        restaurantCheckAllocation(orderId: ID!): JSON
        restaurantOperationsRecovery: JSON!
        restaurantAttendance(fromDate: String, toDate: String, skip: Int, take: Int): JSON!
        previewRestaurantTipPool(date: String!, tipPoolType: String!, cashTips: String!, creditTips: String!, individualStaffId: ID): JSON!
        exportMyRestaurantData: JSON!
        restaurantPrivacyRequests: JSON!
        restaurantNotifications(status: String, limit: Int, cursor: String): RestaurantNotificationPage!
        restaurantBusinessDays: JSON
        restaurantBusinessDay(id: String!): JSON
        redirectToInit: Boolean
        getPaymentStatus(paymentIntentId: String!): GetPaymentStatusResult
        activeCart(cartId: ID!): JSON
        activeCartPaymentProviders: [PaymentProvider!]
        getCustomerOrder(orderId: ID!, secretKey: String): JSON
        getCustomerOrders(limit: Int, offset: Int): JSON
        unplacedCheckoutAttempts(skip: Int, take: Int): UnplacedCheckoutAttemptPage!
        lookupGiftCard(code: String!): JSON
      }

      type RestaurantNotification { id: ID!, recipient: String, subject: String, entityId: ID, status: String!, error: String }
      type RestaurantNotificationPage { items: [RestaurantNotification!]!, status: String!, limit: Int!, hasMore: Boolean!, nextCursor: String }
      type RestaurantNotificationResult { id: ID!, status: String!, error: String }
      type Mutation {
        createRestaurantCampaign(requestKey: String!, subject: String!, text: String!, customerIds: [ID!]!): JSON!
        dispatchRestaurantCampaign(campaignId: ID!): JSON!
        recordRestaurantPurchaseInvoice(id: ID!, reference: String!, currencyCode: String!, lines: JSON!, varianceReason: String, idempotencyKey: String!): JSON!
        recordRestaurantPurchaseCredit(id: ID!, invoiceId: ID!, reference: String!, lines: JSON!, reason: String!, idempotencyKey: String!): JSON!
        setRestaurantLotHold(receiptId: ID!, onHold: Boolean!, reason: String!, idempotencyKey: String!): JSON!
        transferRestaurantStock(fromId: ID!, toId: ID!, quantity: Float!, reason: String!, idempotencyKey: String!): JSON!
        retryRestaurantOperations(orderId: ID!): JSON!
        reviewLegacyRestaurantRecipes(orderId: ID!, reason: String!): JSON!
        recordRestaurantAttendance(action: String!, entryId: ID, shiftId: ID, idempotencyKey: String!, paidBreak: Boolean): JSON!
        requestRestaurantTimeCorrection(entryId: ID!, clockIn: String!, clockOut: String!, breakMinutes: Int!, reason: String!, idempotencyKey: String!): JSON!
        approveRestaurantTimeCorrection(requestId: ID!, idempotencyKey: String!): JSON!
        setRestaurantTableCapacity(tableId: ID!, capacity: Int!): TableManagementResult
        deleteUnusedRestaurantTable(tableId: ID!): TableManagementResult
        reconcileRefund(refundId: ID!): RefundPaymentResult
        recordMyRestaurantPrivacy(action: String!, reason: String, idempotencyKey: String!): JSON!
        resolveRestaurantPrivacyRequest(requestId: ID!, outcome: String!, reason: String!): JSON!
        cancelCheckoutPaymentSession(cartId: ID!, paymentSessionId: ID!): CheckoutCancellationResult
        sendRestaurantNotification(notificationId: ID!, retryUnknown: Boolean): RestaurantNotificationResult
        acknowledgeRestaurantNotification(notificationId: ID!, reason: String!): RestaurantNotificationResult
        ensureRestaurantOnboardingRecord(entity: String!, data: JSON!): JSON!
        issueGiftCard(code: String!, amount: Int!, idempotencyKey: String!): GiftCard
        transitionPurchaseOrder(id: ID!, status: String!): PurchaseOrder
        receivePurchaseOrder(id: ID!, lines: JSON!, reference: String!, idempotencyKey: String!, currencyCode: String): JSON
        countIngredientStock(ingredientId: ID!, counted: Float!, expectedStock: Float!, reason: String!, idempotencyKey: String!): JSON
        recoverCheckoutPayment(paymentSessionId: ID!): RestaurantOrder
        openRestaurantBusinessDay(openingFloat: Int!, cutoffMinutes: Int, idempotencyKey: String!): String
        recordRestaurantCashMovement(id: String!, direction: String!, amount: Int!, reason: String!, idempotencyKey: String!): JSON
        closeRestaurantBusinessDay(id: String!, countedCash: Int!, reason: String!): JSON
        recordRestaurantSettlement(id: String!, reference: String!, method: String!, gross: Int!, fees: Int!, net: Int!, reason: String!): JSON
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

        mergeChecks(orderId: ID!, sourceOrderId: ID!): SplitCheckResult
        splitCheckByItem(
          orderId: String!
          itemIds: [String!]!
        ): SplitCheckResult

        splitCheckBySeat(orderId: ID!, idempotencyKey: String!): SplitCheckResult
        recombineEqualChecks(orderId: ID!): SplitCheckResult
        splitCheckByGuest(
          orderId: String!
          guestCount: Int!
          idempotencyKey: String!
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
          idempotencyKey: String!
          orderType: String!
          guestCount: Int
          tableIds: [ID!]
          isUrgent: Boolean
          specialInstructions: String
          items: [POSOrderItemInput!]!
        ): RestaurantOrder

        addServiceFloorItem(
          idempotencyKey: String!
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
          contactConfirmed: Boolean
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
          sourceNote: String!
          individualStaffId: ID
        ): TipPoolMutationResult

        updateTipPoolStatus(
          tipPoolId: ID!
          action: String!
          payoutReference: String
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
        retryVerifiedRefundWebhookEvent(eventId: ID!): JSON!
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
        previewRestaurantCampaign, restaurantPurchaseEvidence, restaurantIngredientLots,
        restaurantCheckAllocation,
        restaurantOperationsRecovery,
        restaurantAttendance, previewRestaurantTipPool,
        exportMyRestaurantData, restaurantPrivacyRequests,
        restaurantNotifications,
        restaurantBusinessDays, restaurantBusinessDay,
        redirectToInit,
        getPaymentStatus,
        activeCart,
        activeCartPaymentProviders,
        getCustomerOrder,
        getCustomerOrders,
        unplacedCheckoutAttempts,
        lookupGiftCard,
      },
      Mutation: {
        createRestaurantCampaign, dispatchRestaurantCampaign, recordRestaurantPurchaseInvoice, recordRestaurantPurchaseCredit, setRestaurantLotHold,
        transferRestaurantStock,
        retryRestaurantOperations, reviewLegacyRestaurantRecipes,
        recordRestaurantAttendance, requestRestaurantTimeCorrection, approveRestaurantTimeCorrection,
        setRestaurantTableCapacity,
        deleteUnusedRestaurantTable,
        reconcileRefund: reconcileRefundMutation,
        recordMyRestaurantPrivacy, resolveRestaurantPrivacyRequest,
        cancelCheckoutPaymentSession,
        sendRestaurantNotification, acknowledgeRestaurantNotification,
        ensureRestaurantOnboardingRecord,
        issueGiftCard, transitionPurchaseOrder, receivePurchaseOrder, countIngredientStock,
        recoverCheckoutPayment,
        openRestaurantBusinessDay, recordRestaurantCashMovement, closeRestaurantBusinessDay, recordRestaurantSettlement,
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
        mergeChecks,
        splitCheckByItem,
        splitCheckByGuest, splitCheckBySeat, recombineEqualChecks,
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
        retryVerifiedRefundWebhookEvent: retryVerifiedRefundWebhook,
      },
    },
  });
}

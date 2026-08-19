import { User } from './User';
import { Role } from './Role';
import { Section } from './Section';
import { Floor } from './Floor';
import { Table } from './Table';
import { MenuCategory } from './MenuCategory';
import { MenuItem } from './MenuItem';
import { MenuItemImage } from './MenuItemImage';
import { MenuItemModifier } from './MenuItemModifier';
import { RestaurantOrder } from './RestaurantOrder';
import { Address } from './Address';
import { OrderItem } from './OrderItem';
import { OrderCourse } from './OrderCourse';
import { KitchenMessage } from './KitchenMessage';
import { Recipe } from './Recipe';
import { Reservation } from './Reservation';
import { Payment } from './Payment';
import { PaymentCollection } from './PaymentCollection';
import { PaymentSession } from './PaymentSession';
import { Cart } from './Cart';
import { CartItem } from './CartItem';
import { PaymentProvider } from './PaymentProvider';
import { ApiKey } from './ApiKey';
import { Discount } from './Discount';
import { DiscountRule } from './DiscountRule';
import { GiftCard } from './GiftCard';
import { GiftCardTransaction } from './GiftCardTransaction';
import { KitchenStation } from './KitchenStation';
import { PrepStation } from './PrepStation';
import { KitchenTicket } from './KitchenTicket';
import { Vendor } from './Vendor';
import { InventoryLocation } from './InventoryLocation';
import { Ingredient } from './Ingredient';
import { StockMovement } from './StockMovement';
import { StoreSettings } from './StoreSettings';
import { WaitlistEntry } from './WaitlistEntry';
import { Shift } from './Shift';
import { TipPool } from './TipPool';
import { TimeEntry } from './TimeEntry';
import { WasteLog } from './WasteLog';
import { PurchaseOrder } from './PurchaseOrder';
import { AuditEvent } from './AuditEvent';
import { OrderAdjustment } from './OrderAdjustment';
import { Receipt } from './Receipt';
import { Refund } from './Refund';
import { PaymentWebhookEvent } from './PaymentWebhookEvent';
import { KitchenTicketEvent } from './KitchenTicketEvent';
import { IdempotencyKey } from './IdempotencyKey';
import { ManagerApproval } from './ManagerApproval';

export const models = {
  User,
  Role,
  Section,
  Floor,
  Table,
  MenuCategory,
  MenuItem,
  MenuItemImage,
  MenuItemModifier,
  RestaurantOrder,
  Address,
  OrderItem,
  OrderCourse,
  KitchenMessage,
  Recipe,
  Reservation,
  Payment,
  PaymentCollection,
  PaymentSession,
  Cart,
  CartItem,
  PaymentProvider,
  ApiKey,
  Discount,
  DiscountRule,
  GiftCard,
  GiftCardTransaction,
  KitchenStation,
  PrepStation,
  KitchenTicket,
  Vendor,
  InventoryLocation,
  Ingredient,
  StockMovement,
  StoreSettings,
  WaitlistEntry,
  Shift,
  TipPool,
  TimeEntry,
  WasteLog,
  PurchaseOrder,
  AuditEvent,
  OrderAdjustment,
  Receipt,
  Refund,
  PaymentWebhookEvent,
  KitchenTicketEvent,
  IdempotencyKey,
  ManagerApproval,
};

export default models;

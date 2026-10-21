import { businessDate, businessDayStart } from '@/features/lib/financial-ledger';
import { startOfDay, endOfDay, subDays, subMonths, format, eachDayOfInterval, eachMonthOfInterval } from 'date-fns';

export interface RestaurantOrder {
  id: string;
  orderNumber: string;
  orderType: string;
  orderSource: string;
  status: string;
  guestCount: number;
  physicalGuestCount?: number | null;
  subtotal: string;
  tax: string;
  tip: string;
  discount: string;
  total: string;
  createdAt: string;
  table?: { id: string; tableNumber: string };
  server?: { id: string; name: string };
  orderItems?: OrderItem[];
  payments?: { amount: string | number; status: string; refundedAmount?: number }[];
}

export interface OrderItem {
  id: string;
  quantity: number;
  price: string;
  menuItem?: {
    id: string;
    name: string;
    category?: { id: string; name: string };
  };
}

export interface Payment {
  id: string;
  amount: string;
  refundedAmount?: number;
  status: string;
  paymentMethod: string;
  tipAmount: string;
  createdAt: string;
}

export const getDateRange = (period: string) => {
  const endDate = endOfDay(new Date());
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = startOfDay(new Date());
      break;
    case '7d':
      startDate = startOfDay(subDays(new Date(), 6));
      break;
    case '30d':
      startDate = startOfDay(subDays(new Date(), 29));
      break;
    case '90d':
      startDate = startOfDay(subDays(new Date(), 89));
      break;
    case '12m':
      startDate = startOfDay(subMonths(new Date(), 12));
      break;
    default:
      startDate = startOfDay(subDays(new Date(), 29));
  }

  return { 
    startDate: startDate.toISOString(), 
    endDate: endDate.toISOString() 
  };
};

export const getPreviousPeriodRange = (period: string, customStartDate?: string, customEndDate?: string) => {
  if (customStartDate && customEndDate) {
    const start = new Date(customStartDate);
    const end = new Date(customEndDate);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    const previousEndDate = endOfDay(subDays(start, 1));
    const previousStartDate = startOfDay(subDays(start, diffDays));
    
    return {
      startDate: previousStartDate.toISOString(),
      endDate: previousEndDate.toISOString()
    };
  }

  const currentRange = getDateRange(period);
  const currentStart = new Date(currentRange.startDate);
  
  let previousStartDate: Date;
  let previousEndDate: Date;

  switch (period) {
    case '7d':
      previousEndDate = endOfDay(subDays(currentStart, 1));
      previousStartDate = startOfDay(subDays(currentStart, 7));
      break;
    case '30d':
      previousEndDate = endOfDay(subDays(currentStart, 1));
      previousStartDate = startOfDay(subDays(currentStart, 30));
      break;
    case '90d':
      previousEndDate = endOfDay(subDays(currentStart, 1));
      previousStartDate = startOfDay(subDays(currentStart, 90));
      break;
    case '12m':
      previousEndDate = endOfDay(subDays(currentStart, 1));
      previousStartDate = startOfDay(subMonths(currentStart, 12));
      break;
    default:
      previousEndDate = endOfDay(subDays(currentStart, 1));
      previousStartDate = startOfDay(subDays(currentStart, 30));
  }

  return {
    startDate: previousStartDate.toISOString(),
    endDate: previousEndDate.toISOString()
  };
};

export const calculatePercentageChange = (current: number, previous: number): { value: number; isPositive: boolean } => {
  if (previous === 0) {
    return { value: current > 0 ? 100 : 0, isPositive: current >= 0 };
  }
  
  const change = ((current - previous) / previous) * 100;
  return { 
    value: Math.abs(change), 
    isPositive: change >= 0 
  };
};

export const parseDecimal = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value) || 0;
};

export const orderNetCollected = (order: RestaurantOrder): number =>
  (order.payments || []).filter(p => ['succeeded', 'partially_refunded', 'refunded'].includes(p.status))
    .reduce((sum, p) => sum + Math.max(0, parseDecimal(p.amount) - parseDecimal(p.refundedAmount)), 0);

/** Covers belong to the physical party, not to the number of financial checks. */
export const orderPhysicalGuests = (order: Pick<RestaurantOrder, 'guestCount' | 'orderSource' | 'physicalGuestCount'>): number => {
  if (order.orderSource === 'gift_card') return 0;
  return order.physicalGuestCount != null ? Math.max(0, Number(order.physicalGuestCount)) : Math.max(1, Number(order.guestCount || 1));
};
export function venueTodayRange(timezone: string, now = new Date()) {
  const date = businessDate(now, timezone, 0);
  const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return { startDate: businessDayStart(date, timezone, 0).toISOString(), endDate: new Date(businessDayStart(next.toISOString().slice(0, 10), timezone, 0).getTime() - 1).toISOString() };
}
export function operationalDaySummary(orders: RestaurantOrder[], payments: any[], refunds: any[]) {
  const completed = orders.filter(order => order.status === 'completed' && order.orderSource !== 'gift_card');
  const settled = ['succeeded', 'partially_refunded', 'refunded'];
  const gross = payments.filter(payment => settled.includes(payment.status) && payment.order?.orderSource !== 'gift_card').reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
  const refunded = refunds.filter(refund => refund.status === 'succeeded' && refund.payment?.order?.orderSource !== 'gift_card').reduce((sum, refund) => sum + parseDecimal(refund.amount), 0);
  return { netCollections: gross - refunded, completedChecks: completed.length, covers: completed.reduce((sum, order) => sum + orderPhysicalGuests(order), 0), dineInChecksWithGuests: completed.filter(order => order.orderType === 'dine_in' && orderPhysicalGuests(order) > 0).length };
}

export const calculateSalesMetrics = (orders: RestaurantOrder[], previousOrders?: RestaurantOrder[]) => {
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'completed' && o.orderSource !== 'gift_card');
  
  const totalRevenue = completedOrders.reduce((sum, order) => sum + orderNetCollected(order), 0);
  const totalTax = completedOrders.reduce((sum, order) => sum + parseDecimal(order.tax), 0);
  const totalTips = completedOrders.reduce((sum, order) => sum + parseDecimal(order.tip), 0);
  const totalDiscounts = completedOrders.reduce((sum, order) => sum + parseDecimal(order.discount), 0);
  
  const totalGuests = completedOrders.reduce((sum, order) => sum + orderPhysicalGuests(order), 0);
  const averageCheckSize = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
  const revenuePerGuest = totalGuests > 0 ? totalRevenue / totalGuests : 0;

  const ordersByType = {
    dine_in: completedOrders.filter(o => o.orderType === 'dine_in').length,
    takeout: completedOrders.filter(o => o.orderType === 'takeout').length,
    delivery: completedOrders.filter(o => o.orderType === 'delivery').length,
  };

  const ordersBySource = {
    pos: completedOrders.filter(o => o.orderSource === 'pos').length,
    online: completedOrders.filter(o => o.orderSource === 'online').length,
    kiosk: completedOrders.filter(o => o.orderSource === 'kiosk').length,
    phone: completedOrders.filter(o => o.orderSource === 'phone').length,
  };

  const revenueByType = {
    dine_in: completedOrders.filter(o => o.orderType === 'dine_in').reduce((sum, o) => sum + orderNetCollected(o), 0),
    takeout: completedOrders.filter(o => o.orderType === 'takeout').reduce((sum, o) => sum + orderNetCollected(o), 0),
    delivery: completedOrders.filter(o => o.orderType === 'delivery').reduce((sum, o) => sum + orderNetCollected(o), 0),
  };

  let previousRevenue = 0;
  let previousOrdersCount = 0;
  let previousAverageCheck = 0;
  let previousGuests = 0;

  if (previousOrders && previousOrders.length > 0) {
    const prevCompleted = previousOrders.filter(o => o.status === 'completed' && o.orderSource !== 'gift_card');
    previousOrdersCount = prevCompleted.length;
    previousRevenue = prevCompleted.reduce((sum, order) => sum + orderNetCollected(order), 0);
    previousAverageCheck = previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;
    previousGuests = prevCompleted.reduce((sum, order) => sum + orderPhysicalGuests(order), 0);
  }

  return {
    totalOrders,
    completedOrders: completedOrders.length,
    totalRevenue,
    totalTax,
    totalTips,
    totalDiscounts,
    totalGuests,
    averageCheckSize,
    revenuePerGuest,
    ordersByType,
    ordersBySource,
    revenueByType,
    previousRevenue,
    previousOrders: previousOrdersCount,
    previousAverageCheck,
    previousGuests,
  };
};

export const calculateDaypartMetrics = (orders: RestaurantOrder[]) => {
  const dayparts = {
    breakfast: { orders: 0, revenue: 0, startHour: 6, endHour: 11 },
    lunch: { orders: 0, revenue: 0, startHour: 11, endHour: 15 },
    dinner: { orders: 0, revenue: 0, startHour: 15, endHour: 22 },
    lateNight: { orders: 0, revenue: 0, startHour: 22, endHour: 6 },
  };

  orders.filter(o => o.status === 'completed' && o.orderSource !== 'gift_card').forEach(order => {
    const hour = new Date(order.createdAt).getHours();
    const revenue = orderNetCollected(order);
    
    if (hour >= 6 && hour < 11) {
      dayparts.breakfast.orders++;
      dayparts.breakfast.revenue += revenue;
    } else if (hour >= 11 && hour < 15) {
      dayparts.lunch.orders++;
      dayparts.lunch.revenue += revenue;
    } else if (hour >= 15 && hour < 22) {
      dayparts.dinner.orders++;
      dayparts.dinner.revenue += revenue;
    } else {
      dayparts.lateNight.orders++;
      dayparts.lateNight.revenue += revenue;
    }
  });

  return dayparts;
};

export const calculatePaymentMethodBreakdown = (payments: Payment[]) => {
  const breakdown: Record<string, { count: number; total: number; gross: number; refunds: number }> = {};

  payments.filter(p => ['succeeded', 'partially_refunded', 'refunded'].includes(p.status)).forEach(payment => {
    const method = payment.paymentMethod || 'unknown';
    if (!breakdown[method]) {
      breakdown[method] = { count: 0, total: 0, gross: 0, refunds: 0 };
    }
    breakdown[method].count++;
    const gross = parseDecimal(payment.amount);
    const refunded = Math.min(gross, Math.max(0, parseDecimal(payment.refundedAmount)));
    breakdown[method].gross += gross;
    breakdown[method].refunds += refunded;
    breakdown[method].total += gross - refunded;
  });

  return breakdown;
};

export const generateTimeSeriesData = (
  orders: RestaurantOrder[], 
  startDate: string | Date, 
  endDate: string | Date, 
  interval: 'day' | 'month' = 'day'
) => {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  const dates = interval === 'day' 
    ? eachDayOfInterval({ start, end })
    : eachMonthOfInterval({ start, end });

  const dataMap = orders.reduce((acc, order) => {
    const key = format(new Date(order.createdAt), interval === 'day' ? 'yyyy-MM-dd' : 'yyyy-MM');
    if (!acc[key]) {
      acc[key] = { revenue: 0, orders: 0, guests: 0 };
    }
    
    acc[key].revenue += orderNetCollected(order);
    acc[key].orders += 1;
    acc[key].guests += orderPhysicalGuests(order);
    return acc;
  }, {} as Record<string, { revenue: number; orders: number; guests: number }>);

  return dates.map(date => {
    const key = format(date, interval === 'day' ? 'yyyy-MM-dd' : 'yyyy-MM');
    const data = dataMap[key] || { revenue: 0, orders: 0, guests: 0 };
    
    return {
      date: format(date, interval === 'day' ? 'MMM d' : 'MMM yyyy'),
      dateKey: key,
      revenue: data.revenue,
      orders: data.orders,
      guests: data.guests,
    };
  });
};

export const formatCurrency = (amount: number, config?: { currencyCode?: string; locale?: string }) => {
  const currencyCode = config?.currencyCode || 'USD';
  const locale = config?.locale || 'en-US';
  
  // Basic no-division currency check - mirrored from storefront/lib/currency
  const NO_DIVISION_CURRENCIES = [
    "krw", "jpy", "vnd", "clp", "pyg", "xaf", "xof", "bif", "djf", "gnf", "kmf", "mga", "rwf", "xpf", "htg", "vuv", "xag", "xdr", "xau"
  ];
  
  const shouldDivideBy100 = !NO_DIVISION_CURRENCIES.includes(currencyCode.toLowerCase());
  const value = shouldDivideBy100 ? amount / 100 : amount;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(value);
};

export const formatPercentage = (value: number, decimals: number = 1) => {
  return `${value.toFixed(decimals)}%`;
};

export const formatNumber = (value: number, decimals: number = 0) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export interface MenuItemPerformance {
  id: string;
  name: string;
  categoryName: string;
  quantitySold: number;
  revenue: number;
  percentageOfSales: number;
}

export interface CategoryPerformance {
  id: string;
  name: string;
  revenue: number;
  itemsSold: number;
  itemCount: number;
  percentageOfSales: number;
}

export const calculateMenuItemPerformance = (orderItems: any[]): MenuItemPerformance[] => {
  const itemMap = new Map<string, {
    id: string;
    name: string;
    categoryName: string;
    quantitySold: number;
    revenue: number;
  }>();

  orderItems.forEach(item => {
    if (item.isVoided) return;
    if (!item.menuItem && !item.itemNameSnapshot) return;
    
    const id = item.menuItem?.id || item.menuItemIdSnapshot || item.itemNameSnapshot;
    const existing = itemMap.get(id);
    const itemRevenue = Math.max(0, parseDecimal(item.price) * (item.quantity || 1) - parseDecimal(item.adjustmentTotal));
    
    if (existing) {
      existing.quantitySold += item.quantity || 1;
      existing.revenue += itemRevenue;
    } else {
      itemMap.set(id, {
        id,
        name: item.itemNameSnapshot || item.menuItem?.name || 'Unknown',
        categoryName: item.menuItem?.category?.name || 'Uncategorized',
        quantitySold: item.quantity || 1,
        revenue: itemRevenue,
      });
    }
  });

  const items = Array.from(itemMap.values());
  const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);

  return items
    .map(item => ({
      ...item,
      percentageOfSales: totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
};

export const calculateCategoryPerformance = (orderItems: any[]): CategoryPerformance[] => {
  const categoryMap = new Map<string, {
    id: string;
    name: string;
    revenue: number;
    itemsSold: number;
    productIds: Set<string>;
  }>();

  orderItems.forEach(item => {
    if (item.isVoided || !item.menuItem?.category) return;
    
    const categoryId = item.menuItem.category.id;
    const categoryName = item.menuItem.category.name;
    const existing = categoryMap.get(categoryId);
    const itemRevenue = Math.max(0, parseDecimal(item.price) * (item.quantity || 1) - parseDecimal(item.adjustmentTotal));
    
    if (existing) {
      existing.itemsSold += item.quantity || 1;
      existing.revenue += itemRevenue;
      existing.productIds.add(item.menuItem.id);
    } else {
      const productIds = new Set<string>();
      productIds.add(item.menuItem.id);
      categoryMap.set(categoryId, {
        id: categoryId,
        name: categoryName,
        itemsSold: item.quantity || 1,
        revenue: itemRevenue,
        productIds,
      });
    }
  });

  const categories = Array.from(categoryMap.values());
  const totalRevenue = categories.reduce((sum, cat) => sum + cat.revenue, 0);

  return categories
    .map(cat => ({
      id: cat.id,
      name: cat.name,
      revenue: cat.revenue,
      itemsSold: cat.itemsSold,
      itemCount: cat.productIds.size,
      percentageOfSales: totalRevenue > 0 ? (cat.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
};

export function recordedOrderVoidCount(adjustments: any[]) {
  if (adjustments.length > 10000) throw new Error('Void evidence exceeds this dashboard window');
  return new Set(adjustments.filter(row => row.metadata?.wholeOrder === true && row.order?.id).map(row => row.order.id)).size;
}

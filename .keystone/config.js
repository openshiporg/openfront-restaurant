"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __glob = (map) => (path) => {
  var fn = map[path];
  if (fn) return fn();
  throw new Error("Module not found in bundle: " + path);
};
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  capturePaymentFunction: () => capturePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction
});
async function createPaymentFunction({ order, amount, currency, idempotencyKey }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: order?.id || "",
        orderNumber: order?.orderNumber || ""
      }
    },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  };
}
async function capturePaymentFunction({ paymentId, amount }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amount
  });
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_captured,
    data: paymentIntent
  };
}
async function refundPaymentFunction({ paymentId, amount, idempotencyKey }) {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create(
    { payment_intent: paymentId, amount },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    id: refund.id,
    refundId: refund.id,
    status: refund.status,
    amount: refund.amount,
    data: refund
  };
}
async function getPaymentStatusFunction({ paymentId }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    data: paymentIntent
  };
}
async function generatePaymentLinkFunction({ paymentId }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}
async function handleWebhookFunction({ event, headers, rawBody }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  const stripe = getStripeClient();
  try {
    if (!rawBody) throw new Error("Stripe webhook raw body is required");
    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      headers["stripe-signature"],
      webhookSecret
    );
    return {
      isValid: true,
      event: stripeEvent,
      type: stripeEvent.type,
      resource: stripeEvent.data.object
    };
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err?.message || "Unknown error"}`);
  }
}
var import_stripe, getStripeClient;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    getStripeClient = () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new Error("Stripe secret key not configured");
      }
      return new import_stripe.default(stripeKey);
    };
  }
});

// features/integrations/payment/paypal.ts
var paypal_exports = {};
__export(paypal_exports, {
  capturePaymentFunction: () => capturePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  normalizePayPalStatus: () => normalizePayPalStatus,
  refundPaymentFunction: () => refundPaymentFunction2
});
async function handleWebhookFunction2({ event, headers }) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PayPal webhook ID is not configured");
  }
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const response = await fetch(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: event
      })
    }
  );
  const verification = await response.json();
  const isValid = verification.verification_status === "SUCCESS";
  if (!isValid) {
    throw new Error("Invalid webhook signature");
  }
  return {
    isValid: true,
    event,
    type: event.event_type,
    resource: event.resource
  };
}
async function createPaymentFunction2({ order, amount, currency, idempotencyKey }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency.toUpperCase(),
            value: formatPayPalAmount(amount, currency)
          },
          custom_id: order?.id
        }
      ]
    })
  });
  const orderResult = await response.json();
  if (orderResult.error) {
    throw new Error(`PayPal order creation failed: ${orderResult.error.message}`);
  }
  return {
    orderId: orderResult.id,
    status: orderResult.status
  };
}
async function capturePaymentFunction2({ paymentId }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const response = await fetch(
    `${baseUrl}/v2/checkout/orders/${paymentId}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  const capture = await response.json();
  if (capture.error) {
    throw new Error(`PayPal capture failed: ${capture.error.message}`);
  }
  const capturedAmount = capture.purchase_units[0].payments.captures[0].amount;
  return {
    status: normalizePayPalStatus(capture.status),
    amount: parsePayPalAmount(capturedAmount.value, capturedAmount.currency_code),
    data: capture
  };
}
async function refundPaymentFunction2({ paymentId, amount, currency = "USD", idempotencyKey }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const response = await fetch(
    `${baseUrl}/v2/payments/captures/${paymentId}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}
      },
      body: JSON.stringify({
        amount: {
          value: formatPayPalAmount(amount, currency),
          currency_code: currency.toUpperCase()
        }
      })
    }
  );
  const refund = await response.json();
  if (refund.error) {
    throw new Error(`PayPal refund failed: ${refund.error.message}`);
  }
  return {
    id: refund.id,
    refundId: refund.id,
    status: refund.status,
    amount: parsePayPalAmount(refund.amount.value, refund.amount.currency_code),
    data: refund
  };
}
async function getPaymentStatusFunction2({ paymentId }) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const response = await fetch(`${baseUrl}/v2/checkout/orders/${paymentId}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });
  const orderResult = await response.json();
  if (orderResult.error) {
    throw new Error(`PayPal status check failed: ${orderResult.error.message}`);
  }
  const orderAmount = orderResult.purchase_units[0].amount;
  return {
    status: normalizePayPalStatus(orderResult.status),
    amount: parsePayPalAmount(orderAmount.value, orderAmount.currency_code),
    data: orderResult
  };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  return `https://www.paypal.com/activity/payment/${paymentId}`;
}
var NO_DIVISION_CURRENCIES, getPayPalBaseUrl, formatPayPalAmount, parsePayPalAmount, normalizePayPalStatus, getPayPalAccessToken;
var init_paypal = __esm({
  "features/integrations/payment/paypal.ts"() {
    "use strict";
    NO_DIVISION_CURRENCIES = [
      "JPY",
      "KRW",
      "VND",
      "CLP",
      "PYG",
      "XAF",
      "XOF",
      "BIF",
      "DJF",
      "GNF",
      "KMF",
      "MGA",
      "RWF",
      "XPF",
      "HTG",
      "VUV",
      "XAG",
      "XDR",
      "XAU"
    ];
    getPayPalBaseUrl = () => {
      const isSandbox = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX !== "false";
      return isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
    };
    formatPayPalAmount = (amount, currency) => {
      const upperCurrency = currency.toUpperCase();
      const isNoDivision = NO_DIVISION_CURRENCIES.includes(upperCurrency);
      if (isNoDivision) {
        return amount.toString();
      }
      return (amount / 100).toFixed(2);
    };
    parsePayPalAmount = (value, currency) => {
      const upperCurrency = currency.toUpperCase();
      const isNoDivision = NO_DIVISION_CURRENCIES.includes(upperCurrency);
      if (isNoDivision) {
        return parseInt(value, 10);
      }
      return Math.round(parseFloat(value) * 100);
    };
    normalizePayPalStatus = (status) => {
      switch ((status || "").toUpperCase()) {
        case "COMPLETED":
          return "succeeded";
        case "APPROVED":
          return "requires_capture";
        case "VOIDED":
          return "canceled";
        default:
          return "pending";
      }
    };
    getPayPalAccessToken = async () => {
      const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("PayPal credentials not configured");
      }
      const baseUrl = getPayPalBaseUrl();
      const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Language": "en_US",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
        },
        body: "grant_type=client_credentials"
      });
      const { access_token } = await response.json();
      if (!access_token) {
        throw new Error("Failed to get PayPal access token");
      }
      return access_token;
    };
  }
});

// features/integrations/payment/manual.ts
var manual_exports = {};
__export(manual_exports, {
  capturePaymentFunction: () => capturePaymentFunction3,
  createPaymentFunction: () => createPaymentFunction3,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction3,
  getPaymentStatusFunction: () => getPaymentStatusFunction3,
  handleWebhookFunction: () => handleWebhookFunction3,
  refundPaymentFunction: () => refundPaymentFunction3
});
async function handleWebhookFunction3({ event, headers }) {
  return {
    isValid: true,
    event,
    type: event.type,
    resource: event.data
  };
}
async function createPaymentFunction3({ order, amount, currency }) {
  return {
    status: "pending",
    data: {
      status: "pending",
      amount,
      currency: currency.toLowerCase(),
      orderId: order?.id
    }
  };
}
async function capturePaymentFunction3({ paymentId, amount }) {
  return {
    status: "captured",
    amount,
    data: {
      status: "captured",
      amount,
      captured_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function refundPaymentFunction3({ paymentId, amount }) {
  return {
    status: "refunded",
    amount,
    data: {
      status: "refunded",
      amount,
      refunded_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function getPaymentStatusFunction3({ paymentId }) {
  return {
    status: "succeeded",
    data: {
      status: "succeeded"
    }
  };
}
async function generatePaymentLinkFunction3({ paymentId }) {
  return null;
}
var init_manual = __esm({
  "features/integrations/payment/manual.ts"() {
    "use strict";
  }
});

// features/integrations/payment/index.ts
var payment_exports = {};
__export(payment_exports, {
  paymentProviderAdapters: () => paymentProviderAdapters
});
var paymentProviderAdapters;
var init_payment = __esm({
  "features/integrations/payment/index.ts"() {
    "use strict";
    paymentProviderAdapters = {
      stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
      paypal: () => Promise.resolve().then(() => (init_paypal(), paypal_exports)),
      manual: () => Promise.resolve().then(() => (init_manual(), manual_exports))
    };
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core50 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_access = require("@keystone-6/core/access");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/access.ts
function isSignedIn({ session }) {
  return Boolean(session);
}
var permissions = {
  canAccessDashboard: ({ session }) => !!session?.data?.role?.canAccessDashboard,
  canReadOrders: ({ session }) => !!session?.data?.role?.canReadOrders,
  canManageOrders: ({ session }) => !!session?.data?.role?.canManageOrders,
  canReadPayments: ({ session }) => !!session?.data?.role?.canReadPayments,
  canManagePayments: ({ session }) => !!session?.data?.role?.canManagePayments,
  canReadProducts: ({ session }) => !!session?.data?.role?.canReadProducts,
  canManageProducts: ({ session }) => !!session?.data?.role?.canManageProducts,
  canReadCart: ({ session }) => !!session?.data?.role?.canReadCart,
  canManageCart: ({ session }) => !!session?.data?.role?.canManageCart,
  canReadInventory: ({ session }) => !!session?.data?.role?.canReadInventory,
  canManageInventory: ({ session }) => !!session?.data?.role?.canManageInventory,
  canReadUsers: ({ session }) => !!session?.data?.role?.canReadUsers,
  canManageUsers: ({ session }) => !!session?.data?.role?.canManageUsers,
  canSeeOtherPeople: ({ session }) => !!session?.data?.role?.canSeeOtherPeople,
  canEditOtherPeople: ({ session }) => !!session?.data?.role?.canEditOtherPeople,
  canManagePeople: ({ session }) => !!session?.data?.role?.canManagePeople,
  canReadRoles: ({ session }) => !!session?.data?.role?.canReadRoles,
  canManageRoles: ({ session }) => !!session?.data?.role?.canManageRoles,
  canReadKitchen: ({ session }) => !!session?.data?.role?.canReadKitchen,
  canManageKitchen: ({ session }) => !!session?.data?.role?.canManageKitchen,
  canReadTables: ({ session }) => !!session?.data?.role?.canReadTables,
  canManageTables: ({ session }) => !!session?.data?.role?.canManageTables,
  canReadStaff: ({ session }) => !!session?.data?.role?.canReadStaff,
  canManageStaff: ({ session }) => !!session?.data?.role?.canManageStaff,
  canManageSettings: ({ session }) => !!session?.data?.role?.canManageSettings,
  canManageOnboarding: ({ session }) => !!session?.data?.role?.canManageOnboarding,
  canReadVendors: ({ session }) => !!session?.data?.role?.canReadVendors,
  canManageVendors: ({ session }) => !!session?.data?.role?.canManageVendors,
  canReadGiftCards: ({ session }) => !!session?.data?.role?.canReadGiftCards,
  canManageGiftCards: ({ session }) => !!session?.data?.role?.canManageGiftCards,
  canReadDiscounts: ({ session }) => !!session?.data?.role?.canReadDiscounts,
  canManageDiscounts: ({ session }) => !!session?.data?.role?.canManageDiscounts
};
var rules = {
  canManageOrders({ session }) {
    if (!isSignedIn({ session })) return false;
    if (permissions.canManageOrders({ session })) return true;
    return false;
  },
  canManagePayments({ session }) {
    if (!isSignedIn({ session })) return false;
    if (permissions.canManagePayments({ session })) return true;
    return false;
  },
  canReadPeople({ session }) {
    if (!session) return false;
    if (permissions.canSeeOtherPeople({ session })) return true;
    return { id: { equals: session.itemId } };
  },
  canUpdatePeople({ session }) {
    if (!session) return false;
    if (permissions.canEditOtherPeople({ session })) return true;
    return { id: { equals: session.itemId } };
  }
};

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/models/User.ts
var User = (0, import_core.list)({
  access: {
    operation: {
      query: isSignedIn,
      // Any signed-in user can query (filter limits to self)
      create: () => true,
      update: isSignedIn,
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "role", "employeeId", "staffRole", "isActive"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields2.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields2.text)({
      isFilterable: false,
      isOrderable: false,
      isIndexed: "unique",
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields2.password)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    apiKeys: (0, import_fields2.relationship)({
      ref: "ApiKey.user",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    phone: (0, import_fields2.text)({
      ui: {
        description: "Primary phone number for the user"
      }
    }),
    restaurantOrders: (0, import_fields2.relationship)({
      ref: "RestaurantOrder.customer",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    addresses: (0, import_fields2.relationship)({
      ref: "Address.user",
      many: true
    }),
    carts: (0, import_fields2.relationship)({
      ref: "Cart.user",
      many: true
    }),
    firstName: (0, import_fields2.virtual)({
      field: import_core.graphql.field({
        type: import_core.graphql.String,
        resolve(item) {
          const name = item.name || "";
          if (!name) return "";
          return name.trim().split(/\s+/)[0] || "";
        }
      })
    }),
    lastName: (0, import_fields2.virtual)({
      field: import_core.graphql.field({
        type: import_core.graphql.String,
        resolve(item) {
          const name = item.name || "";
          if (!name) return "";
          const parts = name.trim().split(/\s+/);
          return parts.length > 1 ? parts.slice(1).join(" ") : "";
        }
      })
    }),
    billingAddress: (0, import_fields2.virtual)({
      field: (lists) => import_core.graphql.field({
        type: lists.Address.types.output,
        async resolve(item, args, context) {
          const address = await context.db.Address.findMany({
            where: {
              user: { id: { equals: item.id } },
              isBilling: { equals: true }
            },
            take: 1
          });
          if (!address.length) return null;
          return address[0];
        }
      }),
      ui: {
        query: "{ id name address1 address2 city state postalCode phone isBilling }"
      }
    }),
    // Restaurant Staff Fields
    employeeId: (0, import_fields2.text)({
      db: { isNullable: true },
      ui: {
        description: "Unique employee identifier (staff only)"
      }
    }),
    staffRole: (0, import_fields2.select)({
      type: "string",
      options: [
        { label: "Server", value: "server" },
        { label: "Bartender", value: "bartender" },
        { label: "Host", value: "host" },
        { label: "Cook", value: "cook" },
        { label: "Manager", value: "manager" },
        { label: "Admin", value: "admin" },
        { label: "Busser", value: "busser" },
        { label: "Chef", value: "chef" }
      ],
      ui: {
        displayMode: "select",
        description: "Staff role in the restaurant"
      }
    }),
    hireDate: (0, import_fields2.timestamp)({
      ui: {
        description: "Date employee was hired"
      }
    }),
    hourlyRate: (0, import_fields2.decimal)({
      precision: 10,
      scale: 2,
      ui: {
        description: "Hourly wage rate"
      }
    }),
    pin: (0, import_fields2.text)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      ui: {
        description: "4-digit PIN for quick POS login"
      }
    }),
    staffPermissions: (0, import_fields2.json)({
      ui: {
        description: "Additional staff permissions and settings"
      }
    }),
    isActive: (0, import_fields2.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this employee is currently active"
      }
    }),
    onboardingStatus: (0, import_fields2.select)({
      type: "string",
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Dismissed", value: "dismissed" }
      ],
      defaultValue: "not_started",
      ui: {
        description: "Restaurant onboarding progress"
      }
    }),
    photo: (0, import_fields2.image)({
      storage: "my_images"
    }),
    // Emergency Contact Info
    emergencyContactName: (0, import_fields2.text)({
      ui: {
        description: "Emergency contact person name"
      }
    }),
    emergencyContactPhone: (0, import_fields2.text)({
      ui: {
        description: "Emergency contact phone number"
      }
    }),
    // Certifications
    certifications: (0, import_fields2.json)({
      ui: {
        description: "Food handler, alcohol service, and other certifications (JSON)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");
var Role = (0, import_core2.list)({
  access: {
    operation: {
      ...(0, import_access3.allOperations)(permissions.canManageRoles),
      query: () => true
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    // Dashboard
    canAccessDashboard: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Orders
    canReadOrders: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageOrders: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Payments
    canReadPayments: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManagePayments: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Products / Menu
    canReadProducts: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageProducts: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Cart
    canReadCart: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageCart: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Inventory
    canReadInventory: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageInventory: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Users
    canReadUsers: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageUsers: (0, import_fields3.checkbox)({ defaultValue: false }),
    canSeeOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canEditOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManagePeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Roles
    canReadRoles: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageRoles: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Kitchen
    canReadKitchen: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageKitchen: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Tables / Seating / Reservations
    canReadTables: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageTables: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Staff / Scheduling
    canReadStaff: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageStaff: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Settings
    canManageSettings: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Onboarding
    canManageOnboarding: (0, import_fields3.checkbox)({ defaultValue: true }),
    // Vendors
    canReadVendors: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageVendors: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Gift Cards
    canReadGiftCards: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageGiftCards: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Discounts
    canReadDiscounts: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageDiscounts: (0, import_fields3.checkbox)({ defaultValue: false }),
    assignedTo: (0, import_fields3.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Section.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");
var Section = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canReadTables,
      create: permissions.canManageTables,
      update: permissions.canManageTables,
      delete: permissions.canManageTables
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "tables"]
    }
  },
  fields: {
    name: (0, import_fields4.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    // Relationships
    tables: (0, import_fields4.relationship)({
      ref: "Table.section",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["tableNumber", "capacity", "status"],
        inlineCreate: { fields: ["tableNumber", "capacity", "status"] },
        inlineEdit: { fields: ["tableNumber", "capacity", "status"] }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Floor.ts
var import_core4 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var Floor = (0, import_core4.list)({
  access: {
    operation: {
      query: permissions.canReadTables,
      create: permissions.canManageTables,
      update: permissions.canManageTables,
      delete: permissions.canManageTables
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "level", "isActive"]
    }
  },
  fields: {
    name: (0, import_fields5.text)({
      validation: { isRequired: true },
      ui: {
        description: "Floor name (e.g., Main Floor, Second Floor, Patio)"
      }
    }),
    level: (0, import_fields5.integer)({
      validation: { isRequired: true },
      defaultValue: 1,
      ui: {
        description: "Floor level number (1 for ground floor, 2 for second floor, etc.)"
      }
    }),
    isActive: (0, import_fields5.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this floor is currently active for seating"
      }
    }),
    // Relationships
    tables: (0, import_fields5.relationship)({
      ref: "Table.floor",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["tableNumber", "capacity", "status"],
        inlineCreate: { fields: ["tableNumber", "capacity", "positionX", "positionY"] },
        inlineEdit: { fields: ["tableNumber", "capacity", "status", "positionX", "positionY"] }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Table.ts
var import_core5 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var Table = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canReadTables,
      create: permissions.canManageTables,
      update: permissions.canManageTables,
      delete: permissions.canManageTables
    }
  },
  ui: {
    listView: {
      initialColumns: ["tableNumber", "capacity", "section", "status"]
    }
  },
  fields: {
    tableNumber: (0, import_fields6.text)({
      validation: { isRequired: true },
      isIndexed: true
    }),
    capacity: (0, import_fields6.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 4
    }),
    status: (0, import_fields6.select)({
      type: "string",
      options: [
        { label: "Available", value: "available" },
        { label: "Occupied", value: "occupied" },
        { label: "Reserved", value: "reserved" },
        { label: "Cleaning", value: "cleaning" }
      ],
      defaultValue: "available",
      ui: {
        displayMode: "segmented-control"
      }
    }),
    shape: (0, import_fields6.select)({
      type: "string",
      options: [
        { label: "Round", value: "round" },
        { label: "Square", value: "square" },
        { label: "Rectangle", value: "rectangle" }
      ],
      defaultValue: "rectangle",
      ui: {
        description: "Table shape for floor plan rendering"
      }
    }),
    // Floor plan positioning
    positionX: (0, import_fields6.float)({
      defaultValue: 0,
      ui: {
        description: "X coordinate for floor plan rendering"
      }
    }),
    positionY: (0, import_fields6.float)({
      defaultValue: 0,
      ui: {
        description: "Y coordinate for floor plan rendering"
      }
    }),
    metadata: (0, import_fields6.json)({
      ui: {
        description: "Additional table metadata (dimensions, notes, etc.)"
      }
    }),
    // Relationships
    floor: (0, import_fields6.relationship)({
      ref: "Floor.tables",
      ui: {
        displayMode: "select",
        description: "Floor this table belongs to"
      }
    }),
    section: (0, import_fields6.relationship)({
      ref: "Section.tables",
      ui: {
        displayMode: "select"
      }
    }),
    orders: (0, import_fields6.relationship)({
      ref: "RestaurantOrder.tables",
      many: true,
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      }
    }),
    turnoverRate: (0, import_fields6.virtual)({
      field: import_core5.graphql.field({
        type: import_core5.graphql.Float,
        async resolve(item, args, context) {
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
          const ordersCount = await context.sudo().query.RestaurantOrder.count({
            where: {
              tables: { some: { id: { equals: item.id } } },
              createdAt: { gte: dayAgo.toISOString() },
              status: { equals: "completed" }
            }
          });
          return ordersCount;
        }
      }),
      ui: {
        description: "Number of completed orders in the last 24 hours"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MenuCategory.ts
var import_core6 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");
var MenuCategory = (0, import_core6.list)({
  access: {
    operation: {
      query: () => true,
      // Public read for storefront
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "icon", "mealPeriods", "sortOrder"]
    }
  },
  fields: {
    name: (0, import_fields7.text)({
      validation: { isRequired: true }
    }),
    icon: (0, import_fields7.text)({
      ui: {
        description: "Icon name for this category (optional)"
      }
    }),
    description: (0, import_fields7.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    mealPeriods: (0, import_fields7.multiselect)({
      type: "string",
      options: [
        { label: "Breakfast", value: "breakfast" },
        { label: "Lunch", value: "lunch" },
        { label: "Dinner", value: "dinner" },
        { label: "All Day", value: "all_day" }
      ],
      defaultValue: ["all_day"]
    }),
    sortOrder: (0, import_fields7.integer)({
      defaultValue: 0,
      ui: {
        description: "Order in which categories appear on the menu"
      }
    }),
    // Relationships
    menuItems: (0, import_fields7.relationship)({
      ref: "MenuItem.category",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["name", "price", "available"],
        inlineCreate: { fields: ["name", "price", "available"] },
        inlineEdit: { fields: ["name", "price", "available"] }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MenuItem.ts
var import_core7 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
var MenuItem = (0, import_core7.list)({
  access: {
    operation: {
      query: () => true,
      // Public read for storefront
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "price", "category", "available", "kitchenStation"]
    }
  },
  fields: {
    name: (0, import_fields8.text)({
      validation: { isRequired: true }
    }),
    thumbnail: (0, import_fields8.virtual)({
      field: import_core7.graphql.field({
        type: import_core7.graphql.String,
        resolve: async (item, args, context) => {
          const menuItem = await context.query.MenuItem.findOne({
            where: { id: String(item.id) },
            query: "menuItemImages(take: 1) { image { url } imagePath }"
          });
          const imageUrl = menuItem?.menuItemImages?.[0]?.image?.url;
          if (imageUrl) {
            return imageUrl;
          }
          const imagePath = menuItem?.menuItemImages?.[0]?.imagePath;
          if (!imagePath) {
            return null;
          }
          if (imagePath.startsWith("http://") || imagePath.startsWith("https://") || imagePath.startsWith("data:") || imagePath.startsWith("blob:") || imagePath.startsWith("/images/")) {
            return imagePath;
          }
          return imagePath.startsWith("/") ? `/images${imagePath}` : `/images/${imagePath}`;
        }
      })
    }),
    menuItemImages: (0, import_fields8.relationship)({
      ref: "MenuItemImage.menuItems",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["image", "altText", "imagePath"],
        inlineCreate: { fields: ["image", "altText", "imagePath"] },
        inlineEdit: { fields: ["image", "altText", "imagePath"] },
        inlineConnect: true,
        removeMode: "disconnect",
        linkToItem: false
      }
    }),
    description: (0, import_fields_document.document)({
      formatting: true,
      links: true
    }),
    price: (0, import_fields8.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Price in cents"
      }
    }),
    available: (0, import_fields8.checkbox)({
      defaultValue: true
    }),
    featured: (0, import_fields8.checkbox)({
      defaultValue: false,
      ui: {
        description: "Highlight this item on the storefront"
      }
    }),
    popular: (0, import_fields8.checkbox)({
      defaultValue: false,
      ui: {
        description: "Mark as popular item (shows 'Popular' badge)"
      }
    }),
    prepTime: (0, import_fields8.integer)({
      defaultValue: 15,
      ui: {
        description: "Preparation time in minutes"
      }
    }),
    calories: (0, import_fields8.integer)({
      ui: {
        description: "Calorie count for this menu item"
      }
    }),
    kitchenStation: (0, import_fields8.select)({
      type: "string",
      options: [
        { label: "Grill", value: "grill" },
        { label: "Fryer", value: "fryer" },
        { label: "Salad", value: "salad" },
        { label: "Dessert", value: "dessert" },
        { label: "Bar", value: "bar" },
        { label: "Expo", value: "expo" }
      ],
      defaultValue: "grill"
    }),
    allergens: (0, import_fields8.multiselect)({
      type: "string",
      options: [
        { label: "Gluten", value: "gluten" },
        { label: "Dairy", value: "dairy" },
        { label: "Eggs", value: "eggs" },
        { label: "Nuts", value: "nuts" },
        { label: "Shellfish", value: "shellfish" },
        { label: "Soy", value: "soy" },
        { label: "Fish", value: "fish" }
      ],
      defaultValue: []
    }),
    dietaryFlags: (0, import_fields8.multiselect)({
      type: "string",
      options: [
        { label: "Vegan", value: "vegan" },
        { label: "Vegetarian", value: "vegetarian" },
        { label: "Gluten-Free", value: "gluten_free" },
        { label: "Dairy-Free", value: "dairy_free" },
        { label: "Keto", value: "keto" }
      ],
      defaultValue: []
    }),
    mealPeriods: (0, import_fields8.multiselect)({
      type: "string",
      options: [
        { label: "Breakfast", value: "breakfast" },
        { label: "Lunch", value: "lunch" },
        { label: "Dinner", value: "dinner" },
        { label: "All Day", value: "all_day" }
      ],
      defaultValue: ["all_day"]
    }),
    // Relationships
    category: (0, import_fields8.relationship)({
      ref: "MenuCategory.menuItems",
      ui: {
        displayMode: "select"
      }
    }),
    modifiers: (0, import_fields8.relationship)({
      ref: "MenuItemModifier.menuItem",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["name", "priceAdjustment", "modifierGroup"],
        inlineCreate: { fields: ["name", "priceAdjustment", "modifierGroup"] },
        inlineEdit: { fields: ["name", "priceAdjustment", "modifierGroup"] }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MenuItemImage.ts
var import_core8 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var MenuItemImage = (0, import_core8.list)({
  access: {
    operation: {
      query: () => true,
      // Public read for storefront
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  fields: {
    image: (0, import_fields9.image)({ storage: "my_images" }),
    imagePath: (0, import_fields9.text)(),
    altText: (0, import_fields9.text)(),
    order: (0, import_fields9.integer)({
      defaultValue: 0
    }),
    menuItems: (0, import_fields9.relationship)({ ref: "MenuItem.menuItemImages", many: true }),
    metadata: (0, import_fields9.json)(),
    ...trackingFields
  },
  ui: {
    listView: {
      initialColumns: ["image", "imagePath", "altText", "menuItems"]
    }
  }
});

// features/keystone/models/MenuItemModifier.ts
var import_core9 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var MenuItemModifier = (0, import_core9.list)({
  access: {
    operation: {
      query: () => true,
      // Public read for storefront
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "modifierGroup", "priceAdjustment", "defaultSelected"]
    }
  },
  fields: {
    name: (0, import_fields10.text)({
      validation: { isRequired: true }
    }),
    modifierGroup: (0, import_fields10.select)({
      type: "string",
      options: [
        { label: "Size", value: "size" },
        { label: "Temperature", value: "temperature" },
        { label: "Add-ons", value: "addons" },
        { label: "Removals", value: "removals" },
        { label: "Sides", value: "sides" },
        { label: "Dressings", value: "dressings" },
        { label: "Cheese", value: "cheese" },
        { label: "Toppings", value: "toppings" },
        { label: "Sauces", value: "sauces" },
        { label: "Patty", value: "patty" },
        { label: "Ice", value: "ice" },
        { label: "Dipping", value: "dipping" }
      ],
      defaultValue: "addons"
    }),
    modifierGroupLabel: (0, import_fields10.text)({
      ui: {
        description: "Display name for this modifier group (e.g. 'Choose Your Patty')"
      }
    }),
    required: (0, import_fields10.checkbox)({
      defaultValue: false,
      ui: {
        description: "Whether a selection from this group is required"
      }
    }),
    minSelections: (0, import_fields10.integer)({
      defaultValue: 0,
      ui: {
        description: "Minimum number of selections required"
      }
    }),
    maxSelections: (0, import_fields10.integer)({
      defaultValue: 1,
      ui: {
        description: "Maximum number of selections allowed"
      }
    }),
    priceAdjustment: (0, import_fields10.integer)({
      defaultValue: 0,
      ui: {
        description: "Price adjustment in cents (can be negative for removals like no-cheese)"
      }
    }),
    calories: (0, import_fields10.integer)({
      ui: {
        description: "Calorie count for this modifier"
      }
    }),
    defaultSelected: (0, import_fields10.checkbox)({
      defaultValue: false,
      ui: {
        description: "Whether this modifier is selected by default"
      }
    }),
    // Relationships
    menuItem: (0, import_fields10.relationship)({
      ref: "MenuItem.modifiers",
      ui: {
        displayMode: "select"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/RestaurantOrder.ts
var import_core10 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var import_crypto2 = __toESM(require("crypto"));

// features/keystone/utils/kitchenTicketSync.ts
var import_crypto = __toESM(require("crypto"));

// features/keystone/utils/kitchenTicketEvents.ts
var import_node_crypto = __toESM(require("node:crypto"));
async function appendKitchenTicketEventWithClient(prisma, actorId, input) {
  const eventKey = input.eventKey || import_node_crypto.default.randomUUID();
  return prisma.kitchenTicketEvent.upsert({
    where: { eventKey },
    update: {},
    create: {
      eventKey,
      eventType: input.eventType,
      payload: input.payload,
      ticketId: input.ticketId || null,
      orderId: input.orderId || null,
      orderItemId: input.orderItemId || null,
      actorId: actorId || null
    }
  });
}
async function appendKitchenTicketEvent(context, input) {
  return appendKitchenTicketEventWithClient(context.prisma, context.session?.itemId, input);
}

// features/keystone/utils/kitchenTicketSync.ts
var ACTIVE_ORDER_STATUSES = ["sent_to_kitchen", "in_progress", "ready"];
var ACTIVE_TICKET_STATUSES = ["new", "in_progress", "ready"];
async function mutateKitchenState(context, operation) {
  await context.prisma.$transaction(
    (tx) => operation(tx, context.session?.itemId || null),
    { isolationLevel: "Serializable" }
  );
}
function normalizeStationName(name) {
  return name.trim().toLowerCase();
}
function displayStationName(value) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function isExpediterStation(stationName) {
  const n = (stationName || "").toLowerCase();
  return n.includes("expo") || n.includes("expediter");
}
function isKitchenActiveOrderStatus(status) {
  return ACTIVE_ORDER_STATUSES.includes(status || "");
}
function getTicketStatusForOrderStatus(orderStatus) {
  if (orderStatus === "ready") return "ready";
  if (orderStatus === "in_progress") return "in_progress";
  return "new";
}
async function getOrCreateStation(stationKey, context, cachedStations) {
  const normalized = normalizeStationName(stationKey);
  const existing = cachedStations.find((s) => normalizeStationName(s.name) === normalized);
  if (existing) return existing;
  const created = await context.sudo().db.KitchenStation.createOne({
    data: {
      name: displayStationName(stationKey),
      isActive: true,
      displayOrder: cachedStations.length
    }
  });
  const createdStation = {
    id: created.id,
    name: displayStationName(stationKey),
    displayOrder: cachedStations.length
  };
  cachedStations.push(createdStation);
  return createdStation;
}
function normalizeKitchenWork(item) {
  return {
    id: item.id,
    name: item.name,
    quantity: Number(item.quantity || 1),
    notes: item.notes || null,
    station: normalizeStationName(item.station || "expo"),
    modifiersSnapshot: item.modifiersSnapshot ?? null
  };
}
function createKitchenWorkSignature(item) {
  return import_crypto.default.createHash("sha256").update(JSON.stringify(normalizeKitchenWork(item))).digest("hex");
}
function isSameKitchenWork(historical, desired) {
  if (historical.workSignature && desired.workSignature) {
    return historical.workSignature === desired.workSignature;
  }
  return historical.id === desired.id && historical.name === desired.name && Number(historical.quantity || 1) === Number(desired.quantity || 1) && (historical.notes || null) === (desired.notes || null) && normalizeStationName(historical.station || "expo") === normalizeStationName(desired.station || "expo");
}
function getUncoveredKitchenWorkItems(desiredItems, stationTickets) {
  const handledItems = stationTickets.filter((ticket) => ["served", "completed"].includes(ticket.status || "")).flatMap((ticket) => ticket.items || []);
  const activeItems = stationTickets.filter((ticket) => ACTIVE_TICKET_STATUSES.includes(ticket.status || "")).flatMap((ticket) => ticket.items || []);
  const cancelledItems = stationTickets.filter((ticket) => ticket.status === "cancelled").flatMap((ticket) => ticket.items || []);
  return desiredItems.filter((desired) => {
    if (handledItems.some((historical) => isSameKitchenWork(historical, desired))) return false;
    if (activeItems.some((active) => isSameKitchenWork(active, desired))) return true;
    return !cancelledItems.some((historical) => isSameKitchenWork(historical, desired));
  });
}
function mapOrderItemsByStation(order) {
  const grouped = {};
  for (const item of order.orderItems || []) {
    if (!item?.id || item.isVoided) continue;
    const station = item.kitchenStationSnapshot || item.menuItem?.kitchenStation || "expo";
    const name = item.itemNameSnapshot || item.menuItem?.name || "Item";
    const quantity = item.quantity || 1;
    const notes = item.specialInstructions || null;
    if (!grouped[station]) grouped[station] = [];
    grouped[station].push({
      id: item.id,
      name,
      quantity,
      notes,
      station,
      status: "new",
      fulfilledAt: null,
      workSignature: createKitchenWorkSignature({
        id: item.id,
        name,
        quantity,
        notes,
        station,
        modifiersSnapshot: item.modifiersSnapshot
      })
    });
  }
  return grouped;
}
async function reconcileRestaurantOrderStatus(orderId, context) {
  const sudo = context.sudo();
  const [order, tickets] = await Promise.all([
    sudo.query.RestaurantOrder.findOne({
      where: { id: orderId },
      query: "id status"
    }),
    sudo.query.KitchenTicket.findMany({
      where: { order: { id: { equals: orderId } } },
      query: "id status"
    })
  ]);
  if (!order || !tickets.length) return;
  const hasNew = tickets.some((t) => t.status === "new");
  const hasInProgress = tickets.some((t) => t.status === "in_progress");
  const hasReady = tickets.some((t) => t.status === "ready");
  const hasServed = tickets.some((t) => t.status === "served");
  const allServed = tickets.every((t) => ["served", "cancelled"].includes(t.status));
  let nextStatus = null;
  if (hasInProgress) nextStatus = "in_progress";
  else if (hasReady && !hasNew) nextStatus = "ready";
  else if (hasReady || hasNew) nextStatus = "sent_to_kitchen";
  else if (allServed || hasServed) nextStatus = "served";
  if (nextStatus && nextStatus !== order.status) {
    await sudo.db.RestaurantOrder.updateOne({
      where: { id: orderId },
      data: { status: nextStatus }
    });
  }
}
async function syncKitchenTicketsForOrder(orderId, context) {
  const sudo = context.sudo();
  const order = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: `
      id
      status
      isUrgent
      onHold
      createdAt
      orderItems {
        id
        quantity
        specialInstructions
        itemNameSnapshot
        kitchenStationSnapshot
        modifiersSnapshot
        isVoided
        menuItem { id name kitchenStation }
      }
    `
  });
  if (!order) {
    return { created: 0, updated: 0, removed: 0 };
  }
  const existingTickets = await sudo.query.KitchenTicket.findMany({
    where: {
      order: { id: { equals: order.id } },
      status: { in: [...ACTIVE_TICKET_STATUSES, "served", "cancelled"] }
    },
    query: "id items status priority ticketType firedAt station { id name }",
    orderBy: { firedAt: "asc" }
  });
  if (order.status === "completed" || order.status === "cancelled") {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let updated2 = 0;
    for (const ticket of existingTickets.filter((t) => ACTIVE_TICKET_STATUSES.includes(t.status))) {
      const nextStatus = order.status === "completed" ? "served" : "cancelled";
      await mutateKitchenState(context, async (tx, actorId) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: {
            status: nextStatus,
            completedAt: order.status === "completed" ? new Date(now) : void 0,
            servedAt: order.status === "completed" ? new Date(now) : void 0
          }
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: order.status === "completed" ? "status" : "cancel",
          ticketId: ticket.id,
          orderId: order.id,
          payload: { from: ticket.status, to: nextStatus, source: "order_terminal_state" },
          eventKey: `ticket-terminal:${ticket.id}:${nextStatus}`
        });
      });
      updated2 += 1;
    }
    return { created: 0, updated: updated2, removed: 0 };
  }
  if (!isKitchenActiveOrderStatus(order.status)) {
    return { created: 0, updated: 0, removed: 0 };
  }
  const stations = await sudo.query.KitchenStation.findMany({
    query: "id name displayOrder",
    where: { isActive: { equals: true } },
    orderBy: { displayOrder: "asc" }
  });
  const stationItemMap = mapOrderItemsByStation(order);
  let created = 0;
  let updated = 0;
  let removed = 0;
  const desiredStationKeys = new Set(Object.keys(stationItemMap).map(normalizeStationName));
  if (desiredStationKeys.size === 0) {
    for (const ticket of existingTickets.filter((t) => ACTIVE_TICKET_STATUSES.includes(t.status))) {
      await mutateKitchenState(context, async (tx, actorId) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: {
            status: "cancelled",
            items: (ticket.items || []).map((item) => ({ ...item, status: "cancelled" }))
          }
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: "cancel",
          ticketId: ticket.id,
          orderId: order.id,
          payload: { reason: "No active order items remain", previousItems: ticket.items || [] },
          eventKey: `ticket-cancel-empty:${ticket.id}`
        });
      });
      updated += 1;
    }
    return { created, updated, removed };
  }
  for (const [stationKey, items] of Object.entries(stationItemMap)) {
    const station = await getOrCreateStation(stationKey, context, stations);
    const stationTickets = existingTickets.filter(
      (ticket) => normalizeStationName(ticket.station?.name || "") === normalizeStationName(station.name)
    );
    const matchingTickets = stationTickets.filter(
      (ticket) => ACTIVE_TICKET_STATUSES.includes(ticket.status)
    );
    const workItems = getUncoveredKitchenWorkItems(items, stationTickets);
    const priority = order.isUrgent ? 100 : order.onHold ? -10 : 0;
    const ticketType = isExpediterStation(station.name) ? "expediter" : "prep";
    if (workItems.length === 0) {
      for (const stale of matchingTickets) {
        await mutateKitchenState(context, async (tx, actorId) => {
          await tx.kitchenTicket.update({
            where: { id: stale.id },
            data: {
              status: "cancelled",
              items: (stale.items || []).map((item) => ({
                ...item,
                status: "cancelled"
              }))
            }
          });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "cancel",
            ticketId: stale.id,
            orderId: order.id,
            payload: { reason: "Terminal ticket already covers unchanged kitchen work" },
            eventKey: `ticket-terminal-covered-cancel:${stale.id}`
          });
        });
        updated += 1;
      }
      continue;
    }
    if (matchingTickets.length > 0) {
      const existing = matchingTickets[0];
      const existingItems = existing.items || [];
      const existingMap = new Map(existingItems.map((i) => [i.id, i]));
      const currentIds = new Set(workItems.map((item) => item.id));
      const cancelledItems = existingItems.filter((item) => !currentIds.has(item.id)).map((item) => ({ ...item, status: "cancelled" }));
      const mergedItems = [
        ...workItems.map((item) => {
          const prev = existingMap.get(item.id);
          if (!prev) return item;
          return {
            ...item,
            status: prev.status === "cancelled" ? "new" : prev.status || "new",
            fulfilledAt: prev.fulfilledAt || null
          };
        }),
        ...cancelledItems
      ];
      const projectionChanged = JSON.stringify(existingItems) !== JSON.stringify(mergedItems) || Number(existing.priority || 0) !== priority || existing.ticketType !== ticketType || !existing.firedAt;
      if (projectionChanged) {
        const digest = import_crypto.default.createHash("sha256").update(JSON.stringify({ mergedItems, priority, ticketType })).digest("hex");
        await mutateKitchenState(context, async (tx, actorId) => {
          await tx.kitchenTicket.update({
            where: { id: existing.id },
            data: {
              items: mergedItems,
              orderItems: { set: mergedItems.map((item) => ({ id: item.id })) },
              priority,
              ticketType,
              firedAt: existing.firedAt ? new Date(existing.firedAt) : new Date(order.createdAt)
            }
          });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "delta",
            ticketId: existing.id,
            orderId: order.id,
            payload: { before: existingItems, after: mergedItems, priority, ticketType },
            eventKey: `ticket-delta:${existing.id}:${digest}`
          });
        });
        updated += 1;
      }
      for (const duplicate of matchingTickets.slice(1)) {
        await mutateKitchenState(context, async (tx, actorId) => {
          await tx.kitchenTicket.update({ where: { id: duplicate.id }, data: { status: "cancelled" } });
          await appendKitchenTicketEventWithClient(tx, actorId, {
            eventType: "cancel",
            ticketId: duplicate.id,
            orderId: order.id,
            payload: { reason: "Duplicate active projection superseded", canonicalTicketId: existing.id },
            eventKey: `ticket-duplicate-cancel:${duplicate.id}`
          });
        });
        updated += 1;
      }
    } else {
      await mutateKitchenState(context, async (tx, actorId) => {
        const createdTicket = await tx.kitchenTicket.create({
          data: {
            orderId: order.id,
            stationId: station.id,
            items: workItems,
            orderItems: { connect: workItems.map((item) => ({ id: item.id })) },
            priority,
            ticketType,
            status: getTicketStatusForOrderStatus(order.status),
            firedAt: new Date(order.createdAt)
          }
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: "dispatch",
          ticketId: createdTicket.id,
          orderId: order.id,
          payload: { station: station.name, items: workItems, priority, ticketType },
          eventKey: `ticket-dispatch:${createdTicket.id}`
        });
      });
      created += 1;
    }
  }
  for (const ticket of existingTickets.filter((ticket2) => ACTIVE_TICKET_STATUSES.includes(ticket2.status))) {
    const stationName = normalizeStationName(ticket.station?.name || "");
    if (!desiredStationKeys.has(stationName)) {
      await mutateKitchenState(context, async (tx, actorId) => {
        await tx.kitchenTicket.update({
          where: { id: ticket.id },
          data: {
            status: "cancelled",
            items: (ticket.items || []).map((item) => ({ ...item, status: "cancelled" }))
          }
        });
        await appendKitchenTicketEventWithClient(tx, actorId, {
          eventType: "cancel",
          ticketId: ticket.id,
          orderId: order.id,
          payload: { reason: "Station no longer has active items", previousItems: ticket.items || [] },
          eventKey: `ticket-station-cancel:${ticket.id}`
        });
      });
      updated += 1;
    }
  }
  await reconcileRestaurantOrderStatus(order.id, context);
  return { created, updated, removed };
}
async function syncKitchenTicketsForActiveOrders(context) {
  const orders = await context.sudo().query.RestaurantOrder.findMany({
    where: {
      status: { in: [...ACTIVE_ORDER_STATUSES] }
    },
    orderBy: { createdAt: "asc" },
    query: "id"
  });
  let created = 0;
  let updated = 0;
  let removed = 0;
  for (const order of orders) {
    const result2 = await syncKitchenTicketsForOrder(order.id, context);
    created += result2.created;
    updated += result2.updated;
    removed += result2.removed;
  }
  return { created, updated, removed };
}

// features/keystone/utils/inventoryLedger.ts
async function depleteInventoryForCompletedOrder(orderId, context) {
  const sudo = context.sudo();
  const order = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id orderNumber status orderItems { id quantity menuItem { id } }"
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "completed") throw new Error("Inventory can only be depleted for a completed order");
  const lines = [];
  for (const orderItem of order.orderItems || []) {
    if (!orderItem.menuItem?.id) continue;
    const recipes = await sudo.query.Recipe.findMany({
      where: { menuItem: { id: { equals: orderItem.menuItem.id } } },
      query: "id recipeIngredients yield",
      take: 1
    });
    const recipe = recipes[0];
    if (!recipe || !Array.isArray(recipe.recipeIngredients)) continue;
    const recipeYield = Math.max(1, Number(recipe.yield || 1));
    const portions = Number(orderItem.quantity || 0) / recipeYield;
    for (const recipeIngredient of recipe.recipeIngredients) {
      const ingredientId = String(recipeIngredient?.ingredientId || "");
      const quantity = Number(recipeIngredient?.quantity || 0) * portions;
      if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) continue;
      lines.push({
        eventKey: `sale:${order.id}:${orderItem.id}:${ingredientId}`,
        orderItemId: orderItem.id,
        ingredientId,
        quantity: Math.round(quantity * 100) / 100,
        recipeId: recipe.id,
        recipeYield
      });
    }
  }
  const prisma = context.prisma;
  return prisma.$transaction(async (tx) => {
    let created = 0;
    for (const line of lines) {
      const existing = await tx.stockMovement.findUnique({ where: { eventKey: line.eventKey } });
      if (existing) continue;
      const ingredient = await tx.ingredient.findUnique({ where: { id: line.ingredientId } });
      if (!ingredient) throw new Error(`Ingredient not found: ${line.ingredientId}`);
      const nextStock = Number(ingredient.currentStock || 0) - line.quantity;
      await tx.stockMovement.create({
        data: {
          eventKey: line.eventKey,
          referenceType: "OrderItem",
          referenceId: line.orderItemId,
          metadata: {
            orderId: order.id,
            recipeId: line.recipeId,
            recipeYield: line.recipeYield,
            theoretical: true
          },
          ingredientId: line.ingredientId,
          orderId: order.id,
          type: "sale",
          quantity: (-line.quantity).toFixed(2),
          reason: `Theoretical depletion for order ${order.orderNumber}`
        }
      });
      await tx.ingredient.update({
        where: { id: line.ingredientId },
        data: { currentStock: nextStock.toFixed(2) }
      });
      created += 1;
    }
    return { created, existing: lines.length - created };
  }, { isolationLevel: "Serializable" });
}

// features/keystone/models/RestaurantOrder.ts
var RestaurantOrder = (0, import_core10.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadOrders({ session }) || permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["orderNumber", "orderType", "status", "tables", "server", "total"]
    }
  },
  hooks: {
    afterOperation: async ({ operation, item, originalItem, context }) => {
      const sudo = context.sudo();
      if (operation === "create" && item && item.orderType === "dine_in") {
        const orderWithTables = await sudo.query.RestaurantOrder.findOne({
          where: { id: item.id },
          query: "tables { id }"
        });
        if (orderWithTables?.tables?.length) {
          await Promise.all(orderWithTables.tables.map(
            (table) => sudo.db.Table.updateOne({ where: { id: table.id }, data: { status: "occupied" } })
          ));
        }
      }
      if (operation === "update" && item && item.orderType === "dine_in") {
        if (item.status === "completed" || item.status === "cancelled") {
          const orderWithTables = await sudo.query.RestaurantOrder.findOne({
            where: { id: item.id },
            query: "tables { id }"
          });
          if (orderWithTables?.tables?.length) {
            await Promise.all(orderWithTables.tables.map(
              (table) => sudo.db.Table.updateOne({ where: { id: table.id }, data: { status: "cleaning" } })
            ));
          }
        }
      }
      const previousStatus = originalItem?.status;
      const currentStatus = item?.status;
      const orderId = String(item?.id || "");
      const enteredKitchenFlow = operation === "create" ? isKitchenActiveOrderStatus(item?.status) : isKitchenActiveOrderStatus(currentStatus) && !isKitchenActiveOrderStatus(previousStatus);
      const leftKitchenFlow = operation === "update" && isKitchenActiveOrderStatus(previousStatus) && ["completed", "cancelled"].includes(currentStatus || "");
      if (orderId && (enteredKitchenFlow || leftKitchenFlow)) {
        try {
          await syncKitchenTicketsForOrder(orderId, context);
        } catch (err) {
          console.error("Kitchen ticket sync error:", err);
        }
      }
      if (operation === "update" && item?.status === "completed" && originalItem?.status !== "completed") {
        try {
          await depleteInventoryForCompletedOrder(String(item.id), context);
        } catch (err) {
          console.error("Transactional inventory depletion failed; reconciliation is required:", err);
        }
      }
    }
  },
  fields: {
    orderNumber: (0, import_fields11.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    orderType: (0, import_fields11.select)({
      type: "string",
      options: [
        { label: "Dine-in", value: "dine_in" },
        { label: "Takeout", value: "takeout" },
        { label: "Delivery", value: "delivery" }
      ],
      defaultValue: "dine_in"
    }),
    orderSource: (0, import_fields11.select)({
      type: "string",
      options: [
        { label: "POS", value: "pos" },
        { label: "Online", value: "online" },
        { label: "Kiosk", value: "kiosk" },
        { label: "Phone", value: "phone" }
      ],
      defaultValue: "pos"
    }),
    status: (0, import_fields11.select)({
      type: "string",
      options: [
        { label: "Open", value: "open" },
        { label: "Sent to Kitchen", value: "sent_to_kitchen" },
        { label: "In Progress", value: "in_progress" },
        { label: "Ready", value: "ready" },
        { label: "Served", value: "served" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "open"
    }),
    guestCount: (0, import_fields11.integer)({ defaultValue: 1, validation: { min: 1 } }),
    specialInstructions: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    onHold: (0, import_fields11.checkbox)({ defaultValue: false }),
    holdReason: (0, import_fields11.text)(),
    isUrgent: (0, import_fields11.checkbox)({ defaultValue: false }),
    subtotal: (0, import_fields11.integer)({ defaultValue: 0 }),
    tax: (0, import_fields11.integer)({ defaultValue: 0 }),
    tip: (0, import_fields11.integer)({ defaultValue: 0 }),
    discount: (0, import_fields11.integer)({ defaultValue: 0 }),
    total: (0, import_fields11.integer)({ defaultValue: 0 }),
    currencyCode: (0, import_fields11.text)({
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code at time of order" },
      hooks: {
        resolveInput: async ({ operation, inputData, context }) => {
          if (operation === "create" && !inputData.currencyCode) {
            const settings = await context.sudo().query.StoreSettings.findOne({
              where: { id: "1" },
              query: "currencyCode"
            });
            return settings?.currencyCode || "USD";
          }
          return inputData.currencyCode;
        }
      }
    }),
    // Customer Info
    customerName: (0, import_fields11.text)(),
    customerEmail: (0, import_fields11.text)(),
    customerPhone: (0, import_fields11.text)(),
    // Delivery Info
    deliveryAddress: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    deliveryAddress2: (0, import_fields11.text)(),
    deliveryCity: (0, import_fields11.text)(),
    deliveryState: (0, import_fields11.text)(),
    deliveryZip: (0, import_fields11.text)(),
    deliveryCountryCode: (0, import_fields11.text)(),
    secretKey: (0, import_fields11.text)({
      hooks: {
        resolveInput: ({ operation }) => {
          if (operation === "create") {
            return import_crypto2.default.randomBytes(32).toString("hex");
          }
          return void 0;
        }
      }
    }),
    tableSeatedAt: (0, import_fields11.timestamp)({ defaultValue: { kind: "now" } }),
    tableFreedAt: (0, import_fields11.timestamp)(),
    tableDurationMinutes: (0, import_fields11.virtual)({
      field: import_core10.graphql.field({
        type: import_core10.graphql.Int,
        resolve(item) {
          if (!item.tableSeatedAt) return null;
          const end = item.tableFreedAt ? new Date(item.tableFreedAt) : /* @__PURE__ */ new Date();
          const start = new Date(item.tableSeatedAt);
          return Math.floor((end.getTime() - start.getTime()) / 6e4);
        }
      })
    }),
    courseCompletionPercentage: (0, import_fields11.virtual)({
      field: import_core10.graphql.field({
        type: import_core10.graphql.Int,
        async resolve(item, args, context) {
          const courses = await context.sudo().query.OrderCourse.findMany({
            where: { order: { id: { equals: item.id } } },
            query: "status"
          });
          if (courses.length === 0) return 0;
          return Math.round(courses.filter((c) => c.status === "served").length / courses.length * 100);
        }
      })
    }),
    tables: (0, import_fields11.relationship)({ ref: "Table.orders", many: true }),
    customer: (0, import_fields11.relationship)({ ref: "User.restaurantOrders" }),
    server: (0, import_fields11.relationship)({ ref: "User", ui: { labelField: "name" } }),
    createdBy: (0, import_fields11.relationship)({ ref: "User", ui: { labelField: "name" } }),
    courses: (0, import_fields11.relationship)({ ref: "OrderCourse.order", many: true }),
    orderItems: (0, import_fields11.relationship)({ ref: "OrderItem.order", many: true }),
    payments: (0, import_fields11.relationship)({ ref: "Payment.order", many: true }),
    discounts: (0, import_fields11.relationship)({ ref: "Discount.orders", many: true }),
    giftCards: (0, import_fields11.relationship)({ ref: "GiftCard.order", many: true }),
    ...trackingFields
  }
});

// features/keystone/models/Address.ts
var import_core11 = require("@keystone-6/core");
var import_fields12 = require("@keystone-6/core/fields");
var Address = (0, import_core11.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManagePeople({ session })) return true;
        return { user: { id: { equals: session?.itemId } } };
      },
      update: ({ session }) => {
        if (permissions.canManagePeople({ session })) return true;
        return { user: { id: { equals: session?.itemId } } };
      },
      delete: ({ session }) => {
        if (permissions.canManagePeople({ session })) return true;
        return { user: { id: { equals: session?.itemId } } };
      }
    }
  },
  fields: {
    label: (0, import_fields12.virtual)({
      field: import_core11.graphql.field({
        type: import_core11.graphql.String,
        resolve(item) {
          const parts = [];
          if (item.name) parts.push(item.name);
          if (item.address1) parts.push(item.address1);
          if (item.city) parts.push(item.city);
          return parts.join(", ");
        }
      })
    }),
    name: (0, import_fields12.text)({ validation: { isRequired: true } }),
    address1: (0, import_fields12.text)({ validation: { isRequired: true } }),
    address2: (0, import_fields12.text)(),
    city: (0, import_fields12.text)({ validation: { isRequired: true } }),
    state: (0, import_fields12.text)(),
    postalCode: (0, import_fields12.text)({ validation: { isRequired: true } }),
    countryCode: (0, import_fields12.text)({ defaultValue: "US" }),
    country: (0, import_fields12.text)(),
    phone: (0, import_fields12.text)(),
    isDefault: (0, import_fields12.checkbox)({ defaultValue: false }),
    isBilling: (0, import_fields12.checkbox)({ defaultValue: false }),
    metadata: (0, import_fields12.json)(),
    user: (0, import_fields12.relationship)({ ref: "User.addresses" }),
    ...trackingFields
  },
  ui: {
    labelField: "label",
    listView: {
      initialColumns: ["label", "user", "isDefault"]
    }
  }
});

// features/keystone/models/OrderItem.ts
var import_core12 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
var OrderItem = (0, import_core12.list)({
  hooks: {
    afterOperation: async ({ operation, item, originalItem, context }) => {
      const orderId = String(
        item?.orderId || item?.order?.id || originalItem?.orderId || originalItem?.order?.id || ""
      );
      if (!orderId) return;
      const order = await context.sudo().query.RestaurantOrder.findOne({
        where: { id: orderId },
        query: "id status"
      });
      if (!order || !isKitchenActiveOrderStatus(order.status)) return;
      try {
        await syncKitchenTicketsForOrder(order.id, context);
      } catch (err) {
        console.error(`Kitchen ticket sync error after order item ${operation}:`, err);
      }
    }
  },
  access: {
    operation: {
      query: permissions.canReadOrders,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["menuItem", "quantity", "price", "order"]
    }
  },
  fields: {
    quantity: (0, import_fields13.integer)({
      defaultValue: 1,
      validation: { min: 1, isRequired: true }
    }),
    price: (0, import_fields13.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Price at time of order in cents (snapshot)"
      }
    }),
    unitPrice: (0, import_fields13.virtual)({
      field: import_core12.graphql.field({
        type: import_core12.graphql.Int,
        resolve(item) {
          return item.price || 0;
        }
      })
    }),
    totalPrice: (0, import_fields13.virtual)({
      field: import_core12.graphql.field({
        type: import_core12.graphql.Int,
        resolve(item) {
          return (item.price || 0) * (item.quantity || 1);
        }
      })
    }),
    itemNameSnapshot: (0, import_fields13.text)({
      validation: { isRequired: true },
      ui: { description: "Immutable menu item name captured when ordered" }
    }),
    itemThumbnailSnapshot: (0, import_fields13.text)({
      ui: { description: "Immutable menu image URL captured when ordered" }
    }),
    kitchenStationSnapshot: (0, import_fields13.text)({
      ui: { description: "Kitchen routing station captured when ordered" }
    }),
    menuItemIdSnapshot: (0, import_fields13.text)({
      ui: { description: "Historical menu item identifier; not an authority for display" }
    }),
    originalOrderIdSnapshot: (0, import_fields13.text)({
      ui: { description: "Original check identifier retained when an item is split" }
    }),
    modifiersSnapshot: (0, import_fields13.json)({
      ui: { description: "Immutable modifier names, groups, and prices captured when ordered" }
    }),
    thumbnail: (0, import_fields13.virtual)({
      field: import_core12.graphql.field({
        type: import_core12.graphql.String,
        async resolve(item, args, context) {
          if (item.itemThumbnailSnapshot) return item.itemThumbnailSnapshot;
          const orderItem = await context.sudo().query.OrderItem.findOne({
            where: { id: String(item.id) },
            query: "itemThumbnailSnapshot menuItem { thumbnail }"
          });
          return orderItem?.itemThumbnailSnapshot || orderItem?.menuItem?.thumbnail || null;
        }
      })
    }),
    adjustmentTotal: (0, import_fields13.integer)({
      defaultValue: 0,
      validation: { min: 0 },
      ui: { description: "Append-derived comp/correction amount; original price remains unchanged" }
    }),
    isVoided: (0, import_fields13.checkbox)({ defaultValue: false }),
    voidedAt: (0, import_fields13.timestamp)(),
    voidReason: (0, import_fields13.text)({ ui: { displayMode: "textarea" } }),
    voidedBy: (0, import_fields13.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields13.relationship)({ ref: "User" }),
    specialInstructions: (0, import_fields13.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    courseNumber: (0, import_fields13.integer)({
      defaultValue: 1,
      ui: {
        description: "For fine dining: 1=appetizer, 2=main, 3=dessert"
      }
    }),
    seatNumber: (0, import_fields13.integer)({
      ui: {
        description: "Seat number for split check support"
      }
    }),
    sentToKitchen: (0, import_fields13.timestamp)({
      ui: {
        description: "When this item was sent to kitchen"
      }
    }),
    kitchenStatus: (0, import_fields13.select)({
      type: "string",
      options: [
        { label: "New", value: "new" },
        { label: "In Progress", value: "in_progress" },
        { label: "Ready", value: "ready" },
        { label: "Fulfilled", value: "fulfilled" },
        { label: "Recalled", value: "recalled" },
        { label: "Voided", value: "voided" }
      ],
      defaultValue: "new",
      ui: {
        description: "Kitchen lifecycle state for this item"
      }
    }),
    firedAt: (0, import_fields13.timestamp)({
      ui: {
        description: "When this item was fired to prep station"
      }
    }),
    kitchenStartedAt: (0, import_fields13.timestamp)({
      ui: {
        description: "When prep started"
      }
    }),
    kitchenReadyAt: (0, import_fields13.timestamp)({
      ui: {
        description: "When item was marked ready"
      }
    }),
    fulfilledAt: (0, import_fields13.timestamp)({
      ui: {
        description: "When item was fulfilled/served"
      }
    }),
    recalledAt: (0, import_fields13.timestamp)({
      ui: {
        description: "When item was recalled from ready state"
      }
    }),
    // Relationships
    order: (0, import_fields13.relationship)({
      ref: "RestaurantOrder.orderItems",
      ui: {
        displayMode: "select"
      }
    }),
    course: (0, import_fields13.relationship)({
      ref: "OrderCourse.orderItems",
      ui: {
        displayMode: "select"
      }
    }),
    menuItem: (0, import_fields13.relationship)({
      ref: "MenuItem",
      ui: {
        displayMode: "select"
      }
    }),
    // Applied modifiers for this order item
    appliedModifiers: (0, import_fields13.relationship)({
      ref: "MenuItemModifier",
      many: true,
      ui: {
        displayMode: "select"
      }
    }),
    kitchenTickets: (0, import_fields13.relationship)({
      ref: "KitchenTicket.orderItems",
      many: true,
      ui: {
        displayMode: "select",
        description: "Kitchen tickets this item has appeared on"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/OrderCourse.ts
var import_core13 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
var OrderCourse = (0, import_core13.list)({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: permissions.canManageKitchen,
      update: permissions.canManageKitchen,
      delete: permissions.canManageKitchen
    }
  },
  ui: {
    listView: {
      initialColumns: ["order", "courseType", "status", "fireTime"]
    }
  },
  fields: {
    courseType: (0, import_fields14.select)({
      type: "string",
      options: [
        { label: "Appetizers", value: "appetizers" },
        { label: "Mains", value: "mains" },
        { label: "Desserts", value: "desserts" },
        { label: "Drinks", value: "drinks" }
      ],
      defaultValue: "mains",
      validation: { isRequired: true }
    }),
    status: (0, import_fields14.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Fired", value: "fired" },
        { label: "Ready", value: "ready" },
        { label: "Served", value: "served" }
      ],
      defaultValue: "pending"
    }),
    fireTime: (0, import_fields14.timestamp)({
      ui: {
        description: "When this course was sent to the kitchen"
      }
    }),
    autoFireAt: (0, import_fields14.timestamp)({
      ui: {
        description: "Scheduled time to auto-fire this course"
      }
    }),
    onHold: (0, import_fields14.checkbox)({ defaultValue: false }),
    allItemsReady: (0, import_fields14.checkbox)({
      defaultValue: false
    }),
    courseNumber: (0, import_fields14.integer)({
      defaultValue: 1
    }),
    // Relationships
    order: (0, import_fields14.relationship)({
      ref: "RestaurantOrder.courses",
      ui: {
        displayMode: "select"
      }
    }),
    orderItems: (0, import_fields14.relationship)({
      ref: "OrderItem.course",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/KitchenMessage.ts
var import_core14 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
var KitchenMessage = (0, import_core14.list)({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: permissions.canManageKitchen,
      update: permissions.canManageKitchen,
      delete: permissions.canManageKitchen
    }
  },
  fields: {
    content: (0, import_fields15.text)({ validation: { isRequired: true } }),
    type: (0, import_fields15.select)({
      options: [
        { label: "General", value: "general" },
        { label: "Urgent", value: "urgent" },
        { label: "86 Alert", value: "86_alert" }
      ],
      defaultValue: "general"
    }),
    fromStation: (0, import_fields15.select)({
      options: [
        { label: "Kitchen", value: "kitchen" },
        { label: "FOH", value: "foh" }
      ],
      defaultValue: "foh"
    }),
    // Relationships
    order: (0, import_fields15.relationship)({ ref: "RestaurantOrder" }),
    sender: (0, import_fields15.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/Recipe.ts
var import_core15 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var Recipe = (0, import_core15.list)({
  access: {
    operation: {
      query: () => true,
      // Public read for storefront
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "menuItem", "yield", "totalCost"]
    },
    labelField: "name"
  },
  fields: {
    name: (0, import_fields16.text)({ validation: { isRequired: true } }),
    menuItem: (0, import_fields16.relationship)({
      ref: "MenuItem",
      many: false
    }),
    recipeIngredients: (0, import_fields16.json)({
      ui: {
        description: "Array of { ingredientId: string, quantity: number, unit: string }"
      }
    }),
    yield: (0, import_fields16.integer)({
      defaultValue: 1,
      ui: { description: "Number of servings this recipe produces" }
    }),
    prepTime: (0, import_fields16.integer)({
      ui: { description: "Preparation time in minutes" }
    }),
    instructions: (0, import_fields16.text)({
      ui: { displayMode: "textarea" }
    }),
    totalCost: (0, import_fields16.virtual)({
      field: import_core15.graphql.field({
        type: import_core15.graphql.Float,
        async resolve(item, args, context) {
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients;
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: "costPerUnit"
            });
            if (ingredient?.costPerUnit) {
              total += parseFloat(ingredient.costPerUnit) * (ri.quantity || 0);
            }
          }
          return total;
        }
      })
    }),
    costPerServing: (0, import_fields16.virtual)({
      field: import_core15.graphql.field({
        type: import_core15.graphql.Float,
        async resolve(item, args, context) {
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients;
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: "costPerUnit"
            });
            if (ingredient?.costPerUnit) {
              total += parseFloat(ingredient.costPerUnit) * (ri.quantity || 0);
            }
          }
          return total / (item.yield || 1);
        }
      })
    }),
    foodCostPercentage: (0, import_fields16.virtual)({
      field: import_core15.graphql.field({
        type: import_core15.graphql.Float,
        async resolve(item, args, context) {
          if (!item.menuItemId) return 0;
          const menuItem = await context.sudo().query.MenuItem.findOne({
            where: { id: item.menuItemId },
            query: "price"
          });
          if (!menuItem?.price || parseFloat(menuItem.price) === 0) return 0;
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients;
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: "costPerUnit"
            });
            if (ingredient?.costPerUnit) {
              total += parseFloat(ingredient.costPerUnit) * (ri.quantity || 0);
            }
          }
          const costPerServing = total / (item.yield || 1);
          return costPerServing / parseFloat(menuItem.price) * 100;
        }
      })
    }),
    ...trackingFields
  }
});

// features/keystone/models/Reservation.ts
var import_core16 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
var Reservation = (0, import_core16.list)({
  access: {
    operation: {
      query: permissions.canReadTables,
      create: permissions.canManageTables,
      update: permissions.canManageTables,
      delete: permissions.canManageTables
    }
  },
  ui: {
    listView: {
      initialColumns: ["customerName", "reservationDate", "partySize", "status", "assignedTable"]
    }
  },
  fields: {
    customerName: (0, import_fields17.text)({
      validation: { isRequired: true }
    }),
    customerPhone: (0, import_fields17.text)({
      validation: { isRequired: true }
    }),
    customerEmail: (0, import_fields17.text)(),
    reservationDate: (0, import_fields17.timestamp)({
      validation: { isRequired: true }
    }),
    partySize: (0, import_fields17.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 2
    }),
    duration: (0, import_fields17.integer)({
      defaultValue: 90,
      ui: {
        description: "Expected duration in minutes"
      }
    }),
    status: (0, import_fields17.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Seated", value: "seated" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "No-show", value: "no_show" }
      ],
      defaultValue: "pending"
    }),
    specialRequests: (0, import_fields17.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    // Relationships
    assignedTable: (0, import_fields17.relationship)({
      ref: "Table",
      ui: {
        displayMode: "select"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Payment.ts
var import_core17 = require("@keystone-6/core");
var import_fields18 = require("@keystone-6/core/fields");
var Payment = (0, import_core17.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["amount", "status", "paymentMethod", "order", "createdAt"]
    }
  },
  fields: {
    idempotencyKey: (0, import_fields18.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    reservedAt: (0, import_fields18.timestamp)(),
    refundedAmount: (0, import_fields18.integer)({ defaultValue: 0, validation: { min: 0 } }),
    amount: (0, import_fields18.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in cents"
      }
    }),
    data: (0, import_fields18.json)({
      ui: {
        description: "Payment provider data (clientSecret, paymentIntentId, orderId, etc.)"
      }
    }),
    currencyCode: (0, import_fields18.text)({
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code for this payment" },
      hooks: {
        resolveInput: async ({ operation, inputData, context }) => {
          if (operation === "create" && !inputData.currencyCode) {
            const settings = await context.sudo().query.StoreSettings.findOne({
              where: { id: "1" },
              query: "currencyCode"
            });
            return settings?.currencyCode || "USD";
          }
          return inputData.currencyCode;
        }
      }
    }),
    status: (0, import_fields18.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Authorized", value: "authorized" },
        { label: "Unknown", value: "unknown" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" },
        { label: "Partially Refunded", value: "partially_refunded" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    paymentMethod: (0, import_fields18.select)({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit_card" },
        { label: "Debit Card", value: "debit_card" },
        { label: "Cash", value: "cash" },
        { label: "Gift Card", value: "gift_card" },
        { label: "PayPal", value: "paypal" },
        { label: "Apple Pay", value: "apple_pay" },
        { label: "Google Pay", value: "google_pay" }
      ],
      defaultValue: "credit_card"
    }),
    paymentProvider: (0, import_fields18.relationship)({
      ref: "PaymentProvider",
      ui: {
        displayMode: "select",
        description: "Optional provider backing this payment"
      }
    }),
    providerPaymentId: (0, import_fields18.text)({
      ui: {
        description: "Provider payment identifier (Stripe/PayPal/etc.)"
      }
    }),
    // Card details (last 4 digits for reference)
    cardLast4: (0, import_fields18.text)({
      ui: {
        description: "Last 4 digits of card"
      }
    }),
    cardBrand: (0, import_fields18.text)({
      ui: {
        description: "Card brand (visa, mastercard, etc.)"
      }
    }),
    // Tip handling
    tipAmount: (0, import_fields18.integer)({
      defaultValue: 0,
      ui: {
        description: "Tip amount included in payment in cents"
      }
    }),
    // Split payment support
    isSplitPayment: (0, import_fields18.checkbox)({
      defaultValue: false,
      ui: {
        description: "Whether this payment is part of a split bill"
      }
    }),
    splitPaymentIndex: (0, import_fields18.integer)({
      ui: {
        description: "Index of this payment in split (1, 2, 3, etc.)"
      }
    }),
    splitTotal: (0, import_fields18.integer)({
      ui: {
        description: "Total number of split payments for this order"
      }
    }),
    processedAt: (0, import_fields18.timestamp)({
      ui: {
        description: "When payment was successfully processed"
      }
    }),
    // Metadata for errors or additional info
    errorMessage: (0, import_fields18.text)({
      ui: {
        description: "Error message if payment failed"
      }
    }),
    notes: (0, import_fields18.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    // Relationships
    order: (0, import_fields18.relationship)({
      ref: "RestaurantOrder.payments",
      ui: {
        displayMode: "select"
      }
    }),
    paymentCollection: (0, import_fields18.relationship)({
      ref: "PaymentCollection.payments",
      ui: {
        displayMode: "select",
        description: "Payment collection this payment belongs to"
      }
    }),
    processedBy: (0, import_fields18.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who processed payment"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentCollection.ts
var import_core18 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
var PaymentCollection = (0, import_core18.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    description: (0, import_fields19.select)({
      type: "enum",
      options: [
        { label: "Default", value: "default" },
        { label: "Refund", value: "refund" }
      ],
      defaultValue: "default"
    }),
    amount: (0, import_fields19.integer)({
      validation: { isRequired: true }
    }),
    authorizedAmount: (0, import_fields19.integer)({
      defaultValue: 0
    }),
    refundedAmount: (0, import_fields19.integer)({
      defaultValue: 0
    }),
    metadata: (0, import_fields19.json)(),
    paymentSessions: (0, import_fields19.relationship)({
      ref: "PaymentSession.paymentCollection",
      many: true
    }),
    payments: (0, import_fields19.relationship)({
      ref: "Payment.paymentCollection",
      many: true
    }),
    cart: (0, import_fields19.relationship)({
      ref: "Cart.paymentCollection"
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core19 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var PaymentSession = (0, import_core19.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    isSelected: (0, import_fields20.checkbox)({
      defaultValue: false
    }),
    isInitiated: (0, import_fields20.checkbox)({
      defaultValue: false
    }),
    amount: (0, import_fields20.integer)({
      validation: { isRequired: true }
    }),
    data: (0, import_fields20.json)({
      defaultValue: {}
    }),
    idempotencyKey: (0, import_fields20.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    paymentCollection: (0, import_fields20.relationship)({
      ref: "PaymentCollection.paymentSessions"
    }),
    paymentProvider: (0, import_fields20.relationship)({
      ref: "PaymentProvider.sessions",
      many: false
    }),
    paymentAuthorizedAt: (0, import_fields20.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/Cart.ts
var import_core20 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
var Cart = (0, import_core20.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }) || permissions.canReadOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: ({ session }) => {
        if (!session) return false;
        if (permissions.canManageOrders({ session })) return true;
        return { user: { id: { equals: session.itemId } } };
      },
      update: ({ session }) => {
        if (!session) return false;
        if (permissions.canManageOrders({ session })) return true;
        return { user: { id: { equals: session.itemId } } };
      }
    }
  },
  fields: {
    user: (0, import_fields21.relationship)({ ref: "User.carts" }),
    items: (0, import_fields21.relationship)({ ref: "CartItem.cart", many: true }),
    orderType: (0, import_fields21.select)({
      options: [
        { label: "Pickup", value: "pickup" },
        { label: "Delivery", value: "delivery" }
      ],
      defaultValue: "pickup"
    }),
    email: (0, import_fields21.text)(),
    customerName: (0, import_fields21.text)(),
    customerPhone: (0, import_fields21.text)(),
    deliveryAddress: (0, import_fields21.text)(),
    deliveryAddress2: (0, import_fields21.text)(),
    deliveryCity: (0, import_fields21.text)(),
    deliveryState: (0, import_fields21.text)(),
    deliveryZip: (0, import_fields21.text)(),
    deliveryCountryCode: (0, import_fields21.text)(),
    paymentCollection: (0, import_fields21.relationship)({
      ref: "PaymentCollection.cart"
    }),
    tipPercent: (0, import_fields21.select)({
      options: [
        { label: "0%", value: "0" },
        { label: "15%", value: "15" },
        { label: "18%", value: "18" },
        { label: "20%", value: "20" },
        { label: "25%", value: "25" }
      ],
      defaultValue: "0"
    }),
    order: (0, import_fields21.relationship)({ ref: "RestaurantOrder" }),
    subtotal: (0, import_fields21.virtual)({
      field: import_core20.graphql.field({
        type: import_core20.graphql.Int,
        async resolve(item, args, context) {
          const cart = await context.sudo().query.Cart.findOne({
            where: { id: item.id },
            query: "items { quantity menuItem { price } modifiers { priceAdjustment } }"
          });
          if (!cart?.items) return 0;
          return cart.items.reduce((total, cartItem) => {
            const modifiersTotal = cartItem.modifiers?.reduce((sum, mod) => sum + (mod.priceAdjustment || 0), 0) || 0;
            return total + ((cartItem.menuItem?.price || 0) + modifiersTotal) * cartItem.quantity;
          }, 0);
        }
      })
    }),
    ...trackingFields
  }
});

// features/keystone/models/CartItem.ts
var import_core21 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
var CartItem = (0, import_core21.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageCart({ session }) || permissions.canReadCart({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    cart: (0, import_fields22.relationship)({ ref: "Cart.items" }),
    menuItem: (0, import_fields22.relationship)({ ref: "MenuItem" }),
    quantity: (0, import_fields22.integer)({ defaultValue: 1, validation: { min: 1 } }),
    modifiers: (0, import_fields22.relationship)({ ref: "MenuItemModifier", many: true }),
    specialInstructions: (0, import_fields22.text)(),
    thumbnail: (0, import_fields22.virtual)({
      field: import_core21.graphql.field({
        type: import_core21.graphql.String,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const cartItem = await sudoContext.query.CartItem.findOne({
            where: { id: String(item.id) },
            query: `
              menuItem {
                thumbnail
              }
            `
          });
          return cartItem?.menuItem?.thumbnail || null;
        }
      })
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentProvider.ts
var import_core22 = require("@keystone-6/core");
var import_fields23 = require("@keystone-6/core/fields");
var PaymentProvider = (0, import_core22.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "isInstalled"]
    }
  },
  fields: {
    name: (0, import_fields23.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields23.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores'
        }
      }
    }),
    isInstalled: (0, import_fields23.checkbox)({
      defaultValue: true
    }),
    credentials: (0, import_fields23.json)({
      defaultValue: {}
    }),
    metadata: (0, import_fields23.json)({
      defaultValue: {}
    }),
    createPaymentFunction: (0, import_fields23.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to create payments"
      }
    }),
    capturePaymentFunction: (0, import_fields23.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to capture payments"
      }
    }),
    refundPaymentFunction: (0, import_fields23.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to refund payments"
      }
    }),
    getPaymentStatusFunction: (0, import_fields23.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to check payment status"
      }
    }),
    generatePaymentLinkFunction: (0, import_fields23.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to generate payment dashboard links"
      }
    }),
    handleWebhookFunction: (0, import_fields23.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to handle provider webhooks"
      }
    }),
    sessions: (0, import_fields23.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/ApiKey.ts
var import_fields24 = require("@keystone-6/core/fields");
var import_core23 = require("@keystone-6/core");
var ApiKey = (0, import_core23.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ({ session }) => ({ user: { id: { equals: session?.itemId } } }),
      update: ({ session }) => ({ user: { id: { equals: session?.itemId } } }),
      delete: ({ session }) => ({ user: { id: { equals: session?.itemId } } })
    }
  },
  hooks: {
    validate: {
      create: async ({ resolvedData, addValidationError }) => {
        if (!resolvedData.scopes || resolvedData.scopes.length === 0) {
          addValidationError("At least one scope is required for API keys");
        }
      }
    },
    resolveInput: {
      create: async ({ resolvedData, context }) => {
        return {
          ...resolvedData,
          user: resolvedData.user || (context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0)
        };
      }
    }
  },
  fields: {
    name: (0, import_fields24.text)({
      validation: { isRequired: true },
      ui: {
        description: "A descriptive name for this API key (e.g. 'POS Integration')"
      }
    }),
    tokenSecret: (0, import_fields24.password)({
      validation: { isRequired: true },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" },
        description: "Secure API key token (hashed and never displayed)"
      }
    }),
    tokenPreview: (0, import_fields24.text)({
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        listView: { fieldMode: "read" },
        description: "Preview of the API key (actual key is hidden)"
      }
    }),
    scopes: (0, import_fields24.json)({
      defaultValue: [],
      ui: {
        description: "Array of scopes for this API key"
      }
    }),
    status: (0, import_fields24.select)({
      type: "enum",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
        { label: "Revoked", value: "revoked" }
      ],
      defaultValue: "active",
      ui: {
        description: "Current status of this API key"
      }
    }),
    expiresAt: (0, import_fields24.timestamp)({
      ui: {
        description: "When this API key expires (optional - leave blank for no expiration)"
      }
    }),
    lastUsedAt: (0, import_fields24.timestamp)({
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Last time this API key was used"
      }
    }),
    usageCount: (0, import_fields24.json)({
      defaultValue: { total: 0, daily: {} },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Usage statistics for this API key"
      }
    }),
    restrictedToIPs: (0, import_fields24.json)({
      defaultValue: [],
      ui: {
        description: "Optional: Restrict this key to specific IP addresses (array of IPs)"
      }
    }),
    ...trackingFields,
    user: (0, import_fields24.relationship)({
      ref: "User.apiKeys",
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
      }
    })
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "tokenPreview", "scopes", "status", "lastUsedAt"]
    },
    description: "Secure API keys for programmatic access"
  }
});

// features/keystone/models/Discount.ts
var import_core24 = require("@keystone-6/core");
var import_fields25 = require("@keystone-6/core/fields");
var Discount = (0, import_core24.list)({
  access: {
    operation: {
      query: permissions.canReadDiscounts,
      create: permissions.canManageDiscounts,
      update: permissions.canManageDiscounts,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["code", "isDisabled", "usageCount", "startsAt"]
    }
  },
  fields: {
    code: (0, import_fields25.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    isDynamic: (0, import_fields25.checkbox)(),
    isDisabled: (0, import_fields25.checkbox)(),
    stackable: (0, import_fields25.checkbox)({
      defaultValue: false
    }),
    startsAt: (0, import_fields25.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true }
    }),
    endsAt: (0, import_fields25.timestamp)(),
    metadata: (0, import_fields25.json)(),
    usageLimit: (0, import_fields25.integer)(),
    usageCount: (0, import_fields25.integer)({
      defaultValue: 0,
      validation: { isRequired: true }
    }),
    validDuration: (0, import_fields25.text)(),
    ...trackingFields,
    discountRule: (0, import_fields25.relationship)({
      ref: "DiscountRule.discounts"
    }),
    orders: (0, import_fields25.relationship)({
      ref: "RestaurantOrder.discounts",
      many: true
    })
  }
});

// features/keystone/models/DiscountRule.ts
var import_core25 = require("@keystone-6/core");
var import_fields26 = require("@keystone-6/core/fields");
var DiscountRule = (0, import_core25.list)({
  access: {
    operation: {
      query: permissions.canReadDiscounts,
      create: permissions.canManageDiscounts,
      update: permissions.canManageDiscounts,
      delete: permissions.canManageDiscounts
    }
  },
  ui: {
    listView: {
      initialColumns: ["description", "type", "value"]
    }
  },
  fields: {
    description: (0, import_fields26.text)(),
    type: (0, import_fields26.select)({
      type: "enum",
      options: [
        { label: "Fixed", value: "fixed" },
        { label: "Percentage", value: "percentage" },
        { label: "Free Item", value: "free_item" }
      ],
      validation: { isRequired: true }
    }),
    value: (0, import_fields26.integer)({
      validation: { isRequired: true }
    }),
    allocation: (0, import_fields26.select)({
      type: "enum",
      options: [
        { label: "Total", value: "total" },
        { label: "Item", value: "item" }
      ]
    }),
    metadata: (0, import_fields26.json)(),
    discounts: (0, import_fields26.relationship)({
      ref: "Discount.discountRule",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/GiftCard.ts
var import_core26 = require("@keystone-6/core");
var import_fields27 = require("@keystone-6/core/fields");
var GiftCard = (0, import_core26.list)({
  access: {
    operation: {
      query: permissions.canReadGiftCards,
      create: permissions.canManageGiftCards,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["code", "value", "balance", "isDisabled"]
    }
  },
  fields: {
    code: (0, import_fields27.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    value: (0, import_fields27.integer)({
      validation: { isRequired: true }
    }),
    balance: (0, import_fields27.integer)({
      validation: { isRequired: true }
    }),
    isDisabled: (0, import_fields27.checkbox)(),
    endsAt: (0, import_fields27.timestamp)(),
    metadata: (0, import_fields27.json)(),
    ...trackingFields,
    order: (0, import_fields27.relationship)({
      ref: "RestaurantOrder.giftCards"
    }),
    giftCardTransactions: (0, import_fields27.relationship)({
      ref: "GiftCardTransaction.giftCard",
      many: true
    })
  }
});

// features/keystone/models/GiftCardTransaction.ts
var import_core27 = require("@keystone-6/core");
var import_fields28 = require("@keystone-6/core/fields");
var GiftCardTransaction = (0, import_core27.list)({
  access: {
    operation: {
      query: permissions.canReadGiftCards,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["giftCard", "amount", "createdAt", "order"]
    }
  },
  fields: {
    idempotencyKey: (0, import_fields28.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    type: (0, import_fields28.select)({
      type: "string",
      options: [
        { label: "Issue", value: "issue" },
        { label: "Redeem", value: "redeem" },
        { label: "Refund", value: "refund" },
        { label: "Adjustment", value: "adjustment" }
      ],
      validation: { isRequired: true }
    }),
    balanceAfter: (0, import_fields28.integer)({ validation: { isRequired: true } }),
    amount: (0, import_fields28.integer)({
      validation: { isRequired: true }
    }),
    ...trackingFields,
    giftCard: (0, import_fields28.relationship)({
      ref: "GiftCard.giftCardTransactions"
    }),
    order: (0, import_fields28.relationship)({
      ref: "RestaurantOrder"
    })
  }
});

// features/keystone/models/KitchenStation.ts
var import_core28 = require("@keystone-6/core");
var import_fields29 = require("@keystone-6/core/fields");
var KitchenStation = (0, import_core28.list)({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: permissions.canManageKitchen,
      update: permissions.canManageKitchen,
      delete: permissions.canManageKitchen
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "displayOrder", "isActive"]
    }
  },
  fields: {
    name: (0, import_fields29.text)({
      validation: { isRequired: true },
      ui: {
        description: "Station name (e.g., Grill, Fryer, Salad, Expo)"
      }
    }),
    displayOrder: (0, import_fields29.integer)({
      defaultValue: 0,
      ui: {
        description: "Order in which stations are displayed (lower numbers first)"
      }
    }),
    isActive: (0, import_fields29.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this station is currently active"
      }
    }),
    // Relationships
    assignedStaff: (0, import_fields29.relationship)({
      ref: "User",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["name", "email"],
        inlineConnect: true,
        description: "Staff members assigned to this station"
      }
    }),
    tickets: (0, import_fields29.relationship)({
      ref: "KitchenTicket.station",
      many: true
    }),
    prepStations: (0, import_fields29.relationship)({
      ref: "PrepStation.station",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/PrepStation.ts
var import_core29 = require("@keystone-6/core");
var import_fields30 = require("@keystone-6/core/fields");
var PrepStation = (0, import_core29.list)({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: permissions.canManageKitchen,
      update: permissions.canManageKitchen,
      delete: permissions.canManageKitchen
    }
  },
  ui: {
    listView: {
      initialColumns: ["menuItem", "station", "preparationTime"]
    },
    labelField: "menuItem"
  },
  fields: {
    menuItem: (0, import_fields30.relationship)({
      ref: "MenuItem",
      ui: {
        displayMode: "select",
        description: "Menu item to be prepared at this station"
      }
    }),
    station: (0, import_fields30.relationship)({
      ref: "KitchenStation.prepStations",
      ui: {
        displayMode: "select",
        description: "Kitchen station for preparation"
      }
    }),
    preparationTime: (0, import_fields30.integer)({
      defaultValue: 15,
      ui: {
        description: "Expected preparation time in minutes"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/KitchenTicket.ts
var import_core30 = require("@keystone-6/core");
var import_fields31 = require("@keystone-6/core/fields");
var KitchenTicket = (0, import_core30.list)({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["order", "station", "status", "priority", "firedAt"]
    }
  },
  fields: {
    status: (0, import_fields31.select)({
      type: "string",
      options: [
        { label: "New", value: "new" },
        { label: "In Progress", value: "in_progress" },
        { label: "Ready", value: "ready" },
        { label: "Served", value: "served" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "new",
      validation: { isRequired: true }
    }),
    priority: (0, import_fields31.integer)({
      defaultValue: 0,
      ui: {
        description: "Priority level (higher numbers = higher priority)"
      }
    }),
    ticketType: (0, import_fields31.select)({
      type: "string",
      options: [
        { label: "Prep", value: "prep" },
        { label: "Expediter", value: "expediter" }
      ],
      defaultValue: "prep",
      ui: {
        description: "Whether this ticket is shown in prep or expediter context"
      }
    }),
    items: (0, import_fields31.json)({
      ui: {
        description: "Order items for this ticket (JSON array)"
      }
    }),
    firedAt: (0, import_fields31.timestamp)({
      defaultValue: { kind: "now" },
      ui: {
        description: "When the ticket was sent to the kitchen"
      }
    }),
    startedAt: (0, import_fields31.timestamp)({
      ui: {
        description: "When kitchen staff started working on this ticket"
      }
    }),
    completedAt: (0, import_fields31.timestamp)({
      ui: {
        description: "When all items were completed"
      }
    }),
    servedAt: (0, import_fields31.timestamp)({
      ui: {
        description: "When the items were served to the customer"
      }
    }),
    recalledAt: (0, import_fields31.timestamp)({
      ui: {
        description: "When the ticket was recalled back into preparation"
      }
    }),
    // Relationships
    order: (0, import_fields31.relationship)({
      ref: "RestaurantOrder",
      ui: {
        displayMode: "select",
        description: "Restaurant order this ticket belongs to"
      }
    }),
    station: (0, import_fields31.relationship)({
      ref: "KitchenStation.tickets",
      ui: {
        displayMode: "select",
        description: "Kitchen station assigned to this ticket"
      }
    }),
    orderItems: (0, import_fields31.relationship)({
      ref: "OrderItem.kitchenTickets",
      many: true,
      ui: {
        displayMode: "select",
        description: "Normalized order items included in this ticket"
      }
    }),
    preparedBy: (0, import_fields31.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who prepared this ticket"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Vendor.ts
var import_core31 = require("@keystone-6/core");
var import_fields32 = require("@keystone-6/core/fields");
var Vendor = (0, import_core31.list)({
  access: {
    operation: {
      query: permissions.canReadVendors,
      create: permissions.canManageVendors,
      update: permissions.canManageVendors,
      delete: permissions.canManageVendors
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "contact", "email", "phone"]
    }
  },
  fields: {
    name: (0, import_fields32.text)({
      validation: { isRequired: true },
      ui: {
        description: "Vendor company name"
      }
    }),
    contact: (0, import_fields32.text)({
      ui: {
        description: "Primary contact person"
      }
    }),
    email: (0, import_fields32.text)({
      validation: {
        match: {
          regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          explanation: "Please enter a valid email address"
        }
      },
      ui: {
        description: "Vendor email address"
      }
    }),
    phone: (0, import_fields32.text)({
      ui: {
        description: "Vendor phone number"
      }
    }),
    paymentTerms: (0, import_fields32.text)({
      ui: {
        description: "Payment terms (e.g., Net 30, COD)"
      }
    }),
    leadTime: (0, import_fields32.integer)({
      ui: {
        description: "Lead time in days for orders"
      }
    }),
    // Relationships
    ingredients: (0, import_fields32.relationship)({
      ref: "Ingredient.vendor",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryLocation.ts
var import_core32 = require("@keystone-6/core");
var import_fields33 = require("@keystone-6/core/fields");
var InventoryLocation = (0, import_core32.list)({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "isActive"]
    }
  },
  fields: {
    name: (0, import_fields33.text)({
      validation: { isRequired: true },
      ui: {
        description: "Storage location name (e.g., Walk-in, Freezer, Dry Storage)"
      }
    }),
    description: (0, import_fields33.text)({
      ui: {
        displayMode: "textarea",
        description: "Description of the storage location"
      }
    }),
    isActive: (0, import_fields33.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this location is currently in use"
      }
    }),
    // Relationships
    ingredients: (0, import_fields33.relationship)({
      ref: "Ingredient.location",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/Ingredient.ts
var import_core33 = require("@keystone-6/core");
var import_fields34 = require("@keystone-6/core/fields");
var Ingredient = (0, import_core33.list)({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "category", "currentStock", "unit", "parLevel"]
    }
  },
  fields: {
    name: (0, import_fields34.text)({
      validation: { isRequired: true },
      ui: {
        description: "Ingredient name"
      }
    }),
    unit: (0, import_fields34.select)({
      type: "string",
      options: [
        { label: "Kilogram", value: "kg" },
        { label: "Pound", value: "lb" },
        { label: "Ounce", value: "oz" },
        { label: "Liter", value: "liter" },
        { label: "Gallon", value: "gallon" },
        { label: "Each", value: "each" },
        { label: "Case", value: "case" },
        { label: "Box", value: "box" }
      ],
      defaultValue: "lb",
      validation: { isRequired: true },
      ui: {
        description: "Unit of measurement"
      }
    }),
    category: (0, import_fields34.select)({
      type: "string",
      options: [
        { label: "Produce", value: "produce" },
        { label: "Meat", value: "meat" },
        { label: "Dairy", value: "dairy" },
        { label: "Dry Goods", value: "dry_goods" },
        { label: "Beverages", value: "beverages" },
        { label: "Spices", value: "spices" },
        { label: "Seafood", value: "seafood" },
        { label: "Other", value: "other" }
      ],
      ui: {
        description: "Ingredient category"
      }
    }),
    currentStock: (0, import_fields34.decimal)({
      access: { create: () => false, update: () => false },
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      validation: { isRequired: true },
      ui: {
        description: "Current stock quantity"
      }
    }),
    parLevel: (0, import_fields34.decimal)({
      precision: 10,
      scale: 2,
      ui: {
        description: "Ideal stock level to maintain"
      }
    }),
    reorderPoint: (0, import_fields34.decimal)({
      precision: 10,
      scale: 2,
      ui: {
        description: "Stock level at which to reorder"
      }
    }),
    reorderQuantity: (0, import_fields34.decimal)({
      precision: 10,
      scale: 2,
      ui: {
        description: "Quantity to order when restocking"
      }
    }),
    costPerUnit: (0, import_fields34.decimal)({
      precision: 10,
      scale: 2,
      ui: {
        description: "Cost per unit in dollars"
      }
    }),
    expirationDate: (0, import_fields34.timestamp)({
      ui: {
        description: "Expiration date for perishable items"
      }
    }),
    sku: (0, import_fields34.text)({
      ui: {
        description: "SKU or product code"
      }
    }),
    // Relationships
    vendor: (0, import_fields34.relationship)({
      ref: "Vendor.ingredients",
      ui: {
        displayMode: "select",
        description: "Primary vendor for this ingredient"
      }
    }),
    location: (0, import_fields34.relationship)({
      ref: "InventoryLocation.ingredients",
      ui: {
        displayMode: "select",
        description: "Storage location"
      }
    }),
    stockMovements: (0, import_fields34.relationship)({
      ref: "StockMovement.ingredient",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/StockMovement.ts
var import_core34 = require("@keystone-6/core");
var import_fields35 = require("@keystone-6/core/fields");
var StockMovement = (0, import_core34.list)({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["ingredient", "type", "quantity", "createdAt", "createdBy"]
    }
  },
  fields: {
    eventKey: (0, import_fields35.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    referenceType: (0, import_fields35.text)(),
    referenceId: (0, import_fields35.text)({ isIndexed: true }),
    metadata: (0, import_fields35.json)(),
    type: (0, import_fields35.select)({
      type: "string",
      options: [
        { label: "Sale", value: "sale" },
        { label: "Waste", value: "waste" },
        { label: "Spoilage", value: "spoilage" },
        { label: "Theft", value: "theft" },
        { label: "Adjustment", value: "adjustment" },
        { label: "Delivery", value: "delivery" },
        { label: "Return", value: "return" }
      ],
      validation: { isRequired: true },
      ui: {
        description: "Type of stock movement"
      }
    }),
    quantity: (0, import_fields35.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: {
        description: "Quantity moved (positive for additions, negative for reductions)"
      }
    }),
    reason: (0, import_fields35.text)({
      ui: {
        displayMode: "textarea",
        description: "Reason for the stock movement"
      }
    }),
    // Relationships
    ingredient: (0, import_fields35.relationship)({
      ref: "Ingredient.stockMovements",
      ui: {
        displayMode: "select",
        description: "Ingredient this movement affects"
      }
    }),
    createdBy: (0, import_fields35.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who recorded this movement"
      }
    }),
    order: (0, import_fields35.relationship)({
      ref: "RestaurantOrder",
      ui: {
        displayMode: "select",
        description: "Related order (for sale movements)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/StoreSettings.ts
var import_core35 = require("@keystone-6/core");
var import_fields36 = require("@keystone-6/core/fields");

// features/lib/store-logo.ts
var DEFAULT_STORE_LOGO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 200 200"><g clip-path="url(#restaurant-logo-clip)"><path fill-rule="evenodd" clip-rule="evenodd" d="M107.143 0H92.8571V63.2531L69.1621 4.60582L55.9166 9.95735L80.2255 70.1239L34.3401 24.2385L24.2386 34.3401L68.2177 78.3191L11.2241 53.4181L5.50459 66.5089L65.8105 92.8571H0V107.143H65.8104L5.50461 133.491L11.2241 146.582L68.2176 121.681L24.2386 165.66L34.3401 175.761L80.2255 129.876L55.9166 190.043L69.1621 195.394L92.8571 136.747V200H107.143V136.747L130.838 195.394L144.083 190.043L119.775 129.876L165.66 175.761L175.761 165.66L131.782 121.681L188.776 146.582L194.495 133.491L134.19 107.143H200V92.8571H134.189L194.495 66.5089L188.776 53.4181L131.782 78.3191L175.761 34.34L165.66 24.2385L119.775 70.1238L144.083 9.95735L130.838 4.60582L107.143 63.2531V0Z" fill="url(#restaurant-logo-gradient)"/></g><defs><linearGradient id="restaurant-logo-gradient" x1="14" y1="26" x2="179" y2="179.5" gradientUnits="userSpaceOnUse"><stop stop-color="#5c6bc0"/><stop offset="1" stop-color="#4f39f6"/></linearGradient><clipPath id="restaurant-logo-clip"><rect width="200" height="200" fill="white"/></clipPath></defs></svg>';
var DEFAULT_STORE_LOGO_COLOR = "0";
function normalizeStoreLogoColor(value) {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String((numeric % 360 + 360) % 360);
}

// features/lib/sanitize-store-logo.ts
var ALLOWED_ELEMENTS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc"
]);
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set([
  "xmlns",
  "fill",
  "fill-rule",
  "clip-rule",
  "height",
  "width",
  "viewbox",
  "d",
  "clip-path",
  "id",
  "x1",
  "x2",
  "y1",
  "y2",
  "gradientunits",
  "gradienttransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "transform",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "points",
  "role",
  "aria-hidden",
  "aria-label",
  "preserveaspectratio"
]);
var ATTRIBUTE_PATTERN = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
var TAG_PATTERN = /<\/?\s*([A-Za-z][\w:-]*)([^<>]*)>/g;
function sanitizeStoreLogoSvg(svg) {
  const source = svg.trim();
  if (!source.startsWith("<svg") || !source.endsWith("</svg>") || source.length > 1e5) return "";
  if (/<!|<\?|\b(?:javascript|data|vbscript):|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=/i.test(source)) return "";
  let tagCount = 0;
  let match;
  TAG_PATTERN.lastIndex = 0;
  while (match = TAG_PATTERN.exec(source)) {
    tagCount += 1;
    const element = match[1].toLowerCase();
    if (!ALLOWED_ELEMENTS.has(element)) return "";
    if (match[0].startsWith("</")) continue;
    const attributes = match[2];
    let consumed = "";
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    while (attributeMatch = ATTRIBUTE_PATTERN.exec(attributes)) {
      consumed += attributeMatch[0];
      const attribute = attributeMatch[1].toLowerCase();
      const value = attributeMatch[2].slice(1, -1);
      if (!ALLOWED_ATTRIBUTES.has(attribute)) return "";
      if (attribute === "id" && !/^[A-Za-z_][\w:.-]*$/.test(value)) return "";
      if (/url\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) return "";
    }
    const remainder = attributes.replace(consumed, "").replace(/\//g, "").trim();
    if (remainder) return "";
  }
  TAG_PATTERN.lastIndex = 0;
  if (tagCount === 0 || source.replace(TAG_PATTERN, "").trim()) return "";
  return source;
}

// features/keystone/utils/paymentProviderConfig.ts
function isPaymentProviderConfigured(code) {
  if (code.startsWith("pp_stripe")) {
    return Boolean(
      (process.env.NEXT_PUBLIC_STRIPE_KEY || process.env.STRIPE_PUBLISHABLE_KEY) && process.env.STRIPE_SECRET_KEY
    );
  }
  if (code.startsWith("pp_paypal")) {
    return Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  }
  return code === "pp_system_default" || code.startsWith("pp_manual");
}
function getPublicPaymentProviderConfig(code) {
  if (!isPaymentProviderConfigured(code)) return null;
  if (code.startsWith("pp_stripe")) {
    return {
      provider: "stripe",
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || ""
    };
  }
  if (code.startsWith("pp_paypal")) {
    return {
      provider: "paypal",
      publishableKey: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ""
    };
  }
  return null;
}

// features/keystone/models/StoreSettings.ts
var StoreSettings = (0, import_core35.list)({
  access: {
    operation: {
      query: () => true,
      // Public read for storefront
      create: permissions.canManageSettings,
      update: permissions.canManageSettings,
      delete: permissions.canManageSettings
    }
  },
  isSingleton: true,
  graphql: {
    plural: "storeSettingsItems"
  },
  ui: {
    listView: {
      initialColumns: ["name", "tagline", "phone"]
    }
  },
  fields: {
    // Basic Info
    name: (0, import_fields36.text)({
      validation: { isRequired: true },
      ui: { description: "Restaurant name" }
    }),
    tagline: (0, import_fields36.text)({
      ui: { description: "Short tagline (e.g., 'Artisan Burgers & Craft Sides')" }
    }),
    logoIcon: (0, import_fields36.text)({
      defaultValue: DEFAULT_STORE_LOGO_ICON,
      ui: { description: "Sanitized SVG used by the storefront and marketplace" },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          if (value === void 0 || value === null || value === "") return value;
          return typeof value === "string" ? sanitizeStoreLogoSvg(value) : "";
        },
        validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey];
          if (typeof submitted === "string" && submitted.trim() && !resolvedData?.[fieldKey]) {
            addValidationError("Logo must be a valid, safe SVG document");
          }
        }
      }
    }),
    logoColor: (0, import_fields36.text)({
      defaultValue: DEFAULT_STORE_LOGO_COLOR,
      ui: { description: "CSS hue rotation in degrees" },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          return value === void 0 ? value : normalizeStoreLogoColor(value);
        }
      }
    }),
    paymentProviders: (0, import_fields36.virtual)({
      field: import_core35.graphql.field({
        type: import_core35.graphql.list(
          import_core35.graphql.object()({
            name: "RestaurantPaymentProviderConfig",
            fields: {
              provider: import_core35.graphql.field({ type: import_core35.graphql.String }),
              publishableKey: import_core35.graphql.field({ type: import_core35.graphql.String })
            }
          })
        ),
        resolve: async (_item, _args, context) => {
          const installedProviders = await context.sudo().query.PaymentProvider.findMany({
            where: { isInstalled: { equals: true } },
            query: "code"
          });
          return installedProviders.map((provider) => getPublicPaymentProviderConfig(provider.code || "")).filter((provider) => Boolean(provider));
        }
      }),
      ui: { query: "{ provider publishableKey }" }
    }),
    // Contact
    address: (0, import_fields36.text)({
      ui: { description: "Full street address" }
    }),
    phone: (0, import_fields36.text)({
      ui: { description: "Phone number" }
    }),
    email: (0, import_fields36.text)({
      ui: { description: "Contact email" }
    }),
    // Localization
    currencyCode: (0, import_fields36.text)({
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code (e.g. USD, EUR, JPY)" }
    }),
    locale: (0, import_fields36.text)({
      defaultValue: "en-US",
      ui: { description: "Locale used for formatting numbers/dates (e.g. en-US)" }
    }),
    timezone: (0, import_fields36.text)({
      defaultValue: "America/New_York",
      ui: { description: "IANA timezone (e.g. America/New_York)" }
    }),
    countryCode: (0, import_fields36.text)({
      defaultValue: "US",
      ui: { description: "Primary storefront country code (ISO 3166-1 alpha-2)" }
    }),
    // Hours (stored as JSON for flexibility)
    hours: (0, import_fields36.json)({
      defaultValue: {
        monday: "11:00 AM - 10:00 PM",
        tuesday: "11:00 AM - 10:00 PM",
        wednesday: "11:00 AM - 10:00 PM",
        thursday: "11:00 AM - 10:00 PM",
        friday: "11:00 AM - 11:00 PM",
        saturday: "10:00 AM - 11:00 PM",
        sunday: "10:00 AM - 9:00 PM"
      },
      ui: { description: "Operating hours by day of week" }
    }),
    // Tax
    taxRate: (0, import_fields36.decimal)({
      precision: 5,
      scale: 2,
      defaultValue: "8.75",
      ui: { description: "Tax rate percentage (e.g. 8.75 for 8.75%)" }
    }),
    // Delivery/Pickup Settings
    deliveryEnabled: (0, import_fields36.checkbox)({
      defaultValue: true,
      ui: { description: "Allow customers to choose delivery at checkout" }
    }),
    deliveryPostalCodes: (0, import_fields36.json)({
      defaultValue: ["11201"],
      ui: { description: "Allowed delivery ZIP/postal codes" }
    }),
    deliveryFee: (0, import_fields36.decimal)({
      precision: 10,
      scale: 2,
      defaultValue: "4.99",
      ui: { description: "Delivery fee amount" }
    }),
    deliveryMinimum: (0, import_fields36.decimal)({
      precision: 10,
      scale: 2,
      defaultValue: "15.00",
      ui: { description: "Minimum order for delivery" }
    }),
    pickupDiscount: (0, import_fields36.integer)({
      defaultValue: 10,
      ui: { description: "Pickup discount percentage" }
    }),
    estimatedDelivery: (0, import_fields36.text)({
      defaultValue: "30-45 min",
      ui: { description: "Estimated delivery time" }
    }),
    estimatedPickup: (0, import_fields36.text)({
      defaultValue: "15-20 min",
      ui: { description: "Estimated pickup time" }
    }),
    // Hero/Branding
    heroHeadline: (0, import_fields36.text)({
      defaultValue: "Fresh meals for pickup and delivery.",
      ui: { description: "Main hero headline" }
    }),
    heroSubheadline: (0, import_fields36.text)({
      defaultValue: "A modern ordering storefront with house favorites, quick pickup, and a menu built to customize.",
      ui: { description: "Hero subheadline/description" }
    }),
    heroTagline: (0, import_fields36.text)({
      defaultValue: "Made fresh daily \xB7 Ready when you are",
      ui: { description: "Small tagline above headline" }
    }),
    // Promo Banner
    promoBanner: (0, import_fields36.text)({
      defaultValue: "Free pickup discount \xB7 10% off all pickup orders",
      ui: { description: "Promotional banner text at top of page" }
    }),
    // Social/Reviews (optional display data)
    rating: (0, import_fields36.decimal)({
      precision: 2,
      scale: 1,
      defaultValue: "4.8",
      ui: { description: "Average rating to display" }
    }),
    reviewCount: (0, import_fields36.integer)({
      defaultValue: 0,
      ui: { description: "Number of reviews to display" }
    }),
    ...trackingFields
  }
});

// features/keystone/models/WaitlistEntry.ts
var import_core36 = require("@keystone-6/core");
var import_fields37 = require("@keystone-6/core/fields");
var WaitlistEntry = (0, import_core36.list)({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: permissions.canManageKitchen,
      update: permissions.canManageKitchen,
      delete: permissions.canManageKitchen
    }
  },
  ui: {
    listView: {
      initialColumns: ["customerName", "partySize", "quotedWaitTime", "status", "addedAt"]
    },
    labelField: "customerName"
  },
  fields: {
    customerName: (0, import_fields37.text)({
      validation: { isRequired: true }
    }),
    phoneNumber: (0, import_fields37.text)({
      validation: { isRequired: true },
      ui: {
        description: "Phone number for SMS notifications"
      }
    }),
    partySize: (0, import_fields37.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 2
    }),
    quotedWaitTime: (0, import_fields37.integer)({
      validation: { min: 0 },
      defaultValue: 15,
      ui: {
        description: "Quoted wait time in minutes"
      }
    }),
    status: (0, import_fields37.select)({
      type: "string",
      options: [
        { label: "Waiting", value: "waiting" },
        { label: "Notified", value: "notified" },
        { label: "Seated", value: "seated" },
        { label: "Cancelled", value: "cancelled" },
        { label: "No Show", value: "no_show" }
      ],
      defaultValue: "waiting",
      ui: {
        displayMode: "segmented-control"
      }
    }),
    addedAt: (0, import_fields37.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true }
    }),
    notifiedAt: (0, import_fields37.timestamp)({
      ui: {
        description: "When the customer was notified their table is ready"
      }
    }),
    seatedAt: (0, import_fields37.timestamp)({
      ui: {
        description: "When the customer was actually seated"
      }
    }),
    notes: (0, import_fields37.text)({
      ui: {
        displayMode: "textarea",
        description: "Special requests, high chair needed, etc."
      }
    }),
    // Relationships
    table: (0, import_fields37.relationship)({
      ref: "Table",
      ui: {
        displayMode: "select",
        description: "Table assigned when seated"
      }
    }),
    addedBy: (0, import_fields37.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member who added this entry"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Shift.ts
var import_core37 = require("@keystone-6/core");
var import_fields38 = require("@keystone-6/core/fields");
var Shift = (0, import_core37.list)({
  access: {
    operation: {
      query: permissions.canReadStaff,
      create: permissions.canManageStaff,
      update: permissions.canManageStaff,
      delete: permissions.canManageStaff
    }
  },
  ui: {
    listView: {
      initialColumns: ["staff", "startTime", "endTime", "role", "status"]
    }
  },
  fields: {
    startTime: (0, import_fields38.timestamp)({
      validation: { isRequired: true }
    }),
    endTime: (0, import_fields38.timestamp)({
      validation: { isRequired: true }
    }),
    role: (0, import_fields38.select)({
      type: "string",
      options: [
        { label: "Server", value: "server" },
        { label: "Bartender", value: "bartender" },
        { label: "Host", value: "host" },
        { label: "Busser", value: "busser" },
        { label: "Cook", value: "cook" },
        { label: "Dishwasher", value: "dishwasher" },
        { label: "Manager", value: "manager" }
      ],
      defaultValue: "server",
      validation: { isRequired: true }
    }),
    status: (0, import_fields38.select)({
      type: "string",
      options: [
        { label: "Scheduled", value: "scheduled" },
        { label: "Started", value: "started" },
        { label: "Completed", value: "completed" },
        { label: "No Show", value: "no_show" },
        { label: "Called Out", value: "called_out" }
      ],
      defaultValue: "scheduled"
    }),
    hourlyRate: (0, import_fields38.decimal)({
      precision: 10,
      scale: 2,
      ui: { description: "Hourly rate for this shift" }
    }),
    clockIn: (0, import_fields38.timestamp)({
      ui: { description: "Actual clock in time" }
    }),
    clockOut: (0, import_fields38.timestamp)({
      ui: { description: "Actual clock out time" }
    }),
    notes: (0, import_fields38.text)({
      ui: { displayMode: "textarea" }
    }),
    hoursWorked: (0, import_fields38.virtual)({
      field: import_core37.graphql.field({
        type: import_core37.graphql.Float,
        resolve(item) {
          if (!item.clockIn || !item.clockOut) return null;
          const start = new Date(item.clockIn);
          const end = new Date(item.clockOut);
          return Math.round((end.getTime() - start.getTime()) / 36e5 * 100) / 100;
        }
      })
    }),
    laborCost: (0, import_fields38.virtual)({
      field: import_core37.graphql.field({
        type: import_core37.graphql.Float,
        resolve(item) {
          if (!item.clockIn || !item.clockOut || !item.hourlyRate) return null;
          const start = new Date(item.clockIn);
          const end = new Date(item.clockOut);
          const hours = (end.getTime() - start.getTime()) / 36e5;
          return Math.round(hours * parseFloat(item.hourlyRate) * 100) / 100;
        }
      })
    }),
    // Relationships
    staff: (0, import_fields38.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/TipPool.ts
var import_core38 = require("@keystone-6/core");
var import_fields39 = require("@keystone-6/core/fields");
var TipPool = (0, import_core38.list)({
  access: {
    operation: {
      query: permissions.canReadStaff,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["date", "tipPoolType", "totalTips", "status"]
    }
  },
  fields: {
    date: (0, import_fields39.timestamp)({
      validation: { isRequired: true },
      ui: { description: "Date this tip pool is for" }
    }),
    tipPoolType: (0, import_fields39.select)({
      type: "string",
      options: [
        { label: "Individual", value: "individual" },
        { label: "Pool by Role", value: "pool_by_role" },
        { label: "House Pool", value: "house_pool" }
      ],
      defaultValue: "individual"
    }),
    totalTips: (0, import_fields39.integer)({
      defaultValue: 0,
      validation: { isRequired: true },
      ui: { description: "Total tips in cents" }
    }),
    cashTips: (0, import_fields39.integer)({
      defaultValue: 0,
      ui: { description: "Cash tips in cents" }
    }),
    creditTips: (0, import_fields39.integer)({
      defaultValue: 0,
      ui: { description: "Credit tips in cents" }
    }),
    distributions: (0, import_fields39.json)({
      ui: {
        description: "Array of { staffId, staffName, role, hoursWorked, amount }"
      }
    }),
    status: (0, import_fields39.select)({
      type: "string",
      options: [
        { label: "Open", value: "open" },
        { label: "Calculated", value: "calculated" },
        { label: "Distributed", value: "distributed" }
      ],
      defaultValue: "open"
    }),
    notes: (0, import_fields39.text)({
      ui: { displayMode: "textarea" }
    }),
    // Relationships
    createdBy: (0, import_fields39.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/TimeEntry.ts
var import_core39 = require("@keystone-6/core");
var import_fields40 = require("@keystone-6/core/fields");
var TimeEntry = (0, import_core39.list)({
  access: {
    operation: {
      query: permissions.canReadStaff,
      create: permissions.canManageStaff,
      update: permissions.canManageStaff,
      delete: permissions.canManageStaff
    }
  },
  ui: {
    listView: {
      initialColumns: ["staff", "clockIn", "clockOut", "role", "hoursWorked"]
    }
  },
  fields: {
    clockIn: (0, import_fields40.timestamp)({
      validation: { isRequired: true }
    }),
    clockOut: (0, import_fields40.timestamp)(),
    role: (0, import_fields40.select)({
      type: "string",
      options: [
        { label: "Server", value: "server" },
        { label: "Bartender", value: "bartender" },
        { label: "Host", value: "host" },
        { label: "Busser", value: "busser" },
        { label: "Cook", value: "cook" },
        { label: "Dishwasher", value: "dishwasher" },
        { label: "Manager", value: "manager" }
      ],
      defaultValue: "server"
    }),
    hourlyRate: (0, import_fields40.decimal)({
      precision: 10,
      scale: 2,
      ui: { description: "Hourly rate at time of clock in" }
    }),
    tips: (0, import_fields40.decimal)({
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      ui: { description: "Tips earned during this shift" }
    }),
    breakMinutes: (0, import_fields40.decimal)({
      precision: 5,
      scale: 0,
      defaultValue: "0",
      ui: { description: "Break time in minutes" }
    }),
    notes: (0, import_fields40.text)({
      ui: { displayMode: "textarea" }
    }),
    hoursWorked: (0, import_fields40.virtual)({
      field: import_core39.graphql.field({
        type: import_core39.graphql.Float,
        resolve(item) {
          if (!item.clockIn || !item.clockOut) return null;
          const start = new Date(item.clockIn);
          const end = new Date(item.clockOut);
          const breakMins = parseFloat(item.breakMinutes || "0");
          const totalMins = (end.getTime() - start.getTime()) / 6e4 - breakMins;
          return Math.round(totalMins / 60 * 100) / 100;
        }
      })
    }),
    laborCost: (0, import_fields40.virtual)({
      field: import_core39.graphql.field({
        type: import_core39.graphql.Float,
        resolve(item) {
          if (!item.clockIn || !item.clockOut || !item.hourlyRate) return null;
          const start = new Date(item.clockIn);
          const end = new Date(item.clockOut);
          const breakMins = parseFloat(item.breakMinutes || "0");
          const hours = ((end.getTime() - start.getTime()) / 6e4 - breakMins) / 60;
          return Math.round(hours * parseFloat(item.hourlyRate) * 100) / 100;
        }
      })
    }),
    // Relationships
    staff: (0, import_fields40.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/WasteLog.ts
var import_core40 = require("@keystone-6/core");
var import_fields41 = require("@keystone-6/core/fields");
var WasteLog = (0, import_core40.list)({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["ingredient", "quantity", "reason", "cost", "createdAt"]
    }
  },
  fields: {
    eventKey: (0, import_fields41.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    reversedAt: (0, import_fields41.timestamp)(),
    reversedBy: (0, import_fields41.relationship)({ ref: "User" }),
    reversalReason: (0, import_fields41.text)({ ui: { displayMode: "textarea" } }),
    quantity: (0, import_fields41.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: { description: "Amount wasted" }
    }),
    reason: (0, import_fields41.select)({
      type: "string",
      options: [
        { label: "Spoilage", value: "spoilage" },
        { label: "Preparation Error", value: "preparation_error" },
        { label: "Overproduction", value: "overproduction" },
        { label: "Plate Waste", value: "plate_waste" },
        { label: "Expired", value: "expired" },
        { label: "Damaged", value: "damaged" },
        { label: "Other", value: "other" }
      ],
      defaultValue: "spoilage",
      validation: { isRequired: true }
    }),
    cost: (0, import_fields41.virtual)({
      field: import_core40.graphql.field({
        type: import_core40.graphql.Float,
        async resolve(item, args, context) {
          if (!item.ingredientId || !item.quantity) return 0;
          const ingredient = await context.sudo().query.Ingredient.findOne({
            where: { id: item.ingredientId },
            query: "costPerUnit"
          });
          if (!ingredient?.costPerUnit) return 0;
          return parseFloat(ingredient.costPerUnit) * parseFloat(item.quantity);
        }
      })
    }),
    notes: (0, import_fields41.text)({
      ui: { displayMode: "textarea" }
    }),
    // Relationships
    ingredient: (0, import_fields41.relationship)({
      ref: "Ingredient",
      ui: {
        displayMode: "select"
      }
    }),
    loggedBy: (0, import_fields41.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PurchaseOrder.ts
var import_core41 = require("@keystone-6/core");
var import_fields42 = require("@keystone-6/core/fields");
var PurchaseOrder = (0, import_core41.list)({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory
    }
  },
  ui: {
    listView: {
      initialColumns: ["poNumber", "vendor", "orderDate", "status", "totalCost"]
    },
    labelField: "poNumber"
  },
  fields: {
    poNumber: (0, import_fields42.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    orderDate: (0, import_fields42.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" }
    }),
    expectedDelivery: (0, import_fields42.timestamp)({
      ui: { description: "Expected delivery date" }
    }),
    receivedDate: (0, import_fields42.timestamp)({
      ui: { description: "Actual received date" }
    }),
    status: (0, import_fields42.select)({
      type: "string",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Sent", value: "sent" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Shipped", value: "shipped" },
        { label: "Received", value: "received" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "draft"
    }),
    lineItems: (0, import_fields42.json)({
      ui: {
        description: "Array of { ingredientId, ingredientName, quantity, unit, unitCost, totalCost }"
      }
    }),
    totalCost: (0, import_fields42.virtual)({
      field: import_core41.graphql.field({
        type: import_core41.graphql.Float,
        resolve(item) {
          if (!item.lineItems) return 0;
          const items = item.lineItems;
          return items.reduce((sum, li) => sum + (li.totalCost || 0), 0);
        }
      })
    }),
    notes: (0, import_fields42.text)({
      ui: { displayMode: "textarea" }
    }),
    // Relationships
    vendor: (0, import_fields42.relationship)({
      ref: "Vendor",
      ui: {
        displayMode: "select"
      }
    }),
    createdBy: (0, import_fields42.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/AuditEvent.ts
var import_core42 = require("@keystone-6/core");
var import_fields43 = require("@keystone-6/core/fields");
var AuditEvent = (0, import_core42.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }) || permissions.canManagePayments({ session }) || permissions.canManageInventory({ session }) || permissions.canManageStaff({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    eventKey: (0, import_fields43.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    eventType: (0, import_fields43.text)({ validation: { isRequired: true }, isIndexed: true }),
    entityType: (0, import_fields43.text)({ validation: { isRequired: true }, isIndexed: true }),
    entityId: (0, import_fields43.text)({ validation: { isRequired: true }, isIndexed: true }),
    reason: (0, import_fields43.text)({ ui: { displayMode: "textarea" } }),
    before: (0, import_fields43.json)(),
    after: (0, import_fields43.json)(),
    metadata: (0, import_fields43.json)(),
    occurredAt: (0, import_fields43.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    actor: (0, import_fields43.relationship)({ ref: "User" }),
    approver: (0, import_fields43.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/OrderAdjustment.ts
var import_core43 = require("@keystone-6/core");
var import_fields44 = require("@keystone-6/core/fields");
var OrderAdjustment = (0, import_core43.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadOrders({ session }) || permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    idempotencyKey: (0, import_fields44.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    type: (0, import_fields44.select)({
      type: "string",
      options: [
        { label: "Void", value: "void" },
        { label: "Comp", value: "comp" },
        { label: "Split", value: "split" },
        { label: "Correction", value: "correction" }
      ],
      validation: { isRequired: true }
    }),
    amount: (0, import_fields44.integer)({ validation: { isRequired: true, min: 0 } }),
    reason: (0, import_fields44.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    metadata: (0, import_fields44.json)(),
    order: (0, import_fields44.relationship)({ ref: "RestaurantOrder" }),
    orderItem: (0, import_fields44.relationship)({ ref: "OrderItem" }),
    actor: (0, import_fields44.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields44.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/Receipt.ts
var import_core44 = require("@keystone-6/core");
var import_fields45 = require("@keystone-6/core/fields");
var Receipt = (0, import_core44.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    receiptNumber: (0, import_fields45.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    kind: (0, import_fields45.select)({
      type: "string",
      options: [
        { label: "Sale", value: "sale" },
        { label: "Refund", value: "refund" },
        { label: "Correction", value: "correction" }
      ],
      defaultValue: "sale",
      validation: { isRequired: true }
    }),
    amount: (0, import_fields45.integer)({ validation: { isRequired: true } }),
    currencyCode: (0, import_fields45.text)({ validation: { isRequired: true } }),
    snapshot: (0, import_fields45.json)(),
    issuedAt: (0, import_fields45.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    order: (0, import_fields45.relationship)({ ref: "RestaurantOrder" }),
    payment: (0, import_fields45.relationship)({ ref: "Payment" }),
    refund: (0, import_fields45.relationship)({ ref: "Refund" }),
    correctsReceipt: (0, import_fields45.relationship)({ ref: "Receipt" }),
    issuedBy: (0, import_fields45.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/Refund.ts
var import_core45 = require("@keystone-6/core");
var import_fields46 = require("@keystone-6/core/fields");
var Refund = (0, import_core45.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    idempotencyKey: (0, import_fields46.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    amount: (0, import_fields46.integer)({ validation: { isRequired: true, min: 1 } }),
    currencyCode: (0, import_fields46.text)({ validation: { isRequired: true } }),
    status: (0, import_fields46.select)({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Unknown", value: "unknown" }
      ],
      defaultValue: "processing",
      validation: { isRequired: true }
    }),
    reason: (0, import_fields46.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    providerRefundId: (0, import_fields46.text)(),
    providerData: (0, import_fields46.json)(),
    processedAt: (0, import_fields46.timestamp)(),
    payment: (0, import_fields46.relationship)({ ref: "Payment" }),
    order: (0, import_fields46.relationship)({ ref: "RestaurantOrder" }),
    requestedBy: (0, import_fields46.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields46.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentWebhookEvent.ts
var import_core46 = require("@keystone-6/core");
var import_fields47 = require("@keystone-6/core/fields");
var PaymentWebhookEvent = (0, import_core46.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    eventKey: (0, import_fields47.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    providerCode: (0, import_fields47.text)({ validation: { isRequired: true }, isIndexed: true }),
    providerEventId: (0, import_fields47.text)({ isIndexed: true }),
    eventType: (0, import_fields47.text)({ isIndexed: true }),
    status: (0, import_fields47.select)({
      type: "string",
      options: [
        { label: "Received", value: "received" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "received"
    }),
    payload: (0, import_fields47.json)(),
    rawBody: (0, import_fields47.text)({ ui: { displayMode: "textarea" } }),
    error: (0, import_fields47.text)({ ui: { displayMode: "textarea" } }),
    attempts: (0, import_fields47.integer)({ defaultValue: 0 }),
    receivedAt: (0, import_fields47.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    processedAt: (0, import_fields47.timestamp)(),
    payment: (0, import_fields47.relationship)({ ref: "Payment" }),
    ...trackingFields
  }
});

// features/keystone/models/KitchenTicketEvent.ts
var import_core47 = require("@keystone-6/core");
var import_fields48 = require("@keystone-6/core/fields");
var KitchenTicketEvent = (0, import_core47.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadKitchen({ session }) || permissions.canManageKitchen({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    eventType: (0, import_fields48.select)({
      type: "string",
      options: [
        { label: "Dispatch", value: "dispatch" },
        { label: "Delta", value: "delta" },
        { label: "Status", value: "status" },
        { label: "Item Status", value: "item_status" },
        { label: "Recall", value: "recall" },
        { label: "Cancel", value: "cancel" }
      ],
      validation: { isRequired: true }
    }),
    eventKey: (0, import_fields48.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    payload: (0, import_fields48.json)(),
    occurredAt: (0, import_fields48.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    ticket: (0, import_fields48.relationship)({ ref: "KitchenTicket" }),
    order: (0, import_fields48.relationship)({ ref: "RestaurantOrder" }),
    orderItem: (0, import_fields48.relationship)({ ref: "OrderItem" }),
    actor: (0, import_fields48.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/IdempotencyKey.ts
var import_core48 = require("@keystone-6/core");
var import_fields49 = require("@keystone-6/core/fields");
var IdempotencyKey = (0, import_core48.list)({
  access: {
    operation: {
      query: () => false,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields49.text)({
      isIndexed: "unique",
      validation: { isRequired: true }
    }),
    requestMethod: (0, import_fields49.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields49.json)(),
    requestPath: (0, import_fields49.text)({ validation: { isRequired: true } }),
    responseCode: (0, import_fields49.integer)(),
    responseBody: (0, import_fields49.json)(),
    recoveryPoint: (0, import_fields49.text)({
      defaultValue: "started",
      validation: { isRequired: true }
    }),
    lockedAt: (0, import_fields49.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/ManagerApproval.ts
var import_core49 = require("@keystone-6/core");
var import_fields50 = require("@keystone-6/core/fields");
var ManagerApproval = (0, import_core49.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    actionType: (0, import_fields50.select)({
      type: "string",
      options: [
        { label: "Void order item", value: "void_item" },
        { label: "Comp order item", value: "comp_item" },
        { label: "Void order", value: "void_order" },
        { label: "Refund payment", value: "refund_payment" }
      ],
      validation: { isRequired: true },
      isIndexed: true
    }),
    targetId: (0, import_fields50.text)({ validation: { isRequired: true }, isIndexed: true }),
    reason: (0, import_fields50.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    amount: (0, import_fields50.integer)(),
    requestFingerprint: (0, import_fields50.text)({ validation: { isRequired: true } }),
    requestPayload: (0, import_fields50.json)(),
    status: (0, import_fields50.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
        { label: "Consumed", value: "consumed" },
        { label: "Expired", value: "expired" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      isIndexed: true
    }),
    requestedAt: (0, import_fields50.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    approvedAt: (0, import_fields50.timestamp)(),
    consumedAt: (0, import_fields50.timestamp)(),
    expiresAt: (0, import_fields50.timestamp)({ validation: { isRequired: true }, isIndexed: true }),
    consumedEntityType: (0, import_fields50.text)(),
    consumedEntityId: (0, import_fields50.text)(),
    requestedBy: (0, import_fields50.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields50.relationship)({ ref: "User" }),
    ...trackingFields
  },
  ui: { isHidden: true }
});

// features/keystone/models/index.ts
var models = {
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
  ManagerApproval
};

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(root, { data }, context) {
  const sudoContext = context.sudo();
  const session = context.session;
  if (!session?.itemId) {
    throw new Error("Not authenticated");
  }
  const existingUser = await sudoContext.query.User.findOne({
    where: { id: session.itemId }
  });
  if (!existingUser) {
    throw new Error("User not found");
  }
  return await sudoContext.db.User.updateOne({
    where: { id: session.itemId },
    data
  });
}
var updateActiveUser_default = updateActiveUser;

// import("../../integrations/payment/**/*.ts") in features/keystone/utils/paymentProviderAdapter.ts
var globImport_integrations_payment_ts = __glob({
  "../../integrations/payment/index.ts": () => Promise.resolve().then(() => (init_payment(), payment_exports)),
  "../../integrations/payment/manual.ts": () => Promise.resolve().then(() => (init_manual(), manual_exports)),
  "../../integrations/payment/paypal.ts": () => Promise.resolve().then(() => (init_paypal(), paypal_exports)),
  "../../integrations/payment/stripe.ts": () => Promise.resolve().then(() => (init_stripe(), stripe_exports))
});

// features/keystone/utils/paymentProviderAdapter.ts
async function executeAdapterFunction({ provider, functionName, args }) {
  const functionPath = provider[functionName];
  if (functionPath.startsWith("http")) {
    const response = await fetch(functionPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...args })
    });
    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.statusText}`);
    }
    return response.json();
  }
  const adapter = await globImport_integrations_payment_ts(`../../integrations/payment/${functionPath}.ts`);
  const fn = adapter[functionName];
  if (!fn) {
    throw new Error(
      `Function ${functionName} not found in adapter ${functionPath}`
    );
  }
  try {
    return await fn({ provider, ...args });
  } catch (error) {
    throw new Error(
      `Error executing ${functionName} for provider ${functionPath}: ${error?.message || "Unknown error"}`
    );
  }
}
async function createPayment({ provider, cart, order, amount, currency, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency, idempotencyKey }
  });
}
async function capturePayment({ provider, paymentId, amount }) {
  return executeAdapterFunction({
    provider,
    functionName: "capturePaymentFunction",
    args: { paymentId, amount }
  });
}
async function refundPayment({ provider, paymentId, amount, currency, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency, idempotencyKey }
  });
}
async function getPaymentStatus({ provider, paymentId }) {
  return executeAdapterFunction({
    provider,
    functionName: "getPaymentStatusFunction",
    args: { paymentId }
  });
}
async function handleWebhook({ provider, event, headers, rawBody }) {
  return executeAdapterFunction({
    provider,
    functionName: "handleWebhookFunction",
    args: { event, headers, rawBody }
  });
}

// features/keystone/utils/audit.ts
var import_node_crypto2 = __toESM(require("node:crypto"));
async function appendAuditEventWithClient(prisma, actorId, input) {
  const eventKey = input.eventKey || import_node_crypto2.default.randomUUID();
  return prisma.auditEvent.upsert({
    where: { eventKey },
    update: {},
    create: {
      eventKey,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason || "",
      before: input.before ?? void 0,
      after: input.after ?? void 0,
      metadata: input.metadata ?? void 0,
      actorId: actorId || null,
      approverId: input.approverId || null
    }
  });
}
async function appendAuditEvent(context, input) {
  return appendAuditEventWithClient(context.prisma, context.session?.itemId, input);
}

// features/keystone/utils/receipt.ts
function receiptNumber(kind, entityId) {
  return `${kind === "sale" ? "R" : kind === "refund" ? "RF" : "RC"}-${entityId}`;
}
async function issueReceiptWithClient(prisma, issuedById, input) {
  const number = receiptNumber(input.kind, input.entityId);
  return prisma.receipt.upsert({
    where: { receiptNumber: number },
    update: {},
    create: {
      receiptNumber: number,
      kind: input.kind,
      amount: input.amount,
      currencyCode: input.currencyCode,
      snapshot: input.snapshot,
      orderId: input.orderId,
      paymentId: input.paymentId || null,
      refundId: input.refundId || null,
      correctsReceiptId: input.correctsReceiptId || null,
      issuedById: issuedById || null
    }
  });
}

// features/keystone/utils/orderCompletion.ts
function cents(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}
async function finalizePaidOrderWithClient(prisma, orderId, actorId) {
  const order = await prisma.restaurantOrder.findUnique({
    where: { id: orderId },
    include: { payments: { select: { amount: true, status: true } } }
  });
  if (!order) throw new Error("Order not found");
  const paid = order.payments.filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + cents(payment.amount), 0);
  if (paid < cents(order.total)) return false;
  if (order.status === "cancelled") throw new Error("A cancelled order cannot be completed");
  if (order.status !== "completed") {
    await prisma.restaurantOrder.update({ where: { id: orderId }, data: { status: "completed" } });
    await appendAuditEventWithClient(prisma, actorId, {
      eventKey: `order-completed-after-payment:${orderId}`,
      eventType: "order.completed_after_payment",
      entityType: "RestaurantOrder",
      entityId: orderId,
      before: { status: order.status },
      after: { status: "completed", paid, total: order.total }
    });
  }
  return true;
}
async function reconcileCompletedOrderOperations(orderId, context) {
  const order = await context.sudo().query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id status tables { id }"
  });
  if (!order || order.status !== "completed") return;
  await syncKitchenTicketsForOrder(orderId, context);
  await depleteInventoryForCompletedOrder(orderId, context);
  await Promise.all((order.tables || []).map(
    (table) => context.sudo().db.Table.updateOne({ where: { id: table.id }, data: { status: "cleaning" } })
  ));
}
async function finalizePaidOrder(orderId, context) {
  const finalized = await context.prisma.$transaction(
    (tx) => finalizePaidOrderWithClient(tx, orderId, context.session?.itemId),
    { isolationLevel: "Serializable" }
  );
  if (finalized) await reconcileCompletedOrderOperations(orderId, context);
  return finalized;
}

// features/keystone/utils/idempotency.ts
var import_node_crypto3 = __toESM(require("node:crypto"));
function normalize(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Idempotency request contains a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, normalize(entry)])
    );
  }
  throw new Error(`Unsupported idempotency request value: ${typeof value}`);
}
function canonicalIdempotencyParams(params) {
  return normalize(params);
}
function idempotencyFingerprint(params) {
  return import_node_crypto3.default.createHash("sha256").update(JSON.stringify(canonicalIdempotencyParams(params))).digest("hex");
}
function storedFingerprint(requestParams) {
  const params = requestParams && typeof requestParams === "object" ? { ...requestParams } : {};
  const recorded = typeof params._fingerprint === "string" ? params._fingerprint : null;
  delete params._fingerprint;
  const calculated = idempotencyFingerprint(params);
  if (recorded && recorded !== calculated) {
    throw new Error("Stored idempotency request fingerprint is invalid");
  }
  return calculated;
}
function assertIdempotencyRequest(attempt, request) {
  const method = request.requestMethod || "POST";
  const expectedFingerprint = idempotencyFingerprint(request.requestParams);
  if (attempt.requestMethod !== method || attempt.requestPath !== request.requestPath || storedFingerprint(attempt.requestParams) !== expectedFingerprint) {
    throw new Error("Idempotency key was already used with a different request");
  }
}
async function findIdempotencyAttempt(prisma, request) {
  const key = request.key.trim();
  if (!key) throw new Error("Idempotency key is required");
  const existing = await prisma.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
  if (existing) assertIdempotencyRequest(existing, { ...request, key });
  return existing;
}
async function getOrCreateIdempotencyAttempt(prisma, request) {
  const key = request.key.trim();
  if (!key) throw new Error("Idempotency key is required");
  const normalizedParams = canonicalIdempotencyParams(request.requestParams);
  const data = {
    idempotencyKey: key,
    requestMethod: request.requestMethod || "POST",
    requestPath: request.requestPath,
    requestParams: {
      ...normalizedParams,
      _fingerprint: idempotencyFingerprint(request.requestParams)
    },
    recoveryPoint: "started",
    lockedAt: /* @__PURE__ */ new Date()
  };
  const existing = await findIdempotencyAttempt(prisma, { ...request, key });
  if (existing) return { attempt: existing, replay: true };
  try {
    const attempt = await prisma.idempotencyKey.create({ data });
    return { attempt, replay: false };
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const raced = await prisma.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
    if (!raced) throw error;
    assertIdempotencyRequest(raced, { ...request, key });
    return { attempt: raced, replay: true };
  }
}
async function updateIdempotencyAttempt(prisma, attemptId, recoveryPoint, responseBody, responseCode) {
  await prisma.idempotencyKey.update({
    where: { id: attemptId },
    data: {
      recoveryPoint,
      responseBody,
      responseCode,
      lockedAt: ["completed", "failed"].includes(recoveryPoint) ? null : /* @__PURE__ */ new Date()
    }
  });
}

// features/keystone/mutations/processPayment.ts
function cents2(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}
function providerCodeForMethod(method) {
  if (method === "cash") return "pp_system_default";
  if (["credit_card", "debit_card", "apple_pay", "google_pay"].includes(method)) {
    return "pp_stripe_stripe";
  }
  if (method === "paypal") return "pp_paypal_paypal";
  return null;
}
async function getProvider(context, code) {
  if (!code) return null;
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: code }, isInstalled: { equals: true } },
    query: "id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata",
    take: 1
  });
  return providers[0] || null;
}
async function writeSaleEvidence(prisma, actorId, input) {
  await appendAuditEventWithClient(prisma, actorId, {
    eventKey: `payment-succeeded:${input.payment.id}`,
    eventType: "payment.succeeded",
    entityType: "Payment",
    entityId: input.payment.id,
    after: {
      amount: input.payment.amount,
      method: input.payment.paymentMethod,
      remainingBalance: input.remainingBalance
    },
    metadata: { idempotencyKey: input.payment.idempotencyKey }
  });
  await issueReceiptWithClient(prisma, actorId, {
    kind: "sale",
    entityId: input.payment.id,
    orderId: input.order.id,
    paymentId: input.payment.id,
    amount: cents2(input.payment.amount),
    currencyCode: input.order.currencyCode || "USD",
    snapshot: {
      orderId: input.order.id,
      orderNumber: input.order.orderNumber,
      tender: input.payment.paymentMethod,
      amount: cents2(input.payment.amount),
      remainingBalance: input.remainingBalance
    }
  });
}
async function processPayment(_root, args, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, paymentId: null, clientSecret: null, amount: null, remainingBalance: null, error: "Not authorized to process payment" };
  }
  try {
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const providerCode = providerCodeForMethod(args.paymentMethod);
    if (!providerCode || args.paymentMethod === "gift_card") {
      throw new Error(args.paymentMethod === "gift_card" ? "Use the atomic gift-card redemption operation" : "Unsupported payment method");
    }
    const provider = await getProvider(context, providerCode);
    if (args.paymentMethod !== "cash" && (!provider || !isPaymentProviderConfigured(provider.code))) {
      throw new Error("The selected payment provider is not installed and configured");
    }
    const prisma = context.prisma;
    const priorPayment = await prisma.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (priorPayment) {
      const requestedAmount = args.amount == null ? null : cents2(args.amount);
      if (priorPayment.orderId !== args.orderId || priorPayment.paymentMethod !== args.paymentMethod || requestedAmount !== null && cents2(priorPayment.amount) !== requestedAmount) {
        throw new Error("Idempotency key was already used with a different payment request");
      }
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `process-payment:${args.idempotencyKey.trim()}`,
      requestPath: "processPayment",
      requestParams: {
        orderId: args.orderId,
        paymentMethod: args.paymentMethod,
        amount: args.amount ?? null,
        tipAmount: args.tipAmount ?? 0
      }
    });
    const reservation = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing) {
        const requestedAmount2 = args.amount == null ? null : cents2(args.amount);
        if (existing.orderId !== args.orderId || existing.paymentMethod !== args.paymentMethod || requestedAmount2 !== null && cents2(existing.amount) !== requestedAmount2) {
          throw new Error("Idempotency key was already used with a different payment request");
        }
        const order2 = await tx.restaurantOrder.findUnique({ where: { id: existing.orderId } });
        const payments = await tx.payment.findMany({
          where: {
            orderId: existing.orderId,
            status: { in: ["processing", "authorized", "succeeded", "unknown"] }
          }
        });
        const reserved2 = payments.reduce((sum, payment2) => sum + cents2(payment2.amount), 0);
        return {
          payment: existing,
          order: order2,
          remainingBalance: Math.max(0, cents2(order2?.total) - reserved2),
          replay: true
        };
      }
      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) {
        throw new Error("Order cannot accept another tender");
      }
      const recoverable = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          paymentMethod: args.paymentMethod,
          status: { in: ["processing", "authorized", "unknown"] }
        },
        orderBy: { createdAt: "desc" }
      });
      if (recoverable) {
        const reservedRows = await tx.payment.findMany({
          where: {
            orderId: order.id,
            status: { in: ["processing", "authorized", "succeeded", "unknown"] }
          }
        });
        const reservedTotal = reservedRows.reduce((sum, payment2) => sum + cents2(payment2.amount), 0);
        return {
          payment: recoverable,
          order,
          remainingBalance: Math.max(0, cents2(order.total) - reservedTotal),
          replay: true
        };
      }
      const desiredTip = Math.max(cents2(order.tip), cents2(args.tipAmount));
      const total = Math.max(0, cents2(order.total) - cents2(order.tip) + desiredTip);
      const reservedPayments = await tx.payment.findMany({
        where: {
          orderId: order.id,
          status: { in: ["processing", "authorized", "succeeded", "unknown"] }
        }
      });
      const reserved = reservedPayments.reduce((sum, payment2) => sum + cents2(payment2.amount), 0);
      const remainingBalance = total - reserved;
      if (remainingBalance <= 0) throw new Error("Order has no unreserved balance");
      const requestedAmount = cents2(args.amount);
      const amount = requestedAmount > 0 ? requestedAmount : remainingBalance;
      if (amount > remainingBalance) throw new Error("Tender amount exceeds the server-calculated remaining balance");
      const immediate = args.paymentMethod === "cash";
      const payment = await tx.payment.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          reservedAt: /* @__PURE__ */ new Date(),
          amount,
          status: immediate ? "succeeded" : "processing",
          paymentMethod: args.paymentMethod,
          currencyCode: order.currencyCode || "USD",
          tipAmount: desiredTip,
          paymentProviderId: provider?.id || null,
          processedAt: immediate ? /* @__PURE__ */ new Date() : null,
          orderId: order.id,
          processedById: context.session?.itemId || null,
          data: { providerCode }
        }
      });
      const remainingAfterTender = remainingBalance - amount;
      const nextOrder = await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          tip: desiredTip,
          total,
          status: order.status
        }
      });
      if (immediate) {
        await writeSaleEvidence(tx, context.session?.itemId, {
          payment,
          order: nextOrder,
          remainingBalance: remainingAfterTender
        });
        if (remainingAfterTender === 0) {
          await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
        }
      }
      return { payment, order: nextOrder, remainingBalance: remainingAfterTender, replay: false };
    }, { isolationLevel: "Serializable" });
    const existingData = reservation.payment?.data || {};
    const needsProviderRecovery = reservation.replay && args.paymentMethod !== "cash" && !reservation.payment.providerPaymentId && !existingData.clientSecret;
    if (reservation.replay && !needsProviderRecovery) {
      await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
        paymentId: reservation.payment.id,
        orderId: reservation.order?.id || args.orderId
      }, 200);
      return {
        success: !["failed", "cancelled"].includes(reservation.payment.status),
        paymentId: reservation.payment.id,
        clientSecret: existingData.clientSecret || null,
        amount: cents2(reservation.payment.amount),
        remainingBalance: reservation.remainingBalance,
        error: reservation.payment.errorMessage || null
      };
    }
    if (args.paymentMethod === "cash") {
      if (reservation.remainingBalance === 0) {
        await reconcileCompletedOrderOperations(reservation.order.id, context);
      }
      await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
        paymentId: reservation.payment.id,
        orderId: reservation.order.id
      }, 200);
      return {
        success: true,
        paymentId: reservation.payment.id,
        clientSecret: null,
        amount: cents2(reservation.payment.amount),
        remainingBalance: reservation.remainingBalance,
        error: null
      };
    }
    try {
      const providerResult = await createPayment({
        provider,
        order: reservation.order,
        amount: cents2(reservation.payment.amount),
        currency: String(reservation.order.currencyCode || "USD").toLowerCase(),
        idempotencyKey: reservation.payment.idempotencyKey || args.idempotencyKey
      });
      const providerPaymentId = providerResult?.paymentIntentId || providerResult?.orderId || providerResult?.paymentId || null;
      const status = providerResult?.status === "succeeded" ? "succeeded" : providerResult?.status === "requires_capture" ? "authorized" : "processing";
      const data = { ...providerResult, providerCode };
      await prisma.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id: reservation.payment.id },
          data: {
            providerPaymentId: providerPaymentId || "",
            data,
            status,
            processedAt: status === "succeeded" ? /* @__PURE__ */ new Date() : void 0
          }
        });
        if (status === "succeeded") {
          await writeSaleEvidence(tx, context.session?.itemId, { ...reservation, payment: updated });
          if (reservation.remainingBalance === 0) {
            await finalizePaidOrderWithClient(tx, reservation.order.id, context.session?.itemId);
          }
        }
      }, { isolationLevel: "Serializable" });
      if (status === "succeeded" && reservation.remainingBalance === 0) {
        await reconcileCompletedOrderOperations(reservation.order.id, context);
      }
      await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
        paymentId: reservation.payment.id,
        orderId: reservation.order.id,
        providerPaymentId,
        status
      }, 200);
      return {
        success: true,
        paymentId: reservation.payment.id,
        clientSecret: providerResult?.clientSecret || null,
        amount: cents2(reservation.payment.amount),
        remainingBalance: reservation.remainingBalance,
        error: null
      };
    } catch (error) {
      await context.sudo().db.Payment.updateOne({
        where: { id: reservation.payment.id },
        data: { status: "failed", errorMessage: error instanceof Error ? error.message : "Provider initiation failed" }
      });
      await updateIdempotencyAttempt(prisma, attempt.id, "failed", {
        paymentId: reservation.payment.id,
        error: error instanceof Error ? error.message : "Provider initiation failed"
      }, 502);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, paymentId: null, clientSecret: null, amount: null, remainingBalance: null, error: message };
  }
}
async function capturePaymentMutation(_root, args, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, status: null, error: "Not authorized to capture payment" };
  }
  try {
    const payments = await context.sudo().query.Payment.findMany({
      where: { providerPaymentId: { equals: args.paymentIntentId } },
      query: "id idempotencyKey amount status paymentMethod currencyCode providerPaymentId data order { id orderNumber total currencyCode status } paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }",
      take: 1
    });
    const payment = payments[0];
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "succeeded") return { success: true, status: "succeeded", error: null };
    if (!payment.paymentProvider) throw new Error("Payment provider is missing");
    const captured = await capturePayment({
      provider: payment.paymentProvider,
      paymentId: payment.providerPaymentId || args.paymentIntentId,
      amount: cents2(payment.amount)
    });
    const didSucceed = ["succeeded", "captured"].includes(captured.status);
    const nextStatus = didSucceed ? "succeeded" : captured.status === "failed" ? "failed" : "unknown";
    const prisma = context.prisma;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          processedAt: didSucceed ? /* @__PURE__ */ new Date() : void 0,
          data: { ...payment.data || {}, capture: captured.data || captured }
        }
      });
      if (didSucceed && payment.order?.id) {
        const order = await tx.restaurantOrder.findUnique({ where: { id: payment.order.id } });
        const succeeded = await tx.payment.findMany({ where: { orderId: order.id, status: "succeeded" } });
        const paid = succeeded.reduce((sum, row) => sum + cents2(row.amount), 0);
        const remainingBalance = Math.max(0, cents2(order.total) - paid);
        await writeSaleEvidence(tx, context.session?.itemId, { payment: updated, order, remainingBalance });
        if (remainingBalance === 0) await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
      }
    }, { isolationLevel: "Serializable" });
    if (didSucceed && payment.order?.id) await reconcileCompletedOrderOperations(payment.order.id, context);
    return { success: didSucceed, status: nextStatus, error: didSucceed ? null : "Capture outcome is not final" };
  } catch (error) {
    return { success: false, status: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function reconcilePaymentMutation(_root, { paymentId }, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, status: null, error: "Not authorized to reconcile payment" };
  }
  try {
    const payment = await context.sudo().query.Payment.findOne({
      where: { id: paymentId },
      query: "id idempotencyKey amount status paymentMethod currencyCode providerPaymentId data order { id orderNumber total currencyCode status } paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }"
    });
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "succeeded") return { success: true, status: "succeeded", error: null };
    if (!payment.paymentProvider || !payment.providerPaymentId) throw new Error("Provider payment reference is missing");
    const providerStatus = await getPaymentStatus({
      provider: payment.paymentProvider,
      paymentId: payment.providerPaymentId
    });
    const succeeded = providerStatus.status === "succeeded";
    const status = succeeded ? "succeeded" : ["failed", "canceled", "cancelled"].includes(providerStatus.status) ? providerStatus.status === "failed" ? "failed" : "cancelled" : "processing";
    const prisma = context.prisma;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status,
          processedAt: succeeded ? /* @__PURE__ */ new Date() : void 0,
          data: { ...payment.data || {}, reconciliation: providerStatus.data || providerStatus }
        }
      });
      if (succeeded && payment.order?.id) {
        const order = await tx.restaurantOrder.findUnique({ where: { id: payment.order.id } });
        const paidRows = await tx.payment.findMany({ where: { orderId: order.id, status: "succeeded" } });
        const paid = paidRows.reduce((sum, row) => sum + cents2(row.amount), 0);
        const remainingBalance = Math.max(0, cents2(order.total) - paid);
        await writeSaleEvidence(tx, context.session?.itemId, { payment: updated, order, remainingBalance });
        if (remainingBalance === 0) await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
      }
    }, { isolationLevel: "Serializable" });
    if (succeeded && payment.order?.id) await reconcileCompletedOrderOperations(payment.order.id, context);
    return { success: succeeded, status, error: succeeded ? null : "Provider payment is not yet successful" };
  } catch (error) {
    return { success: false, status: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function getPaymentStatus2(_root, args, context) {
  if (!(permissions.canReadPayments({ session: context.session }) || permissions.canManagePayments({ session: context.session }))) {
    return { status: null, amount: null, error: "Not authorized to check payment status" };
  }
  try {
    const payments = await context.sudo().query.Payment.findMany({
      where: { providerPaymentId: { equals: args.paymentIntentId } },
      query: "id amount status providerPaymentId paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }",
      take: 1
    });
    const payment = payments[0];
    if (!payment) throw new Error("Payment not found");
    if (!payment.paymentProvider || ["cash", "gift_card"].includes(payment.paymentMethod || "")) {
      return { status: payment.status, amount: cents2(payment.amount), error: null };
    }
    const status = await getPaymentStatus({
      provider: payment.paymentProvider,
      paymentId: payment.providerPaymentId || args.paymentIntentId
    });
    return { status: status.status, amount: status.amount ?? cents2(payment.amount), error: null };
  } catch (error) {
    return { status: null, amount: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// features/keystone/mutations/redeemGiftCard.ts
function cents3(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}
async function lookupGiftCard(_root, { code }, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to use gift-card tenders");
  }
  const normalized = code?.trim().toUpperCase();
  if (!normalized) throw new Error("Gift card code is required");
  const cards = await context.sudo().query.GiftCard.findMany({
    where: { code: { equals: normalized }, isDisabled: { equals: false } },
    query: "id code balance endsAt",
    take: 1
  });
  const card = cards[0];
  if (!card || card.endsAt && new Date(card.endsAt) <= /* @__PURE__ */ new Date()) return null;
  return card;
}
async function redeemGiftCard(_root, args, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, paymentId: null, amount: 0, remainingBalance: 0, error: "Not authorized" };
  }
  try {
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const code = args.code?.trim().toUpperCase();
    if (!code) throw new Error("Gift card code is required");
    const prisma = context.prisma;
    const priorTransaction = await prisma.giftCardTransaction.findUnique({
      where: { idempotencyKey: args.idempotencyKey }
    });
    if (priorTransaction) {
      const [priorPayment, priorCard] = await Promise.all([
        prisma.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } }),
        priorTransaction.giftCardId ? prisma.giftCard.findUnique({ where: { id: priorTransaction.giftCardId } }) : null
      ]);
      if (priorTransaction.orderId !== args.orderId || priorPayment?.orderId !== args.orderId || priorCard?.code !== code) {
        throw new Error("Idempotency key was already used with a different gift-card request");
      }
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `gift-card-redemption:${args.idempotencyKey.trim()}`,
      requestPath: "redeemGiftCard",
      requestParams: {
        orderId: args.orderId,
        code,
        tipAmount: args.tipAmount ?? 0
      }
    });
    const result2 = await prisma.$transaction(async (tx) => {
      const existingTransaction = await tx.giftCardTransaction.findUnique({
        where: { idempotencyKey: args.idempotencyKey }
      });
      if (existingTransaction) {
        const existingPayment = await tx.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
        const existingCard = existingTransaction.giftCardId ? await tx.giftCard.findUnique({ where: { id: existingTransaction.giftCardId } }) : null;
        if (existingTransaction.orderId !== args.orderId || existingPayment?.orderId !== args.orderId || existingCard?.code !== code) {
          throw new Error("Idempotency key was already used with a different gift-card request");
        }
        const order2 = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
        const payments = await tx.payment.findMany({ where: { orderId: args.orderId, status: "succeeded" } });
        const paid = payments.reduce((sum, payment2) => sum + cents3(payment2.amount), 0);
        return {
          payment: existingPayment,
          order: order2,
          amount: Math.abs(cents3(existingTransaction.amount)),
          remainingBalance: Math.max(0, cents3(order2?.total) - paid),
          replay: true
        };
      }
      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) throw new Error("Order cannot accept another tender");
      const desiredTip = Math.max(cents3(order.tip), cents3(args.tipAmount));
      const orderTotal = Math.max(0, cents3(order.total) - cents3(order.tip) + desiredTip);
      const reservedPayments = await tx.payment.findMany({
        where: { orderId: args.orderId, status: { in: ["processing", "authorized", "succeeded"] } }
      });
      const reserved = reservedPayments.reduce((sum, payment2) => sum + cents3(payment2.amount), 0);
      const remaining = orderTotal - reserved;
      if (remaining <= 0) throw new Error("Order has no remaining balance");
      const giftCard = await tx.giftCard.findUnique({ where: { code } });
      if (!giftCard || giftCard.isDisabled) throw new Error("Gift card not found or disabled");
      if (giftCard.endsAt && new Date(giftCard.endsAt) <= /* @__PURE__ */ new Date()) throw new Error("Gift card has expired");
      const amount = Math.min(cents3(giftCard.balance), remaining);
      if (amount <= 0) throw new Error("Gift card has no available balance");
      const balanceAfter = cents3(giftCard.balance) - amount;
      await tx.giftCard.update({ where: { id: giftCard.id }, data: { balance: balanceAfter } });
      const payment = await tx.payment.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          reservedAt: /* @__PURE__ */ new Date(),
          amount,
          currencyCode: order.currencyCode || "USD",
          status: "succeeded",
          paymentMethod: "gift_card",
          tipAmount: desiredTip,
          processedAt: /* @__PURE__ */ new Date(),
          orderId: order.id,
          processedById: context.session?.itemId || null,
          data: { giftCardId: giftCard.id }
        }
      });
      await tx.giftCardTransaction.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          type: "redeem",
          amount: -amount,
          balanceAfter,
          giftCardId: giftCard.id,
          orderId: order.id
        }
      });
      const updatedOrder = await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          tip: desiredTip,
          total: orderTotal,
          status: order.status
        }
      });
      const remainingBalance = remaining - amount;
      await appendAuditEventWithClient(tx, context.session?.itemId, {
        eventKey: `gift-card-redeemed:${payment.id}`,
        eventType: "gift_card.redeemed",
        entityType: "Payment",
        entityId: payment.id,
        after: { amount, remainingBalance },
        metadata: { idempotencyKey: args.idempotencyKey }
      });
      await issueReceiptWithClient(tx, context.session?.itemId, {
        kind: "sale",
        entityId: payment.id,
        orderId: order.id,
        paymentId: payment.id,
        amount,
        currencyCode: order.currencyCode || "USD",
        snapshot: { orderId: order.id, tender: "gift_card", amount, remainingBalance }
      });
      if (remainingBalance === 0) {
        await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
      }
      return { payment, order: updatedOrder, amount, remainingBalance, replay: false };
    }, { isolationLevel: "Serializable" });
    if (result2.remainingBalance === 0) await reconcileCompletedOrderOperations(args.orderId, context);
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      paymentId: result2.payment?.id || null,
      orderId: args.orderId,
      amount: result2.amount,
      remainingBalance: result2.remainingBalance
    }, 200);
    return {
      success: true,
      paymentId: result2.payment?.id || null,
      amount: result2.amount,
      remainingBalance: result2.remainingBalance,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      paymentId: null,
      amount: 0,
      remainingBalance: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// features/keystone/utils/managerApproval.ts
function normalizedRequest(input) {
  return canonicalIdempotencyParams({
    actionType: input.actionType,
    targetId: input.targetId,
    reason: input.reason.trim(),
    amount: input.amount ?? null
  });
}
function canApproveAction(context, actionType) {
  return actionType === "refund_payment" ? permissions.canManagePayments({ session: context.session }) : permissions.canManageOrders({ session: context.session });
}
async function requestManagerApproval(_root, input, context) {
  const requesterId = context.session?.itemId;
  if (!requesterId || !canApproveAction(context, input.actionType)) {
    throw new Error("Not authorized to request this manager approval");
  }
  if (!input.targetId?.trim()) throw new Error("Approval target is required");
  if (!input.reason?.trim()) throw new Error("Approval reason is required");
  const requestPayload = normalizedRequest(input);
  return context.prisma.managerApproval.create({
    data: {
      actionType: input.actionType,
      targetId: input.targetId.trim(),
      reason: input.reason.trim(),
      amount: input.amount ?? null,
      requestPayload,
      requestFingerprint: idempotencyFingerprint(requestPayload),
      status: "pending",
      requestedById: requesterId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1e3)
    }
  });
}
async function approveManagerApproval(_root, { approvalId }, context) {
  const approverId = context.session?.itemId;
  if (!approverId) throw new Error("Not authorized to approve manager actions");
  const prisma = context.prisma;
  const outcome = await prisma.$transaction(async (tx) => {
    const approval = await tx.managerApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new Error("Manager approval request not found");
    if (!canApproveAction(context, approval.actionType)) {
      throw new Error("Not authorized to approve this manager action");
    }
    if (approval.requestedById === approverId) {
      throw new Error("A manager cannot approve their own correction request");
    }
    if (approval.status !== "pending") throw new Error(`Manager approval is already ${approval.status}`);
    if (new Date(approval.expiresAt) <= /* @__PURE__ */ new Date()) {
      const expired = await tx.managerApproval.update({ where: { id: approval.id }, data: { status: "expired" } });
      return { expired };
    }
    const updated = await tx.managerApproval.updateMany({
      where: { id: approval.id, status: "pending", requestedById: { not: approverId } },
      data: { status: "approved", approvedById: approverId, approvedAt: /* @__PURE__ */ new Date() }
    });
    if (updated.count !== 1) throw new Error("Manager approval changed concurrently");
    return { approval: await tx.managerApproval.findUnique({ where: { id: approval.id } }) };
  }, { isolationLevel: "Serializable" });
  if (outcome.expired) throw new Error("Manager approval request has expired");
  return outcome.approval;
}
async function consumeManagerApproval(tx, input) {
  if (!input.approvalId) throw new Error("Independent manager approval is required");
  if (!input.actorId) throw new Error("Authenticated correction actor is required");
  const approval = await tx.managerApproval.findUnique({ where: { id: input.approvalId } });
  if (!approval) throw new Error("Manager approval request not found");
  const requestPayload = normalizedRequest(input);
  if (approval.requestFingerprint !== idempotencyFingerprint(approval.requestPayload || {}) || approval.requestFingerprint !== idempotencyFingerprint(requestPayload) || approval.requestedById !== input.actorId) {
    throw new Error("Manager approval does not match this correction request");
  }
  if (!approval.approvedById || approval.approvedById === input.actorId) {
    throw new Error("Correction requires approval by a different manager");
  }
  if (approval.status !== "approved") throw new Error(`Manager approval is ${approval.status}`);
  if (new Date(approval.expiresAt) <= /* @__PURE__ */ new Date()) throw new Error("Manager approval has expired");
  const consumed = await tx.managerApproval.updateMany({
    where: {
      id: approval.id,
      status: "approved",
      requestedById: input.actorId,
      approvedById: { not: input.actorId },
      expiresAt: { gt: /* @__PURE__ */ new Date() }
    },
    data: {
      status: "consumed",
      consumedAt: /* @__PURE__ */ new Date(),
      consumedEntityType: input.entityType,
      consumedEntityId: input.entityId
    }
  });
  if (consumed.count !== 1) throw new Error("Manager approval was already consumed or expired");
  return approval;
}

// features/keystone/mutations/refundPayment.ts
function cents4(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}
async function refundPayment2(_root, args, context) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, refundId: null, status: null, error: "Not authorized to approve refunds" };
  }
  try {
    if (!args.managerApprovalId) throw new Error("Independent manager approval is required");
    if (!args.reason?.trim()) throw new Error("Refund reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma;
    const priorRefund = await prisma.refund.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (priorRefund) {
      const requestedAmount = args.amount == null ? null : cents4(args.amount);
      if (priorRefund.paymentId !== args.paymentId || priorRefund.reason !== args.reason.trim() || requestedAmount !== null && cents4(priorRefund.amount) !== requestedAmount) {
        throw new Error("Idempotency key was already used with a different refund request");
      }
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `refund:${args.idempotencyKey.trim()}`,
      requestPath: "refundPayment",
      requestParams: {
        paymentId: args.paymentId,
        amount: args.amount ?? null,
        reason: args.reason.trim(),
        managerApprovalId: args.managerApprovalId
      }
    });
    const reservation = await prisma.$transaction(async (tx) => {
      const existing = await tx.refund.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing) {
        const requestedAmount = args.amount == null ? null : cents4(args.amount);
        if (existing.paymentId !== args.paymentId || existing.reason !== args.reason.trim() || requestedAmount !== null && cents4(existing.amount) !== requestedAmount) {
          throw new Error("Idempotency key was already used with a different refund request");
        }
        return { refund: existing, replay: true };
      }
      const payment2 = await tx.payment.findUnique({ where: { id: args.paymentId } });
      if (!payment2 || !["succeeded", "partially_refunded"].includes(payment2.status)) {
        throw new Error("Only a successful payment can be refunded");
      }
      const pendingRefunds = await tx.refund.findMany({
        where: { paymentId: payment2.id, status: { in: ["processing", "succeeded", "unknown"] } }
      });
      const reserved = pendingRefunds.reduce((sum, refund2) => sum + cents4(refund2.amount), 0);
      const available = cents4(payment2.amount) - reserved;
      const amount = args.amount == null ? available : cents4(args.amount);
      if (amount <= 0 || amount > available) throw new Error("Refund amount exceeds the unrefunded payment balance");
      const refund = await tx.refund.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          amount,
          currencyCode: payment2.currencyCode || "USD",
          status: "processing",
          reason: args.reason.trim(),
          paymentId: payment2.id,
          orderId: payment2.orderId,
          requestedById: context.session?.itemId || null,
          approvedById: null
        }
      });
      const approval = await consumeManagerApproval(tx, {
        approvalId: args.managerApprovalId,
        actorId: context.session?.itemId,
        actionType: "refund_payment",
        targetId: args.paymentId,
        reason: args.reason,
        amount: args.amount ?? null,
        entityType: "Refund",
        entityId: refund.id
      });
      const approvedRefund = await tx.refund.update({
        where: { id: refund.id },
        data: { approvedById: approval.approvedById }
      });
      return { refund: approvedRefund, payment: payment2, replay: false };
    }, { isolationLevel: "Serializable" });
    if (reservation.replay && ["succeeded", "failed"].includes(reservation.refund.status)) {
      await updateIdempotencyAttempt(
        prisma,
        attempt.id,
        reservation.refund.status === "succeeded" ? "completed" : "failed",
        { refundId: reservation.refund.id, status: reservation.refund.status },
        reservation.refund.status === "succeeded" ? 200 : 422
      );
      return {
        success: reservation.refund.status === "succeeded",
        refundId: reservation.refund.id,
        status: reservation.refund.status,
        error: reservation.refund.status === "failed" ? "Previous refund attempt failed; use a new approved idempotency key to retry" : null
      };
    }
    const payment = await context.sudo().query.Payment.findOne({
      where: { id: args.paymentId },
      query: "id amount refundedAmount currencyCode paymentMethod providerPaymentId data order { id orderNumber } paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }"
    });
    if (!payment?.order?.id) throw new Error("Payment order is missing");
    const providerReference = payment.data?.captureId || payment.data?.chargeId || payment.providerPaymentId;
    let providerResult = { status: "succeeded", amount: reservation.refund.amount };
    if (!["cash", "gift_card"].includes(payment.paymentMethod || "")) {
      if (!payment.paymentProvider || !providerReference) throw new Error("Provider refund reference is missing");
      providerResult = await refundPayment({
        provider: payment.paymentProvider,
        paymentId: providerReference,
        amount: reservation.refund.amount,
        currency: payment.currencyCode || "USD",
        idempotencyKey: args.idempotencyKey
      });
    }
    const succeeded = ["succeeded", "refunded", "completed", "COMPLETED"].includes(providerResult.status);
    const finalStatus = succeeded ? "succeeded" : providerResult.status === "failed" ? "failed" : "unknown";
    const isLocalTender = ["cash", "gift_card"].includes(payment.paymentMethod || "");
    const providerRefundId = providerResult.id || providerResult.refundId || providerResult.data?.id || providerResult.data?.refundId || (isLocalTender ? `local:${reservation.refund.id}` : null);
    if (succeeded && !providerRefundId) {
      throw new Error("Provider reported a successful refund without a refund reference");
    }
    const final = await prisma.$transaction(async (tx) => {
      const refund = await tx.refund.update({
        where: { id: reservation.refund.id },
        data: {
          status: finalStatus,
          providerRefundId: providerRefundId || "",
          providerData: providerResult.data || providerResult,
          processedAt: succeeded ? /* @__PURE__ */ new Date() : null
        }
      });
      if (succeeded) {
        if (payment.paymentMethod === "gift_card") {
          const giftCardId = payment.data?.giftCardId;
          if (!giftCardId) throw new Error("Gift card reference is missing from the original tender");
          const giftCard = await tx.giftCard.findUnique({ where: { id: giftCardId } });
          if (!giftCard) throw new Error("Gift card not found");
          const balanceAfter = cents4(giftCard.balance) + cents4(refund.amount);
          await tx.giftCard.update({ where: { id: giftCard.id }, data: { balance: balanceAfter } });
          await tx.giftCardTransaction.create({
            data: {
              idempotencyKey: `refund:${args.idempotencyKey}`,
              type: "refund",
              amount: cents4(refund.amount),
              balanceAfter,
              giftCardId: giftCard.id,
              orderId: payment.order.id
            }
          });
        }
        const nextRefunded = cents4(payment.refundedAmount) + cents4(refund.amount);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount: nextRefunded,
            status: nextRefunded >= cents4(payment.amount) ? "refunded" : "partially_refunded"
          }
        });
        await appendAuditEventWithClient(tx, context.session?.itemId, {
          eventKey: `payment-refunded:${refund.id}`,
          eventType: "payment.refunded",
          entityType: "Refund",
          entityId: refund.id,
          reason: args.reason,
          after: { amount: refund.amount, paymentId: payment.id },
          approverId: reservation.refund.approvedById,
          metadata: { idempotencyKey: args.idempotencyKey, managerApprovalId: args.managerApprovalId }
        });
        await issueReceiptWithClient(tx, context.session?.itemId, {
          kind: "refund",
          entityId: refund.id,
          orderId: payment.order.id,
          paymentId: payment.id,
          refundId: refund.id,
          amount: -cents4(refund.amount),
          currencyCode: payment.currencyCode || "USD",
          snapshot: {
            orderNumber: payment.order.orderNumber,
            originalPaymentId: payment.id,
            refundAmount: cents4(refund.amount),
            reason: args.reason,
            providerRefundId: refund.providerRefundId,
            managerApprovalId: args.managerApprovalId
          }
        });
      }
      return refund;
    }, { isolationLevel: "Serializable" });
    await updateIdempotencyAttempt(
      prisma,
      attempt.id,
      succeeded ? "completed" : finalStatus === "failed" ? "failed" : "provider_pending",
      { refundId: final.id, status: final.status, providerRefundId: final.providerRefundId },
      succeeded ? 200 : finalStatus === "failed" ? 422 : 202
    );
    return { success: succeeded, refundId: final.id, status: final.status, error: succeeded ? null : "Refund provider outcome is not final" };
  } catch (error) {
    return { success: false, refundId: null, status: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// features/keystone/mutations/splitCheck.ts
var import_crypto3 = __toESM(require("crypto"));

// features/lib/restaurant-order-pricing.ts
var NO_DIVISION_CURRENCIES2 = [
  "krw",
  "jpy",
  "vnd",
  "clp",
  "pyg",
  "xaf",
  "xof",
  "bif",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "rwf",
  "xpf",
  "htg",
  "vuv",
  "xag",
  "xdr",
  "xau"
];
function toNumber(value, fallback = 0) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function toMinorUnits(value, currencyCode = "USD") {
  const parsed = toNumber(value);
  const shouldDivideBy100 = !NO_DIVISION_CURRENCIES2.includes(currencyCode.toLowerCase());
  return shouldDivideBy100 ? Math.round(parsed * 100) : Math.round(parsed);
}
function isDeliveryOrder(orderType) {
  return orderType === "delivery";
}
function isPickupLikeOrder(orderType) {
  return orderType === "pickup" || orderType === "takeout";
}
function calculateRestaurantTotals({
  subtotal,
  orderType,
  tipPercent,
  deliveryFee,
  deliveryMinimum,
  pickupDiscountPercent,
  taxRate,
  currencyCode = "USD"
}) {
  const normalizedSubtotal = toNumber(subtotal);
  const normalizedTipPercent = toNumber(tipPercent);
  const normalizedTaxRate = toNumber(taxRate);
  const normalizedPickupDiscountPercent = toNumber(pickupDiscountPercent);
  const normalizedDeliveryFee = isDeliveryOrder(orderType) ? toMinorUnits(deliveryFee, currencyCode) : 0;
  const normalizedDeliveryMinimum = isDeliveryOrder(orderType) ? toMinorUnits(deliveryMinimum, currencyCode) : 0;
  const pickupDiscount = isPickupLikeOrder(orderType) ? Math.round(normalizedSubtotal * (normalizedPickupDiscountPercent / 100)) : 0;
  const tax = Math.round(normalizedSubtotal * (normalizedTaxRate / 100));
  const tip = Math.round(normalizedSubtotal * (normalizedTipPercent / 100));
  const total = normalizedSubtotal - pickupDiscount + normalizedDeliveryFee + tax + tip;
  const deliveryMinimumNotMet = isDeliveryOrder(orderType) && normalizedDeliveryMinimum > 0 && normalizedSubtotal < normalizedDeliveryMinimum;
  return {
    subtotal: normalizedSubtotal,
    deliveryFee: normalizedDeliveryFee,
    deliveryMinimum: normalizedDeliveryMinimum,
    deliveryMinimumNotMet,
    deliveryMinimumShortfall: deliveryMinimumNotMet ? normalizedDeliveryMinimum - normalizedSubtotal : 0,
    pickupDiscount,
    tax,
    tip,
    total
  };
}

// features/lib/delivery-zones.ts
function normalizeCountryCode(value) {
  return (value || "").trim().toUpperCase();
}
function normalizePostalCode(value) {
  return (value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
}
function parseDeliveryPostalCodes(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePostalCode(String(entry ?? ""))).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => normalizePostalCode(entry)).filter(Boolean);
  }
  return [];
}
function getUniqueDeliveryPostalCodes(value) {
  return Array.from(new Set(parseDeliveryPostalCodes(value)));
}
function getDeliveryEligibility(params) {
  const deliveryEnabled = Boolean(params.deliveryEnabled);
  const storeCountryCode = normalizeCountryCode(params.storeCountryCode);
  const addressCountryCode = normalizeCountryCode(params.addressCountryCode);
  const addressPostalCode = normalizePostalCode(params.addressPostalCode);
  const allowedPostalCodes = getUniqueDeliveryPostalCodes(params.deliveryPostalCodes);
  if (!deliveryEnabled) {
    return {
      eligible: false,
      reason: "delivery_disabled",
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode
    };
  }
  if (!addressCountryCode || !addressPostalCode) {
    return {
      eligible: false,
      reason: "missing_address",
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode
    };
  }
  if (storeCountryCode && addressCountryCode !== storeCountryCode) {
    return {
      eligible: false,
      reason: "country_mismatch",
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode
    };
  }
  if (allowedPostalCodes.length === 0) {
    return {
      eligible: false,
      reason: "missing_delivery_zones",
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode
    };
  }
  if (!allowedPostalCodes.includes(addressPostalCode)) {
    return {
      eligible: false,
      reason: "postal_code_outside_zone",
      allowedPostalCodes,
      normalizedPostalCode: addressPostalCode
    };
  }
  return {
    eligible: true,
    reason: "eligible",
    allowedPostalCodes,
    normalizedPostalCode: addressPostalCode
  };
}

// features/keystone/utils/deliveryValidation.ts
async function getStoreDeliverySettings(context) {
  return context.sudo().query.StoreSettings.findOne({
    where: { id: "1" },
    query: `
      id
      countryCode
      deliveryEnabled
      deliveryPostalCodes
      deliveryMinimum
      deliveryFee
      pickupDiscount
      taxRate
      currencyCode
    `
  });
}
function getDeliveryErrorMessage(reason) {
  switch (reason) {
    case "delivery_disabled":
      return "Delivery is not available for this restaurant.";
    case "missing_address":
      return "Delivery address is incomplete. Add street address, city, postal code, and country code.";
    case "country_mismatch":
      return "This address is outside the restaurant's delivery country.";
    case "postal_code_outside_zone":
      return "This address is outside the restaurant's delivery zone.";
    case "missing_delivery_zones":
      return "Delivery zones have not been configured for this restaurant.";
    default:
      return "Delivery is not available for this address.";
  }
}
function assertDeliveryModeAllowed(params) {
  if (params.orderType === "delivery" && !params.storeSettings?.deliveryEnabled) {
    throw new Error("Delivery is not available for this restaurant.");
  }
}
function assertDeliveryAddressComplete(params) {
  if (params.orderType !== "delivery") {
    return;
  }
  if (!params.deliveryAddress || !params.deliveryCity || !params.deliveryZip || !params.deliveryCountryCode) {
    throw new Error("Delivery address is incomplete. Add street address, city, postal code, and country code.");
  }
}
function assertDeliveryAddressEligible(params) {
  if (params.orderType !== "delivery") {
    return;
  }
  const eligibility = getDeliveryEligibility({
    deliveryEnabled: params.storeSettings?.deliveryEnabled,
    storeCountryCode: params.storeSettings?.countryCode,
    deliveryPostalCodes: params.storeSettings?.deliveryPostalCodes,
    addressCountryCode: params.deliveryCountryCode,
    addressPostalCode: params.deliveryZip
  });
  if (!eligibility.eligible) {
    throw new Error(getDeliveryErrorMessage(eligibility.reason));
  }
}
function normalizeDeliveryFields(data) {
  const next = { ...data };
  if ("deliveryCountryCode" in next) {
    next.deliveryCountryCode = normalizeCountryCode(next.deliveryCountryCode);
  }
  if ("deliveryZip" in next) {
    next.deliveryZip = normalizePostalCode(next.deliveryZip);
  }
  return next;
}

// features/keystone/utils/orderItemFinancials.ts
function getOrderItemOriginalTotal(item) {
  return Math.max(0, Math.round(Number(item.price || 0))) * Math.max(0, Math.round(Number(item.quantity || 0)));
}
function getOrderItemEffectiveTotal(item) {
  if (item.isVoided) return 0;
  return Math.max(0, getOrderItemOriginalTotal(item) - Math.max(0, Math.round(Number(item.adjustmentTotal || 0))));
}
function getOrderItemsSubtotal(items) {
  return items.reduce((sum, item) => sum + getOrderItemEffectiveTotal(item), 0);
}

// features/keystone/mutations/splitCheck.ts
function splitKey(orderId, itemIds) {
  return import_crypto3.default.createHash("sha256").update(`split:${orderId}:${[...itemIds].sort().join(":")}`).digest("hex");
}
function buildSplitOrderNumber() {
  return `SPL-${Date.now().toString(36).toUpperCase()}-${import_crypto3.default.randomBytes(3).toString("hex").toUpperCase()}`;
}
async function splitCheckByItem(_root, args, context) {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  }
  try {
    const itemIds = Array.from(new Set(args.itemIds || []));
    if (!itemIds.length) throw new Error("Must select at least one item to split");
    const settings = await getStoreDeliverySettings(context);
    const key = splitKey(args.orderId, itemIds);
    const prisma = context.prisma;
    const result2 = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing?.metadata?.newOrderId) {
        return { originalOrderId: args.orderId, newOrderId: existing.metadata.newOrderId, replay: true };
      }
      const order = await tx.restaurantOrder.findUnique({
        where: { id: args.orderId },
        include: { tables: true, orderItems: true }
      });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) throw new Error("Closed checks cannot be split");
      const reservedPayments = await tx.payment.count({
        where: { orderId: order.id, status: { in: ["processing", "authorized", "succeeded", "unknown"] } }
      });
      if (reservedPayments) throw new Error("A check with reserved or successful tenders cannot be split");
      const selected = order.orderItems.filter((item) => itemIds.includes(item.id));
      if (selected.length !== itemIds.length) throw new Error("One or more selected items do not belong to this check");
      if (selected.length === order.orderItems.length) throw new Error("At least one item must remain on the original check");
      const originalSubtotalBefore = getOrderItemsSubtotal(order.orderItems);
      const movedSubtotal = getOrderItemsSubtotal(selected);
      const remainingItems = order.orderItems.filter((item) => !itemIds.includes(item.id));
      const remainingSubtotal = getOrderItemsSubtotal(remainingItems);
      const ratio = originalSubtotalBefore > 0 ? movedSubtotal / originalSubtotalBefore : 0;
      const movedTip = Math.round(Number(order.tip || 0) * ratio);
      const movedDiscount = Math.round(Number(order.discount || 0) * ratio);
      const remainingTip = Number(order.tip || 0) - movedTip;
      const remainingDiscount = Number(order.discount || 0) - movedDiscount;
      const movedPricing = calculateRestaurantTotals({
        subtotal: movedSubtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD"
      });
      const remainingPricing = calculateRestaurantTotals({
        subtotal: remainingSubtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD"
      });
      const movedTotal = Math.max(0, movedSubtotal + movedPricing.tax + movedTip - movedDiscount);
      const remainingTotal = Math.max(0, remainingSubtotal + remainingPricing.tax + remainingTip - remainingDiscount);
      const newOrder = await tx.restaurantOrder.create({
        data: {
          orderNumber: buildSplitOrderNumber(),
          orderType: order.orderType,
          orderSource: order.orderSource,
          status: order.status,
          guestCount: 1,
          specialInstructions: order.specialInstructions || "",
          subtotal: movedSubtotal,
          tax: movedPricing.tax,
          tip: movedTip,
          discount: movedDiscount,
          total: movedTotal,
          currencyCode: order.currencyCode,
          customerId: order.customerId,
          serverId: order.serverId,
          createdById: context.session?.itemId || order.createdById,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          deliveryAddress: order.deliveryAddress,
          deliveryAddress2: order.deliveryAddress2,
          deliveryCity: order.deliveryCity,
          deliveryState: order.deliveryState,
          deliveryZip: order.deliveryZip,
          deliveryCountryCode: order.deliveryCountryCode,
          tables: order.tables.length ? { connect: order.tables.map((table) => ({ id: table.id })) } : void 0
        }
      });
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds }, orderId: order.id },
        data: { orderId: newOrder.id, originalOrderIdSnapshot: order.id }
      });
      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          subtotal: remainingSubtotal,
          tax: remainingPricing.tax,
          tip: remainingTip,
          discount: remainingDiscount,
          total: remainingTotal
        }
      });
      await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type: "split",
          amount: movedTotal,
          reason: "Item split",
          metadata: { newOrderId: newOrder.id, itemIds, originalOrderId: order.id },
          orderId: order.id,
          actorId: context.session?.itemId || null,
          approvedById: context.session?.itemId || null
        }
      });
      return { originalOrderId: order.id, newOrderId: newOrder.id, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result2.replay) {
      await appendAuditEvent(context, {
        eventType: "check.split_by_item",
        entityType: "RestaurantOrder",
        entityId: args.orderId,
        after: { newOrderId: result2.newOrderId, itemIds },
        metadata: { idempotencyKey: key }
      }).catch((error) => console.error("Split audit event failed:", error));
      await Promise.all([
        syncKitchenTicketsForOrder(result2.originalOrderId, context),
        syncKitchenTicketsForOrder(result2.newOrderId, context)
      ]);
    }
    return { success: true, newOrderIds: [result2.newOrderId], error: null };
  } catch (error) {
    return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function splitCheckByGuest(_root, _args, context) {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  }
  return {
    success: false,
    newOrderIds: [],
    error: "Equal guest splits are disabled until financial check-allocation records and tender UI are migrated. Split by item instead."
  };
}

// features/keystone/mutations/voidComp.ts
var import_crypto4 = __toESM(require("crypto"));
function operationKey(type, targetId, reason, amount, supplied) {
  if (supplied?.trim()) return supplied.trim();
  return import_crypto4.default.createHash("sha256").update(`${type}:${targetId}:${reason.trim()}:${amount ?? "full"}`).digest("hex");
}
function authorize(context, approvalId) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Not authorized to request order corrections");
  if (!approvalId) throw new Error("Independent manager approval is required for this correction");
}
async function adjustOrderItem(type, args, context) {
  try {
    authorize(context, args.managerApprovalId);
    if (!args.reason?.trim()) throw new Error("Reason is required");
    const settings = await getStoreDeliverySettings(context);
    const key = operationKey(type, args.orderItemId, args.reason, args.compAmount, args.idempotencyKey);
    const prisma = context.prisma;
    const priorAdjustment = await prisma.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
    if (priorAdjustment && (priorAdjustment.orderItemId !== args.orderItemId || priorAdjustment.type !== type || priorAdjustment.reason !== args.reason.trim())) {
      throw new Error("Idempotency key was already used with a different order-item correction");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `order-adjustment:${key}`,
      requestPath: type === "void" ? "voidOrderItem" : "compOrderItem",
      requestParams: {
        orderItemId: args.orderItemId,
        reason: args.reason.trim(),
        compAmount: args.compAmount ?? null,
        managerApprovalId: args.managerApprovalId
      }
    });
    const result2 = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.orderItemId !== args.orderItemId || existing.type !== type || existing.reason !== args.reason.trim()) {
          throw new Error("Idempotency key was already used with a different order-item correction");
        }
        return { adjustment: existing, orderId: existing.orderId, replay: true };
      }
      const item = await tx.orderItem.findUnique({ where: { id: args.orderItemId } });
      if (!item?.orderId) throw new Error("Order item not found");
      const order = await tx.restaurantOrder.findUnique({ where: { id: item.orderId } });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) {
        throw new Error("Closed checks require a refund/correction receipt instead of an item edit");
      }
      const originalTotal = Math.max(0, Number(item.price || 0) * Number(item.quantity || 0));
      const alreadyAdjusted = Math.max(0, Number(item.adjustmentTotal || 0));
      const available = Math.max(0, originalTotal - alreadyAdjusted);
      const amount = type === "void" ? available : args.compAmount == null ? available : Math.max(0, Math.min(Math.round(args.compAmount), available));
      if (amount <= 0) throw new Error("No remaining item value can be adjusted");
      const adjustment = await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type,
          amount,
          reason: args.reason.trim(),
          metadata: { originalTotal, previousAdjustmentTotal: alreadyAdjusted, managerApprovalId: args.managerApprovalId },
          orderId: order.id,
          orderItemId: item.id,
          actorId: context.session?.itemId || null,
          approvedById: null
        }
      });
      const approval = await consumeManagerApproval(tx, {
        approvalId: args.managerApprovalId,
        actorId: context.session?.itemId,
        actionType: type === "void" ? "void_item" : "comp_item",
        targetId: args.orderItemId,
        reason: args.reason,
        amount: args.compAmount ?? null,
        entityType: "OrderAdjustment",
        entityId: adjustment.id
      });
      await tx.orderItem.update({
        where: { id: item.id },
        data: type === "void" ? {
          isVoided: true,
          voidedAt: /* @__PURE__ */ new Date(),
          voidReason: args.reason.trim(),
          voidedById: context.session?.itemId || null,
          approvedById: approval.approvedById
        } : {
          adjustmentTotal: alreadyAdjusted + amount,
          approvedById: approval.approvedById
        }
      });
      const approvedAdjustment = await tx.orderAdjustment.update({
        where: { id: adjustment.id },
        data: { approvedById: approval.approvedById }
      });
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const subtotal = getOrderItemsSubtotal(items);
      const { tax } = calculateRestaurantTotals({
        subtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD"
      });
      const total = Math.max(0, subtotal + tax + Number(order.tip || 0) - Number(order.discount || 0));
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { subtotal, tax, total } });
      await appendAuditEventWithClient(tx, context.session?.itemId, {
        eventKey: `order-adjustment:${adjustment.id}`,
        eventType: `order_item.${type}`,
        entityType: "OrderItem",
        entityId: args.orderItemId,
        reason: args.reason,
        after: { adjustedAmount: amount },
        approverId: approval.approvedById,
        metadata: { adjustmentId: adjustment.id, idempotencyKey: key, managerApprovalId: args.managerApprovalId }
      });
      return { adjustment: approvedAdjustment, orderId: order.id, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result2.replay) await syncKitchenTicketsForOrder(result2.orderId, context);
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      adjustmentId: result2.adjustment.id,
      orderId: result2.orderId,
      adjustedAmount: result2.adjustment.amount
    }, 200);
    return { success: true, requiresManagerApproval: false, adjustedAmount: result2.adjustment.amount, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      requiresManagerApproval: message.toLowerCase().includes("manager approval"),
      adjustedAmount: null,
      error: message
    };
  }
}
function voidOrderItem(_root, args, context) {
  return adjustOrderItem("void", args, context);
}
function compOrderItem(_root, args, context) {
  return adjustOrderItem("comp", args, context);
}
async function voidOrder(_root, args, context) {
  try {
    authorize(context, args.managerApprovalId);
    if (!args.reason?.trim()) throw new Error("Reason is required");
    const key = operationKey("void-order", args.orderId, args.reason, null, args.idempotencyKey);
    const prisma = context.prisma;
    const priorAdjustment = await prisma.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
    if (priorAdjustment && (priorAdjustment.orderId !== args.orderId || priorAdjustment.orderItemId || priorAdjustment.reason !== args.reason.trim() || !priorAdjustment.metadata?.wholeOrder)) {
      throw new Error("Idempotency key was already used with a different order correction");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `order-adjustment:${key}`,
      requestPath: "voidOrder",
      requestParams: { orderId: args.orderId, reason: args.reason.trim(), managerApprovalId: args.managerApprovalId }
    });
    const result2 = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.orderId !== args.orderId || existing.orderItemId || existing.reason !== args.reason.trim() || !existing.metadata?.wholeOrder) {
          throw new Error("Idempotency key was already used with a different order correction");
        }
        return { adjustment: existing, replay: true };
      }
      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
      if (!order) throw new Error("Order not found");
      const successfulPayments = await tx.payment.count({ where: { orderId: order.id, status: "succeeded" } });
      if (successfulPayments > 0) throw new Error("Paid orders must be refunded before cancellation");
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const amount = getOrderItemsSubtotal(items);
      const adjustment = await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type: "void",
          amount,
          reason: args.reason.trim(),
          metadata: {
            wholeOrder: true,
            originalSubtotal: order.subtotal,
            originalTax: order.tax,
            originalTotal: order.total,
            managerApprovalId: args.managerApprovalId
          },
          orderId: order.id,
          actorId: context.session?.itemId || null,
          approvedById: null
        }
      });
      const approval = await consumeManagerApproval(tx, {
        approvalId: args.managerApprovalId,
        actorId: context.session?.itemId,
        actionType: "void_order",
        targetId: args.orderId,
        reason: args.reason,
        amount: null,
        entityType: "OrderAdjustment",
        entityId: adjustment.id
      });
      for (const item of items.filter((candidate) => !candidate.isVoided)) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            isVoided: true,
            voidedAt: /* @__PURE__ */ new Date(),
            voidReason: args.reason.trim(),
            voidedById: context.session?.itemId || null,
            approvedById: approval.approvedById
          }
        });
      }
      const approvedAdjustment = await tx.orderAdjustment.update({
        where: { id: adjustment.id },
        data: { approvedById: approval.approvedById }
      });
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "cancelled" } });
      await appendAuditEventWithClient(tx, context.session?.itemId, {
        eventKey: `order-adjustment:${adjustment.id}`,
        eventType: "order.voided",
        entityType: "RestaurantOrder",
        entityId: args.orderId,
        reason: args.reason,
        after: { status: "cancelled", adjustedAmount: amount },
        approverId: approval.approvedById,
        metadata: { adjustmentId: adjustment.id, idempotencyKey: key, managerApprovalId: args.managerApprovalId }
      });
      return { adjustment: approvedAdjustment, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result2.replay) await syncKitchenTicketsForOrder(args.orderId, context);
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      adjustmentId: result2.adjustment.id,
      orderId: args.orderId,
      adjustedAmount: result2.adjustment.amount
    }, 200);
    return { success: true, requiresManagerApproval: false, adjustedAmount: result2.adjustment.amount, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, requiresManagerApproval: message.toLowerCase().includes("manager approval"), adjustedAmount: null, error: message };
  }
}

// features/keystone/mutations/initiatePaymentSession.ts
var import_crypto5 = __toESM(require("crypto"));

// features/keystone/utils/cartAccess.ts
var cookie = __toESM(require("cookie"));
function getRequestCartId(context) {
  const cookieHeader = context.req?.headers?.cookie;
  if (!cookieHeader) return void 0;
  return cookie.parse(cookieHeader)._restaurant_cart_id;
}
function canBypassCartAccess(context, mode) {
  if (permissions.canManageOrders({ session: context.session })) return true;
  if (mode === "read" && permissions.canReadOrders({ session: context.session })) return true;
  return false;
}
function assertOwnership({
  context,
  cartId,
  cartUserId,
  mode
}) {
  if (canBypassCartAccess(context, mode)) return;
  const requestCartId = getRequestCartId(context);
  const sessionItemId = context.session?.itemId;
  const ownsByUser = Boolean(sessionItemId && cartUserId && cartUserId === sessionItemId);
  const ownsByCookie = requestCartId === cartId;
  if (!ownsByUser && !ownsByCookie) {
    throw new Error("Access denied");
  }
}
async function assertCanAccessCart(context, cartId, mode = "write") {
  const cart = await context.sudo().query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      user {
        id
      }
    `
  });
  if (!cart) {
    throw new Error("Cart not found");
  }
  assertOwnership({
    context,
    cartId: cart.id,
    cartUserId: cart.user?.id,
    mode
  });
  return cart;
}
async function assertCanAccessCartItem(context, cartItemId, mode = "write") {
  const cartItem = await context.sudo().query.CartItem.findOne({
    where: { id: cartItemId },
    query: `
      id
      cart {
        id
        user {
          id
        }
      }
    `
  });
  if (!cartItem?.cart?.id) {
    throw new Error("Cart not found for this item");
  }
  assertOwnership({
    context,
    cartId: cartItem.cart.id,
    cartUserId: cartItem.cart.user?.id,
    mode
  });
  return cartItem;
}

// features/keystone/utils/cartItemValidation.ts
function normalizeCartQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error("Quantity must be a whole number between 1 and 99");
  }
  return quantity;
}
function normalizeSpecialInstructions(value) {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error("Special instructions must be text");
  const normalized = value.trim();
  if (normalized.length > 500) throw new Error("Special instructions cannot exceed 500 characters");
  return normalized;
}
function validateModifierSelections(availableModifiers, requestedModifierIds = []) {
  const uniqueIds = Array.from(new Set(requestedModifierIds.filter(Boolean)));
  if (uniqueIds.length !== requestedModifierIds.length) {
    throw new Error("A modifier cannot be selected more than once");
  }
  const byId = new Map(availableModifiers.map((modifier) => [modifier.id, modifier]));
  const selected = uniqueIds.map((id) => {
    const modifier = byId.get(id);
    if (!modifier) throw new Error("One or more selected modifiers do not belong to this menu item");
    return modifier;
  });
  const groups = /* @__PURE__ */ new Map();
  for (const modifier of availableModifiers) {
    const key = modifier.modifierGroup || "addons";
    groups.set(key, [...groups.get(key) || [], modifier]);
  }
  for (const [group, groupModifiers] of groups) {
    const selectedCount = selected.filter((modifier) => modifier.modifierGroup === group).length;
    const required = groupModifiers.some((modifier) => Boolean(modifier.required));
    const configuredMinimum = Math.max(0, ...groupModifiers.map((modifier) => Number(modifier.minSelections || 0)));
    const minimum = Math.max(required ? 1 : 0, configuredMinimum);
    const configuredMaximum = groupModifiers.map((modifier) => Number(modifier.maxSelections || 0)).filter((maximum2) => maximum2 > 0);
    const maximum = configuredMaximum.length > 0 ? Math.min(...configuredMaximum) : groupModifiers.length;
    if (selectedCount < minimum) {
      throw new Error(`Select at least ${minimum} option${minimum === 1 ? "" : "s"} from ${group}`);
    }
    if (selectedCount > maximum) {
      throw new Error(`Select no more than ${maximum} option${maximum === 1 ? "" : "s"} from ${group}`);
    }
  }
  return selected;
}
async function validateCartItemInput(context, input) {
  if (!input.menuItemId) throw new Error("Menu item is required");
  const menuItem = await context.sudo().query.MenuItem.findOne({
    where: { id: input.menuItemId },
    query: `
      id
      name
      price
      available
      thumbnail
      kitchenStation
      modifiers {
        id
        name
        modifierGroup
        modifierGroupLabel
        required
        minSelections
        maxSelections
        priceAdjustment
      }
    `
  });
  if (!menuItem) throw new Error("Menu item not found");
  if (!menuItem.available) throw new Error(`${menuItem.name || "Selected item"} is unavailable`);
  const quantity = normalizeCartQuantity(input.quantity);
  const specialInstructions = normalizeSpecialInstructions(input.specialInstructions);
  const modifiers = validateModifierSelections(
    (menuItem.modifiers || []).map((modifier) => ({
      ...modifier,
      priceAdjustment: Math.round(Number(modifier.priceAdjustment || 0))
    })),
    input.modifierIds || []
  );
  const basePrice = Math.round(Number(menuItem.price || 0));
  const modifierTotal = modifiers.reduce((sum, modifier) => sum + modifier.priceAdjustment, 0);
  const unitPrice = basePrice + modifierTotal;
  if (unitPrice < 0) throw new Error("Selected modifiers cannot make the item price negative");
  return {
    menuItem: {
      id: menuItem.id,
      name: menuItem.name || "Item",
      price: basePrice,
      thumbnail: menuItem.thumbnail || null,
      kitchenStation: menuItem.kitchenStation || null
    },
    modifiers,
    quantity,
    specialInstructions,
    unitPrice
  };
}

// features/keystone/mutations/initiatePaymentSession.ts
function sessionKey(input) {
  return import_crypto5.default.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
var SESSION_QUERY = `
  id
  data
  amount
  isInitiated
  isSelected
  paymentProvider { id code }
`;
async function initiatePaymentSession(_root, { cartId, paymentProviderId }, context) {
  await assertCanAccessCart(context, cartId, "write");
  const sudo = context.sudo();
  const cart = await sudo.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id updatedAt orderType deliveryAddress deliveryCity deliveryCountryCode deliveryZip tipPercent
      order { id }
      paymentCollection {
        id amount
        paymentSessions { id idempotencyKey isSelected isInitiated amount data paymentProvider { id code } }
      }
      items {
        id quantity specialInstructions
        menuItem { id }
        modifiers { id }
      }
    `
  });
  if (!cart) throw new Error("Cart not found");
  if (cart.order?.id) throw new Error("Completed carts cannot start another payment");
  if (!cart.items?.length) throw new Error("Cart is empty");
  const provider = await sudo.query.PaymentProvider.findOne({
    where: { code: paymentProviderId },
    query: `
      id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction
      getPaymentStatusFunction generatePaymentLinkFunction credentials
    `
  });
  if (!provider?.isInstalled || !isPaymentProviderConfigured(provider.code)) {
    throw new Error(`Payment provider ${paymentProviderId} is not installed and configured`);
  }
  const validatedItems = await Promise.all(
    cart.items.map((item) => validateCartItemInput(context, {
      menuItemId: item.menuItem?.id,
      quantity: item.quantity,
      modifierIds: (item.modifiers || []).map((modifier) => modifier.id),
      specialInstructions: item.specialInstructions
    }))
  );
  const subtotal = validatedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const settings = await getStoreDeliverySettings(context);
  const currency = settings?.currencyCode || "USD";
  assertDeliveryAddressComplete({
    orderType: cart.orderType,
    deliveryAddress: cart.deliveryAddress,
    deliveryCity: cart.deliveryCity,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip
  });
  assertDeliveryAddressEligible({
    orderType: cart.orderType,
    storeSettings: settings,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip
  });
  const pricing = calculateRestaurantTotals({
    subtotal,
    orderType: cart.orderType,
    tipPercent: cart.tipPercent,
    deliveryFee: settings?.deliveryFee,
    deliveryMinimum: settings?.deliveryMinimum,
    pickupDiscountPercent: settings?.pickupDiscount,
    taxRate: settings?.taxRate,
    currencyCode: currency
  });
  if (pricing.deliveryMinimumNotMet) {
    throw new Error(`Delivery orders require a minimum subtotal of ${settings?.deliveryMinimum || "0.00"}.`);
  }
  const amount = pricing.total;
  const idempotencyKey = sessionKey({
    cartId,
    cartUpdatedAt: cart.updatedAt,
    provider: provider.code,
    amount,
    items: validatedItems.map((item) => ({
      menuItemId: item.menuItem.id,
      quantity: item.quantity,
      modifierIds: item.modifiers.map((modifier) => modifier.id).sort(),
      specialInstructions: item.specialInstructions
    }))
  });
  let collection = cart.paymentCollection;
  if (!collection) {
    collection = await sudo.query.PaymentCollection.createOne({
      data: { cart: { connect: { id: cart.id } }, amount, description: "default" },
      query: "id amount paymentSessions { id idempotencyKey isSelected isInitiated amount data paymentProvider { id code } }"
    });
  } else if (Number(collection.amount || 0) !== amount) {
    await sudo.query.PaymentCollection.updateOne({ where: { id: collection.id }, data: { amount } });
  }
  let paymentSession = collection.paymentSessions?.find(
    (candidate) => candidate.idempotencyKey === idempotencyKey
  );
  if (!paymentSession) {
    try {
      paymentSession = await sudo.query.PaymentSession.createOne({
        data: {
          paymentCollection: { connect: { id: collection.id } },
          paymentProvider: { connect: { id: provider.id } },
          amount,
          idempotencyKey,
          isSelected: true,
          isInitiated: false,
          data: { providerCode: provider.code, state: "initializing" }
        },
        query: SESSION_QUERY
      });
    } catch (error) {
      const matches = await sudo.query.PaymentSession.findMany({
        where: { idempotencyKey: { equals: idempotencyKey } },
        query: SESSION_QUERY,
        take: 1
      });
      paymentSession = matches[0];
      if (!paymentSession) throw error;
    }
  }
  for (const candidate of collection.paymentSessions || []) {
    if (candidate.id !== paymentSession.id && candidate.isSelected) {
      await sudo.query.PaymentSession.updateOne({ where: { id: candidate.id }, data: { isSelected: false } });
    }
  }
  if (paymentSession.isInitiated) {
    if (!paymentSession.isSelected) {
      await sudo.query.PaymentSession.updateOne({ where: { id: paymentSession.id }, data: { isSelected: true } });
    }
    return sudo.query.PaymentSession.findOne({ where: { id: paymentSession.id }, query: SESSION_QUERY });
  }
  const isManual = provider.code === "pp_system_default" || provider.code.startsWith("pp_manual");
  try {
    const providerData = isManual ? { providerCode: provider.code, status: "pending" } : await createPayment({
      provider,
      cart: { ...cart, subtotal },
      amount,
      currency: currency.toLowerCase(),
      idempotencyKey
    });
    return sudo.query.PaymentSession.updateOne({
      where: { id: paymentSession.id },
      data: {
        isSelected: true,
        isInitiated: true,
        data: { ...providerData, providerCode: provider.code, state: "ready" }
      },
      query: SESSION_QUERY
    });
  } catch (error) {
    await sudo.query.PaymentSession.updateOne({
      where: { id: paymentSession.id },
      data: {
        data: {
          providerCode: provider.code,
          state: "failed",
          error: error instanceof Error ? error.message : "Provider initiation failed"
        }
      }
    });
    throw error;
  }
}

// features/keystone/mutations/completeActiveCart.ts
async function completeActiveCart(root, { cartId, paymentSessionId }, context) {
  const sudoContext = context.sudo();
  await assertCanAccessCart(context, cartId, "write");
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      orderType
      subtotal
      email
      customerName
      customerPhone
      deliveryAddress
      deliveryAddress2
      deliveryCity
      deliveryState
      deliveryZip
      deliveryCountryCode
      tipPercent
      user { id }
      order { id orderNumber secretKey status }
      paymentCollection {
        id
        amount
        paymentSessions {
          id
          idempotencyKey
          isSelected
          isInitiated
          amount
          data
          paymentProvider {
            id
            code
            capturePaymentFunction
            getPaymentStatusFunction
          }
        }
      }
      items {
        id
        thumbnail
        quantity
        specialInstructions
        menuItem {
          id
          name
          price
          thumbnail
        }
        modifiers {
          id
          name
          priceAdjustment
        }
      }
    `
  });
  if (!cart) throw new Error("Cart not found");
  if (cart.order?.id) return cart.order;
  if (!cart.items?.length) throw new Error("Cart is empty");
  const validatedItems = await Promise.all(
    cart.items.map(
      (item) => validateCartItemInput(context, {
        menuItemId: item.menuItem?.id,
        quantity: item.quantity,
        modifierIds: (item.modifiers || []).map((modifier) => modifier.id),
        specialInstructions: item.specialInstructions
      })
    )
  );
  const selectedSession = paymentSessionId ? cart.paymentCollection?.paymentSessions?.find(
    (session) => session.id === paymentSessionId
  ) : cart.paymentCollection?.paymentSessions?.find((session) => session.isSelected);
  if (!selectedSession) {
    throw new Error("No selected payment session found for this cart.");
  }
  const sessionData = selectedSession.data || {};
  let paymentData = { ...sessionData };
  const providerCode = selectedSession.paymentProvider?.code || sessionData?.providerCode;
  const providerPaymentId = sessionData?.paymentIntentId || sessionData?.orderId;
  const paymentProvider = selectedSession.paymentProvider;
  if (!paymentProvider) {
    throw new Error("Selected payment session is missing payment provider information.");
  }
  const isManual = providerCode === "pp_system_default" || providerCode?.startsWith("pp_manual");
  let paymentResult = {
    status: "manual_pending",
    paymentIntentId: null
  };
  if (!isManual) {
    if (!providerPaymentId) {
      throw new Error("Selected payment session is missing provider payment data.");
    }
    const status = await getPaymentStatus({
      provider: paymentProvider,
      paymentId: providerPaymentId
    });
    if (status.status === "succeeded") {
      paymentResult = { status: "succeeded", paymentIntentId: providerPaymentId };
    } else if (status.status === "requires_capture") {
      const captured = await capturePayment({
        provider: paymentProvider,
        paymentId: providerPaymentId
      });
      const captureId = captured.data?.purchase_units?.[0]?.payments?.captures?.[0]?.id || captured.data?.id || null;
      paymentData = {
        ...paymentData,
        capture: captured.data || captured,
        captureId
      };
      paymentResult = {
        status: captured.status === "succeeded" ? "succeeded" : "failed",
        paymentIntentId: providerPaymentId
      };
    } else {
      throw new Error(`Payment not successful. Status: ${status.status}`);
    }
    if (paymentResult.status === "failed") {
      throw new Error("Payment capture failed");
    }
  }
  const settings = await getStoreDeliverySettings(context);
  const currencyCode = settings?.currencyCode || "USD";
  const subtotal = validatedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  assertDeliveryAddressComplete({
    orderType: cart.orderType,
    deliveryAddress: cart.deliveryAddress,
    deliveryCity: cart.deliveryCity,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip
  });
  assertDeliveryAddressEligible({
    orderType: cart.orderType,
    storeSettings: settings,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip
  });
  const { tax, tip, pickupDiscount, deliveryFee, total, deliveryMinimumNotMet } = calculateRestaurantTotals({
    subtotal,
    orderType: cart.orderType,
    tipPercent: cart.tipPercent,
    deliveryFee: settings?.deliveryFee,
    deliveryMinimum: settings?.deliveryMinimum,
    pickupDiscountPercent: settings?.pickupDiscount,
    taxRate: settings?.taxRate,
    currencyCode
  });
  if (deliveryMinimumNotMet) {
    throw new Error(`Delivery orders require a minimum subtotal of ${settings?.deliveryMinimum || "0.00"}.`);
  }
  const orderTypeMap = {
    pickup: "takeout",
    delivery: "delivery"
  };
  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${require("crypto").randomBytes(3).toString("hex").toUpperCase()}`;
  const customerId = cart.user?.id;
  const secretKey = !customerId ? require("crypto").randomBytes(32).toString("hex") : "";
  const isDeliveryOrder2 = cart.orderType === "delivery";
  if (Number(selectedSession.amount || 0) !== total && !isManual) {
    throw new Error("Cart total changed. Please return to payment and confirm your payment method again.");
  }
  const paymentMethodMap = {
    pp_stripe_stripe: "credit_card",
    pp_paypal_paypal: "paypal",
    pp_system_default: "cash"
  };
  const paymentIdempotencyKey = `checkout:${selectedSession.idempotencyKey || selectedSession.id}`;
  const prisma = context.prisma;
  const result2 = await prisma.$transaction(async (tx) => {
    const lockedCart = await tx.cart.findUnique({ where: { id: cartId } });
    if (!lockedCart) throw new Error("Cart not found");
    if (lockedCart.orderId) {
      const existingOrder = await tx.restaurantOrder.findUnique({ where: { id: lockedCart.orderId } });
      return { order: existingOrder, payment: null, replay: true };
    }
    const order = await tx.restaurantOrder.create({
      data: {
        orderNumber,
        orderType: orderTypeMap[cart.orderType || "pickup"] || "takeout",
        orderSource: "online",
        status: isManual ? "open" : "sent_to_kitchen",
        guestCount: 1,
        subtotal,
        tax,
        tip,
        discount: pickupDiscount,
        total,
        currencyCode,
        customerId: customerId || null,
        customerName: cart.customerName || "",
        customerEmail: cart.email || "",
        customerPhone: cart.customerPhone || "",
        deliveryAddress: isDeliveryOrder2 ? cart.deliveryAddress || "" : "",
        deliveryAddress2: isDeliveryOrder2 ? cart.deliveryAddress2 || "" : "",
        deliveryCity: isDeliveryOrder2 ? cart.deliveryCity || "" : "",
        deliveryState: isDeliveryOrder2 ? cart.deliveryState || "" : "",
        deliveryZip: isDeliveryOrder2 ? cart.deliveryZip || "" : "",
        deliveryCountryCode: isDeliveryOrder2 ? cart.deliveryCountryCode || "" : "",
        secretKey,
        orderItems: {
          create: validatedItems.map((item) => ({
            quantity: item.quantity,
            price: item.unitPrice,
            itemNameSnapshot: item.menuItem.name,
            itemThumbnailSnapshot: item.menuItem.thumbnail || "",
            kitchenStationSnapshot: item.menuItem.kitchenStation || "expo",
            menuItemIdSnapshot: item.menuItem.id,
            modifiersSnapshot: item.modifiers.map((modifier) => ({
              id: modifier.id,
              name: modifier.name,
              modifierGroup: modifier.modifierGroup,
              modifierGroupLabel: modifier.modifierGroupLabel || null,
              priceAdjustment: modifier.priceAdjustment
            })),
            specialInstructions: item.specialInstructions,
            menuItemId: item.menuItem.id,
            appliedModifiers: item.modifiers.length ? { connect: item.modifiers.map((modifier) => ({ id: modifier.id })) } : void 0
          }))
        }
      }
    });
    const payment = await tx.payment.create({
      data: {
        idempotencyKey: paymentIdempotencyKey,
        reservedAt: /* @__PURE__ */ new Date(),
        amount: total,
        status: paymentResult.status === "succeeded" ? "succeeded" : "pending",
        paymentMethod: paymentMethodMap[providerCode || "pp_system_default"] || "cash",
        currencyCode,
        tipAmount: tip,
        providerPaymentId: paymentResult.paymentIntentId || "",
        data: paymentData || {},
        processedAt: paymentResult.status === "succeeded" ? /* @__PURE__ */ new Date() : null,
        orderId: order.id,
        paymentProviderId: paymentProvider.id,
        paymentCollectionId: cart.paymentCollection?.id || null
      }
    });
    if (cart.paymentCollection?.id) {
      await tx.paymentCollection.update({ where: { id: cart.paymentCollection.id }, data: { amount: total } });
    }
    if (isManual && Number(selectedSession.amount || 0) !== total) {
      await tx.paymentSession.update({ where: { id: selectedSession.id }, data: { amount: total } });
    }
    await tx.cart.update({ where: { id: cartId }, data: { orderId: order.id } });
    await appendAuditEventWithClient(tx, context.session?.itemId, {
      eventKey: `checkout-completed:${order.id}`,
      eventType: "checkout.completed",
      entityType: "RestaurantOrder",
      entityId: order.id,
      after: { total, paymentStatus: payment.status },
      metadata: { paymentSessionId: selectedSession.id, paymentIdempotencyKey }
    });
    if (payment.status === "succeeded") {
      await issueReceiptWithClient(tx, context.session?.itemId, {
        kind: "sale",
        entityId: payment.id,
        orderId: order.id,
        paymentId: payment.id,
        amount: total,
        currencyCode,
        snapshot: {
          orderNumber: order.orderNumber,
          items: validatedItems,
          subtotal,
          tax,
          tip,
          discount: pickupDiscount,
          deliveryFee,
          total
        }
      });
    }
    return { order, payment, replay: false };
  }, { isolationLevel: "Serializable" });
  if (!result2.replay && isKitchenActiveOrderStatus(result2.order.status)) {
    await syncKitchenTicketsForOrder(result2.order.id, context);
  }
  return {
    id: result2.order.id,
    orderNumber: result2.order.orderNumber,
    secretKey: result2.order.secretKey,
    status: result2.order.status
  };
}

// features/keystone/mutations/activeCart.ts
async function activeCart(root, { cartId }, context) {
  const sudoContext = context.sudo();
  if (!cartId) {
    throw new Error("Cart ID is required");
  }
  try {
    await assertCanAccessCart(context, cartId, "read");
  } catch (error) {
    if (error instanceof Error && (error.message === "Cart not found" || error.message === "Access denied")) {
      return null;
    }
    throw error;
  }
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      orderType
      subtotal
      email
      customerName
      customerPhone
      deliveryAddress
      deliveryAddress2
      deliveryCity
      deliveryState
      deliveryZip
      deliveryCountryCode
      tipPercent
      items {
        id
        thumbnail
        quantity
        specialInstructions
        menuItem {
          id
          name
          price
          thumbnail
        }
        modifiers {
          id
          name
          priceAdjustment
        }
      }
      paymentCollection {
        id
        paymentSessions {
          id
          isSelected
          isInitiated
          amount
          data
          paymentProvider {
            id
            code
          }
        }
      }
      order {
        id
      }
    `
  });
  if (!cart) {
    return null;
  }
  const settings = await sudoContext.query.StoreSettings.findOne({
    where: { id: "1" },
    query: `currencyCode deliveryFee deliveryMinimum pickupDiscount taxRate`
  });
  const currencyCode = settings?.currencyCode || "USD";
  const totals = calculateRestaurantTotals({
    subtotal: cart.subtotal || 0,
    orderType: cart.orderType,
    tipPercent: cart.tipPercent,
    deliveryFee: settings?.deliveryFee,
    deliveryMinimum: settings?.deliveryMinimum,
    pickupDiscountPercent: settings?.pickupDiscount,
    taxRate: settings?.taxRate,
    currencyCode
  });
  return {
    ...cart,
    ...totals,
    currencyCode
  };
}

// features/keystone/mutations/createActiveCart.ts
var ALLOWED_ORDER_TYPES = /* @__PURE__ */ new Set(["pickup", "delivery"]);
async function createActiveCart(_root, { orderType = "pickup" }, context) {
  const normalizedOrderType = ALLOWED_ORDER_TYPES.has(orderType || "") ? orderType : "pickup";
  const userId = context.session?.itemId;
  return context.sudo().query.Cart.createOne({
    data: {
      orderType: normalizedOrderType,
      tipPercent: "0",
      user: userId ? { connect: { id: userId } } : void 0
    },
    query: "id orderType tipPercent"
  });
}

// features/keystone/mutations/addActiveCartItem.ts
async function addActiveCartItem(_root, {
  cartId,
  input
}, context) {
  await assertCanAccessCart(context, cartId, "write");
  const sudo = context.sudo();
  const cart = await sudo.query.Cart.findOne({
    where: { id: cartId },
    query: "id order { id }"
  });
  if (cart?.order?.id) throw new Error("Completed carts cannot be changed");
  const validated = await validateCartItemInput(context, input);
  await sudo.query.CartItem.createOne({
    data: {
      cart: { connect: { id: cartId } },
      menuItem: { connect: { id: validated.menuItem.id } },
      quantity: validated.quantity,
      modifiers: validated.modifiers.length ? { connect: validated.modifiers.map((modifier) => ({ id: modifier.id })) } : void 0,
      specialInstructions: validated.specialInstructions
    },
    query: "id"
  });
  return sudo.db.Cart.findOne({ where: { id: cartId } });
}

// features/keystone/mutations/updateActiveCart.ts
var ALLOWED_TIP_PERCENTS = /* @__PURE__ */ new Set(["0", "15", "18", "20", "25"]);
var ALLOWED_ORDER_TYPES2 = /* @__PURE__ */ new Set(["pickup", "delivery"]);
function boundedText(value, field, maximum) {
  if (value == null) return void 0;
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${field} cannot exceed ${maximum} characters`);
  return normalized;
}
async function updateActiveCart(_root, { cartId, data }, context) {
  await assertCanAccessCart(context, cartId, "write");
  const sudo = context.sudo();
  const cart = await sudo.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      orderType
      deliveryAddress
      deliveryAddress2
      deliveryCity
      deliveryState
      deliveryCountryCode
      deliveryZip
      user { id }
      order { id }
    `
  });
  if (!cart) throw new Error("Cart not found");
  if (cart.order?.id) throw new Error("Completed carts cannot be changed");
  const deliveryInput = Object.fromEntries(
    Object.entries({
      deliveryAddress: data.deliveryAddress,
      deliveryAddress2: data.deliveryAddress2,
      deliveryCity: data.deliveryCity,
      deliveryState: data.deliveryState,
      deliveryZip: data.deliveryZip,
      deliveryCountryCode: data.deliveryCountryCode
    }).filter(([, value]) => value !== void 0)
  );
  const normalizedDelivery = normalizeDeliveryFields(deliveryInput);
  const nextOrderType = data.orderType ?? cart.orderType ?? "pickup";
  if (!ALLOWED_ORDER_TYPES2.has(nextOrderType)) throw new Error("Invalid order type");
  if (data.tipPercent != null && !ALLOWED_TIP_PERCENTS.has(data.tipPercent)) {
    throw new Error("Invalid tip percentage");
  }
  const storeSettings = await getStoreDeliverySettings(context);
  assertDeliveryModeAllowed({ orderType: nextOrderType, storeSettings });
  const isUpdatingDeliveryAddress = Object.values(normalizedDelivery).some(
    (value) => value !== void 0
  );
  if (isUpdatingDeliveryAddress) {
    const delivery = {
      orderType: nextOrderType,
      deliveryAddress: normalizedDelivery.deliveryAddress ?? cart.deliveryAddress,
      deliveryCity: normalizedDelivery.deliveryCity ?? cart.deliveryCity,
      deliveryCountryCode: normalizedDelivery.deliveryCountryCode ?? cart.deliveryCountryCode,
      deliveryZip: normalizedDelivery.deliveryZip ?? cart.deliveryZip
    };
    assertDeliveryAddressComplete(delivery);
    assertDeliveryAddressEligible({
      ...delivery,
      storeSettings
    });
  }
  let userId;
  if (data.userId) {
    const canAssignAnotherUser = permissions.canManageOrders({ session: context.session });
    if (!canAssignAnotherUser && data.userId !== context.session?.itemId) {
      throw new Error("Cart owner must match the authenticated customer");
    }
    const user = await sudo.query.User.findOne({ where: { id: data.userId }, query: "id" });
    if (!user) throw new Error("Customer not found");
    userId = user.id;
  }
  const updateData = {
    orderType: nextOrderType,
    email: boundedText(data.email, "Email", 320),
    customerName: boundedText(data.customerName, "Customer name", 160),
    customerPhone: boundedText(data.customerPhone, "Phone", 64),
    ...normalizedDelivery,
    tipPercent: data.tipPercent ?? void 0,
    user: userId ? { connect: { id: userId } } : void 0
  };
  return sudo.db.Cart.updateOne({
    where: { id: cartId },
    data: updateData
  });
}

// features/keystone/mutations/updateCartItemQuantity.ts
async function updateCartItemQuantity(root, { cartItemId, quantity }, context) {
  const sudoContext = context.sudo();
  const cartItem = await assertCanAccessCartItem(context, cartItemId, "write");
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartItem.cart.id },
    query: "id order { id }"
  });
  if (cart?.order?.id) throw new Error("Completed carts cannot be changed");
  await sudoContext.db.CartItem.updateOne({
    where: { id: cartItemId },
    data: { quantity: normalizeCartQuantity(quantity) }
  });
  return await sudoContext.db.Cart.findOne({
    where: { id: cartItem.cart.id }
  });
}

// features/keystone/mutations/removeCartItem.ts
async function removeCartItem(root, { cartItemId }, context) {
  const sudoContext = context.sudo();
  const cartItem = await assertCanAccessCartItem(context, cartItemId, "write");
  const cartId = cartItem.cart.id;
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: "id order { id }"
  });
  if (cart?.order?.id) throw new Error("Completed carts cannot be changed");
  await sudoContext.db.CartItem.deleteOne({
    where: { id: cartItemId }
  });
  return await sudoContext.db.Cart.findOne({
    where: { id: cartId }
  });
}

// features/keystone/mutations/getCustomerOrder.ts
async function getCustomerOrder(root, { orderId, secretKey }, context) {
  const sudoContext = context.sudo();
  const sessionUserId = context.session?.itemId;
  const order = await sudoContext.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: `
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
      secretKey
      createdAt
      updatedAt
      customer {
        id
      }
      orderItems {
        id
        thumbnail
        itemNameSnapshot
        itemThumbnailSnapshot
        modifiersSnapshot
        quantity
        unitPrice
        totalPrice
        specialInstructions
        menuItem {
          id
          name
          price
          thumbnail
        }
        modifiers: appliedModifiers {
          id
          name
          priceAdjustment
        }
      }
      payments {
        id
        amount
        paymentMethod
        status
        createdAt
      }
    `
  });
  if (!order) {
    throw new Error("Order not found");
  }
  if (secretKey) {
    if (order.secretKey !== secretKey) {
      throw new Error("Invalid secret key");
    }
    return order;
  }
  if (!sessionUserId) {
    throw new Error("Not authenticated");
  }
  if (order.customer?.id === sessionUserId) {
    return order;
  }
  throw new Error("Order not found");
}

// features/keystone/mutations/getCustomerOrders.ts
async function getCustomerOrders(root, { limit = 10, offset = 0 }, context) {
  const sessionUserId = context.session?.itemId;
  if (!sessionUserId) {
    throw new Error("Not authenticated");
  }
  const sudoContext = context.sudo();
  const orders = await sudoContext.query.RestaurantOrder.findMany({
    where: {
      customer: { id: { equals: sessionUserId } }
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(50, Math.max(1, Number(limit) || 10)),
    skip: Math.max(0, Number(offset) || 0),
    query: `
      id
      orderNumber
      orderType
      status
      total
      createdAt
      customerName
      orderItems {
        id
        quantity
        price
        itemNameSnapshot
        itemThumbnailSnapshot
        modifiersSnapshot
        menuItem {
          id
          name
        }
      }
    `
  });
  return orders;
}

// features/keystone/queries/activeCartPaymentProviders.ts
async function activeCartPaymentProviders(root, _args, context) {
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: {
      isInstalled: { equals: true }
    },
    query: `
      id
      name
      code
      isInstalled
    `
  });
  return providers.filter(
    (provider) => isPaymentProviderConfigured(provider.code || "")
  );
}

// features/keystone/mutations/tableManagement.ts
async function transferTable(root, args, context) {
  if (!permissions.canManageTables({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  const { orderId, fromTableId, toTableId } = args;
  const sudo = context.sudo();
  try {
    await sudo.db.RestaurantOrder.updateOne({
      where: { id: orderId },
      data: {
        tables: {
          disconnect: [{ id: fromTableId }],
          connect: [{ id: toTableId }]
        }
      }
    });
    const fromTableOrders = await sudo.query.RestaurantOrder.count({
      where: {
        tables: { some: { id: { equals: fromTableId } } },
        status: { notIn: ["completed", "cancelled"] }
      }
    });
    if (fromTableOrders === 0) {
      await sudo.db.Table.updateOne({
        where: { id: fromTableId },
        data: { status: "cleaning" }
      });
    }
    await sudo.db.Table.updateOne({
      where: { id: toTableId },
      data: { status: "occupied" }
    });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function combineTables(root, args, context) {
  if (!permissions.canManageTables({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  const { orderId, tableIds } = args;
  const sudo = context.sudo();
  try {
    await sudo.db.RestaurantOrder.updateOne({
      where: { id: orderId },
      data: {
        tables: {
          connect: tableIds.map((id) => ({ id }))
        }
      }
    });
    await Promise.all(
      tableIds.map(
        (id) => sudo.db.Table.updateOne({
          where: { id },
          data: { status: "occupied" }
        })
      )
    );
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// features/keystone/mutations/courseManagement.ts
async function fireCourse(root, args, context) {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  const { courseId } = args;
  const sudo = context.sudo();
  try {
    await sudo.db.OrderCourse.updateOne({
      where: { id: courseId },
      data: {
        status: "fired",
        fireTime: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    const course = await sudo.query.OrderCourse.findOne({
      where: { id: courseId },
      query: "order { id } orderItems { id }"
    });
    if (course?.orderItems?.length) {
      await Promise.all(
        course.orderItems.map(
          (item) => sudo.db.OrderItem.updateOne({
            where: { id: item.id },
            data: {
              sentToKitchen: (/* @__PURE__ */ new Date()).toISOString(),
              firedAt: (/* @__PURE__ */ new Date()).toISOString(),
              kitchenStatus: "new"
            }
          })
        )
      );
    }
    await appendKitchenTicketEvent(context, {
      eventType: "dispatch",
      orderId: course?.order?.id,
      payload: { courseId, action: "fire", orderItemIds: (course?.orderItems || []).map((item) => item.id) }
    });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function recallCourse(root, args, context) {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  const { courseId } = args;
  const sudo = context.sudo();
  try {
    await sudo.db.OrderCourse.updateOne({
      where: { id: courseId },
      data: {
        status: "pending",
        fireTime: null
      }
    });
    const course = await sudo.query.OrderCourse.findOne({
      where: { id: courseId },
      query: "order { id } orderItems { id }"
    });
    const recalledAt = (/* @__PURE__ */ new Date()).toISOString();
    await Promise.all((course?.orderItems || []).map(
      (item) => sudo.db.OrderItem.updateOne({
        where: { id: item.id },
        data: { kitchenStatus: "recalled", recalledAt }
      })
    ));
    await appendKitchenTicketEvent(context, {
      eventType: "recall",
      orderId: course?.order?.id,
      payload: { courseId, action: "recall", orderItemIds: (course?.orderItems || []).map((item) => item.id) }
    });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// features/keystone/mutations/kdsTickets.ts
async function syncKitchenTickets(_root, _args, context) {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized", created: 0, updated: 0 };
  }
  try {
    const result2 = await syncKitchenTicketsForActiveOrders(context);
    return { success: true, error: null, created: result2.created, updated: result2.updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error", created: 0, updated: 0 };
  }
}
async function updateKitchenTicketStatus(_root, args, context) {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  try {
    const prisma = context.prisma;
    const actorId = context.session?.itemId;
    const result2 = await prisma.$transaction(async (tx) => {
      const ticket = await tx.kitchenTicket.findUnique({
        where: { id: args.ticketId },
        include: {
          order: { select: { id: true } },
          station: { select: { name: true } },
          orderItems: { select: { id: true } }
        }
      });
      if (!ticket) throw new Error("Ticket not found");
      if (ticket.status === args.status) return { orderId: ticket.orderId, replay: true };
      if (args.status === "served" && isExpediterStation(ticket.station?.name) && ticket.orderId) {
        const siblings = await tx.kitchenTicket.findMany({
          where: { orderId: ticket.orderId, status: { in: ["new", "in_progress"] }, id: { not: ticket.id } },
          include: { station: { select: { name: true } } }
        });
        const blockingPrep = siblings.filter((candidate) => !isExpediterStation(candidate.station?.name));
        if (blockingPrep.length) {
          const stations = blockingPrep.map((candidate) => candidate.station?.name).filter(Boolean).join(", ");
          throw new Error(stations ? `Prep stations still working: ${stations}` : "Prep tickets must be completed before expediter can bump served");
        }
      }
      const now = /* @__PURE__ */ new Date();
      const nowIso = now.toISOString();
      const terminalItems = (ticket.items || []).map(
        (item) => args.status === "served" ? { ...item, status: "fulfilled", fulfilledAt: item.fulfilledAt || nowIso } : args.status === "cancelled" ? { ...item, status: "cancelled" } : item
      );
      await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: {
          status: args.status,
          items: ["served", "cancelled"].includes(args.status) ? terminalItems : void 0,
          completedAt: args.status === "ready" ? now : args.status === "in_progress" ? null : void 0,
          servedAt: args.status === "served" ? now : void 0,
          recalledAt: args.status === "in_progress" && ticket.status === "ready" ? now : void 0
        }
      });
      const itemState = args.status === "served" ? "fulfilled" : args.status === "ready" ? "ready" : args.status === "cancelled" ? "voided" : args.status;
      await tx.orderItem.updateMany({
        where: { id: { in: ticket.orderItems.map((item) => item.id) } },
        data: {
          kitchenStatus: itemState,
          kitchenStartedAt: args.status === "in_progress" ? now : void 0,
          kitchenReadyAt: args.status === "ready" ? now : void 0,
          fulfilledAt: args.status === "served" ? now : void 0,
          recalledAt: args.status === "in_progress" && ticket.status === "ready" ? now : void 0
        }
      });
      await appendKitchenTicketEventWithClient(tx, actorId, {
        eventType: args.status === "cancelled" ? "cancel" : args.status === "in_progress" && ticket.status === "ready" ? "recall" : "status",
        ticketId: ticket.id,
        orderId: ticket.orderId,
        payload: { from: ticket.status, to: args.status, orderItemIds: ticket.orderItems.map((item) => item.id) }
      });
      return { orderId: ticket.orderId, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result2.replay && result2.orderId) await reconcileRestaurantOrderStatus(result2.orderId, context);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function fulfillKitchenTicketItem(_root, args, context) {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }
  try {
    const prisma = context.prisma;
    const actorId = context.session?.itemId;
    const result2 = await prisma.$transaction(async (tx) => {
      const ticket = await tx.kitchenTicket.findUnique({
        where: { id: args.ticketId },
        include: { orderItems: { select: { id: true } } }
      });
      if (!ticket) throw new Error("Ticket not found");
      const currentItems = ticket.items || [];
      if (!currentItems.some((item) => item.id === args.itemId)) throw new Error("Ticket item not found");
      const now = /* @__PURE__ */ new Date();
      const nowIso = now.toISOString();
      const items = currentItems.map(
        (item) => item.id === args.itemId ? { ...item, status: args.fulfilled ? "fulfilled" : "in_progress", fulfilledAt: args.fulfilled ? nowIso : null } : item
      );
      const allFulfilled = items.length > 0 && items.every((item) => item.status === "fulfilled");
      await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: { items, status: allFulfilled ? "ready" : "in_progress", completedAt: allFulfilled ? now : null }
      });
      const normalizedItem = ticket.orderItems.find((item) => item.id === args.itemId);
      if (normalizedItem) {
        await tx.orderItem.update({
          where: { id: normalizedItem.id },
          data: {
            kitchenStatus: args.fulfilled ? "fulfilled" : "in_progress",
            fulfilledAt: args.fulfilled ? now : null,
            kitchenStartedAt: args.fulfilled ? void 0 : now
          }
        });
      }
      await appendKitchenTicketEventWithClient(tx, actorId, {
        eventType: "item_status",
        ticketId: ticket.id,
        orderId: ticket.orderId,
        orderItemId: args.itemId,
        payload: { fulfilled: args.fulfilled, at: nowIso }
      });
      return { orderId: ticket.orderId };
    }, { isolationLevel: "Serializable" });
    if (result2.orderId) await reconcileRestaurantOrderStatus(result2.orderId, context);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// features/keystone/mutations/handlePaymentProviderWebhook.ts
var import_crypto6 = __toESM(require("crypto"));
function normalizeHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[String(key).toLowerCase()] = Array.isArray(value) ? String(value[0] || "") : String(value ?? "");
  }
  return normalized;
}
function getCandidateProviderPaymentIds(type, resource) {
  const ids = /* @__PURE__ */ new Set();
  const add = (value) => {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  };
  add(resource?.id);
  add(resource?.payment_intent);
  add(resource?.supplementary_data?.related_ids?.order_id);
  add(resource?.supplementary_data?.related_ids?.capture_id);
  if (type.startsWith("PAYMENT.CAPTURE.")) {
    add(resource?.supplementary_data?.related_ids?.order_id);
    add(resource?.id);
  }
  return Array.from(ids);
}
async function findPaymentByProviderIds(providerPaymentIds, context) {
  const sudo = context.sudo();
  for (const providerPaymentId of providerPaymentIds) {
    const payments = await sudo.query.Payment.findMany({
      where: { providerPaymentId: { equals: providerPaymentId } },
      query: "id status data order { id status orderSource }",
      take: 1
    });
    if (payments[0]) return payments[0];
  }
  return null;
}
async function handlePaymentProviderWebhook(_root, {
  providerCode,
  event,
  headers,
  rawBody
}, context) {
  if (!providerCode || !/^[a-z0-9_-]+$/i.test(providerCode)) throw new Error("Invalid provider code");
  if (!event || typeof event !== "object") throw new Error("Webhook event payload is required");
  const normalizedHeaders = normalizeHeaders(headers);
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: providerCode } },
    query: "id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata",
    take: 1
  });
  const provider = providers[0];
  if (!provider?.isInstalled) throw new Error(`Payment provider ${providerCode} not found or not installed`);
  if (!provider.handleWebhookFunction || provider.handleWebhookFunction === "manual") {
    throw new Error(`Provider ${providerCode} does not support authenticated webhook handling`);
  }
  const parsed = await handleWebhook({
    provider,
    event,
    headers: normalizedHeaders,
    rawBody: rawBody || void 0
  });
  if (!parsed?.isValid || !parsed?.type) throw new Error("Webhook verification failed");
  const type = String(parsed.type);
  const resource = parsed.resource || {};
  const providerEventId = String(parsed.event?.id || event?.id || "");
  const eventKey = `${providerCode}:${providerEventId || import_crypto6.default.createHash("sha256").update(rawBody || JSON.stringify(event)).digest("hex")}`;
  const existing = await context.sudo().query.PaymentWebhookEvent.findMany({
    where: { eventKey: { equals: eventKey } },
    query: "id status",
    take: 1
  });
  if (existing[0]?.status === "processed" || existing[0]?.status === "ignored") {
    return { success: true, error: null };
  }
  let inbox = existing[0];
  if (!inbox) {
    inbox = await context.sudo().query.PaymentWebhookEvent.createOne({
      data: {
        eventKey,
        providerCode,
        providerEventId,
        eventType: type,
        status: "received",
        payload: event,
        rawBody: rawBody || JSON.stringify(event),
        attempts: 0
      },
      query: "id status"
    });
  }
  const candidateIds = getCandidateProviderPaymentIds(type, resource);
  const payment = candidateIds.length ? await findPaymentByProviderIds(candidateIds, context) : null;
  if (!payment) {
    await context.sudo().db.PaymentWebhookEvent.updateOne({
      where: { id: inbox.id },
      data: { status: "ignored", processedAt: (/* @__PURE__ */ new Date()).toISOString(), attempts: 1 }
    });
    return { success: true, error: null };
  }
  try {
    const prisma = context.prisma;
    await prisma.$transaction(async (tx) => {
      const currentInbox = await tx.paymentWebhookEvent.findUnique({ where: { eventKey } });
      if (["processed", "ignored"].includes(currentInbox?.status || "")) return;
      let status = null;
      if (["payment_intent.succeeded", "charge.succeeded", "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"].includes(type)) {
        status = "succeeded";
      } else if (["payment_intent.payment_failed", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"].includes(type)) {
        status = "failed";
      } else if (["payment_intent.canceled", "PAYMENT.CAPTURE.REVERSED", "CHECKOUT.ORDER.VOIDED"].includes(type)) {
        status = "cancelled";
      }
      if (status) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status,
            processedAt: status === "succeeded" ? /* @__PURE__ */ new Date() : null,
            errorMessage: status === "failed" ? resource.last_payment_error?.message || resource.status_details?.reason || "Payment failed" : "",
            data: {
              ...payment.data || {},
              webhookType: type,
              webhookEventId: providerEventId,
              webhookResourceId: resource.id || null,
              captureId: resource.supplementary_data?.related_ids?.capture_id || resource.latest_charge || null
            }
          }
        });
        if (status === "succeeded" && payment.order?.id && payment.order.orderSource === "online" && payment.order.status === "open") {
          await tx.restaurantOrder.update({ where: { id: payment.order.id }, data: { status: "sent_to_kitchen" } });
        }
      }
      await tx.paymentWebhookEvent.update({
        where: { id: inbox.id },
        data: {
          paymentId: payment.id,
          status: status ? "processed" : "ignored",
          attempts: Number(currentInbox?.attempts || 0) + 1,
          processedAt: /* @__PURE__ */ new Date(),
          error: ""
        }
      });
    }, { isolationLevel: "Serializable" });
    if (["payment_intent.succeeded", "charge.succeeded", "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"].includes(type) && payment.order?.id && payment.order.orderSource === "pos") {
      await finalizePaidOrder(payment.order.id, context);
    }
    return { success: true, error: null };
  } catch (error) {
    await context.sudo().db.PaymentWebhookEvent.updateOne({
      where: { id: inbox.id },
      data: {
        status: "failed",
        attempts: 1,
        error: error instanceof Error ? error.message : "Unknown webhook processing error"
      }
    });
    throw error;
  }
}

// features/keystone/mutations/createPOSOrder.ts
function generateOrderNumber() {
  const now = /* @__PURE__ */ new Date();
  return `${now.toISOString().slice(2, 10).replace(/-/g, "")}-${now.getTime().toString().slice(-4)}`;
}
function getCourseType(courseNumber) {
  if (courseNumber === 1) return "appetizers";
  if (courseNumber === 2) return "mains";
  if (courseNumber === 3) return "desserts";
  return "mains";
}
async function createPOSOrder(_root, args, context) {
  if (!permissions.canManageOrders({ session: context.session })) {
    throw new Error("Not authorized to create POS orders");
  }
  const orderType = args.orderType || "dine_in";
  const items = (args.items || []).filter((item) => item?.menuItemId && Number(item.quantity) > 0);
  const tableIds = Array.from(new Set(args.tableIds || []));
  if (!items.length) throw new Error("Order must include at least one item");
  if (orderType === "dine_in" && !tableIds.length) {
    throw new Error("Dine-in orders require at least one table");
  }
  const sudo = context.sudo();
  const [storeSettings, validatedItems, tables] = await Promise.all([
    sudo.query.StoreSettings.findOne({ where: { id: "1" }, query: "currencyCode taxRate" }),
    Promise.all(
      items.map(async (item) => ({
        ...await validateCartItemInput(context, {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          modifierIds: item.modifierIds || [],
          specialInstructions: item.specialInstructions
        }),
        courseNumber: Math.max(1, Math.floor(Number(item.courseNumber || 1)))
      }))
    ),
    tableIds.length ? sudo.query.Table.findMany({ where: { id: { in: tableIds } }, query: "id status" }) : Promise.resolve([])
  ]);
  if (tables.length !== tableIds.length) throw new Error("One or more tables were not found");
  const subtotal = validatedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const currencyCode = storeSettings?.currencyCode || "USD";
  const { tax, total } = calculateRestaurantTotals({
    subtotal,
    orderType,
    taxRate: storeSettings?.taxRate,
    currencyCode
  });
  const order = await sudo.db.RestaurantOrder.createOne({
    data: {
      orderNumber: generateOrderNumber(),
      orderType,
      orderSource: "pos",
      status: "sent_to_kitchen",
      guestCount: Math.max(1, args.guestCount || 1),
      subtotal,
      tax,
      total,
      isUrgent: Boolean(args.isUrgent),
      specialInstructions: args.specialInstructions || "",
      currencyCode,
      tables: tableIds.length ? { connect: tableIds.map((id) => ({ id })) } : void 0,
      server: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0,
      createdBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0
    }
  });
  const courseMap = /* @__PURE__ */ new Map();
  for (const item of validatedItems) {
    if (!courseMap.has(item.courseNumber)) {
      const course = await sudo.db.OrderCourse.createOne({
        data: {
          order: { connect: { id: order.id } },
          courseNumber: item.courseNumber,
          courseType: getCourseType(item.courseNumber),
          status: "pending"
        }
      });
      courseMap.set(item.courseNumber, course.id);
    }
    await sudo.db.OrderItem.createOne({
      data: {
        order: { connect: { id: order.id } },
        course: { connect: { id: courseMap.get(item.courseNumber) } },
        menuItem: { connect: { id: item.menuItem.id } },
        appliedModifiers: item.modifiers.length ? { connect: item.modifiers.map((modifier) => ({ id: modifier.id })) } : void 0,
        quantity: item.quantity,
        price: item.unitPrice,
        itemNameSnapshot: item.menuItem.name,
        itemThumbnailSnapshot: item.menuItem.thumbnail || "",
        kitchenStationSnapshot: item.menuItem.kitchenStation || "expo",
        menuItemIdSnapshot: item.menuItem.id,
        modifiersSnapshot: item.modifiers,
        specialInstructions: item.specialInstructions,
        courseNumber: item.courseNumber
      }
    });
  }
  return sudo.query.RestaurantOrder.findOne({
    where: { id: order.id },
    query: "id orderNumber status subtotal tax total"
  });
}

// features/keystone/mutations/addServiceFloorItem.ts
function generateDineInOrderNumber() {
  return `DIN-${Date.now().toString(36).toUpperCase()}`;
}
function getCourseType2(courseNumber) {
  if (courseNumber === 1) return "appetizers";
  if (courseNumber === 2) return "mains";
  if (courseNumber === 3) return "desserts";
  return "mains";
}
async function recalculateOrderTotals(orderId, context) {
  const sudo = context.sudo();
  const [settings, order] = await Promise.all([
    getStoreDeliverySettings(context),
    sudo.query.RestaurantOrder.findOne({
      where: { id: orderId },
      query: `
        id
        orderType
        currencyCode
        tip
        discount
        orderItems { id quantity price }
      `
    })
  ]);
  if (!order) throw new Error("Order not found while recalculating totals");
  const subtotal = (order.orderItems || []).reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const { tax } = calculateRestaurantTotals({
    subtotal,
    orderType: order.orderType || "dine_in",
    taxRate: settings?.taxRate,
    currencyCode: settings?.currencyCode || order.currencyCode || "USD"
  });
  const tip = Math.max(0, Number(order.tip || 0));
  const discount = Math.max(0, Number(order.discount || 0));
  const total = Math.max(0, subtotal + tax + tip - discount);
  await sudo.db.RestaurantOrder.updateOne({
    where: { id: orderId },
    data: {
      subtotal,
      tax,
      total,
      currencyCode: settings?.currencyCode || order.currencyCode || "USD"
    }
  });
  return { subtotal, tax, total };
}
async function addServiceFloorItem(root, args, context) {
  if (!permissions.canManageOrders({ session: context.session })) {
    throw new Error("Not authorized to manage service-floor checks");
  }
  const quantity = Math.max(1, Math.floor(Number(args.quantity || 1)));
  const courseNumber = Math.max(1, Math.floor(Number(args.courseNumber || 1)));
  const sudo = context.sudo();
  if (!args.tableId) throw new Error("Table is required");
  if (!args.menuItemId) throw new Error("Menu item is required");
  const [settings, table, validatedItem] = await Promise.all([
    getStoreDeliverySettings(context),
    sudo.query.Table.findOne({
      where: { id: args.tableId },
      query: "id tableNumber status"
    }),
    validateCartItemInput(context, {
      menuItemId: args.menuItemId,
      quantity,
      modifierIds: args.modifierIds || [],
      specialInstructions: args.specialInstructions
    })
  ]);
  if (!table) throw new Error("Table not found");
  let orderId = args.orderId || null;
  let order = null;
  if (orderId) {
    order = await sudo.query.RestaurantOrder.findOne({
      where: { id: orderId },
      query: "id status orderType tables { id } courses { id courseNumber }"
    });
    if (!order) throw new Error("Active check not found");
  } else {
    const currencyCode = settings?.currencyCode || "USD";
    order = await sudo.db.RestaurantOrder.createOne({
      data: {
        orderNumber: generateDineInOrderNumber(),
        orderType: "dine_in",
        orderSource: "pos",
        status: "open",
        guestCount: 1,
        subtotal: 0,
        tax: 0,
        total: 0,
        currencyCode,
        tables: { connect: [{ id: args.tableId }] },
        server: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0,
        createdBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0
      }
    });
    orderId = order.id;
    await sudo.db.Table.updateOne({
      where: { id: args.tableId },
      data: { status: "occupied" }
    });
  }
  const existingCourse = (order.courses || []).find((course2) => Number(course2.courseNumber) === courseNumber);
  const course = existingCourse || await sudo.db.OrderCourse.createOne({
    data: {
      order: { connect: { id: orderId } },
      courseNumber,
      courseType: getCourseType2(courseNumber),
      status: "pending"
    }
  });
  if (!orderId) throw new Error("Unable to create or find active order for this table");
  await sudo.db.OrderItem.createOne({
    data: {
      order: { connect: { id: orderId } },
      course: { connect: { id: course.id } },
      menuItem: { connect: { id: validatedItem.menuItem.id } },
      appliedModifiers: validatedItem.modifiers.length ? { connect: validatedItem.modifiers.map((modifier) => ({ id: modifier.id })) } : void 0,
      quantity: validatedItem.quantity,
      price: validatedItem.unitPrice,
      itemNameSnapshot: validatedItem.menuItem.name,
      itemThumbnailSnapshot: validatedItem.menuItem.thumbnail || "",
      kitchenStationSnapshot: validatedItem.menuItem.kitchenStation || "expo",
      menuItemIdSnapshot: validatedItem.menuItem.id,
      modifiersSnapshot: validatedItem.modifiers,
      courseNumber,
      seatNumber: args.seatNumber ?? void 0,
      specialInstructions: validatedItem.specialInstructions
    }
  });
  await recalculateOrderTotals(orderId, context);
  const refreshed = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id orderNumber status subtotal tax total"
  });
  return refreshed;
}

// features/keystone/mutations/updateServiceFloorItem.ts
function getCourseType3(courseNumber) {
  if (courseNumber === 1) return "appetizers";
  if (courseNumber === 2) return "mains";
  if (courseNumber === 3) return "desserts";
  return "mains";
}
async function recalculateOrderTotals2(orderId, context, voidReason) {
  const sudo = context.sudo();
  const [settings, order] = await Promise.all([
    getStoreDeliverySettings(context),
    sudo.query.RestaurantOrder.findOne({
      where: { id: orderId },
      query: `
        id
        orderType
        currencyCode
        tip
        discount
        specialInstructions
        orderItems { id quantity price adjustmentTotal isVoided }
      `
    })
  ]);
  if (!order) throw new Error("Order not found while recalculating totals");
  const subtotal = getOrderItemsSubtotal(order.orderItems || []);
  const { tax } = calculateRestaurantTotals({
    subtotal,
    orderType: order.orderType || "dine_in",
    taxRate: settings?.taxRate,
    currencyCode: settings?.currencyCode || order.currencyCode || "USD"
  });
  const tip = Math.max(0, Number(order.tip || 0));
  const discount = Math.max(0, Number(order.discount || 0));
  const total = Math.max(0, subtotal + tax + tip - discount);
  const notePatch = voidReason ? order.specialInstructions ? `${order.specialInstructions} | VOID ITEM: ${voidReason}` : `VOID ITEM: ${voidReason}` : order.specialInstructions;
  await sudo.db.RestaurantOrder.updateOne({
    where: { id: orderId },
    data: {
      subtotal,
      tax,
      total,
      currencyCode: settings?.currencyCode || order.currencyCode || "USD",
      specialInstructions: notePatch || ""
    }
  });
  return { subtotal, tax, total };
}
async function getOrCreateCourse(orderId, courseNumber, context) {
  const sudo = context.sudo();
  const courses = await sudo.query.OrderCourse.findMany({
    where: {
      order: { id: { equals: orderId } },
      courseNumber: { equals: courseNumber }
    },
    query: "id courseNumber",
    take: 1
  });
  if (courses[0]) return courses[0];
  return sudo.db.OrderCourse.createOne({
    data: {
      order: { connect: { id: orderId } },
      courseNumber,
      courseType: getCourseType3(courseNumber),
      status: "pending"
    }
  });
}
async function updateServiceFloorItem(root, args, context) {
  if (!permissions.canManageOrders({ session: context.session })) {
    throw new Error("Not authorized to manage service-floor checks");
  }
  if (!args.orderItemId) throw new Error("Order item is required");
  const sudo = context.sudo();
  const item = await sudo.query.OrderItem.findOne({
    where: { id: args.orderItemId },
    query: "id quantity courseNumber order { id status }"
  });
  if (!item?.order?.id) throw new Error("Order item not found");
  const orderId = item.order.id;
  const voidReason = args.voidReason?.trim() || null;
  if (voidReason) {
    const result2 = await voidOrderItem(null, {
      orderItemId: args.orderItemId,
      reason: voidReason,
      managerApprovalId: args.managerApprovalId,
      idempotencyKey: `service-floor-void:${args.orderItemId}:${voidReason}:${args.managerApprovalId || "missing-approval"}`
    }, context);
    if (!result2.success) throw new Error(result2.error || "Unable to void item");
  } else {
    const quantity = Math.max(1, Math.floor(Number(args.quantity ?? item.quantity ?? 1)));
    const courseNumber = Math.max(1, Math.floor(Number(args.courseNumber ?? item.courseNumber ?? 1)));
    const course = await getOrCreateCourse(orderId, courseNumber, context);
    await sudo.db.OrderItem.updateOne({
      where: { id: args.orderItemId },
      data: {
        quantity,
        courseNumber,
        course: { connect: { id: course.id } },
        seatNumber: args.seatNumber ?? void 0,
        specialInstructions: args.specialInstructions ?? void 0
      }
    });
  }
  if (!voidReason) await recalculateOrderTotals2(orderId, context);
  const refreshed = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id orderNumber status subtotal tax total"
  });
  return refreshed;
}

// features/keystone/mutations/serviceFloorTable.ts
var ACTIVE_ORDER_STATUSES2 = ["open", "sent_to_kitchen", "in_progress", "ready", "served"];
async function getActiveOrdersForTable(tableId, context) {
  return context.sudo().query.RestaurantOrder.findMany({
    where: {
      tables: { some: { id: { equals: tableId } } },
      status: { in: ACTIVE_ORDER_STATUSES2 }
    },
    query: "id status orderNumber",
    take: 5
  });
}
async function updateServiceFloorTableStatus(root, args, context) {
  if (!permissions.canManageTables({ session: context.session })) {
    return { success: false, error: "Not authorized to manage tables" };
  }
  if (!args.tableId) return { success: false, error: "Table is required" };
  if (!["available", "occupied", "reserved", "cleaning"].includes(args.status)) {
    return { success: false, error: "Invalid table status" };
  }
  try {
    const sudo = context.sudo();
    const table = await sudo.query.Table.findOne({
      where: { id: args.tableId },
      query: "id tableNumber status"
    });
    if (!table) return { success: false, error: "Table not found" };
    const activeOrders = await getActiveOrdersForTable(args.tableId, context);
    if (activeOrders.length > 0 && ["available", "cleaning"].includes(args.status)) {
      return {
        success: false,
        error: `Table ${table.tableNumber || ""} has an active check. Close or move the check before marking it ${args.status}.`
      };
    }
    await sudo.db.Table.updateOne({
      where: { id: args.tableId },
      data: { status: args.status }
    });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function updateServiceFloorCheckStatus(root, args, context) {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, error: "Not authorized to manage checks" };
  }
  if (!args.orderId) return { success: false, error: "Order is required" };
  try {
    const sudo = context.sudo();
    const order = await sudo.query.RestaurantOrder.findOne({
      where: { id: args.orderId },
      query: "id status total payments { id amount status } tables { id } orderItems { id }"
    });
    if (!order) return { success: false, error: "Check not found" };
    let nextStatus = null;
    if (args.action === "send_to_kitchen") {
      if (!order.orderItems?.length) return { success: false, error: "Add at least one item before sending to kitchen" };
      nextStatus = "sent_to_kitchen";
    } else if (args.action === "mark_served") {
      nextStatus = "served";
    } else if (args.action === "close_check") {
      const paid = (order.payments || []).filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      if (paid < Number(order.total || 0)) {
        return { success: false, error: "Check cannot be closed until payment is complete" };
      }
      nextStatus = "completed";
    } else if (args.action === "cancel_check") {
      return { success: false, error: "Use the approved order void workflow with a reason to cancel this check" };
    } else {
      return { success: false, error: "Invalid check action" };
    }
    await sudo.db.RestaurantOrder.updateOne({
      where: { id: args.orderId },
      data: { status: nextStatus }
    });
    await appendAuditEvent(context, {
      eventType: "service_floor.check_status_changed",
      entityType: "RestaurantOrder",
      entityId: args.orderId,
      before: { status: order.status },
      after: { status: nextStatus },
      metadata: { action: args.action }
    }).catch((error) => console.error("Check status audit event failed:", error));
    if (["completed", "cancelled"].includes(nextStatus)) {
      for (const table of order.tables || []) {
        const activeOrders = await getActiveOrdersForTable(table.id, context);
        const otherActiveOrders = activeOrders.filter((activeOrder) => activeOrder.id !== order.id);
        if (otherActiveOrders.length === 0) {
          await sudo.db.Table.updateOne({
            where: { id: table.id },
            data: { status: nextStatus === "completed" ? "cleaning" : "available" }
          });
        }
      }
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// features/keystone/mutations/waitlistManagement.ts
function normalizePartySize(value) {
  return Math.max(1, Math.floor(Number(value || 1)));
}
function normalizeQuotedWait(value) {
  return Math.max(0, Math.floor(Number(value || 15)));
}
async function createWaitlistEntry(root, args, context) {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized to manage waitlist" };
  }
  const customerName = args.customerName?.trim();
  const phoneNumber = args.phoneNumber?.trim();
  if (!customerName) return { success: false, error: "Guest name is required" };
  if (!phoneNumber) return { success: false, error: "Phone number is required" };
  try {
    await context.sudo().db.WaitlistEntry.createOne({
      data: {
        customerName,
        phoneNumber,
        partySize: normalizePartySize(args.partySize),
        quotedWaitTime: normalizeQuotedWait(args.quotedWaitTime),
        notes: args.notes?.trim() || "",
        status: "waiting",
        addedBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0
      }
    });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function updateWaitlistStatus(root, args, context) {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized to manage waitlist" };
  }
  if (!args.entryId) return { success: false, error: "Waitlist entry is required" };
  try {
    const sudo = context.sudo();
    const entry = await sudo.query.WaitlistEntry.findOne({
      where: { id: args.entryId },
      query: "id status partySize customerName"
    });
    if (!entry) return { success: false, error: "Waitlist entry not found" };
    if (["seated", "cancelled", "no_show"].includes(entry.status || "")) {
      return { success: false, error: "This waitlist entry is already closed" };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (args.action === "notify") {
      await sudo.db.WaitlistEntry.updateOne({
        where: { id: args.entryId },
        data: { status: "notified", notifiedAt: now }
      });
    } else if (args.action === "seat") {
      if (!args.tableId) return { success: false, error: "Select a table before seating the guest" };
      const table = await sudo.query.Table.findOne({
        where: { id: args.tableId },
        query: "id tableNumber capacity status"
      });
      if (!table) return { success: false, error: "Table not found" };
      if (table.status !== "available") {
        return { success: false, error: `Table ${table.tableNumber || ""} is not available` };
      }
      if (Number(table.capacity || 0) < Number(entry.partySize || 1)) {
        return { success: false, error: "Selected table is too small for this party" };
      }
      await sudo.db.WaitlistEntry.updateOne({
        where: { id: args.entryId },
        data: {
          status: "seated",
          seatedAt: now,
          table: { connect: { id: args.tableId } }
        }
      });
      await sudo.db.Table.updateOne({
        where: { id: args.tableId },
        data: { status: "occupied" }
      });
    } else if (args.action === "cancel") {
      await sudo.db.WaitlistEntry.updateOne({
        where: { id: args.entryId },
        data: { status: "cancelled" }
      });
    } else if (args.action === "no_show") {
      await sudo.db.WaitlistEntry.updateOne({
        where: { id: args.entryId },
        data: { status: "no_show" }
      });
    } else {
      return { success: false, error: "Invalid waitlist action" };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// features/keystone/mutations/reservationManagement.ts
var ACTIVE_RESERVATION_STATUSES = ["pending", "confirmed", "seated"];
var TERMINAL_RESERVATION_STATUSES = ["completed", "cancelled", "no_show"];
function minutes(value, fallback = 90) {
  return Math.max(15, Math.floor(Number(value || fallback)));
}
function partySize(value) {
  return Math.max(1, Math.floor(Number(value || 1)));
}
function reservationWindow(dateValue, duration) {
  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) throw new Error("Reservation date is invalid");
  const end = new Date(start.getTime() + duration * 6e4);
  return { start, end };
}
async function assertTableAssignable({
  tableId,
  party,
  reservationStart,
  duration,
  reservationId,
  context
}) {
  if (!tableId) return;
  const sudo = context.sudo();
  const table = await sudo.query.Table.findOne({
    where: { id: tableId },
    query: "id tableNumber capacity status"
  });
  if (!table) throw new Error("Assigned table not found");
  if (Number(table.capacity || 0) < party) {
    throw new Error(`Table ${table.tableNumber || ""} is too small for this party`);
  }
  const { start, end } = reservationWindow(reservationStart, duration);
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);
  const sameDayReservations = await sudo.query.Reservation.findMany({
    where: {
      assignedTable: { id: { equals: tableId } },
      reservationDate: { gte: dayStart.toISOString(), lte: dayEnd.toISOString() },
      status: { in: ACTIVE_RESERVATION_STATUSES }
    },
    query: "id reservationDate duration status customerName"
  });
  const conflicts = sameDayReservations.filter((reservation) => {
    if (reservationId && reservation.id === reservationId) return false;
    const existingStart = new Date(reservation.reservationDate);
    const existingEnd = new Date(existingStart.getTime() + minutes(reservation.duration) * 6e4);
    return existingStart < end && start < existingEnd;
  });
  if (conflicts.length > 0) {
    throw new Error(`Table ${table.tableNumber || ""} already has a reservation in that time window`);
  }
}
async function upsertReservation(root, args, context) {
  if (!permissions.canManageTables({ session: context.session })) {
    return { success: false, error: "Not authorized to manage reservations" };
  }
  const customerName = args.customerName?.trim();
  const customerPhone = args.customerPhone?.trim();
  if (!customerName) return { success: false, error: "Customer name is required" };
  if (!customerPhone) return { success: false, error: "Phone number is required" };
  try {
    const normalizedPartySize = partySize(args.partySize);
    const normalizedDuration = minutes(args.duration);
    const status = args.status || "confirmed";
    if (!["pending", "confirmed", "seated", "completed", "cancelled", "no_show"].includes(status)) {
      return { success: false, error: "Invalid reservation status" };
    }
    await assertTableAssignable({
      tableId: args.assignedTableId,
      party: normalizedPartySize,
      reservationStart: args.reservationDate,
      duration: normalizedDuration,
      reservationId: args.reservationId,
      context
    });
    const data = {
      customerName,
      customerPhone,
      customerEmail: args.customerEmail?.trim() || "",
      reservationDate: new Date(args.reservationDate).toISOString(),
      partySize: normalizedPartySize,
      duration: normalizedDuration,
      status,
      specialRequests: args.specialRequests?.trim() || ""
    };
    if (args.assignedTableId) {
      data.assignedTable = { connect: { id: args.assignedTableId } };
    } else if (args.reservationId) {
      data.assignedTable = { disconnect: true };
    }
    if (args.reservationId) {
      await context.sudo().db.Reservation.updateOne({
        where: { id: args.reservationId },
        data
      });
    } else {
      await context.sudo().db.Reservation.createOne({ data });
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function updateReservationStatus(root, args, context) {
  if (!permissions.canManageTables({ session: context.session })) {
    return { success: false, error: "Not authorized to manage reservations" };
  }
  if (!args.reservationId) return { success: false, error: "Reservation is required" };
  try {
    const sudo = context.sudo();
    const reservation = await sudo.query.Reservation.findOne({
      where: { id: args.reservationId },
      query: "id status partySize duration reservationDate assignedTable { id tableNumber status }"
    });
    if (!reservation) return { success: false, error: "Reservation not found" };
    if (TERMINAL_RESERVATION_STATUSES.includes(reservation.status || "")) {
      return { success: false, error: "This reservation is already closed" };
    }
    if (args.action === "pending") {
      await sudo.db.Reservation.updateOne({ where: { id: args.reservationId }, data: { status: "pending" } });
    } else if (args.action === "confirm") {
      await sudo.db.Reservation.updateOne({ where: { id: args.reservationId }, data: { status: "confirmed" } });
    } else if (args.action === "seat") {
      const tableId = args.tableId || reservation.assignedTable?.id;
      if (!tableId) return { success: false, error: "Assign a table before seating" };
      await assertTableAssignable({
        tableId,
        party: partySize(reservation.partySize),
        reservationStart: reservation.reservationDate,
        duration: minutes(reservation.duration),
        reservationId: reservation.id,
        context
      });
      const table = await sudo.query.Table.findOne({ where: { id: tableId }, query: "id status tableNumber" });
      if (!table) return { success: false, error: "Table not found" };
      if (!["available", "reserved"].includes(table.status || "")) {
        return { success: false, error: `Table ${table.tableNumber || ""} is not available to seat` };
      }
      await sudo.db.Reservation.updateOne({
        where: { id: args.reservationId },
        data: {
          status: "seated",
          assignedTable: { connect: { id: tableId } }
        }
      });
      await sudo.db.Table.updateOne({ where: { id: tableId }, data: { status: "occupied" } });
    } else if (args.action === "complete") {
      await sudo.db.Reservation.updateOne({ where: { id: args.reservationId }, data: { status: "completed" } });
      if (reservation.assignedTable?.id && reservation.assignedTable.status === "occupied") {
        await sudo.db.Table.updateOne({ where: { id: reservation.assignedTable.id }, data: { status: "cleaning" } });
      }
    } else if (args.action === "cancel") {
      await sudo.db.Reservation.updateOne({ where: { id: args.reservationId }, data: { status: "cancelled" } });
      if (reservation.assignedTable?.id && reservation.assignedTable.status === "reserved") {
        await sudo.db.Table.updateOne({ where: { id: reservation.assignedTable.id }, data: { status: "available" } });
      }
    } else if (args.action === "no_show") {
      await sudo.db.Reservation.updateOne({ where: { id: args.reservationId }, data: { status: "no_show" } });
      if (reservation.assignedTable?.id && reservation.assignedTable.status === "reserved") {
        await sudo.db.Table.updateOne({ where: { id: reservation.assignedTable.id }, data: { status: "available" } });
      }
    } else {
      return { success: false, error: "Invalid reservation action" };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// features/keystone/mutations/shiftManagement.ts
var VALID_ROLES = ["server", "bartender", "host", "busser", "cook", "dishwasher", "manager"];
var OPEN_SHIFT_STATUSES = ["scheduled", "started"];
function parseShiftWindow(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime())) throw new Error("Shift start time is invalid");
  if (Number.isNaN(end.getTime())) throw new Error("Shift end time is invalid");
  if (end <= start) throw new Error("Shift end time must be after start time");
  return { start, end };
}
async function assertNoStaffOverlap({
  staffId,
  startTime,
  endTime,
  shiftId,
  context
}) {
  if (!staffId) return;
  const { start, end } = parseShiftWindow(startTime, endTime);
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);
  const shifts = await context.sudo().query.Shift.findMany({
    where: {
      staff: { id: { equals: staffId } },
      startTime: { gte: dayStart.toISOString(), lte: dayEnd.toISOString() },
      status: { in: OPEN_SHIFT_STATUSES }
    },
    query: "id startTime endTime status"
  });
  const overlapping = shifts.filter((shift) => {
    if (shiftId && shift.id === shiftId) return false;
    const existingStart = new Date(shift.startTime);
    const existingEnd = new Date(shift.endTime);
    return existingStart < end && start < existingEnd;
  });
  if (overlapping.length > 0) {
    throw new Error("This staff member already has an overlapping open shift");
  }
}
async function upsertShift(root, args, context) {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage shifts" };
  }
  if (!VALID_ROLES.includes(args.role)) return { success: false, error: "Invalid shift role" };
  try {
    parseShiftWindow(args.startTime, args.endTime);
    if (args.staffId) {
      const staff = await context.sudo().query.User.findOne({
        where: { id: args.staffId },
        query: "id name isActive"
      });
      if (!staff) return { success: false, error: "Staff member not found" };
      if (staff.isActive === false) return { success: false, error: "Cannot schedule an inactive staff member" };
    }
    await assertNoStaffOverlap({
      staffId: args.staffId,
      startTime: args.startTime,
      endTime: args.endTime,
      shiftId: args.shiftId,
      context
    });
    const data = {
      startTime: new Date(args.startTime).toISOString(),
      endTime: new Date(args.endTime).toISOString(),
      role: args.role,
      hourlyRate: args.hourlyRate || void 0,
      staff: args.staffId ? { connect: { id: args.staffId } } : { disconnect: true }
    };
    if (args.shiftId) {
      await context.sudo().db.Shift.updateOne({ where: { id: args.shiftId }, data });
    } else {
      await context.sudo().db.Shift.createOne({ data: { ...data, status: "scheduled" } });
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function updateShiftStatus(root, args, context) {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage shifts" };
  }
  if (!args.shiftId) return { success: false, error: "Shift is required" };
  try {
    const sudo = context.sudo();
    const shift = await sudo.query.Shift.findOne({
      where: { id: args.shiftId },
      query: "id status clockIn clockOut"
    });
    if (!shift) return { success: false, error: "Shift not found" };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (args.action === "start") {
      if (shift.status !== "scheduled") return { success: false, error: "Only scheduled shifts can be started" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "started", clockIn: now } });
    } else if (args.action === "complete") {
      if (shift.status !== "started") return { success: false, error: "Only started shifts can be completed" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "completed", clockOut: now } });
    } else if (args.action === "no_show") {
      if (shift.status !== "scheduled") return { success: false, error: "Only scheduled shifts can be marked no-show" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "no_show" } });
    } else if (args.action === "cancel") {
      if (!["scheduled", "started"].includes(shift.status || "")) return { success: false, error: "This shift is already closed" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "called_out" } });
    } else {
      return { success: false, error: "Invalid shift action" };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// features/lib/tip-allocation.ts
var TIP_ROLE_WEIGHTS = {
  server: 60,
  bartender: 20,
  busser: 10,
  host: 10
};
var TIP_INELIGIBLE_ROLES = /* @__PURE__ */ new Set(["manager", "admin", "owner", "supervisor"]);
function isTipEligibleRole(role) {
  return Boolean(role && !TIP_INELIGIBLE_ROLES.has(role.toLowerCase()));
}
function allocateCents(total, entries, getWeight, getStableKey) {
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, getWeight(entry)), 0);
  if (totalWeight <= 0 || total <= 0) return entries.map((entry) => ({ entry, amount: 0 }));
  const allocations = entries.map((entry) => {
    const exact = Math.max(0, getWeight(entry)) / totalWeight * total;
    const floor = Math.floor(exact);
    return { entry, amount: floor, remainder: exact - floor, key: getStableKey(entry) };
  });
  let centsRemaining = total - allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  allocations.sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key)).forEach((allocation) => {
    if (centsRemaining > 0) {
      allocation.amount += 1;
      centsRemaining -= 1;
    }
  });
  return allocations.sort((a, b) => a.key.localeCompare(b.key)).map(({ entry, amount }) => ({ entry, amount }));
}
function aggregateEntries(entries) {
  const byStaff = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const role = (entry.role || "").toLowerCase();
    if (!entry.staffId || !isTipEligibleRole(role) || entry.hoursWorked <= 0) continue;
    const key = `${entry.staffId}:${role}`;
    const existing = byStaff.get(key);
    byStaff.set(key, {
      staffId: entry.staffId,
      staffName: entry.staffName,
      role,
      hoursWorked: (existing?.hoursWorked || 0) + entry.hoursWorked
    });
  }
  return Array.from(byStaff.values());
}
function calculateTipDistributions(type, totalTipsCents, rawEntries) {
  const total = Math.max(0, Math.round(totalTipsCents));
  const entries = aggregateEntries(rawEntries);
  if (!entries.length || !total) return [];
  if (type === "house_pool") {
    return allocateCents(total, entries, (entry) => entry.hoursWorked, (entry) => entry.staffId).map(({ entry, amount }) => ({ ...entry, amount }));
  }
  const groups = Array.from(
    entries.reduce((map, entry) => {
      map.set(entry.role, [...map.get(entry.role) || [], entry]);
      return map;
    }, /* @__PURE__ */ new Map())
  ).map(([role, roleEntries]) => ({
    role,
    entries: roleEntries,
    weight: TIP_ROLE_WEIGHTS[role] || 0
  })).filter((group) => group.weight > 0);
  const groupAllocations = allocateCents(
    total,
    groups,
    (group) => group.weight,
    (group) => group.role
  );
  return groupAllocations.flatMap(
    ({ entry: group, amount: groupAmount }) => allocateCents(
      groupAmount,
      group.entries,
      (entry) => entry.hoursWorked,
      (entry) => entry.staffId
    ).map(({ entry, amount }) => ({ ...entry, amount }))
  );
}
function assertTipConservation(totalTipsCents, distributions) {
  const distributed = distributions.reduce((sum, distribution) => sum + distribution.amount, 0);
  if (distributed !== Math.round(totalTipsCents)) {
    throw new Error(`Tip allocation must conserve every cent (${distributed} of ${totalTipsCents})`);
  }
}

// features/keystone/mutations/tipManagement.ts
function dollarsToCents(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}
function getBusinessDayWindow(date) {
  const start = new Date(date);
  if (Number.isNaN(start.getTime())) throw new Error("Business date is invalid");
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
function calculateHours(entry) {
  if (typeof entry.hoursWorked === "number") return entry.hoursWorked;
  if (!entry.clockIn || !entry.clockOut) return 0;
  const start = new Date(entry.clockIn);
  const end = new Date(entry.clockOut);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 36e5 * 100) / 100);
}
async function calculateDistributions({
  tipPoolType,
  totalTipsCents,
  startDate,
  endDate,
  context
}) {
  if (tipPoolType === "individual") return [];
  const entries = await context.sudo().query.Shift.findMany({
    where: {
      status: { equals: "completed" },
      clockIn: { gte: startDate, lte: endDate }
    },
    query: "id role hoursWorked clockIn clockOut staff { id name }"
  });
  const distributions = calculateTipDistributions(
    tipPoolType,
    totalTipsCents,
    entries.map((entry) => ({
      staffId: entry.staff?.id || "",
      staffName: entry.staff?.name || "",
      role: entry.role || "",
      hoursWorked: calculateHours(entry)
    }))
  );
  assertTipConservation(totalTipsCents, distributions);
  return distributions;
}
async function createTipPoolLedger(root, args, context) {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage tip pools" };
  }
  if (!["individual", "pool_by_role", "house_pool"].includes(args.tipPoolType)) {
    return { success: false, error: "Invalid tip pool type" };
  }
  try {
    const { start, end } = getBusinessDayWindow(args.date);
    const cashTips = dollarsToCents(args.cashTips);
    const creditTips = dollarsToCents(args.creditTips);
    const totalTips = cashTips + creditTips;
    if (totalTips <= 0) return { success: false, error: "Tip pool must include cash or credit tips" };
    const existing = await context.sudo().query.TipPool.findMany({
      where: {
        date: { gte: start.toISOString(), lte: end.toISOString() },
        tipPoolType: { equals: args.tipPoolType },
        status: { in: ["open", "calculated"] }
      },
      query: "id status tipPoolType",
      take: 1
    });
    if (existing.length > 0) {
      return { success: false, error: "An open or calculated tip pool already exists for this date and type" };
    }
    const distributions = await calculateDistributions({
      tipPoolType: args.tipPoolType,
      totalTipsCents: totalTips,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      context
    });
    if (args.tipPoolType !== "individual" && distributions.length === 0) {
      return { success: false, error: "No completed shifts found for this tip pool" };
    }
    const tipPool = await context.sudo().db.TipPool.createOne({
      data: {
        date: start.toISOString(),
        tipPoolType: args.tipPoolType,
        totalTips,
        cashTips,
        creditTips,
        distributions,
        status: "calculated",
        createdBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0
      }
    });
    await appendAuditEvent(context, {
      eventType: "tip_pool.calculated",
      entityType: "TipPool",
      entityId: tipPool.id,
      after: { totalTips, distributions }
    });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function updateTipPoolStatus(root, args, context) {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage tip pools" };
  }
  try {
    const tipPool = await context.sudo().query.TipPool.findOne({
      where: { id: args.tipPoolId },
      query: "id status"
    });
    if (!tipPool) return { success: false, error: "Tip pool not found" };
    if (args.action === "distribute") {
      if (tipPool.status !== "calculated") return { success: false, error: "Only calculated tip pools can be distributed" };
      await context.sudo().db.TipPool.updateOne({ where: { id: args.tipPoolId }, data: { status: "distributed" } });
      await appendAuditEvent(context, {
        eventType: "tip_pool.marked_distributed",
        entityType: "TipPool",
        entityId: args.tipPoolId,
        before: { status: tipPool.status },
        after: { status: "distributed" }
      });
    } else if (args.action === "reopen") {
      if (tipPool.status !== "distributed") return { success: false, error: "Only distributed tip pools can be reopened" };
      await context.sudo().db.TipPool.updateOne({ where: { id: args.tipPoolId }, data: { status: "calculated" } });
      await appendAuditEvent(context, {
        eventType: "tip_pool.reopened",
        entityType: "TipPool",
        entityId: args.tipPoolId,
        before: { status: tipPool.status },
        after: { status: "calculated" }
      });
    } else {
      return { success: false, error: "Invalid tip pool action" };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// features/keystone/mutations/wasteManagement.ts
function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Waste quantity must be greater than zero");
  }
  return Math.round(quantity * 100) / 100;
}
async function recordWaste(_root, args, context) {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, wasteLogId: null, error: "Not authorized to record inventory waste" };
  }
  try {
    const quantity = normalizeQuantity(args.quantity);
    if (!args.reason?.trim()) throw new Error("Waste reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma;
    const priorWaste = await prisma.wasteLog.findUnique({ where: { eventKey: args.idempotencyKey } });
    if (priorWaste && (priorWaste.ingredientId !== args.ingredientId || Number(priorWaste.quantity) !== quantity || priorWaste.reason !== args.reason.trim() || (priorWaste.notes || "") !== (args.notes || "").trim())) {
      throw new Error("Idempotency key was already used with a different waste request");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `record-waste:${args.idempotencyKey.trim()}`,
      requestPath: "recordWaste",
      requestParams: {
        ingredientId: args.ingredientId,
        quantity,
        reason: args.reason.trim(),
        notes: (args.notes || "").trim()
      }
    });
    const result2 = await prisma.$transaction(async (tx) => {
      const existing = await tx.wasteLog.findUnique({ where: { eventKey: args.idempotencyKey } });
      if (existing) {
        if (existing.ingredientId !== args.ingredientId || Number(existing.quantity) !== quantity || existing.reason !== args.reason.trim() || (existing.notes || "") !== (args.notes || "").trim()) {
          throw new Error("Idempotency key was already used with a different waste request");
        }
        return { wasteLog: existing, replay: true };
      }
      const ingredient = await tx.ingredient.findUnique({ where: { id: args.ingredientId } });
      if (!ingredient) throw new Error("Ingredient not found");
      const nextStock = Number(ingredient.currentStock || 0) - quantity;
      const wasteLog = await tx.wasteLog.create({
        data: {
          eventKey: args.idempotencyKey,
          ingredientId: args.ingredientId,
          quantity: quantity.toFixed(2),
          reason: args.reason.trim(),
          notes: (args.notes || "").trim(),
          loggedById: context.session?.itemId || null
        }
      });
      await tx.stockMovement.create({
        data: {
          eventKey: `waste:${wasteLog.id}`,
          referenceType: "WasteLog",
          referenceId: wasteLog.id,
          ingredientId: args.ingredientId,
          type: "waste",
          quantity: (-quantity).toFixed(2),
          reason: args.reason.trim(),
          createdById: context.session?.itemId || null
        }
      });
      await tx.ingredient.update({
        where: { id: args.ingredientId },
        data: { currentStock: nextStock.toFixed(2) }
      });
      return { wasteLog, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result2.replay) {
      await appendAuditEvent(context, {
        eventType: "inventory.waste_recorded",
        entityType: "WasteLog",
        entityId: result2.wasteLog.id,
        reason: args.reason,
        after: { ingredientId: args.ingredientId, quantity },
        metadata: { idempotencyKey: args.idempotencyKey }
      }).catch((error) => console.error("Waste audit event failed:", error));
    }
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      wasteLogId: result2.wasteLog.id
    }, 200);
    return { success: true, wasteLogId: result2.wasteLog.id, error: null };
  } catch (error) {
    return { success: false, wasteLogId: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function adjustInventory(_root, args, context) {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, wasteLogId: null, error: "Not authorized to adjust inventory" };
  }
  try {
    const quantity = Number(args.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) throw new Error("Adjustment quantity must be non-zero");
    if (!args.reason?.trim()) throw new Error("Adjustment reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma;
    const priorMovement = await prisma.stockMovement.findUnique({ where: { eventKey: args.idempotencyKey } });
    if (priorMovement && (priorMovement.ingredientId !== args.ingredientId || Number(priorMovement.quantity) !== quantity || priorMovement.reason !== args.reason.trim() || priorMovement.referenceType !== "ManualAdjustment")) {
      throw new Error("Idempotency key was already used with a different inventory adjustment");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `adjust-inventory:${args.idempotencyKey.trim()}`,
      requestPath: "adjustInventory",
      requestParams: {
        ingredientId: args.ingredientId,
        quantity,
        reason: args.reason.trim()
      }
    });
    const result2 = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockMovement.findUnique({ where: { eventKey: args.idempotencyKey } });
      if (existing) {
        if (existing.ingredientId !== args.ingredientId || Number(existing.quantity) !== quantity || existing.reason !== args.reason.trim() || existing.referenceType !== "ManualAdjustment") {
          throw new Error("Idempotency key was already used with a different inventory adjustment");
        }
        return { movement: existing, replay: true };
      }
      const ingredient = await tx.ingredient.findUnique({ where: { id: args.ingredientId } });
      if (!ingredient) throw new Error("Ingredient not found");
      const movement = await tx.stockMovement.create({
        data: {
          eventKey: args.idempotencyKey,
          referenceType: "ManualAdjustment",
          referenceId: args.ingredientId,
          ingredientId: args.ingredientId,
          type: "adjustment",
          quantity: quantity.toFixed(2),
          reason: args.reason.trim(),
          createdById: context.session?.itemId || null
        }
      });
      await tx.ingredient.update({
        where: { id: args.ingredientId },
        data: { currentStock: (Number(ingredient.currentStock || 0) + quantity).toFixed(2) }
      });
      return { movement, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result2.replay) {
      await appendAuditEvent(context, {
        eventType: "inventory.adjusted",
        entityType: "StockMovement",
        entityId: result2.movement.id,
        reason: args.reason,
        after: { ingredientId: args.ingredientId, quantity },
        metadata: { idempotencyKey: args.idempotencyKey }
      }).catch((error) => console.error("Inventory adjustment audit event failed:", error));
    }
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      stockMovementId: result2.movement.id,
      ingredientId: args.ingredientId
    }, 200);
    return { success: true, wasteLogId: null, error: null };
  } catch (error) {
    return { success: false, wasteLogId: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function reverseWaste(_root, args, context) {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, wasteLogId: null, error: "Not authorized to reverse inventory waste" };
  }
  try {
    if (!args.reason?.trim()) throw new Error("Reversal reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma;
    const priorMovement = await prisma.stockMovement.findUnique({ where: { eventKey: args.idempotencyKey } });
    if (priorMovement && (priorMovement.referenceId !== args.wasteLogId || priorMovement.referenceType !== "WasteLogReversal" || priorMovement.reason !== args.reason.trim())) {
      throw new Error("Idempotency key was already used with a different waste reversal");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `reverse-waste:${args.idempotencyKey.trim()}`,
      requestPath: "reverseWaste",
      requestParams: { wasteLogId: args.wasteLogId, reason: args.reason.trim() }
    });
    const result2 = await prisma.$transaction(async (tx) => {
      const waste = await tx.wasteLog.findUnique({ where: { id: args.wasteLogId } });
      if (!waste) throw new Error("Waste log not found");
      if (waste.reversedAt) return { waste, replay: true };
      const ingredient = await tx.ingredient.findUnique({ where: { id: waste.ingredientId } });
      if (!ingredient) throw new Error("Ingredient not found");
      const quantity = Number(waste.quantity || 0);
      await tx.stockMovement.create({
        data: {
          eventKey: args.idempotencyKey,
          referenceType: "WasteLogReversal",
          referenceId: waste.id,
          ingredientId: waste.ingredientId,
          type: "adjustment",
          quantity: quantity.toFixed(2),
          reason: args.reason.trim(),
          createdById: context.session?.itemId || null
        }
      });
      await tx.ingredient.update({
        where: { id: waste.ingredientId },
        data: { currentStock: (Number(ingredient.currentStock || 0) + quantity).toFixed(2) }
      });
      const updated = await tx.wasteLog.update({
        where: { id: waste.id },
        data: {
          reversedAt: /* @__PURE__ */ new Date(),
          reversedById: context.session?.itemId || null,
          reversalReason: args.reason.trim()
        }
      });
      return { waste: updated, replay: false };
    }, { isolationLevel: "Serializable" });
    if (!result2.replay) {
      await appendAuditEvent(context, {
        eventType: "inventory.waste_reversed",
        entityType: "WasteLog",
        entityId: result2.waste.id,
        reason: args.reason,
        metadata: { idempotencyKey: args.idempotencyKey }
      }).catch((error) => console.error("Waste reversal audit event failed:", error));
    }
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      wasteLogId: result2.waste.id
    }, 200);
    return { success: true, wasteLogId: result2.waste.id, error: null };
  } catch (error) {
    return { success: false, wasteLogId: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// features/keystone/mutations/reconcileOrderInventory.ts
async function reconcileOrderInventory(_root, { orderId }, context) {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, created: 0, error: "Not authorized to reconcile inventory" };
  }
  try {
    const result2 = await depleteInventoryForCompletedOrder(orderId, context);
    await appendAuditEvent(context, {
      eventType: "inventory.order_reconciled",
      entityType: "RestaurantOrder",
      entityId: orderId,
      after: result2
    }).catch((error) => console.error("Inventory reconciliation audit event failed:", error));
    return { success: true, created: result2.created, error: null };
  } catch (error) {
    return { success: false, created: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// features/keystone/mutations/transitionRestaurantOrder.ts
var TRANSITIONS = {
  open: ["sent_to_kitchen", "cancelled"],
  sent_to_kitchen: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: ["completed"],
  completed: [],
  cancelled: []
};
async function transitionRestaurantOrder(_root, { orderId, status, reason }, context) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Not authorized to transition orders");
  const order = await context.sudo().query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id status"
  });
  if (!order) throw new Error("Order not found");
  if (!(TRANSITIONS[order.status || ""] || []).includes(status)) {
    throw new Error(`Order cannot transition from ${order.status} to ${status}`);
  }
  if (status === "cancelled") {
    throw new Error("Use the approved void/cancellation workflow to cancel an order");
  }
  const updated = await context.sudo().query.RestaurantOrder.updateOne({
    where: { id: orderId },
    data: { status },
    query: "id status"
  });
  await appendAuditEvent(context, {
    eventType: "order.status_transitioned",
    entityType: "RestaurantOrder",
    entityId: orderId,
    reason: reason || "",
    before: { status: order.status },
    after: { status }
  }).catch((error) => console.error("Order transition audit event failed:", error));
  await syncKitchenTicketsForOrder(orderId, context);
  return updated;
}

// features/keystone/mutations/setGiftCardStatus.ts
async function setGiftCardStatus(_root, { giftCardId, isDisabled, reason }, context) {
  if (!permissions.canManageGiftCards({ session: context.session })) throw new Error("Not authorized to manage gift cards");
  const card = await context.sudo().query.GiftCard.findOne({ where: { id: giftCardId }, query: "id isDisabled" });
  if (!card) throw new Error("Gift card not found");
  const updated = await context.sudo().query.GiftCard.updateOne({
    where: { id: giftCardId },
    data: { isDisabled },
    query: "id isDisabled"
  });
  await appendAuditEvent(context, {
    eventType: "gift_card.status_changed",
    entityType: "GiftCard",
    entityId: giftCardId,
    reason: reason || "",
    before: { isDisabled: card.isDisabled },
    after: { isDisabled }
  }).catch((error) => console.error("Gift card status audit event failed:", error));
  return updated;
}

// features/keystone/mutations/managerApprovals.ts
var ACTIONS = /* @__PURE__ */ new Set([
  "void_item",
  "comp_item",
  "void_order",
  "refund_payment"
]);
function result(approval) {
  return {
    id: approval.id,
    status: approval.status,
    actionType: approval.actionType,
    targetId: approval.targetId,
    expiresAt: approval.expiresAt instanceof Date ? approval.expiresAt.toISOString() : String(approval.expiresAt),
    error: null
  };
}
async function requestManagerApproval2(_root, args, context) {
  try {
    if (!ACTIONS.has(args.actionType)) {
      throw new Error("Unsupported manager approval action");
    }
    return result(await requestManagerApproval(_root, {
      ...args,
      actionType: args.actionType
    }, context));
  } catch (error) {
    return { id: null, status: null, actionType: args.actionType, targetId: args.targetId, expiresAt: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
async function approveManagerApproval2(_root, args, context) {
  try {
    return result(await approveManagerApproval(_root, args, context));
  } catch (error) {
    return { id: args.approvalId, status: null, actionType: null, targetId: null, expiresAt: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// features/keystone/mutations/index.ts
var graphql16 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql16`
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
        redirectToInit: redirectToInit_default,
        getPaymentStatus: getPaymentStatus2,
        activeCart,
        activeCartPaymentProviders,
        getCustomerOrder,
        getCustomerOrders,
        lookupGiftCard
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        createActiveCart,
        addActiveCartItem,
        updateActiveCart,
        updateCartItemQuantity,
        removeCartItem,
        processPayment,
        setGiftCardStatus,
        redeemGiftCard,
        refundPayment: refundPayment2,
        requestManagerApproval: requestManagerApproval2,
        approveManagerApproval: approveManagerApproval2,
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
        handlePaymentProviderWebhook
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/index.ts
var import_iron = __toESM(require("@hapi/iron"));
var cookie2 = __toESM(require("cookie"));

// features/keystone/runtimeConfig.ts
var DEVELOPMENT_SESSION_SECRET = "openfront-restaurant-development-session-secret-change-me";
var DEVELOPMENT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/openfront_restaurant";
function requiredProductionEnv(name, value) {
  if (process.env.NODE_ENV === "production" && !value?.trim()) {
    throw new Error(`${name} is required in production`);
  }
  return value?.trim();
}
function getRuntimeConfig() {
  const production = process.env.NODE_ENV === "production";
  const databaseURL2 = requiredProductionEnv("DATABASE_URL", process.env.DATABASE_URL) || DEVELOPMENT_DATABASE_URL;
  const sessionSecret2 = requiredProductionEnv("SESSION_SECRET", process.env.SESSION_SECRET) || DEVELOPMENT_SESSION_SECRET;
  if (sessionSecret2.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long");
  }
  if (!databaseURL2.startsWith("postgresql://") && !databaseURL2.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must use PostgreSQL for this deployment");
  }
  const storage = {
    bucketName: requiredProductionEnv("S3_BUCKET_NAME", process.env.S3_BUCKET_NAME) || "keystone-test",
    region: requiredProductionEnv("S3_REGION", process.env.S3_REGION) || "ap-southeast-2",
    accessKeyId: requiredProductionEnv("S3_ACCESS_KEY_ID", process.env.S3_ACCESS_KEY_ID) || "keystone",
    secretAccessKey: requiredProductionEnv("S3_SECRET_ACCESS_KEY", process.env.S3_SECRET_ACCESS_KEY) || "keystone",
    endpoint: requiredProductionEnv("S3_ENDPOINT", process.env.S3_ENDPOINT) || "https://sfo3.digitaloceanspaces.com"
  };
  if (production && sessionSecret2 === DEVELOPMENT_SESSION_SECRET) {
    throw new Error("A development session secret cannot be used in production");
  }
  return { databaseURL: databaseURL2, sessionSecret: sessionSecret2, storage };
}

// features/keystone/index.ts
var runtimeConfig = getRuntimeConfig();
var { databaseURL, sessionSecret } = runtimeConfig;
var {
  bucketName,
  region,
  accessKeyId,
  secretAccessKey,
  endpoint
} = runtimeConfig.storage;
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  secret: sessionSecret
};
function statelessSessions({
  secret,
  maxAge = 60 * 60 * 24 * 360,
  path = "/",
  secure = process.env.NODE_ENV === "production",
  ironOptions = import_iron.default.defaults,
  domain,
  sameSite = "lax",
  cookieName = "keystonejs-session"
}) {
  if (!secret) {
    throw new Error("You must specify a session secret to use sessions");
  }
  if (secret.length < 32) {
    throw new Error("The session secret must be at least 32 characters long");
  }
  return {
    async get({ context }) {
      if (!context?.req) return;
      const authHeader = context.req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const accessToken = authHeader.replace("Bearer ", "");
        try {
          return await import_iron.default.unseal(accessToken, secret, ironOptions);
        } catch (err) {
        }
      }
      const cookies = cookie2.parse(context.req.headers.cookie || "");
      const token = cookies[cookieName];
      if (!token) return;
      try {
        return await import_iron.default.unseal(token, secret, ironOptions);
      } catch (err) {
      }
    },
    async end({ context }) {
      if (!context?.res) return;
      context.res.setHeader(
        "Set-Cookie",
        cookie2.serialize(cookieName, "", {
          maxAge: 0,
          expires: /* @__PURE__ */ new Date(),
          httpOnly: true,
          secure,
          path,
          sameSite,
          domain
        })
      );
    },
    async start({ context, data }) {
      if (!context?.res) return;
      const sealedData = await import_iron.default.seal(data, secret, {
        ...ironOptions,
        ttl: maxAge * 1e3
      });
      context.res.setHeader(
        "Set-Cookie",
        cookie2.serialize(cookieName, sealedData, {
          maxAge,
          expires: new Date(Date.now() + maxAge * 1e3),
          httpOnly: true,
          secure,
          path,
          sameSite,
          domain
        })
      );
      return sealedData;
    }
  };
}
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Admin",
          canAccessDashboard: true,
          canReadOrders: true,
          canManageOrders: true,
          canReadPayments: true,
          canManagePayments: true,
          canReadProducts: true,
          canManageProducts: true,
          canReadCart: true,
          canManageCart: true,
          canReadInventory: true,
          canManageInventory: true,
          canReadUsers: true,
          canManageUsers: true,
          canSeeOtherPeople: true,
          canEditOtherPeople: true,
          canManagePeople: true,
          canReadRoles: true,
          canManageRoles: true,
          canReadKitchen: true,
          canManageKitchen: true,
          canReadTables: true,
          canManageTables: true,
          canReadStaff: true,
          canManageStaff: true,
          canManageSettings: true,
          canManageOnboarding: true,
          canReadVendors: true,
          canManageVendors: true,
          canReadGiftCards: true,
          canManageGiftCards: true,
          canReadDiscounts: true,
          canManageDiscounts: true
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    id
    name
    email
    role {
      id
      name
      canAccessDashboard
      canReadOrders
      canManageOrders
      canReadPayments
      canManagePayments
      canReadProducts
      canManageProducts
      canReadCart
      canManageCart
      canReadInventory
      canManageInventory
      canReadUsers
      canManageUsers
      canSeeOtherPeople
      canEditOtherPeople
      canManagePeople
      canReadRoles
      canManageRoles
      canReadKitchen
      canManageKitchen
      canReadTables
      canManageTables
      canReadStaff
      canManageStaff
      canManageSettings
      canManageOnboarding
      canReadVendors
      canManageVendors
      canReadGiftCards
      canManageGiftCards
      canReadDiscounts
      canManageDiscounts
    }
  `
});
var keystone_default = withAuth(
  (0, import_core50.config)({
    db: {
      provider: "postgresql",
      url: databaseURL
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session }),
      basePath: "/dashboard"
    },
    session: statelessSessions(sessionConfig),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map

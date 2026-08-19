import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { extendGraphqlSchema } from "./mutations";
import { sendPasswordResetEmail } from "./lib/mail";
import { permissions } from "./access";
import Iron from "@hapi/iron";
import * as cookie from "cookie";
import { getRuntimeConfig } from "./runtimeConfig";

const runtimeConfig = getRuntimeConfig();
const { databaseURL, sessionSecret } = runtimeConfig;
const {
  bucketName,
  region,
  accessKeyId,
  secretAccessKey,
  endpoint,
} = runtimeConfig.storage;

const listKey = "User";

const sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  secret: sessionSecret,
};

export function statelessSessions({
  secret,
  maxAge = 60 * 60 * 24 * 360,
  path = "/",
  secure = process.env.NODE_ENV === "production",
  ironOptions = Iron.defaults,
  domain,
  sameSite = "lax" as const,
  cookieName = "keystonejs-session",
}: {
  secret: string;
  maxAge?: number;
  path?: string;
  secure?: boolean;
  ironOptions?: any;
  domain?: string;
  sameSite?: "lax" | "none" | "strict" | boolean;
  cookieName?: string;
}) {
  if (!secret) {
    throw new Error("You must specify a session secret to use sessions");
  }
  if (secret.length < 32) {
    throw new Error("The session secret must be at least 32 characters long");
  }

  return {
    async get({ context }: { context: any }) {
      if (!context?.req) return;
      
      // Check for OAuth Bearer token authentication
      const authHeader = context.req.headers.authorization;
      
      if (authHeader?.startsWith("Bearer ")) {
        const accessToken = authHeader.replace("Bearer ", "");
        
        // Try as regular session token
        try {
          return await Iron.unseal(accessToken, secret, ironOptions);
        } catch (err) {}
      }
      
      // Check for session cookie
      const cookies = cookie.parse(context.req.headers.cookie || "");
      const token = cookies[cookieName];
      if (!token) return;
      try {
        return await Iron.unseal(token, secret, ironOptions);
      } catch (err) {}
    },
    async end({ context }: { context: any }) {
      if (!context?.res) return;

      context.res.setHeader(
        "Set-Cookie",
        cookie.serialize(cookieName, "", {
          maxAge: 0,
          expires: new Date(),
          httpOnly: true,
          secure,
          path,
          sameSite,
          domain,
        })
      );
    },
    async start({ context, data }: { context: any; data: any }) {
      if (!context?.res) return;

      const sealedData = await Iron.seal(data, secret, {
        ...ironOptions,
        ttl: maxAge * 1000,
      });
      context.res.setHeader(
        "Set-Cookie",
        cookie.serialize(cookieName, sealedData, {
          maxAge,
          expires: new Date(Date.now() + maxAge * 1000),
          httpOnly: true,
          secure,
          path,
          sameSite,
          domain,
        })
      );

      return sealedData;
    },
  };
}

const { withAuth } = createAuth({
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
          canManageDiscounts: true,
        },
      },
    },
  },
  passwordResetLink: {
    async sendToken(args) {
      // send the email
      await sendPasswordResetEmail(args.token, args.identity);
    },
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
  `,
});

export default withAuth(
  config({
    db: {
      provider: "postgresql",
      url: databaseURL,
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
        signed: { expiry: 5000 },
        forcePathStyle: true,
      },
    },
    ui: {
      isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session }),
      basePath: "/dashboard",
    },
    session: statelessSessions(sessionConfig),
    graphql: {
      extendGraphqlSchema,
    },
  })
);

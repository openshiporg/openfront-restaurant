const DEVELOPMENT_SESSION_SECRET = "openfront-restaurant-development-session-secret-change-me";
const DEVELOPMENT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/openfront_restaurant";

function requiredProductionEnv(name: string, value: string | undefined) {
  if (process.env.NODE_ENV === "production" && !value?.trim()) {
    throw new Error(`${name} is required in production`);
  }
  return value?.trim();
}

export function getRuntimeConfig() {
  const production = process.env.NODE_ENV === "production";
  const databaseURL = requiredProductionEnv("DATABASE_URL", process.env.DATABASE_URL) || DEVELOPMENT_DATABASE_URL;
  const sessionSecret = requiredProductionEnv("SESSION_SECRET", process.env.SESSION_SECRET) || DEVELOPMENT_SESSION_SECRET;

  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long");
  }
  if (!databaseURL.startsWith("postgresql://") && !databaseURL.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must use PostgreSQL for this deployment");
  }

  const storage = {
    bucketName: requiredProductionEnv("S3_BUCKET_NAME", process.env.S3_BUCKET_NAME) || "keystone-test",
    region: requiredProductionEnv("S3_REGION", process.env.S3_REGION) || "ap-southeast-2",
    accessKeyId: requiredProductionEnv("S3_ACCESS_KEY_ID", process.env.S3_ACCESS_KEY_ID) || "keystone",
    secretAccessKey: requiredProductionEnv("S3_SECRET_ACCESS_KEY", process.env.S3_SECRET_ACCESS_KEY) || "keystone",
    endpoint: requiredProductionEnv("S3_ENDPOINT", process.env.S3_ENDPOINT) || "https://sfo3.digitaloceanspaces.com",
  };

  if (production && sessionSecret === DEVELOPMENT_SESSION_SECRET) {
    throw new Error("A development session secret cannot be used in production");
  }

  return { databaseURL, sessionSecret, storage };
}

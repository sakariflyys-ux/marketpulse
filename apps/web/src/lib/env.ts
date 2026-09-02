import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Everything except DATABASE_URL is optional so the
 * app boots with nothing but a database. Auth providers switch on/off based on
 * which pairs of variables are present (see src/auth.ts).
 */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Required at runtime, but not at build time (route metadata collection
  // imports modules without a database). @marketpulse/db throws a clear
  // error on first query if it is missing.
  DATABASE_URL: optionalString,

  AUTH_SECRET: optionalString,
  AUTH_URL: optionalString,
  AUTH_TRUST_HOST: optionalString,

  AUTH_GITHUB_ID: optionalString,
  AUTH_GITHUB_SECRET: optionalString,
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  AUTH_RESEND_KEY: optionalString,
  AUTH_EMAIL_FROM: optionalString,
  /** "true" enables /api/auth/dev-login outside production. */
  AUTH_DEV_LOGIN: optionalString,

  REDIS_URL: optionalString,
  DATA_SOURCE: z.enum(["mock", "shopify"]).default("mock"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Local dev sign-in without OAuth. Requires AUTH_DEV_LOGIN=true, and in a
 * production build additionally requires the request to come from localhost,
 * so a leaked flag on a deployed host still cannot enable it.
 */
export function isDevLoginEnabled(host?: string | null): boolean {
  if (env.AUTH_DEV_LOGIN !== "true") return false;
  if (env.NODE_ENV !== "production") return true;
  const hostname = (host ?? "").split(":")[0] ?? "";
  return LOCAL_HOSTS.has(hostname);
}

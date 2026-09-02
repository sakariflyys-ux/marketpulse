import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@synergilon/db";

import { env } from "@/lib/env";

/**
 * Each provider is enabled only when its full set of env vars is present.
 * With none configured, Auth.js still mounts (so /api/auth/* and `auth()`
 * work) but the login page renders a "no providers configured" state.
 */
function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
    providers.push(GitHub({ clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET }));
  }
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    providers.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
  }
  if (env.AUTH_RESEND_KEY && env.AUTH_EMAIL_FROM) {
    providers.push(Resend({ apiKey: env.AUTH_RESEND_KEY, from: env.AUTH_EMAIL_FROM }));
  }

  return providers;
}

const providers = buildProviders();

const DEV_SECRET = "synergilon-dev-secret-do-not-use-in-production";
if (!env.AUTH_SECRET && env.NODE_ENV !== "production") {
  console.warn("[auth] AUTH_SECRET is not set; using an insecure development secret.");
}

export type ProviderInfo = { id: string; name: string; type: "oauth" | "oidc" | "email" };

/** Serializable list for the login page (server component). */
export const enabledProviders: ProviderInfo[] = providers.map((p) => {
  const data = typeof p === "function" ? p() : p;
  return { id: data.id, name: data.name, type: data.type as ProviderInfo["type"] };
});

export const authConfig: NextAuthConfig = {
  // @auth/prisma-adapter types are written against @prisma/client's default
  // client; Prisma 7's generated client is structurally compatible.
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
  providers,
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  // Auth.js v5 requires a secret even with zero providers. In development we
  // fall back to a fixed dev secret so the app boots with an empty .env;
  // production must set AUTH_SECRET (Auth.js throws MissingSecret otherwise).
  secret: env.AUTH_SECRET ?? (env.NODE_ENV === "production" ? undefined : DEV_SECRET),
  trustHost: env.AUTH_TRUST_HOST === "true" || env.NODE_ENV !== "production",
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

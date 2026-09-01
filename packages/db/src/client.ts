import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Prisma 7 requires a driver adapter; we use node-postgres. The client is
// cached on globalThis so Next.js hot reloads don't leak connection pools.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const client = createClient();
    // In production each process holds exactly one client anyway; caching on
    // globalThis everywhere keeps the code path identical across envs.
    globalForPrisma.prisma = client;
  }
  return globalForPrisma.prisma;
}

/**
 * Lazily-initialised Prisma client. Nothing touches the database (or reads
 * DATABASE_URL) until the first property access, which lets `next build`
 * collect route metadata without a database and keeps import order irrelevant.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type { PrismaClient };

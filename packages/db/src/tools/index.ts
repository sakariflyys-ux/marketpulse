/**
 * Shared tool definitions used by BOTH the MCP server (packages/mcp-server)
 * and the /chat route (apps/web). Each tool is a plain object: a Zod input
 * schema plus an `execute` function over the repositories/services. The two
 * hosts only adapt these to their own SDKs, so the logic lives in one place.
 */
import { z } from "zod";
import { getRepositories } from "../repositories";
import { ensureFolderPath, saveItem, ServiceError } from "../services";

export type ToolContext = {
  /** Signed-in user (chat) or MCP_USER_ID (MCP). Required by save_to_folder. */
  userId?: string;
};

export type ToolDefinition<Schema extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  inputSchema: Schema;
  execute: (input: z.infer<Schema>, ctx: ToolContext) => Promise<unknown>;
};

function define<Schema extends z.ZodObject>(def: ToolDefinition<Schema>): ToolDefinition<Schema> {
  return def;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export const searchAds = define({
  name: "search_ads",
  description:
    "Full-text search over ad creatives (headline + body). Supports web-search syntax (quotes, -exclusions). Returns ads ranked by relevance, or by engagement when no query is given.",
  inputSchema: z.object({
    query: z.string().max(200).describe("Search terms, e.g. 'skincare free shipping'"),
    platform: z
      .enum(["META", "TIKTOK", "GOOGLE"])
      .optional()
      .describe("Restrict to one ad platform"),
    minEngagement: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Minimum engagement rate in percent"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  async execute({ query, platform, minEngagement, limit }) {
    const q = query.trim() || undefined;
    const page = await getRepositories().ads.list({
      q,
      platform,
      minEngagement,
      sort: q ? "relevance" : "engagement",
      order: "desc",
      limit,
    });
    return {
      count: page.data.length,
      ads: page.data.map((a) => ({
        id: a.id,
        platform: a.platform,
        headline: a.headline,
        bodyText: a.bodyText,
        cta: a.cta,
        engagementRate: a.engagementRate,
        spendEstimate: a.spendEstimate,
        impressions: a.impressions,
        targetAudience: a.targetAudience,
        store: { id: a.store.id, name: a.store.name, domain: a.store.shopifyDomain },
        creativeUrl: a.creativeUrl,
      })),
    };
  },
});

export const getTrendingStores = define({
  name: "get_trending_stores",
  description:
    "Stores ranked by revenue growth over the last 7 daily snapshots (falls back to absolute revenue for stores without history). Optionally filter by category.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(10),
    category: z.string().max(100).optional().describe("Exact category name, e.g. 'Skincare'"),
  }),
  async execute({ limit, category }) {
    const page = await getRepositories().stores.trending({ limit, category });
    return {
      count: page.data.length,
      stores: page.data.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.shopifyDomain,
        category: s.category,
        monthlyRevenue: s.monthlyRevenue,
        monthlyTraffic: s.monthlyTraffic,
        growth7d: s.growth === null ? null : Math.round(s.growth * 1000) / 10,
        techStack: s.techStack,
      })),
    };
  },
});

export const getStoreInsights = define({
  name: "get_store_insights",
  description:
    "Full insights for one store by its Shopify domain (e.g. 'reynolds-group.myshopify.com'): metrics, 30-day revenue history, tech stack, top product and recent ads.",
  inputSchema: z.object({
    domain: z.string().min(3).max(200).describe("Shopify domain, with or without https://"),
  }),
  async execute({ domain }) {
    const clean = domain
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    const store = await getRepositories().stores.getByDomain(clean);
    if (!store) throw new ToolError(`No store found for domain "${clean}"`);
    const first = store.snapshots[0];
    const last = store.snapshots[store.snapshots.length - 1];
    const growth30d =
      first && last && first.monthlyRevenue > 0
        ? Math.round(((last.monthlyRevenue - first.monthlyRevenue) / first.monthlyRevenue) * 1000) /
          10
        : null;
    return {
      id: store.id,
      name: store.name,
      domain: store.shopifyDomain,
      description: store.description,
      category: store.category,
      monthlyRevenue: store.monthlyRevenue,
      monthlyTraffic: store.monthlyTraffic,
      growth30d,
      techStack: store.techStack,
      topProduct: store.topProduct,
      lastScrapedAt: store.lastScrapedAt,
      revenueHistory: store.snapshots.map((s) => ({
        date: s.capturedAt.toISOString().slice(0, 10),
        monthlyRevenue: s.monthlyRevenue,
        monthlyTraffic: s.monthlyTraffic,
      })),
      adCount: store.adCount,
      recentAds: store.ads.map((a) => ({
        id: a.id,
        platform: a.platform,
        headline: a.headline,
        engagementRate: a.engagementRate,
        spendEstimate: a.spendEstimate,
      })),
    };
  },
});

export const saveToFolder = define({
  name: "save_to_folder",
  description:
    "Save a store or ad into a folder for the user. `folderPath` is slash-separated like 'Competitors/Skincare'; missing folders are created. Requires a user (userId argument, or the session / MCP_USER_ID).",
  inputSchema: z.object({
    itemType: z.enum(["STORE", "AD"]),
    itemId: z.string().min(1).describe("Store id or ad id from another tool's result"),
    folderPath: z.string().min(1).max(400).describe("e.g. 'Competitors/Skincare'"),
    userId: z.string().min(1).optional().describe("Overrides the default user"),
    notes: z.string().max(2000).optional(),
  }),
  async execute({ itemType, itemId, folderPath, userId, notes }, ctx) {
    const user = userId ?? ctx.userId;
    if (!user) {
      throw new ToolError("No user: pass userId, sign in (chat), or set MCP_USER_ID (MCP server)");
    }
    try {
      const folder = await ensureFolderPath(user, folderPath);
      const saved = await saveItem(user, { itemType, itemId, folderId: folder.id, notes });
      return { savedId: saved.id, folderId: folder.id, folderPath, itemType, itemId };
    } catch (err) {
      if (err instanceof ServiceError) throw new ToolError(err.message);
      throw err;
    }
  },
});

export const synergilonTools = [
  searchAds,
  getTrendingStores,
  getStoreInsights,
  saveToFolder,
] as const;

export type AnyToolDefinition = (typeof synergilonTools)[number];

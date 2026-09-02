import { APP_FINGERPRINTS, SHOPIFY_MARKERS } from "./fingerprints";

export type ParsedHtml = {
  isShopify: boolean;
  theme: string | null;
  apps: string[];
  currency: string | null;
  /** Raw <title> text (often an SEO tagline, not the brand). */
  title: string | null;
  description: string | null;
  /** og:site_name, when present. */
  siteName: string | null;
  /** name of an Organization/WebSite node in application/ld+json, when present. */
  ldName: string | null;
  /** The myshopify handle from `Shopify.shop`, when present. */
  shopHandle: string | null;
};

/**
 * Pure HTML analysis (no network) so it is unit-testable with fixtures.
 * Tolerates malformed markup: everything is regex over the raw text.
 */
export function parseStorefrontHtml(html: string): ParsedHtml {
  const text = typeof html === "string" ? html : "";
  const head = text.slice(0, 400_000);
  const isShopify = SHOPIFY_MARKERS.some((re) => re.test(head));

  // Shopify.theme = {"name":"Dawn","id":1,"schema_name":"Dawn","schema_version":"12.0.0", ...}
  let theme: string | null = null;
  // Capture up to the statement end; tolerate broken JSON by falling back to
  // a name regex on the captured chunk.
  const themeMatch = head.match(/Shopify\.theme\s*=\s*(\{[^;\n]*)/);
  if (themeMatch?.[1]) {
    const chunk = themeMatch[1];
    try {
      const parsed = JSON.parse(chunk.replace(/\s*;?\s*$/, "")) as {
        schema_name?: string;
        name?: string;
      };
      theme = (parsed.schema_name || parsed.name || "").trim() || null;
    } catch {
      const name =
        chunk.match(/"schema_name"\s*:\s*"([^"]+)"/) ?? chunk.match(/"name"\s*:\s*"([^"]+)"/);
      theme = name?.[1]?.trim() || null;
    }
  }

  let currency: string | null = null;
  const currencyMatch =
    head.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/) ??
    head.match(/property="og:price:currency"\s+content="([A-Z]{3})"/i) ??
    head.match(/"currency"\s*:\s*"([A-Z]{3})"/);
  if (currencyMatch?.[1]) currency = currencyMatch[1];

  const apps = APP_FINGERPRINTS.filter((f) => f.patterns.some((re) => re.test(head))).map(
    (f) => f.name,
  );

  const title = decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "") || null;
  const description =
    decode(
      head.match(
        /<meta\s+(?:name|property)="(?:description|og:description)"\s+content="([^"]*)"/i,
      )?.[1] ??
        head.match(
          /<meta\s+content="([^"]*)"\s+(?:name|property)="(?:description|og:description)"/i,
        )?.[1] ??
        "",
    ) || null;

  const siteName =
    decode(
      head.match(/<meta\s+property="og:site_name"\s+content="([^"]*)"/i)?.[1] ??
        head.match(/<meta\s+content="([^"]*)"\s+property="og:site_name"/i)?.[1] ??
        "",
    ) || null;

  const ldName = ldJsonName(head);

  const shopHandle =
    head.match(/Shopify\.shop\s*=\s*["']([a-z0-9-]+)\.myshopify\.com["']/i)?.[1] ?? null;

  return { isShopify, theme, apps, currency, title, description, siteName, ldName, shopHandle };
}

const NAMED_LD_TYPES = new Set([
  "organization",
  "website",
  "store",
  "onlinestore",
  "brand",
  "corporation",
  "localbusiness",
]);

/** First `name` of an Organization/WebSite-like node across all ld+json blocks. */
function ldJsonName(head: string): string | null {
  const blocks = [
    ...head.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]!.trim());
    } catch {
      continue;
    }
    const found = findNamedNode(parsed);
    if (found) return found;
  }
  return null;
}

function findNamedNode(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== "object" || depth > 4) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const n = findNamedNode(item, depth + 1);
      if (n) return n;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = (Array.isArray(type) ? type : [type])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.toLowerCase());
  if (
    types.some((t) => NAMED_LD_TYPES.has(t)) &&
    typeof obj["name"] === "string" &&
    obj["name"].trim()
  ) {
    return decode(obj["name"]);
  }
  for (const key of ["@graph", "publisher", "brand", "isPartOf"]) {
    const n = findNamedNode(obj[key], depth + 1);
    if (n) return n;
  }
  return null;
}

const TITLE_SEPARATOR = /\s*[|–—:]\s*|\s+-\s+/;
const MAX_TITLE_NAME = 30;

/**
 * Store display name, first non-empty of: og:site_name, ld+json name,
 * Shopify.shop handle (title-cased), <title> before its first separator if
 * short, the domain without TLD (title-cased). Never the raw SEO title.
 */
export function resolveStoreName(
  html: Pick<ParsedHtml, "siteName" | "ldName" | "shopHandle" | "title">,
  domain: string,
): string {
  if (html.siteName?.trim()) return html.siteName.trim();
  if (html.ldName?.trim()) return html.ldName.trim();
  if (html.shopHandle?.trim()) return titleCase(html.shopHandle.replace(/-/g, " "));
  const lead = html.title?.split(TITLE_SEPARATOR)[0]?.trim();
  if (lead && lead.length > 0 && lead.length < MAX_TITLE_NAME) return lead;
  const label = domain.replace(/^www\./, "").split(".")[0] ?? domain;
  return titleCase(label.replace(/[-_]+/g, " "));
}

export function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export type ProductsJson = {
  products?: {
    id?: number | string;
    title?: string;
    handle?: string;
    product_type?: string;
    tags?: string[] | string;
    images?: { src?: string }[];
    variants?: { price?: string | number; available?: boolean }[];
  }[];
};

export type ParsedProducts = {
  count: number;
  priceMin: number | null;
  priceMax: number | null;
  top: { name: string; price: number | null; imageUrl: string | null; handle: string | null }[];
  /** product_type values, most common first (kept for compatibility). */
  productTypes: string[];
  /** product_type values and tags with the number of products carrying each, most common first. */
  tagCounts: { value: string; count: number }[];
  /** First-variant price per product, for catalogue statistics. */
  prices: number[];
};

/** Extracts what we use from one or more /products.json pages. */
export function parseProducts(pages: ProductsJson[], topN = 5): ParsedProducts {
  const products = pages.flatMap((p) => (Array.isArray(p?.products) ? p.products : []));
  let priceMin: number | null = null;
  let priceMax: number | null = null;
  const types = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const prices: number[] = [];

  for (const product of products) {
    const type = typeof product.product_type === "string" ? product.product_type.trim() : "";
    if (type) {
      types.set(type, (types.get(type) ?? 0) + 1);
      tagCounts.set(type, (tagCounts.get(type) ?? 0) + 1);
    }
    const rawTags = Array.isArray(product.tags)
      ? product.tags
      : typeof product.tags === "string"
        ? product.tags.split(",")
        : [];
    for (const tag of new Set(rawTags.map((t) => String(t).trim()).filter(Boolean))) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const firstPrice = Number.parseFloat(String(product.variants?.[0]?.price ?? ""));
    if (Number.isFinite(firstPrice) && firstPrice >= 0) prices.push(firstPrice);
    for (const v of product.variants ?? []) {
      const price =
        typeof v.price === "number" ? v.price : Number.parseFloat(String(v.price ?? ""));
      if (!Number.isFinite(price) || price < 0) continue;
      priceMin = priceMin === null ? price : Math.min(priceMin, price);
      priceMax = priceMax === null ? price : Math.max(priceMax, price);
    }
  }

  // products.json is ordered by the storefront's default (most recently
  // created first); the first N stand in for "top by position".
  const top = products.slice(0, topN).map((p) => {
    const first = p.variants?.[0];
    const price = first ? Number.parseFloat(String(first.price ?? "")) : Number.NaN;
    return {
      name: typeof p.title === "string" ? p.title : "(untitled)",
      price: Number.isFinite(price) ? price : null,
      imageUrl: typeof p.images?.[0]?.src === "string" ? p.images[0].src : null,
      handle: typeof p.handle === "string" ? p.handle : null,
    };
  });

  return {
    count: products.length,
    priceMin,
    priceMax,
    top,
    productTypes: [...types.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
    tagCounts: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    prices,
  };
}

/**
 * Minimal robots.txt check: is `path` allowed for our user agent (falling
 * back to `*`)? Longest-match wins, Allow beats Disallow on ties, per RFC 9309.
 */
export function isAllowedByRobots(
  robotsTxt: string | null,
  path: string,
  userAgentToken: string,
): boolean {
  if (!robotsTxt) return true;
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ allow: key === "allow", path: value });
    }
  }
  const token = userAgentToken.toLowerCase();
  const group =
    groups.find((g) => g.agents.some((a) => a !== "*" && token.includes(a))) ??
    groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    if (!matchesRobotsPath(rule.path, path)) continue;
    if (
      !best ||
      rule.path.length > best.length ||
      (rule.path.length === best.length && rule.allow)
    ) {
      best = { allow: rule.allow, length: rule.path.length };
    }
  }
  return best ? best.allow : true;
}

function matchesRobotsPath(pattern: string, path: string): boolean {
  const escaped = pattern
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const anchored = escaped.endsWith("\\$") ? `^${escaped.slice(0, -2)}$` : `^${escaped}`;
  return new RegExp(anchored).test(path);
}

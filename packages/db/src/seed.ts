/**
 * Mock data seed.
 *
 *   SEED_SCALE=small (default) -> 100 stores, 500 ads
 *   SEED_SCALE=large           -> 10,000 stores, 50,000 ads
 *
 * Idempotent: truncates Store/StoreSnapshot/Ad and re-inserts. Uses createMany
 * in batches so the large scale finishes in seconds rather than minutes.
 * Faker is seeded so repeated runs produce the same dataset.
 */
import "./load-env";
import { faker } from "@faker-js/faker";
import { prisma } from "./client";
import type { AdPlatform, Prisma } from "../generated/prisma/client";

type Scale = "small" | "large";

const SCALES: Record<Scale, { stores: number; ads: number }> = {
  small: { stores: 100, ads: 500 },
  large: { stores: 10_000, ads: 50_000 },
};

const SNAPSHOT_DAYS = 30;
const BATCH_SIZE = 1_000;

const CATEGORIES = [
  "Skincare",
  "Beauty",
  "Apparel",
  "Footwear",
  "Jewelry",
  "Home & Garden",
  "Electronics",
  "Fitness",
  "Supplements",
  "Pets",
  "Food & Beverage",
  "Outdoors",
  "Kids & Baby",
  "Toys & Games",
];

const THEMES = ["Dawn", "Impulse", "Prestige", "Sense", "Refresh", "Craft", "Symmetry", "Motion"];
const APPS = [
  "Klaviyo",
  "Judge.me",
  "Recharge",
  "Gorgias",
  "Yotpo",
  "Loox",
  "PageFly",
  "Shopify Inbox",
  "ReConvert",
  "Bold Upsell",
  "Smile.io",
  "Privy",
];
const PLATFORMS: AdPlatform[] = ["META", "TIKTOK", "GOOGLE"];
const CTAS = ["Shop Now", "Learn More", "Get Offer", "Sign Up", "Buy Now", "Order Today"];
const HOOKS = [
  "up to 40% off",
  "free shipping",
  "limited drop",
  "new arrival",
  "as seen on TikTok",
  "bestseller",
];
const INTERESTS = [
  "wellness",
  "fashion",
  "fitness",
  "home decor",
  "gadgets",
  "parenting",
  "travel",
  "cooking",
  "sustainability",
  "gaming",
];
const COUNTRIES = ["US", "CA", "GB", "AU", "DE", "FR", "NL", "SE"];

type StoreRef = { id: string; monthlyRevenue: number | null; monthlyTraffic: number | null };

function pickScale(): Scale {
  const raw = (process.env["SEED_SCALE"] ?? "small").toLowerCase();
  if (raw === "small" || raw === "large") return raw;
  throw new Error(`SEED_SCALE must be "small" or "large", got "${raw}"`);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Heavy-tailed revenue: most stores are small, a few are large. */
function randomMonthlyRevenue(): number {
  const exp = faker.number.float({ min: 3.7, max: 6.3 }); // 10^3.7 ≈ 5k, 10^6.3 ≈ 2M
  return Math.round(Math.pow(10, exp));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

async function reset(): Promise<void> {
  // TRUNCATE ... CASCADE also clears StoreSnapshot and Ad via FK cascade.
  // SavedItem.itemId is a plain string (no FK) so saved references to seeded
  // rows will dangle after a reseed — acceptable for mock data.
  // Only seed rows are replaced; ingested live data (source <> 'mock') is untouched.
  await prisma.store.deleteMany({ where: { source: "mock" } });
  await prisma.ad.deleteMany({ where: { source: "mock" } });
}

async function seedStores(count: number): Promise<StoreRef[]> {
  const usedDomains = new Set<string>();
  const rows: Prisma.StoreCreateManyInput[] = [];

  for (let i = 0; i < count; i++) {
    const name = faker.company.name().replace(/[,.]/g, "");
    let domain = `${slugify(name)}.myshopify.com`;
    if (usedDomains.has(domain)) domain = `${slugify(name)}-${i}.myshopify.com`;
    usedDomains.add(domain);

    const monthlyRevenue = randomMonthlyRevenue();
    const aov = faker.number.float({ min: 25, max: 180 });
    const conversionRate = faker.number.float({ min: 0.01, max: 0.04 });
    const monthlyTraffic = Math.round(monthlyRevenue / aov / conversionRate);
    const productName = faker.commerce.productName();

    rows.push({
      shopifyDomain: domain,
      name,
      description: `${faker.company.catchPhrase()}. ${faker.lorem.sentences({ min: 1, max: 2 })}`,
      logo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
      category: faker.helpers.arrayElement(CATEGORIES),
      monthlyRevenue,
      monthlyTraffic,
      topProduct: {
        name: productName,
        price: round2(aov * faker.number.float({ min: 0.8, max: 1.4 })),
        imageUrl: `https://picsum.photos/seed/${slugify(productName)}/400/400`,
      },
      techStack: {
        theme: faker.helpers.arrayElement(THEMES),
        apps: faker.helpers.arrayElements(APPS, { min: 1, max: 5 }),
      },
      lastScrapedAt: faker.date.recent({ days: 3 }),
      source: "mock",
    });
  }

  const created: StoreRef[] = [];
  for (const batch of chunks(rows, BATCH_SIZE)) {
    const result = await prisma.store.createManyAndReturn({
      data: batch,
      select: { id: true, monthlyRevenue: true, monthlyTraffic: true },
    });
    created.push(...result);
  }
  return created;
}

async function seedSnapshots(stores: StoreRef[]): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rows: Prisma.StoreSnapshotCreateManyInput[] = [];

  for (const store of stores) {
    // Walk backwards from today's value. Each store gets a trend (growing,
    // flat, or declining) plus daily noise so growth rankings are meaningful.
    const dailyTrend = faker.number.float({ min: -0.012, max: 0.02 });
    // Seeded stores always carry measured values; the columns are nullable
    // only for live rows.
    if (store.monthlyRevenue === null || store.monthlyTraffic === null) continue;
    let revenue = store.monthlyRevenue;
    let traffic = store.monthlyTraffic;

    for (let d = 0; d < SNAPSHOT_DAYS; d++) {
      const capturedAt = new Date(today.getTime() - d * 24 * 60 * 60 * 1000);
      rows.push({
        storeId: store.id,
        monthlyRevenue: Math.round(revenue),
        monthlyTraffic: Math.round(traffic),
        source: "mock",
        capturedAt,
      });
      // Reverse the trend to reconstruct the previous day.
      const noise = faker.number.float({ min: -0.03, max: 0.03 });
      revenue = Math.max(500, revenue / (1 + dailyTrend + noise));
      traffic = Math.max(50, traffic / (1 + dailyTrend + noise * 0.8));
    }
  }

  let inserted = 0;
  for (const batch of chunks(rows, BATCH_SIZE * 5)) {
    const res = await prisma.storeSnapshot.createMany({ data: batch });
    inserted += res.count;
  }
  return inserted;
}

async function seedAds(storeIds: string[], count: number): Promise<number> {
  const rows: Prisma.AdCreateManyInput[] = [];

  for (let i = 0; i < count; i++) {
    const impressions = faker.number.int({ min: 2_000, max: 5_000_000 });
    const cpm = faker.number.float({ min: 4, max: 22 });
    const product = faker.commerce.productName();

    rows.push({
      platform: faker.helpers.arrayElement(PLATFORMS),
      creativeUrl: `https://picsum.photos/seed/ad-${i}/600/600`,
      headline: `${faker.commerce.productAdjective()} ${product} — ${faker.helpers.arrayElement(HOOKS)}`,
      bodyText: `${faker.company.buzzPhrase()}. ${faker.lorem.sentences({ min: 1, max: 3 })}`,
      cta: faker.helpers.arrayElement(CTAS),
      spendEstimate: round2((impressions / 1000) * cpm),
      impressions,
      engagementRate: round2(faker.number.float({ min: 0.3, max: 12 })),
      targetAudience: {
        ageRange: faker.helpers.arrayElement(["18-24", "25-34", "35-44", "45-54", "55+"]),
        gender: faker.helpers.arrayElement(["all", "female", "male"]),
        interests: faker.helpers.arrayElements(INTERESTS, { min: 1, max: 3 }),
        countries: faker.helpers.arrayElements(COUNTRIES, { min: 1, max: 3 }),
      },
      storeId: faker.helpers.arrayElement(storeIds),
      createdAt: faker.date.recent({ days: 90 }),
      source: "mock",
    });
  }

  let inserted = 0;
  for (const batch of chunks(rows, BATCH_SIZE)) {
    const res = await prisma.ad.createMany({ data: batch });
    inserted += res.count;
  }
  return inserted;
}

async function main(): Promise<void> {
  const scale = pickScale();
  const { stores: storeCount, ads: adCount } = SCALES[scale];
  faker.seed(42);

  const started = Date.now();
  console.log(
    `Seeding scale=${scale}: ${storeCount} stores, ${adCount} ads, ${SNAPSHOT_DAYS} snapshots/store`,
  );

  await reset();
  const stores = await seedStores(storeCount);
  console.log(`  stores:    ${stores.length}`);
  const snapshots = await seedSnapshots(stores);
  console.log(`  snapshots: ${snapshots}`);
  const ads = await seedAds(
    stores.map((s) => s.id),
    adCount,
  );
  console.log(`  ads:       ${ads}`);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

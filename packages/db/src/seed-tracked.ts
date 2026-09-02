/**
 * Seeds the ingestion work list with well-known DTC brands that run on
 * Shopify. STORE entities are public storefront domains; BRAND entities are
 * Meta Ad Library queries — a numeric page id when known, otherwise the brand
 * name used as search_terms — linked to the store domain so ingested ads
 * attach to the right store. Idempotent (upsert on kind + value).
 */
import "./load-env";
import { prisma } from "./client";

type Brand = { name: string; domain: string; metaPageId?: string };

const BRANDS: Brand[] = [
  { name: "Allbirds", domain: "allbirds.com" },
  { name: "Gymshark", domain: "gymshark.com" },
  { name: "Kylie Cosmetics", domain: "kyliecosmetics.com" },
  { name: "Fashion Nova", domain: "fashionnova.com" },
  { name: "ColourPop", domain: "colourpop.com" },
  { name: "Bombas", domain: "bombas.com" },
  { name: "Brooklinen", domain: "brooklinen.com" },
  { name: "Ruggable", domain: "ruggable.com" },
  { name: "Chubbies", domain: "chubbiesshorts.com" },
  { name: "MVMT", domain: "mvmt.com" },
  { name: "Rothy's", domain: "rothys.com" },
  { name: "Taylor Stitch", domain: "taylorstitch.com" },
  { name: "Beardbrand", domain: "beardbrand.com" },
  { name: "Death Wish Coffee", domain: "deathwishcoffee.com" },
  { name: "Hiut Denim", domain: "hiutdenim.co.uk" },
  { name: "Gymshark EU", domain: "eu.gymshark.com" },
  { name: "Jeffree Star Cosmetics", domain: "jeffreestarcosmetics.com" },
  { name: "Tentree", domain: "tentree.com" },
  { name: "Pura Vida Bracelets", domain: "puravidabracelets.com" },
  { name: "Steve Madden", domain: "stevemadden.com" },
  { name: "Skims", domain: "skims.com" },
  { name: "Glossier", domain: "glossier.com" },
  { name: "Peloton Apparel", domain: "apparel.onepeloton.com" },
  { name: "Represent", domain: "representclo.com" },
  { name: "Oatly Shop", domain: "shop.oatly.com" },
  { name: "Finnish Design Shop", domain: "finnishdesignshop.com" },
  { name: "Makia", domain: "makiaclothing.com" },
];

async function main(): Promise<void> {
  let stores = 0;
  let brands = 0;
  for (const brand of BRANDS) {
    await prisma.trackedEntity.upsert({
      where: { kind_value: { kind: "STORE", value: brand.domain } },
      update: { label: brand.name },
      create: { kind: "STORE", value: brand.domain, label: brand.name },
    });
    stores++;
    const value = brand.metaPageId ?? brand.name;
    await prisma.trackedEntity.upsert({
      where: { kind_value: { kind: "BRAND", value } },
      update: { label: brand.name, linkedDomain: brand.domain },
      create: { kind: "BRAND", value, label: brand.name, linkedDomain: brand.domain },
    });
    brands++;
  }
  console.log(`Tracked entities: ${stores} stores, ${brands} brands (idempotent)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStorefrontHtml, resolveStoreName } from "./parse";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/names/${name}.html`, import.meta.url), "utf8");

/** The six domains whose SEO titles leaked into the store name in Phase 7, plus edge cases. */
const CASES: { domain: string; fixture: string; expected: string; via: string }[] = [
  {
    domain: "taylorstitch.com",
    fixture: "taylorstitch",
    expected: "Taylor Stitch",
    via: "og:site_name",
  },
  {
    domain: "representclo.com",
    fixture: "representclo",
    expected: "REPRESENT",
    via: "ld+json Organization",
  },
  {
    domain: "deathwishcoffee.com",
    fixture: "deathwishcoffee",
    expected: "Death Wish Coffee Company",
    via: "ld+json WebSite in @graph",
  },
  {
    domain: "brooklinen.com",
    fixture: "brooklinen",
    expected: "Brooklinen",
    via: "Shopify.shop handle",
  },
  {
    domain: "apparel.onepeloton.com",
    fixture: "apparel.onepeloton",
    expected: "Peloton Apparel",
    via: "short <title>",
  },
  {
    domain: "jeffreestarcosmetics.com",
    fixture: "jeffreestarcosmetics",
    expected: "Jeffree Star Cosmetics",
    via: "og:site_name",
  },
  {
    domain: "some-brand-shop.co.uk",
    fixture: "no-hints",
    expected: "Some Brand Shop",
    via: "domain fallback",
  },
];

describe("resolveStoreName", () => {
  for (const c of CASES) {
    it(`${c.domain} → "${c.expected}" (${c.via})`, () => {
      const html = parseStorefrontHtml(fixture(c.fixture));
      expect(html.isShopify).toBe(true);
      expect(resolveStoreName(html, c.domain)).toBe(c.expected);
      // The raw title is preserved separately for context.
      expect(html.title).not.toBeNull();
    });
  }

  it("never returns the SEO title when a separator-split lead is too long", () => {
    const html = parseStorefrontHtml(fixture("no-hints"));
    expect(html.title!.length).toBeGreaterThan(30);
    expect(resolveStoreName(html, "example.com")).toBe("Example");
  });

  it("prefers og:site_name over ld+json and title", () => {
    const html = parseStorefrontHtml(
      '<html><head><title>SEO Title | X</title><meta property="og:site_name" content="Site Name"><script type="application/ld+json">{"@type":"Organization","name":"LD Name"}</script><script src="https://cdn.shopify.com/a.js"></script></head></html>',
    );
    expect(resolveStoreName(html, "x.com")).toBe("Site Name");
    expect(html.ldName).toBe("LD Name");
  });
});

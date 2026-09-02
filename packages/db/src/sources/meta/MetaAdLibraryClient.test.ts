import { describe, expect, it, vi } from "vitest";
import {
  MetaAdLibraryClient,
  MetaCredentialError,
  MetaRateLimitError,
} from "./MetaAdLibraryClient";
import type { AdArchivePage } from "./types";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeClient(
  responses: (() => Response)[],
  overrides: Partial<ConstructorParameters<typeof MetaAdLibraryClient>[0]> = {},
) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next();
  });
  const sleep = vi.fn(async (_ms: number) => undefined);
  const client = new MetaAdLibraryClient({
    accessToken: "TOKEN",
    fetch: fetchMock as unknown as typeof fetch,
    sleep,
    random: () => 0.5,
    baseDelayMs: 10,
    ...overrides,
  });
  return { client, calls, sleep };
}

describe("MetaAdLibraryClient", () => {
  it("builds the ads_archive URL with the documented parameter names", () => {
    const { client } = makeClient([]);
    const url = new URL(
      client.buildUrl({
        searchPageIds: ["1", "2"],
        countries: ["FI", "SE"],
        limit: 25,
        adDeliveryDateMin: "2026-01-01",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v26.0/ads_archive");
    expect(url.searchParams.get("access_token")).toBe("TOKEN");
    expect(url.searchParams.get("ad_reached_countries")).toBe('["FI","SE"]');
    expect(url.searchParams.get("search_page_ids")).toBe("1,2");
    expect(url.searchParams.get("ad_active_status")).toBe("ALL");
    expect(url.searchParams.get("ad_type")).toBe("ALL");
    expect(url.searchParams.get("ad_delivery_date_min")).toBe("2026-01-01");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("fields")).toContain("eu_total_reach");
    expect(url.searchParams.get("fields")).toContain("ad_snapshot_url");
  });

  it("throws a typed credential error when no token is configured", () => {
    const { client } = makeClient([], { accessToken: undefined });
    expect(client.configured).toBe(false);
    expect(() => client.buildUrl({ searchTerms: "x", countries: ["FI"] })).toThrow(
      MetaCredentialError,
    );
  });

  it("requires search terms or page ids and at least one country", () => {
    const { client } = makeClient([]);
    expect(() => client.buildUrl({ countries: ["FI"] })).toThrow(/search_page_ids or search_terms/);
    expect(() => client.buildUrl({ searchTerms: "x", countries: [] })).toThrow(
      /ad_reached_countries/,
    );
  });

  it("follows the after cursor across pages", async () => {
    const page1: AdArchivePage = {
      data: [{ id: "1" }, { id: "2" }],
      paging: { cursors: { after: "CUR2" } },
    };
    const page2: AdArchivePage = { data: [{ id: "3" }], paging: {} };
    const { client, calls } = makeClient([() => jsonResponse(page1), () => jsonResponse(page2)]);
    const pages: string[][] = [];
    for await (const items of client.iterate({ searchTerms: "linen", countries: ["FI"] })) {
      pages.push(items.map((i) => i.id!));
    }
    expect(pages).toEqual([["1", "2"], ["3"]]);
    expect(new URL(calls[1]!).searchParams.get("after")).toBe("CUR2");
  });

  it("backs off with jitter on 429 and Graph rate-limit codes, then succeeds", async () => {
    const { client, sleep } = makeClient([
      () => jsonResponse({ error: { code: 4, message: "Application request limit reached" } }, 400),
      () => jsonResponse({}, 429, { "retry-after": "2" }),
      () => jsonResponse({ data: [{ id: "ok" }] }),
    ]);
    const result = await client.search({ searchTerms: "x", countries: ["DE"] });
    expect(result.items).toEqual([{ id: "ok" }]);
    expect(sleep).toHaveBeenCalledTimes(2);
    // First delay is jittered exponential backoff (random 0.5 × 10ms), second honours Retry-After.
    expect(sleep.mock.calls[0]![0]).toBe(5);
    expect(sleep.mock.calls[1]![0]).toBe(2000);
  });

  it("gives up with a rate-limit error after max retries", async () => {
    const limited = () =>
      jsonResponse(
        { error: { code: 613, message: "Calls to this api have exceeded the rate limit." } },
        400,
      );
    const { client } = makeClient([limited, limited, limited], { maxRetries: 2 });
    await expect(client.search({ searchTerms: "x", countries: ["DE"] })).rejects.toBeInstanceOf(
      MetaRateLimitError,
    );
  });

  it("surfaces an invalid or expired token as a credential error, not an empty page", async () => {
    const { client } = makeClient([
      () =>
        jsonResponse(
          {
            error: { code: 190, type: "OAuthException", message: "Error validating access token" },
          },
          400,
        ),
    ]);
    await expect(client.search({ searchTerms: "x", countries: ["DE"] })).rejects.toThrow(
      MetaCredentialError,
    );
  });
});

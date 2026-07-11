import { describe, expect, it } from "vitest";
import { EMPTY_FEED_DEFAULTS, normalizeFeedEditorialDefaults, routeReady } from "@/lib/feed-routing";

describe("feed routing readiness", () => {
  it("fills array defaults for legacy feeds", () => {
    expect(normalizeFeedEditorialDefaults({})).toEqual(EMPTY_FEED_DEFAULTS);
    expect(normalizeFeedEditorialDefaults({ defaultTags: ["Tech", " Tech ", null] })).toMatchObject({
      defaultTags: ["Tech"],
      defaultCategories: [],
      defaultTopicTags: [],
    });
  });

  it("accepts a connected generic CMS route", () => {
    expect(routeReady({ siteId: "site", integrationId: "integration", editorialDefaults: { ...EMPTY_FEED_DEFAULTS } }, { id: "integration", config: {}, status: "connected" } as never)).toBe(true);
  });

  it("requires Ortak Alan author and editorial owner defaults", () => {
    const value = { siteId: "site", integrationId: "integration", editorialDefaults: { ...EMPTY_FEED_DEFAULTS, profile: "ortak_alan_news" as const, contentType: "Haber" } };
    expect(routeReady(value, { id: "integration", config: { profile: "ortak_alan_news" }, status: "connected" } as never)).toBe(false);
    expect(routeReady(value, { id: "integration", config: { profile: "ortak_alan_news", defaultAuthor: { id: "author" }, editorialOwner: "Ortak Alan" }, status: "connected" } as never)).toBe(true);
  });
});

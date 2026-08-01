import { describe, expect, it } from "vitest";
import { normalizeFeedEditorialDefaults } from "./feed-routing";

describe("feed editorial tag limits", () => {
  it("keeps generic and Ortak Alan defaults within their publishing limits", () => {
    const tags = Array.from({ length: 10 }, (_, index) => `Tag ${index + 1}`);

    expect(normalizeFeedEditorialDefaults({ defaultTags: tags }).defaultTags).toHaveLength(8);
    expect(normalizeFeedEditorialDefaults({ defaultTopicTags: tags }).defaultTopicTags).toHaveLength(7);
  });
});

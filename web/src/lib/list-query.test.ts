import { describe, expect, it } from "vitest";
import { jobListPath, postListPath } from "./list-query";

describe("bounded list paths", () => {
  it("serializes posts filters and stable sorting", () => {
    expect(postListPath({ page: 2, limit: 50, search: " launch ", status: "draft", sourceType: "rss", modelId: "all", personaId: "none", campaignId: "all", sort: "title", direction: "asc" }))
      .toBe("/library/content?page=2&limit=50&sort=title&direction=asc&search=launch&status=draft&sourceType=rss&personaId=none");
  });

  it("omits inactive job filters", () => {
    expect(jobListPath({ page: 1, limit: 25, search: "", status: "all" })).toBe("/runs?page=1&limit=25");
  });
});

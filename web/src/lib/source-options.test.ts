import { describe, expect, it } from "vitest";
import { filterTypesForPlatform } from "./source-options";

describe("filterTypesForPlatform", () => {
  it("only shows score filters for sources that expose scores", () => {
    expect(filterTypesForPlatform("rss").map((item) => item.id)).toEqual(["none"]);
    expect(filterTypesForPlatform("youtube").map((item) => item.id)).toEqual(["none"]);
    expect(filterTypesForPlatform("reddit").map((item) => item.id)).toEqual(["none", "score", "threshold"]);
    expect(filterTypesForPlatform("hackernews").map((item) => item.id)).toEqual(["none", "score", "threshold"]);
    expect(filterTypesForPlatform("github").map((item) => item.id)).toEqual(["none", "score", "threshold"]);
  });

  it("keeps legacy posts_per_day filters editable without offering them on new feeds", () => {
    expect(filterTypesForPlatform("reddit", "posts_per_day").map((item) => item.id)).toContain("posts_per_day");
  });
});

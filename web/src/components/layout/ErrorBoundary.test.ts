import { describe, expect, it } from "vitest";
import { cacheBustUrl, isChunkLoadError } from "./ErrorBoundary";

describe("ErrorBoundary chunk recovery", () => {
  it("detects stale dynamic import chunks", () => {
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /assets/Settings-old.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Plain render error"))).toBe(false);
  });

  it("adds a cache-busting reload param", () => {
    expect(cacheBustUrl("https://blogfactory.io/settings?tab=models", 123)).toBe("https://blogfactory.io/settings?tab=models&__bf_reload=123");
  });
});

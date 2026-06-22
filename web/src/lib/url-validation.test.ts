import { describe, expect, it } from "vitest";
import { normalizeHttpUrl, stripHttpProtocol, validateSourceUrl } from "./url-validation";

describe("url helpers", () => {
  it("normalizes missing HTTP protocol", () => {
    expect(normalizeHttpUrl("example.com/feed.xml")).toBe("https://example.com/feed.xml");
    expect(normalizeHttpUrl(" http://example.com ")).toBe("http://example.com");
  });

  it("strips only HTTP protocol for prefixed inputs", () => {
    expect(stripHttpProtocol("https://www.example.com/blog")).toBe("www.example.com/blog");
    expect(stripHttpProtocol("example.com")).toBe("example.com");
    expect(stripHttpProtocol("https://")).toBe("https://");
  });

  it("validates common pasted source URLs", () => {
    expect(validateSourceUrl("example.com/feed.xml").valid).toBe(true);
    expect(validateSourceUrl("https://example.com/feed.xml").valid).toBe(true);
  });
});

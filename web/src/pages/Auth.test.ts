import { describe, expect, it } from "vitest";
import { authReturnTo } from "./Auth";

describe("authReturnTo", () => {
  it("keeps internal OAuth paths and rejects external redirects", () => {
    expect(authReturnTo({ returnTo: "/mcp/oauth?external_auth_id=ext_auth_123" }))
      .toBe("/mcp/oauth?external_auth_id=ext_auth_123");
    expect(authReturnTo(null, "/mcp/oauth?external_auth_id=ext_auth_456"))
      .toBe("/mcp/oauth?external_auth_id=ext_auth_456");
    expect(authReturnTo({ returnTo: "//evil.example/steal" })).toBe("/");
    expect(authReturnTo({ returnTo: "https://evil.example/steal" })).toBe("/");
    expect(authReturnTo(null, "https://evil.example/steal")).toBe("/");
    expect(authReturnTo(null)).toBe("/");
  });
});

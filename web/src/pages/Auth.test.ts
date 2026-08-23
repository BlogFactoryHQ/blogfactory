import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Auth, { authReturnTo } from "./Auth";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ login: vi.fn(), devLogin: vi.fn() }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("authReturnTo", () => {
  it("keeps internal OAuth paths and rejects external redirects", () => {
    expect(authReturnTo({ returnTo: "/mcp/oauth?external_auth_id=ext_auth_123" }))
      .toBe("/mcp/oauth?external_auth_id=ext_auth_123");
    expect(authReturnTo(null, "/mcp/oauth?external_auth_id=ext_auth_456"))
      .toBe("/mcp/oauth?external_auth_id=ext_auth_456");
    expect(authReturnTo({ returnTo: "//evil.example/steal" })).toBe("/");
    expect(authReturnTo({ returnTo: "/\\evil.example/steal" })).toBe("/");
    expect(authReturnTo({ returnTo: "https://evil.example/steal" })).toBe("/");
    expect(authReturnTo(null, "https://evil.example/steal")).toBe("/");
    expect(authReturnTo(null)).toBe("/");
  });

  it("renders login without public signup controls", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(MemoryRouter, {
        future: { v7_startTransition: true, v7_relativeSplatPath: true },
      }, createElement(Auth)));
    });

    expect(container).toHaveTextContent("Sign in");
    expect(container).not.toHaveTextContent("Sign up");
    expect(container).not.toHaveTextContent("Create account");
    expect(container).not.toHaveTextContent("Forgot password");
    await act(async () => root.unmount());
  });
});

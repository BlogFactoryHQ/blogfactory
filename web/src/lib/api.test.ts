import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  authRedirectHref,
  prepareImagePrompts,
  pushCmsDrafts,
  retryTransientApiError,
  shouldRedirectAfterUnauthorized,
} from "./api";

beforeEach(() => {
  api.setToken(null);
  vi.restoreAllMocks();
});

describe("ApiClient errors", () => {
  it("preserves machine-readable error details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "Invalid status",
      code: "validation_error",
      message: "Invalid status",
      details: [{ field: "status", message: "Expected draft or published" }],
    }), { status: 400, headers: { "content-type": "application/json" } }));

    const error = await api.post("/posts/1", {}).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "validation_error", message: "Invalid status" });
    expect((error as ApiError).details).toEqual([{ field: "status", message: "Expected draft or published" }]);
  });

  it("falls back for legacy and non-JSON errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: "Legacy failure" }), { status: 409 }));
    await expect(api.get("/legacy")).rejects.toMatchObject({ status: 409, code: "http_409", message: "Legacy failure" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    await expect(api.get("/html")).rejects.toMatchObject({ status: 502, code: "http_502", message: "Request failed: 502" });
  });

  it("includes server validation errors in the visible message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: "SEO metadata is invalid", errors: ["Meta description must end with a complete sentence."] }), { status: 400 }));
    await expect(api.put("/posts/1/seo", {})).rejects.toThrow(/complete sentence/i);
  });
});

describe("ApiClient collection responses", () => {
  it("normalizes missing legacy collections instead of exposing a crash-prone shape", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(null), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "enveloped" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "one" }]), { status: 200 }));

    await expect(api.getArray("/missing")).resolves.toEqual([]);
    await expect(api.getArray("/legacy-envelope")).resolves.toEqual([{ id: "enveloped" }]);
    await expect(api.getArray("/items")).resolves.toEqual([{ id: "one" }]);
  });
});

it("does not retry permanent API errors", () => {
  expect(retryTransientApiError(0, new ApiError("Missing key", 400, "missing_key"))).toBe(false);
  expect(retryTransientApiError(0, new ApiError("Unavailable", 503, "unavailable"))).toBe(true);
});

it("preserves an OAuth return path when authentication expires", () => {
  expect(authRedirectHref("/mcp/oauth", "?external_auth_id=ext_auth_123"))
    .toBe("/auth?returnTo=%2Fmcp%2Foauth%3Fexternal_auth_id%3Dext_auth_123");
  expect(authRedirectHref("/auth", "?returnTo=%2Fmcp%2Foauth")).toBe("/auth?returnTo=%2Fmcp%2Foauth");
  expect(shouldRedirectAfterUnauthorized("/auth/login")).toBe(false);
  expect(shouldRedirectAfterUnauthorized("/mcp/oauth/complete")).toBe(true);
});

it("continues a CMS draft batch after an individual post fails", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ total: 3, failures: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Ghost rejected the image" }), { status: 502 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
  const progress: number[] = [];

  const result = await pushCmsDrafts([
    { id: "one", title: "First" },
    { id: "two", title: "Second" },
    { id: "three", title: "Third" },
  ], "ghost", ({ completed }) => progress.push(completed));

  expect(result).toEqual({
    total: 3,
    failures: [{ id: "two", title: "Second", error: "Ghost rejected the image" }],
  });
  expect(progress).toEqual([0, 1, 2, 3]);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("does not start a CMS draft batch when preflight fails", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: "Duplicate SEO slug" }), { status: 409 }));

  await expect(pushCmsDrafts([{ id: "one", title: "First" }], "ghost")).rejects.toThrow("Duplicate SEO slug");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("prepares image prompts for every selected post and retains failures", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ created: 2, existing: 0 }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Missing image settings" }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ created: 0, existing: 2 }), { status: 200 }));

  await expect(prepareImagePrompts([
    { id: "one", title: "First" },
    { id: "two", title: "Second" },
    { id: "three", title: "Third" },
  ])).resolves.toEqual({
    total: 3,
    created: 2,
    existing: 2,
    failures: [{ id: "two", title: "Second", error: "Missing image settings" }],
  });
  expect(fetch).toHaveBeenCalledTimes(3);
});

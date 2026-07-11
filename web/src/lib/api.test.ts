import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

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
});

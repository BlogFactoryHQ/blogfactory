import { describe, expect, it } from "vitest";
import { asArray, asRecord, asStringArray } from "./api-shape";

describe("API shape normalization", () => {
  it("turns missing or malformed collections into empty arrays", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray({ items: [] })).toEqual([]);
    expect(asArray([1, 2])).toEqual([1, 2]);
  });

  it("keeps only normalized string values", () => {
    expect(asStringArray([" Tech ", null, "", "Tech", 4, "News"])).toEqual(["Tech", "News"]);
  });

  it("rejects arrays and primitives as records", () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord([])).toEqual({});
    expect(asRecord({ ok: true })).toEqual({ ok: true });
  });
});

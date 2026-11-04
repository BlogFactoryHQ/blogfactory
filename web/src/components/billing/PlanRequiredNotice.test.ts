import { describe, expect, it } from "vitest";
import { transitionDaysRemaining, type BillingState } from "@/lib/billing";

const state = {
  entitlement_source: "transition",
  period_end: "2026-11-14T00:00:00.000Z",
} as BillingState;

describe("transitionDaysRemaining", () => {
  it("counts down and never reports negative days", () => {
    expect(transitionDaysRemaining(state, Date.parse("2026-11-01T00:00:00.000Z"))).toBe(13);
    expect(transitionDaysRemaining(state, Date.parse("2026-11-15T00:00:00.000Z"))).toBe(0);
    expect(transitionDaysRemaining({ ...state, entitlement_source: "polar" })).toBeNull();
  });
});

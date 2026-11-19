import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilitySummary, evaluateCapabilities, nextUnlock, type RequirementState } from "./capabilities";

const none: RequirementState = { openrouter: false, openai: false, cms: false, search_console: false, mcp: false, serp: false, volume: false };

describe("capabilities", () => {
  it("keeps free features ready with nothing configured, but flags the upgrade", () => {
    const results = evaluateCapabilities(none);
    expect(results.find((r) => r.def.id === "questions")).toMatchObject({ status: "limited", missing: [], upgrades: ["volume"] });
    expect(results.find((r) => r.def.id === "quality")?.status).toBe("ready");
  });

  it("blocks a feature until every requirement is present", () => {
    const blocked = evaluateCapabilities(none).find((r) => r.def.id === "draft");
    expect(blocked).toMatchObject({ status: "blocked", missing: ["openrouter"] });
    const ready = evaluateCapabilities({ ...none, openrouter: true }).find((r) => r.def.id === "draft");
    expect(ready?.status).toBe("ready");
  });

  it("summarises every feature exactly once", () => {
    const summary = capabilitySummary(evaluateCapabilities(none));
    expect(summary.ready + summary.limited + summary.blocked).toBe(CAPABILITIES.length);
  });

  it("suggests the requirement that unlocks the most, first one on a tie", () => {
    expect(nextUnlock(evaluateCapabilities(none))).toEqual({ id: "serp", unlocks: 2 });
    expect(nextUnlock(evaluateCapabilities({ ...none, serp: true }))).toEqual({ id: "openrouter", unlocks: 2 });
    expect(nextUnlock(evaluateCapabilities({ ...none, openrouter: true, serp: true, cms: true, search_console: true, mcp: true }))).toBeNull();
  });
});

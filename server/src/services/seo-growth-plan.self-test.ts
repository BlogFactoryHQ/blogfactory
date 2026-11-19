import assert from "node:assert/strict";
import { nextOpenPlanDate, planDates, seoActionType, validPlanDate } from "./seo-growth-plan.js";

assert.equal(seoActionType(["needs_attention", "low_ctr"]), "refresh");
assert.equal(seoActionType(["low_ctr"]), "snippet_test");
assert.equal(seoActionType(["almost_ranking"]), "internal_link");
assert.deepEqual(planDates(3, new Date("2026-08-23T12:00:00Z")), ["2026-08-23", "2026-08-25", "2026-08-27"]);
assert.equal(validPlanDate("2026-08-23"), true);
assert.equal(validPlanDate("23-08-2026"), false);
assert.equal(nextOpenPlanDate(["2026-08-23", "2026-08-25"], new Date("2026-08-23T12:00:00Z")), "2026-08-24");

console.log("seo growth plan self-check passed");

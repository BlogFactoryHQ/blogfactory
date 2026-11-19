import assert from "node:assert/strict";
import { MAX_ADMIN_CREDITS, SITE_SCOPED_TABLES, parseCreditGrant, parsePlanGrant, polarOwnsEntitlement } from "./admin-actions.js";

const now = new Date("2026-09-21T00:00:00Z");
const in30 = "2026-10-21T00:00:00Z";

assert.deepEqual(parsePlanGrant({ plan: "advanced", expiresAt: in30 }, now), { plan: "advanced", expiresAt: new Date(in30) });
assert.deepEqual(parsePlanGrant({ plan: "internal", expiresAt: null }, now), { plan: "internal", expiresAt: null });
assert.ok("error" in parsePlanGrant({ plan: "advanced", expiresAt: null }, now), "paid plans need an end date");
assert.ok("error" in parsePlanGrant({ plan: "none", expiresAt: in30 }, now));
assert.ok("error" in parsePlanGrant({ plan: "advanced", expiresAt: "2026-09-20T00:00:00Z" }, now), "past end date accepted");
assert.ok("error" in parsePlanGrant({ plan: "advanced", expiresAt: "2031-01-01T00:00:00Z" }, now), "end date beyond three years accepted");
assert.ok("error" in parsePlanGrant({ plan: "advanced", expiresAt: "soon" }, now));

assert.deepEqual(parseCreditGrant({ credits: 14_000, expiresAt: in30 }, now), { credits: 14_000, expiresAt: new Date(in30) });
assert.ok("error" in parseCreditGrant({ credits: 0, expiresAt: in30 }, now));
assert.ok("error" in parseCreditGrant({ credits: 1.5, expiresAt: in30 }, now));
assert.ok("error" in parseCreditGrant({ credits: "100", expiresAt: in30 }, now));
assert.ok("error" in parseCreditGrant({ credits: MAX_ADMIN_CREDITS + 1, expiresAt: in30 }, now));
assert.ok("error" in parseCreditGrant({ credits: 100 }, now), "credits without expiry accepted");

assert.equal(polarOwnsEntitlement(undefined, now), false);
assert.equal(polarOwnsEntitlement({ source: "polar", status: "active", expiresAt: new Date(in30) }, now), true);
assert.equal(polarOwnsEntitlement({ source: "polar", status: "past_due", expiresAt: null }, now), true);
assert.equal(polarOwnsEntitlement({ source: "polar", status: "revoked", expiresAt: null }, now), false);
assert.equal(polarOwnsEntitlement({ source: "polar", status: "canceled", expiresAt: new Date("2026-09-01T00:00:00Z") }, now), false);
assert.equal(polarOwnsEntitlement({ source: "transition", status: "active", expiresAt: new Date(in30) }, now), false);

assert.equal(new Set(SITE_SCOPED_TABLES).size, SITE_SCOPED_TABLES.length);
assert.ok(SITE_SCOPED_TABLES.includes("posts") && SITE_SCOPED_TABLES.includes("site_integrations"));

console.log("admin-actions self-test passed");

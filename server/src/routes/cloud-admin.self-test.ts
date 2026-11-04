import assert from "node:assert/strict";
import { matchesCustomerFilter, parseCustomerFilter, adminReason } from "./cloud-admin.js";
import { SUSPENDED_ALLOWED_PATHS, isSuspended, publicUser } from "../services/access-control.js";

assert.equal(parseCustomerFilter("transition"), "transition");
assert.equal(parseCustomerFilter("drop table"), "all");
assert.equal(parseCustomerFilter(undefined), "all");

const base = { plan: "advanced", entitlementSource: "polar", entitlementStatus: "active", suspendedAt: null };
assert.equal(matchesCustomerFilter(base, "all"), true);
assert.equal(matchesCustomerFilter(base, "transition"), false);
assert.equal(matchesCustomerFilter({ ...base, entitlementSource: "transition" }, "transition"), true);
assert.equal(matchesCustomerFilter({ ...base, entitlementStatus: "past_due" }, "past_due"), true);
assert.equal(matchesCustomerFilter({ ...base, plan: null, entitlementSource: null, entitlementStatus: null }, "no_plan"), true);
assert.equal(matchesCustomerFilter({ ...base, entitlementStatus: "revoked" }, "no_plan"), true);
assert.equal(matchesCustomerFilter(base, "no_plan"), false);
assert.equal(matchesCustomerFilter({ ...base, suspendedAt: new Date() }, "suspended"), true);

assert.equal(adminReason("  spam  "), "spam");
assert.equal(adminReason("no"), null);
assert.equal(adminReason("x".repeat(501)), null);
assert.equal(adminReason(42), null);

assert.equal(isSuspended({ role: "user", suspendedAt: new Date() }), true);
assert.equal(isSuspended({ role: "user", suspendedAt: null }), false);
assert.equal(isSuspended({ role: "admin", suspendedAt: new Date() }), false, "admins are never locked out by a stale suspension");
assert.equal(SUSPENDED_ALLOWED_PATHS.has("/api/auth/me"), true);
assert.equal(SUSPENDED_ALLOWED_PATHS.has("/api/posts"), false);

const suspendedAt = new Date("2026-09-21T00:00:00Z");
assert.deepEqual(
  { at: publicUser({ id: "u", email: "a@b.c", displayName: null, role: "user", suspendedAt }).suspendedAt },
  { at: suspendedAt },
);
assert.equal(publicUser({ id: "u", email: "a@b.c", displayName: null, role: "admin", suspendedAt }).suspendedAt, null);
assert.equal("suspendedReason" in publicUser({ id: "u", email: "a@b.c", displayName: null, role: "user", suspendedAt, suspendedReason: "abuse" } as never), false, "internal suspension reason leaked to the customer");

console.log("cloud-admin self-test passed");

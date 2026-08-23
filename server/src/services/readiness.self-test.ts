import assert from "node:assert/strict";
import { readinessStatus } from "./readiness.js";

assert.deepEqual(await readinessStatus([async () => true, async () => true]), { ready: true, status: 200 });
assert.deepEqual(await readinessStatus([async () => { throw new Error("secret database detail"); }]), { ready: false, status: 503 });

console.log("readiness self-check passed");

import assert from "node:assert/strict";
import { aiCreditMath } from "./ai-credits.js";

assert.deepEqual(aiCreditMath.returnedAllocation([
  { grantId: "early", credits: 50 }, { grantId: "late", credits: 70 },
], 80), [{ grantId: "late", credits: 40 }]);
assert.deepEqual(aiCreditMath.returnedAllocation([{ grantId: "a", credits: 10 }], 0), [{ grantId: "a", credits: 10 }]);
console.log("ai credit math self-test passed");

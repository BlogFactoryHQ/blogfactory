import assert from "node:assert/strict";
import { recoveredCampaignPostId } from "./campaign-runner.js";

const postId = "00000000-0000-4000-8000-000000000001";
assert.equal(recoveredCampaignPostId([postId], new Set([postId])), postId);
assert.equal(recoveredCampaignPostId([postId], new Set()), null);
assert.equal(recoveredCampaignPostId(null, new Set()), null);

console.log("campaign runner recovery self-test passed");

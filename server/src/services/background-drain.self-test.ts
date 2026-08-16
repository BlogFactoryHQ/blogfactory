import assert from "node:assert/strict";
import { backgroundDrainUrl } from "./background-drain.js";

assert.equal(backgroundDrainUrl("seo", "00000000-0000-4000-8000-000000000001", {}), null);
assert.equal(
  backgroundDrainUrl("seo", "00000000-0000-4000-8000-000000000001", { VERCEL_URL: "example.vercel.app", CRON_SECRET: "secret" }),
  "https://example.vercel.app/api/cron/drain?task=seo-worker&userId=00000000-0000-4000-8000-000000000001",
);
assert.equal(
  backgroundDrainUrl("images", undefined, { VERCEL_URL: "https://example.vercel.app", CRON_SECRET: "secret" }),
  "https://example.vercel.app/api/cron/drain?task=images-worker",
);

console.log("background drain self-test passed");

import assert from "node:assert/strict";
import { ensureS3Bucket } from "./init-s3-bucket.js";
import { runCronOnce } from "./run-cron-once.js";

const commands: string[] = [];
await ensureS3Bucket({
  send: async (command) => {
    commands.push(command.constructor.name);
    return {} as never;
  },
} as never, "blogfactory");
assert.deepEqual(commands, ["CreateBucketCommand", "HeadBucketCommand"]);

const headers: string[] = [];
await runCronOnce(
  { CRON_URL: "http://api:3000/api/cron/drain", CRON_SECRET: "secret" },
  async (_url, init) => {
    headers.push(new Headers(init?.headers).get("Authorization") || "");
    return new Response("ok");
  },
);
assert.deepEqual(headers, ["Bearer secret"]);
await assert.rejects(() => runCronOnce({}, fetch), /CRON_URL and CRON_SECRET/);

console.log("Railway one-shot runners self-check passed");

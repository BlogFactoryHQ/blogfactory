import assert from "node:assert/strict";
import { discoverPilotFixture, pilotToolData } from "./run-mcp-pilot-smoke.js";

const result = {
  content: [{ type: "text" as const, text: "ok" }],
  structuredContent: { ok: true, data: { items: [] }, next_action: null },
};
assert.deepEqual(pilotToolData(result, "list_sites"), { items: [] });

assert.throws(() => pilotToolData({
  content: [{ type: "text" as const, text: "safe" }],
  isError: true,
  structuredContent: {
    ok: false,
    error: { code: "not_found", message: "hidden", retryable: false },
    next_action: null,
  },
}, "get_post"), /get_post failed \(not_found\)/);

assert.throws(() => pilotToolData({
  content: [{ type: "text" as const, text: "empty" }],
}, "whoami"), /whoami failed/);

const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
const fixture = await discoverPilotFixture([{ id: "site-a" }, { id: "site-b" }], async (tool, args) => {
  calls.push({ tool, args });
  if (tool === "list_publish_targets") {
    return { items: args.site_id === "site-b" ? [{ id: "target-b" }] : [] };
  }
  if (tool === "list_posts" && args.page === 2) {
    return { items: [{ id: "post-b", job_id: "job-b" }], total_pages: 2 };
  }
  return { items: [], total_pages: 2 };
});
assert.deepEqual(fixture, {
  siteId: "site-b",
  targetCount: 1,
  postCount: 1,
  postId: "post-b",
  jobId: "job-b",
});
assert.deepEqual(calls, [
  { tool: "list_publish_targets", args: { site_id: "site-a" } },
  { tool: "list_publish_targets", args: { site_id: "site-b" } },
  { tool: "list_posts", args: { site_id: "site-b", limit: 50, page: 1 } },
  { tool: "list_posts", args: { site_id: "site-b", limit: 50, page: 2 } },
]);

console.log("MCP pilot smoke result parsing self-check passed");

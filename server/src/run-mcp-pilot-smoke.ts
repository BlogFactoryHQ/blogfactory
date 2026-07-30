import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ACTIVE_MCP_TOOL_NAMES } from "./mcp/contracts.js";

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;
type PilotCall = (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
const MAX_PILOT_POST_PAGES = 5;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function pilotToolData(result: ToolResult, tool: string) {
  const envelope = record("structuredContent" in result ? result.structuredContent : null);
  if (!envelope || envelope.ok !== true) {
    const error = record(envelope?.error);
    throw new Error(`${tool} failed${typeof error?.code === "string" ? ` (${error.code})` : ""}`);
  }
  const data = record(envelope.data);
  if (!data) throw new Error(`${tool} returned no data`);
  return data;
}

function items(data: Record<string, unknown>, tool: string) {
  if (!Array.isArray(data.items)) throw new Error(`${tool} returned no items array`);
  return data.items.map(record).filter((item): item is Record<string, unknown> => Boolean(item));
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`${label} is missing`);
  return value;
}

export async function discoverPilotFixture(
  sites: Record<string, unknown>[],
  call: PilotCall,
) {
  for (const site of sites) {
    const siteId = requiredString(site.id, "site_id");
    const targets = items(
      await call("list_publish_targets", { site_id: siteId }),
      "list_publish_targets",
    );
    if (!targets.length) continue;

    let postCount = 0;
    for (let page = 1; page <= MAX_PILOT_POST_PAGES; page += 1) {
      const postsData = await call("list_posts", { site_id: siteId, limit: 50, page });
      const posts = items(postsData, "list_posts");
      postCount += posts.length;
      const generatedPost = posts.find((post) => typeof post.job_id === "string" && post.job_id);
      if (generatedPost) {
        return {
          siteId,
          targetCount: targets.length,
          postCount,
          postId: requiredString(generatedPost.id, "post_id"),
          jobId: requiredString(generatedPost.job_id, "job_id"),
        };
      }
      const totalPages = typeof postsData.total_pages === "number" && Number.isInteger(postsData.total_pages)
        ? postsData.total_pages
        : page;
      if (page >= totalPages) break;
    }
  }
  throw new Error(`No allowed site has both a publish target and a job-backed post in its first ${MAX_PILOT_POST_PAGES * 50} posts`);
}

async function runPilotSmoke() {
  const urlValue = process.env.MCP_PILOT_URL;
  const token = process.env.MCP_PILOT_TOKEN;
  if (!urlValue) throw new Error("MCP_PILOT_URL is required");
  if (!token) throw new Error("MCP_PILOT_TOKEN is required");
  const url = new URL(urlValue);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("MCP_PILOT_URL must use HTTP or HTTPS");

  const client = new Client({ name: "blogfactory-pilot-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  let connected = false;

  try {
    await client.connect(transport);
    connected = true;
    const server = client.getServerVersion();
    assert.equal(server?.name, "blogfactory", "unexpected MCP server identity");
    console.log(`PASS initialize ${server.name}@${server.version}`);

    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), [...ACTIVE_MCP_TOOL_NAMES], "unexpected active tool catalog");
    console.log(`PASS tools/list ${listed.tools.length} tools`);

    const whoami = pilotToolData(await client.callTool({ name: "whoami", arguments: {} }), "whoami");
    console.log(`PASS whoami ${requiredString(whoami.user_id, "user_id")}`);
    const call: PilotCall = async (tool, args) => pilotToolData(
      await client.callTool({ name: tool, arguments: args }),
      tool,
    );

    const sites = items(pilotToolData(
      await client.callTool({ name: "list_sites", arguments: {} }),
      "list_sites",
    ), "list_sites");
    assert.ok(sites.length, "pilot token has no active allowed site");
    console.log(`PASS list_sites ${sites.length} site(s)`);

    const personas = items(pilotToolData(
      await client.callTool({ name: "list_personas", arguments: {} }),
      "list_personas",
    ), "list_personas");
    assert.ok(personas.length, "pilot account has no active persona");
    console.log(`PASS list_personas ${personas.length} persona(s)`);

    const fixture = await discoverPilotFixture(sites, call);
    console.log(`PASS list_publish_targets ${fixture.targetCount} target(s); using ${fixture.siteId}`);
    console.log(`PASS list_posts ${fixture.postCount} post(s) inspected; using ${fixture.postId}`);

    const post = pilotToolData(
      await client.callTool({ name: "get_post", arguments: { post_id: fixture.postId } }),
      "get_post",
    );
    assert.equal(post.id, fixture.postId, "get_post returned a different post");
    console.log(`PASS get_post ${fixture.postId}`);

    const job = pilotToolData(
      await client.callTool({ name: "get_job", arguments: { job_id: fixture.jobId } }),
      "get_job",
    );
    assert.equal(job.id, fixture.jobId, "get_job returned a different job");
    console.log(`PASS get_job ${fixture.jobId}`);
  } finally {
    if (connected) await client.close();
    else await transport.close();
  }
}

if (import.meta.main) {
  runPilotSmoke().catch((error) => {
    console.error(`FAIL MCP pilot: ${error instanceof Error ? error.name : "UnknownError"}`);
    process.exitCode = 1;
  });
}

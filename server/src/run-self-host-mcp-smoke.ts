import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ACTIVE_MCP_TOOL_NAMES } from "./mcp/contracts.js";

const url = new URL(process.env.MCP_SMOKE_URL || "http://localhost:8080/mcp");
const token = process.env.MCP_SMOKE_TOKEN;
if (!token) throw new Error("MCP_SMOKE_TOKEN is required");

const client = new Client({ name: "blogfactory-self-host-smoke", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { authorization: `Bearer ${token}` } },
});

try {
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, "blogfactory");
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), [...ACTIVE_MCP_TOOL_NAMES]);
  const whoami = await client.callTool({ name: "whoami", arguments: {} });
  assert.equal(whoami.isError, false);
  console.log(`Self-host MCP smoke passed (${ACTIVE_MCP_TOOL_NAMES.length} tools)`);
} finally {
  await client.close();
}

import assert from "node:assert/strict";
import {
  MCP_ERROR_CODES,
  MCP_PROTOCOL_VERSION,
  MCP_SCOPES,
  MCP_SERVER_VERSION,
  MCP_TOOL_NAMES,
  ACTIVE_MCP_TOOL_NAMES,
} from "./contracts.js";
import { handleMcpHttpRequest } from "./server.js";
import {
  assertMcpToolRegistry,
  capMcpPostContent,
  MCP_POST_CONTENT_LIMIT,
  safeMcpJobError,
} from "./tools.js";

const principal = {
  tokenId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  scopes: new Set(["content:read", "drafts:write"] as const),
  siteIds: new Set([
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000003",
  ]),
  displayName: "Editor",
  role: "user",
  approvalStatus: "approved",
};

const postAs = (
  body: unknown,
  authenticatedPrincipal: typeof principal,
  headers: Record<string, string> = {},
) =>
  handleMcpHttpRequest(new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test",
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }), async (authorization) => authorization === "Bearer test" ? authenticatedPrincipal : null);

const post = (body: unknown, headers: Record<string, string> = {}) =>
  postAs(body, principal, headers);

const initialize = await post({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "blogfactory-self-test", version: "1.0.0" },
  },
});
assert.equal(initialize.status, 200);
const initializeResult = (await initialize.json() as any).result;
assert.equal(initializeResult.protocolVersion, MCP_PROTOCOL_VERSION);
assert.equal(initializeResult.serverInfo.version, MCP_SERVER_VERSION);

const list = await post(
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
);
assert.equal(list.status, 200);
const listedTools = (await list.json() as any).result.tools;
assert.deepEqual(listedTools.map((tool: any) => tool.name), ACTIVE_MCP_TOOL_NAMES);
const listedTool = listedTools.find((tool: any) => tool.name === "whoami");
assert.equal(listedTool.name, "whoami");
for (const tool of listedTools) {
  const mutationAnnotations: Record<string, unknown> = {
    generate_draft: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    update_draft: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    push_to_cms_draft: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  };
  assert.deepEqual(tool.annotations, mutationAnnotations[tool.name] || {
    readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
  });
  assert.ok(tool.description);
  assert.ok(tool.inputSchema);
  assert.ok(tool.outputSchema);
}

const call = await post(
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "whoami", arguments: {} },
  },
  { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
);
assert.deepEqual((await call.json() as any).result.structuredContent, {
  ok: true,
  data: {
    user_id: principal.userId,
    display_name: "Editor",
    role: "user",
    approval_status: "approved",
    scopes: ["content:read", "drafts:write"],
    allowed_site_ids: [
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
    ],
  },
  next_action: null,
});

const denied = await postAs(
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "list_sites", arguments: {} },
  },
  { ...principal, scopes: new Set(["drafts:write"] as const) },
  { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
);
const deniedResult = (await denied.json() as any).result;
assert.equal(deniedResult.isError, true);
assert.equal(deniedResult.structuredContent.error.code, "insufficient_scope");

const deniedWrite = await postAs(
  {
    jsonrpc: "2.0",
    id: 41,
    method: "tools/call",
    params: {
      name: "generate_draft",
      arguments: {
        site_id: "00000000-0000-4000-8000-000000000003",
        source_type: "article_keyword",
        source_value: "MCP security",
      },
    },
  },
  { ...principal, scopes: new Set(["content:read"] as const) },
  { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
);
assert.equal((await deniedWrite.json() as any).result.structuredContent.error.code, "insufficient_scope");

const deniedCmsDraft = await post(
  {
    jsonrpc: "2.0",
    id: 42,
    method: "tools/call",
    params: {
      name: "push_to_cms_draft",
      arguments: {
        post_id: "00000000-0000-4000-8000-000000000010",
        integration_id: "00000000-0000-4000-8000-000000000011",
        expected_updated_at: "2026-08-20T12:00:00.000Z",
      },
    },
  },
  { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
);
assert.equal((await deniedCmsDraft.json() as any).result.structuredContent.error.code, "insufficient_scope");

const crossSite = await post(
  {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "list_publish_targets",
      arguments: { site_id: "00000000-0000-4000-8000-000000000099" },
    },
  },
  { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
);
const crossSiteResult = (await crossSite.json() as any).result;
assert.equal(crossSiteResult.isError, true);
assert.equal(crossSiteResult.structuredContent.error.code, "not_found");

for (const name of ["get_search_console_dashboard", "get_search_console_insights"]) {
  const response = await post(
    {
      jsonrpc: "2.0",
      id: `cross-site-${name}`,
      method: "tools/call",
      params: { name, arguments: { site_id: "00000000-0000-4000-8000-000000000099" } },
    },
    { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
  );
  const result = (await response.json() as any).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "not_found");
}

const invalidInput = await post(
  {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "list_publish_targets", arguments: { site_id: "not-a-uuid" } },
  },
  { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
);
const invalidInputResult = (await invalidInput.json() as any).result;
assert.equal(invalidInputResult.isError, true);
assert.match(invalidInputResult.content[0].text, /validation error/i);
assert.equal(invalidInputResult.structuredContent, undefined);

const missingAccept = await handleMcpHttpRequest(new Request("http://localhost/mcp", {
  method: "POST",
  headers: { authorization: "Bearer test", "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }),
}), async () => principal);
assert.equal(missingAccept.status, 406);

const unsupportedMethod = await handleMcpHttpRequest(new Request("http://localhost/mcp", {
  headers: { accept: "application/json, text/event-stream" },
}), async () => principal);
assert.equal(unsupportedMethod.status, 405);
assert.equal(unsupportedMethod.headers.get("allow"), "POST");

const unauthorized = await handleMcpHttpRequest(new Request("http://localhost/mcp", {
  method: "POST",
}), async () => null);
assert.equal(unauthorized.status, 401);
assert.equal(unauthorized.headers.get("www-authenticate"), "Bearer");

const unauthorizedGet = await handleMcpHttpRequest(
  new Request("https://blogfactory.io/mcp"),
  async () => null,
);
assert.equal(unauthorizedGet.status, 401);
assert.equal(unauthorizedGet.headers.get("www-authenticate"), "Bearer");

const previousIssuer = process.env.WORKOS_AUTHKIT_ISSUER;
const previousResource = process.env.MCP_RESOURCE_URL;
const previousApiKey = process.env.WORKOS_API_KEY;
process.env.WORKOS_AUTHKIT_ISSUER = "https://blogfactory-test.authkit.app";
process.env.MCP_RESOURCE_URL = "https://blogfactory.io/mcp";
process.env.WORKOS_API_KEY = "sk_test_not_a_real_secret";
const oauthUnauthorized = await handleMcpHttpRequest(
  new Request("https://blogfactory.io/mcp"),
  async () => null,
);
assert.equal(oauthUnauthorized.status, 401);
assert.equal(
  oauthUnauthorized.headers.get("www-authenticate"),
  'Bearer resource_metadata="https://blogfactory.io/.well-known/oauth-protected-resource", scope="content:read drafts:write publish:draft"',
);
if (previousIssuer === undefined) delete process.env.WORKOS_AUTHKIT_ISSUER;
else process.env.WORKOS_AUTHKIT_ISSUER = previousIssuer;
if (previousResource === undefined) delete process.env.MCP_RESOURCE_URL;
else process.env.MCP_RESOURCE_URL = previousResource;
if (previousApiKey === undefined) delete process.env.WORKOS_API_KEY;
else process.env.WORKOS_API_KEY = previousApiKey;

const browserUnauthorized = await handleMcpHttpRequest(new Request("https://blogfactory.io/mcp", {
  method: "POST",
  headers: { origin: "https://blogfactory.io" },
}), async () => null);
assert.equal(browserUnauthorized.status, 401);
assert.equal(browserUnauthorized.headers.get("access-control-allow-origin"), "https://blogfactory.io");
assert.equal(browserUnauthorized.headers.get("access-control-expose-headers"), "WWW-Authenticate");
assert.match(browserUnauthorized.headers.get("vary") || "", /Origin/);

const browserPreflight = await handleMcpHttpRequest(new Request("https://blogfactory.io/mcp", {
  method: "OPTIONS",
  headers: {
    origin: "https://blogfactory.io",
    "access-control-request-method": "POST",
  },
}), async () => null);
assert.equal(browserPreflight.status, 204);
assert.equal(browserPreflight.headers.get("access-control-allow-origin"), "https://blogfactory.io");
assert.match(browserPreflight.headers.get("access-control-allow-headers") || "", /Authorization/);

const authUnavailable = await handleMcpHttpRequest(new Request("https://blogfactory.io/mcp", {
  method: "POST",
  headers: { origin: "https://blogfactory.io" },
}), async () => {
  throw new Error("database details must not escape");
});
assert.equal(authUnavailable.status, 500);
assert.equal(authUnavailable.headers.get("access-control-allow-origin"), "https://blogfactory.io");
assert.equal((await authUnavailable.text()).includes("database details"), false);

const forbiddenOrigin = await handleMcpHttpRequest(new Request("https://blogfactory.io/mcp", {
  method: "POST",
  headers: { origin: "https://evil.example" },
}), async () => principal);
assert.equal(forbiddenOrigin.status, 403);

assert.equal(MCP_TOOL_NAMES.length, 12);
assert.equal(ACTIVE_MCP_TOOL_NAMES.length, 12);
assert.deepEqual(MCP_SCOPES, ["content:read", "drafts:write", "publish:draft"]);
assert.equal(new Set(MCP_ERROR_CODES).size, 13);
assert.equal(MCP_POST_CONTENT_LIMIT, 100_000);
assert.doesNotThrow(assertMcpToolRegistry);
assert.deepEqual(capMcpPostContent("short"), { content: "short", content_truncated: false });
assert.deepEqual(capMcpPostContent("x".repeat(MCP_POST_CONTENT_LIMIT + 1)), {
  content: "x".repeat(MCP_POST_CONTENT_LIMIT),
  content_truncated: true,
});
assert.equal(safeMcpJobError({
  status: "failed",
  errorMessage: "provider raw secret",
  generationError: null,
}), "Generation failed. Open BlogFactory for details or retry the job.");
assert.match(safeMcpJobError({
  status: "failed",
  errorMessage: "Text model did not return before the job timed out. Try a faster model, fewer variations, or a shorter source.",
  generationError: null,
}) || "", /timed out/);
assert.equal(safeMcpJobError({
  status: "failed",
  errorMessage: "provider-secret: job timed out",
  generationError: null,
}), "Generation failed. Open BlogFactory for details or retry the job.");

console.log("MCP authenticated server self-check passed");

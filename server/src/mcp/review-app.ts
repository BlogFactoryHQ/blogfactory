import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_REVIEW_APP_URI } from "./tools.js";

function reviewAppUrl() {
  if (process.env.MCP_APP_URL) return process.env.MCP_APP_URL;
  if (process.env.WEB_APP_URL || process.env.MCP_RESOURCE_URL) return new URL("/mcp-review.html", process.env.WEB_APP_URL || process.env.MCP_RESOURCE_URL).toString();
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/mcp-review.html`;
  return "http://localhost:8080/mcp-review.html";
}

export function registerReviewApp(server: McpServer) {
  registerAppResource(server, "BlogFactory Review Card", MCP_REVIEW_APP_URI, {
    description: "Review a BlogFactory draft and explicitly send it to a CMS draft destination.",
    _meta: { ui: { prefersBorder: true } },
  }, async () => {
    const response = await fetch(reviewAppUrl());
    if (!response.ok) throw new Error(`Review App unavailable (${response.status})`);
    return {
      contents: [{
        uri: MCP_REVIEW_APP_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await response.text(),
        _meta: { ui: { prefersBorder: true } },
      }],
    };
  });
}

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_SERVER_VERSION = "0.1.0";

export const MCP_SCOPES = [
  "content:read",
  "drafts:write",
  "publish:draft",
] as const;
export type McpScope = typeof MCP_SCOPES[number];

export const MCP_TOOL_NAMES = [
  "whoami",
  "list_sites",
  "list_personas",
  "list_publish_targets",
  "list_posts",
  "get_post",
  "generate_draft",
  "get_job",
  "update_draft",
  "push_to_cms_draft",
] as const;

export const ACTIVE_MCP_TOOL_NAMES = [
  "whoami",
  "list_sites",
  "list_personas",
  "list_publish_targets",
  "list_posts",
  "get_post",
  "generate_draft",
  "get_job",
  "update_draft",
  "push_to_cms_draft",
] as const satisfies readonly (typeof MCP_TOOL_NAMES[number])[];

export const MCP_ERROR_CODES = [
  "authentication_required",
  "insufficient_scope",
  "not_found",
  "validation_error",
  "conflict",
  "configuration_missing",
  "generation_busy",
  "generation_failed",
  "seo_not_ready",
  "destination_not_ready",
  "provider_error",
  "rate_limited",
  "internal_error",
] as const;

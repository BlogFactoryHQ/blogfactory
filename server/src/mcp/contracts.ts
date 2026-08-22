export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_SERVER_VERSION = "0.4.1";

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
  "create_draft",
  "generate_draft",
  "get_job",
  "get_workspace_digest",
  "list_action_items",
  "review_post",
  "get_search_console_dashboard",
  "get_search_console_insights",
  "update_draft",
  "push_to_cms_draft",
  "inspect_search_console_url",
  "batch_inspect_search_console_urls",
  "list_search_console_sitemaps",
  "query_search_console_analytics",
] as const;

export const ACTIVE_MCP_TOOL_NAMES = [
  "whoami",
  "list_sites",
  "list_personas",
  "list_publish_targets",
  "list_posts",
  "get_post",
  "create_draft",
  "generate_draft",
  "get_job",
  "get_workspace_digest",
  "list_action_items",
  "review_post",
  "get_search_console_dashboard",
  "get_search_console_insights",
  "update_draft",
  "push_to_cms_draft",
  "inspect_search_console_url",
  "batch_inspect_search_console_urls",
  "list_search_console_sitemaps",
  "query_search_console_analytics",
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

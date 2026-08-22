export type ActionSeverity = "blocker" | "review" | "warning";

export type ActionReason = { kind: string; severity: ActionSeverity; label: string; message: string };

export type ActionItem = {
  id: string;
  object_id: string;
  site_id: string;
  title: string;
  summary: string | null;
  source_type: string;
  editorial_state: string;
  revision_number: number | null;
  routing_status: "ready" | "needs_routing";
  destination_id: string | null;
  destination_name: string | null;
  destination_provider: string | null;
  severity: ActionSeverity;
  kind: string;
  reasons: ActionReason[];
  updated_at: string;
  suggested_action: string;
};

export type OperationEvent = {
  id: string;
  origin: "web" | "mcp" | "system";
  client_name: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  status: "started" | "succeeded" | "failed";
  duration_ms: number | null;
  created_at: string;
};

export type WorkspaceDigest = {
  site: { id: string; name: string; domain: string };
  attention: { total: number; blocker: number; review: number; warning: number };
  action_items: ActionItem[];
  runs: { running: number; failed: number; recent: Array<{ id: string; status: string; source_type: string; current_step: string; created_at: string }> };
  outcomes: { drafts: number; published: number; cms_drafts: number; cost: number; window_days: number };
  search_growth: { connected: boolean; segments?: Record<string, unknown>; totals?: Record<string, number> };
  recent_outputs: Array<{ id: string; title: string; status: string; editorial_state: string; source_type: string; updated_at: string }>;
  connections: { active: number; cms: { total: number; connected: number; attention: number }; search_console: { connected: boolean } };
  activity: OperationEvent[];
};

export type ReviewPacket = {
  post: { id: string; site_id: string; title: string; summary: string | null; status: string; updated_at: string; web_url: string };
  source: { type: string; reference: string | null };
  editorial: { state: string; revision_id: string | null; revision_number: number | null; current_revision_approved: boolean };
  changes: { changed_fields: string[]; word_delta: number };
  seo: { status: string };
  preflight: { can_send: boolean; has_blockers: boolean; checks: Array<{ id: string; label: string; status: "pass" | "warning" | "blocker"; message: string }> };
  destinations: Array<{ id: string; provider: string; display_name: string; status: string; credential_status: "usable" | "missing" | "undecryptable"; preferred: boolean }>;
  permissions: { can_push_cms_draft: boolean };
  links: { edit: string; preview: string };
};

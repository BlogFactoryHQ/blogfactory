// One place that says what each feature needs. The UI reads this instead of guessing per page.
export type RequirementId = "openrouter" | "openai" | "cms" | "search_console" | "mcp" | "serp" | "volume";

export type RequirementInfo = {
  label: string;
  /** "account" is something the user adds; "server" is an operator-only setting on the deployment. */
  owner: "account" | "server";
  action?: { label: string; href: string };
  /** Shown when the requirement is missing. */
  how: string;
};

export const REQUIREMENTS: Record<RequirementId, RequirementInfo> = {
  openrouter: { label: "OpenRouter key", owner: "account", action: { label: "Add OpenRouter key", href: "/control/article-settings" }, how: "Add your OpenRouter key. It is stored encrypted and tested before it is saved." },
  openai: { label: "OpenAI key", owner: "account", action: { label: "Add OpenAI key", href: "/control/article-settings" }, how: "Add an OpenAI key in Article Settings to compare topics by meaning, not only by title." },
  cms: { label: "CMS destination", owner: "account", action: { label: "Connect a CMS", href: "/control/integrations?from=capabilities" }, how: "Connect WordPress, Ghost, Wix or Framer. BlogFactory only creates drafts there." },
  search_console: { label: "Search Console", owner: "account", action: { label: "Connect Search Console", href: "/overview/growth?tab=optimize&connect=search-console" }, how: "Connect a Search Console property for read-only search evidence." },
  mcp: { label: "MCP token", owner: "account", action: { label: "Open MCP connections", href: "/control/connections" }, how: "Create a site-scoped token and add the endpoint to your AI client." },
  serp: { label: "Brave Search API key", owner: "account", action: { label: "Add Brave key", href: "/control/article-settings" }, how: "Add a Brave Search API key (it has a free tier). The server operator can also set one for every workspace." },
  volume: { label: "DataForSEO credentials", owner: "account", action: { label: "Add DataForSEO", href: "/control/article-settings" }, how: "Add your DataForSEO API login and password to see monthly search volume. Research works without it." },
};

export type CapabilityDef = {
  id: string;
  title: string;
  /** What the user gets, in one line. */
  outcome: string;
  href: string;
  /** All of these must be present or the feature cannot run. */
  requires: RequirementId[];
  /** Missing ones only make the feature less rich. */
  enhancedBy?: RequirementId[];
  /** What still works when the feature is limited or blocked. */
  fallback?: string;
};

export const CAPABILITIES: CapabilityDef[] = [
  { id: "topics", title: "Find topics from your product", outcome: "Topics scored from your product URL, with the ones you already cover flagged.", href: "/overview/growth?view=topics", requires: [], enhancedBy: ["openai"], fallback: "Topics are matched by title. An OpenAI key adds matching by meaning." },
  { id: "questions", title: "Question research", outcome: "Real questions people ask, grouped into a tree.", href: "/overview/growth?view=research", requires: [], enhancedBy: ["volume"] },
  { id: "gaps", title: "Competitor content gaps", outcome: "Topics a competitor's public sitemap covers that your site does not.", href: "/overview/growth?view=research", requires: [] },
  { id: "serp-brief", title: "SERP brief and term coverage", outcome: "Headings, length and shared terms of the top results, and how much of that a draft covers.", href: "/overview/growth?view=research", requires: ["serp"], fallback: "Question research still works without it." },
  { id: "draft", title: "Write drafts", outcome: "Reviewable drafts from a topic or a plan brief.", href: "/create", requires: ["openrouter"] },
  { id: "quality", title: "Draft quality check", outcome: "Term coverage, structure and FAQ markup for each draft.", href: "/library", requires: [] },
  { id: "audit", title: "Technical audit and topical map", outcome: "Broken basics and a map of what your site covers.", href: "/overview/growth?view=monitor", requires: [] },
  { id: "rank", title: "Rank tracking", outcome: "Where your pages rank for the keywords you track.", href: "/overview/growth?view=monitor", requires: ["serp"] },
  { id: "ai-visibility", title: "AI search visibility", outcome: "Whether AI answers mention or cite your site.", href: "/overview/growth?view=monitor", requires: ["openrouter"] },
  { id: "cms", title: "CMS draft delivery", outcome: "Approved posts land in your CMS as drafts. Nothing goes live on its own.", href: "/control/integrations", requires: ["cms"], fallback: "Drafts stay in BlogFactory for review and export." },
  { id: "search-console", title: "Search Console evidence", outcome: "Queries and pages that already have impressions, turned into planned work.", href: "/overview/growth", requires: ["search_console"] },
  { id: "agents", title: "Agent access over MCP", outcome: "Your AI client reads, drafts and delivers within the same limits.", href: "/control/connections", requires: ["mcp"] },
];

export type RequirementState = Record<RequirementId, boolean>;

export type CapabilityStatus = "ready" | "limited" | "blocked";

export type CapabilityResult = {
  def: CapabilityDef;
  status: CapabilityStatus;
  /** Required and missing. */
  missing: RequirementId[];
  /** Optional and missing. */
  upgrades: RequirementId[];
};

export function evaluateCapabilities(state: RequirementState, defs: CapabilityDef[] = CAPABILITIES): CapabilityResult[] {
  return defs.map((def) => {
    const missing = def.requires.filter((id) => !state[id]);
    const upgrades = (def.enhancedBy || []).filter((id) => !state[id]);
    const status: CapabilityStatus = missing.length ? "blocked" : upgrades.length ? "limited" : "ready";
    return { def, status, missing, upgrades };
  });
}

export function capabilitySummary(results: CapabilityResult[]) {
  return {
    ready: results.filter((r) => r.status === "ready").length,
    limited: results.filter((r) => r.status === "limited").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    total: results.length,
  };
}

/** The unmet requirement that unlocks the most blocked features, so the user adds the most useful thing first. */
export function nextUnlock(results: CapabilityResult[]): { id: RequirementId; unlocks: number } | null {
  const counts = new Map<RequirementId, number>();
  for (const result of results) for (const id of result.missing) counts.set(id, (counts.get(id) || 0) + 1);
  let best: { id: RequirementId; unlocks: number } | null = null;
  for (const [id, unlocks] of counts) {
    if (REQUIREMENTS[id].owner === "server") continue; // a user cannot add these
    if (!best || unlocks > best.unlocks) best = { id, unlocks };
  }
  return best;
}

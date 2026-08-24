import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDigest } from "@/lib/control-plane";
import Overview from "./Overview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const queryState = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: string[] }) => options.queryKey?.[0] === "search-console"
    ? ({ data: { oauth_enabled: false }, isLoading: false, isFetching: false, error: null })
    : ({ data: queryState.data, isLoading: false, isFetching: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({ activeSite: { id: "site-1", domain: "example.com" } }),
}));

const digest: WorkspaceDigest = {
  site: { id: "site-1", name: "Example", domain: "example.com" },
  attention: { total: 0, blocker: 0, review: 0, warning: 0 },
  action_items: [],
  runs: { running: 0, failed: 0, recent: [] },
  outcomes: { drafts: 0, published: 0, cms_drafts: 0, cost: 0, window_days: 30 },
  search_growth: { connected: false },
  recent_outputs: [],
  connections: {
    generation: { ready: false, credential_status: "missing" },
    active: 0,
    cms: { total: 0, connected: 0, attention: 0 },
    search_console: { connected: false },
  },
  activity: [],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderOverview(next: WorkspaceDigest) {
  queryState.data = next;
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => root?.render(<MemoryRouter><Overview /></MemoryRouter>));
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
});

describe("Overview setup readiness", () => {
  it("sends a zero-draft workspace back to the value-first flow without optional setup noise", async () => {
    await renderOverview({ ...digest, connections: { ...digest.connections, generation: { ready: true, credential_status: "usable" } } });

    expect(document.body).toHaveTextContent("Create your first draft");
    expect(Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/onboarding"]')).some((link) => link.textContent?.includes("Choose a topic"))).toBe(true);
    expect(document.body).not.toHaveTextContent("CMS draft delivery");
    expect(document.body).not.toHaveTextContent("Connect Search Console");
    expect(document.body).not.toHaveTextContent("Connect MCP");
  });

  it("collapses optional connections after the first draft", async () => {
    await renderOverview({
      ...digest,
      outcomes: { ...digest.outcomes, drafts: 1 },
      connections: { ...digest.connections, generation: { ready: true, credential_status: "usable" } },
    });

    expect(document.body).toHaveTextContent("Connections & setup");
    expect(document.body).toHaveTextContent("0 of 3 optional capabilities configured");
    expect(document.body).toHaveTextContent("CMS · off");
    expect(document.body).toHaveTextContent("Search · off");
    expect(document.body).toHaveTextContent("MCP · off");
    expect(document.body).not.toHaveTextContent("Required foundation");
  });

  it("dismisses the compact setup until readiness regresses", async () => {
    const completed = {
      ...digest,
      outcomes: { ...digest.outcomes, drafts: 1 },
      connections: { ...digest.connections, generation: { ready: true, credential_status: "usable" as const } },
    };
    await renderOverview(completed);

    const dismiss = document.querySelector<HTMLButtonElement>('button[aria-label="Dismiss connections setup"]');
    await act(async () => dismiss?.click());
    expect(document.body).not.toHaveTextContent("0 of 3 optional connections active");

    await renderOverview({ ...completed, connections: { ...completed.connections, generation: { ready: false, credential_status: "undecryptable" } } });
    expect(document.body).toHaveTextContent("AI access needs attention");
    expect(document.body).toHaveTextContent("Repair AI access");
  });
});

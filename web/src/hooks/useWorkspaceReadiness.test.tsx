import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { useWorkspaceReadiness, type WorkspaceReadiness } from "./useWorkspaceReadiness";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  digest: null as WorkspaceDigest | null,
  site: { id: "site-1", domain: "example.com" } as { id: string; domain: string } | null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.digest, isLoading: false }),
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({ activeSite: state.site }),
}));

function digestWith(overrides: Partial<WorkspaceDigest["connections"]> & { drafts?: number }): WorkspaceDigest {
  return {
    site: { id: "site-1", name: "Example", domain: "example.com" },
    attention: { total: 0, blocker: 0, review: 0, warning: 0 },
    action_items: [],
    runs: { running: 0, failed: 0, recent: [] },
    outcomes: { drafts: overrides.drafts ?? 0, published: 0, cms_drafts: 0, cost: 0, window_days: 30 },
    search_growth: { connected: false },
    recent_outputs: [],
    connections: {
      generation: overrides.generation ?? { ready: false, credential_status: "missing" },
      active: overrides.active ?? 0,
      cms: overrides.cms ?? { total: 0, connected: 0, attention: 0 },
      search_console: overrides.search_console ?? { connected: false },
    },
    activity: [],
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function readReadiness(): Promise<WorkspaceReadiness> {
  let captured: WorkspaceReadiness | null = null;
  function Probe() {
    captured = useWorkspaceReadiness();
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return captured!;
}

beforeEach(() => {
  state.site = { id: "site-1", domain: "example.com" };
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  state.digest = null;
});

describe("useWorkspaceReadiness", () => {
  it("counts a connected site alone as one of six steps", async () => {
    state.digest = digestWith({});
    const readiness = await readReadiness();
    expect(readiness.completed).toBe(1);
    expect(readiness.total).toBe(6);
    expect(readiness.percent).toBe(17);
    expect(readiness.complete).toBe(false);
  });

  it("points at AI access before anything optional", async () => {
    state.digest = digestWith({});
    const readiness = await readReadiness();
    expect(readiness.nextStep?.step).toBe("generation");
  });

  it("prioritises a broken credential over an unfinished later step", async () => {
    state.digest = digestWith({
      generation: { ready: false, credential_status: "undecryptable" },
      drafts: 3,
    });
    const readiness = await readReadiness();
    expect(readiness.nextStep?.step).toBe("generation");
    expect(readiness.nextStep?.broken).toBe(true);
  });

  it("reports completion when every capability is connected", async () => {
    state.digest = digestWith({
      generation: { ready: true, credential_status: "usable" },
      active: 2,
      cms: { total: 1, connected: 1, attention: 0 },
      search_console: { connected: true },
      drafts: 4,
    });
    const readiness = await readReadiness();
    expect(readiness.complete).toBe(true);
    expect(readiness.percent).toBe(100);
    expect(readiness.nextStep).toBeNull();
  });

  it("changes its fingerprint when a capability changes, so a dismissal does not stick", async () => {
    state.digest = digestWith({});
    const before = (await readReadiness()).fingerprint;
    await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;

    state.digest = digestWith({ generation: { ready: true, credential_status: "usable" } });
    const after = (await readReadiness()).fingerprint;
    expect(after).not.toBe(before);
  });
});

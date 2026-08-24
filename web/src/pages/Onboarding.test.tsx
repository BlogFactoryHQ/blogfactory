import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Site } from "@/hooks/useSites";
import type { WorkspaceDigest } from "@/lib/control-plane";
import Onboarding from "./Onboarding";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  activeSite: null as Site | null,
  sites: [] as Site[],
  createSite: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  sitesLoading: false,
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({
    activeSite: state.activeSite,
    sites: state.sites,
    createSite: state.createSite,
    isCreating: false,
    isLoading: state.sitesLoading,
  }),
}));

vi.mock("@/lib/api", () => ({
  api: { get: state.get, post: state.post, put: state.put },
  retryTransientApiError: false,
}));

const site: Site = {
  id: "site-1",
  name: "Example",
  domain: "example.com",
  status: "active",
  pageCount: 42,
  vectorCount: 0,
  topics: ["legal tech", "contracts", "compliance", "extra"],
  editorialTopics: [],
  language: "en",
};

const digest: WorkspaceDigest = {
  site: { id: site.id, name: site.name, domain: site.domain },
  attention: { total: 0, blocker: 0, review: 0, warning: 0 },
  action_items: [],
  runs: { running: 0, failed: 0, recent: [] },
  outcomes: { drafts: 0, published: 0, cms_drafts: 0, cost: 0, window_days: 30 },
  search_growth: { connected: false },
  recent_outputs: [],
  connections: {
    generation: { ready: true, credential_status: "usable" },
    active: 0,
    cms: { total: 0, connected: 0, attention: 0 },
    search_console: { connected: false },
  },
  activity: [],
};

const textModel = {
  id: "openai/gpt-4o-mini",
  name: "GPT-4o mini",
  provider: "openai",
  pricing: "low",
  costInfo: "$0.15/M input · $0.60/M output",
  description: "Fast text model",
  isFree: false,
  limits: null,
  rawPricing: { prompt: 0.15, completion: 0.6, request: 0 },
  contextLength: 128000,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function renderOnboarding() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await rerenderOnboarding();
}

async function rerenderOnboarding() {
  await act(async () => root?.render(
    <QueryClientProvider client={queryClient!}>
      <TooltipProvider><MemoryRouter initialEntries={["/onboarding"]}><Onboarding /></MemoryRouter></TooltipProvider>
    </QueryClientProvider>,
  ));
  await flush();
  await flush();
  await flush();
}

beforeEach(() => {
  state.activeSite = null;
  state.sites = [];
  state.createSite.mockReset();
  state.get.mockReset();
  state.post.mockReset();
  state.put.mockReset();
  state.sitesLoading = false;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  queryClient = null;
});

describe("Onboarding", () => {
  it("asks only for site information the product uses", async () => {
    await renderOnboarding();

    expect(document.body).toHaveTextContent("We only ask for information the product uses");
    expect(document.querySelector("#site-url")).toBeInTheDocument();
    expect(document.querySelector("#first-name")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Agency");
  });

  it("resumes when the active site arrives after the first render", async () => {
    state.sitesLoading = true;
    await renderOnboarding();

    state.activeSite = site;
    state.sites = [site];
    state.sitesLoading = false;
    state.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/control-plane/overview")) return digest;
      if (path === "/models/text") return [textModel];
      throw new Error(`Unexpected GET ${path}`);
    });
    state.post.mockResolvedValue({ ok: true });
    await rerenderOnboarding();

    expect(document.body).toHaveTextContent("Choose your first topic");
    expect(document.body).not.toHaveTextContent("What site are we writing for?");
  });

  it("resumes a ready workspace at site topics without showing optional integrations", async () => {
    state.activeSite = site;
    state.sites = [site];
    state.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/control-plane/overview")) return digest;
      if (path === "/models/text") return [textModel];
      throw new Error(`Unexpected GET ${path}`);
    });
    state.post.mockResolvedValue({ ok: true });

    await renderOnboarding();

    expect(document.body).toHaveTextContent("Choose your first topic");
    expect(document.body).toHaveTextContent("legal tech");
    expect(document.body).toHaveTextContent("contracts");
    expect(document.body).not.toHaveTextContent("Search Console");
    expect(document.body).not.toHaveTextContent("MCP");
    expect(document.body).not.toHaveTextContent("Brand voice");
  });

  it("reuses an existing key after site creation and explains sitemap fallback", async () => {
    const fallbackSite: Site = { ...site, pageCount: 0, topics: [], language: null, indexingError: "Sitemap request failed" };
    state.createSite.mockResolvedValue(fallbackSite);
    state.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/control-plane/overview")) return digest;
      if (path === "/models/text") return [textModel];
      throw new Error(`Unexpected GET ${path}`);
    });
    state.post.mockResolvedValue({ ok: true });
    await renderOnboarding();

    const input = document.querySelector<HTMLInputElement>("#site-url")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const connect = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Connect site"));
    await act(async () => connect?.click());
    await flush();
    await flush();
    await flush();

    expect(document.body).toHaveTextContent("The site is connected, but its sitemap could not be read");
    expect(document.body).toHaveTextContent("Write the first topic below");
    expect(document.querySelector("#first-draft-topic")).toBeInTheDocument();
    expect(document.querySelector("#onboarding-openrouter-key")).not.toBeInTheDocument();
    expect(state.post).toHaveBeenCalledWith("/settings/api-keys/test", { provider: "openrouter" });
  });

  it.each(["missing", "undecryptable"] as const)("resumes %s credentials at the inline key step", async (credentialStatus) => {
    state.activeSite = site;
    state.sites = [site];
    state.get.mockResolvedValue({
      ...digest,
      connections: { ...digest.connections, generation: { ready: false, credential_status: credentialStatus } },
    });

    await renderOnboarding();

    expect(document.body).toHaveTextContent("Add OpenRouter to create your first draft");
    expect(document.querySelector("#onboarding-openrouter-key")).toBeInTheDocument();
    expect(state.post).not.toHaveBeenCalled();
  });

  it("re-tests a saved key and keeps an invalid one in the inline repair step", async () => {
    state.activeSite = site;
    state.sites = [site];
    state.get.mockResolvedValue(digest);
    state.post.mockRejectedValue(new Error("OpenRouter rejected this key"));

    await renderOnboarding();

    expect(state.post).toHaveBeenCalledWith("/settings/api-keys/test", { provider: "openrouter" });
    expect(document.body).toHaveTextContent("The key did not pass verification");
    expect(document.body).toHaveTextContent("OpenRouter rejected this key");
    expect(document.querySelector("#onboarding-openrouter-key")).toBeInTheDocument();
  });

  it("starts a text-only first draft without a persona and opens the completed result", async () => {
    state.activeSite = site;
    state.sites = [site];
    let generatePayload: Record<string, unknown> | null = null;
    state.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/control-plane/overview")) return digest;
      if (path === "/models/text") return [textModel];
      if (path === "/jobs/job-1") return {
        status: "completed",
        current_step: "completed_post_1_of_1",
        result_post_ids: ["post-1"],
        total_cost: 0.037,
        created_at: "2026-08-24T00:00:00.000Z",
        completed_at: "2026-08-24T00:00:38.000Z",
      };
      if (path === "/posts/post-1") return {
        id: "post-1",
        title: "Legal tech for growing teams",
        summary: "A practical guide to adopting legal technology.",
        content: "Draft content",
        status: "draft",
      };
      throw new Error(`Unexpected GET ${path}`);
    });
    state.post.mockImplementation(async (path: string, payload: Record<string, unknown>) => {
      if (path === "/settings/api-keys/test") return { ok: true };
      if (path === "/content/generate") {
        generatePayload = payload;
        return { jobId: "job-1", status: "running", postIds: [] };
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    await renderOnboarding();
    const topic = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("legal tech"));
    await act(async () => topic?.click());
    expect(document.body).toHaveTextContent("Projected cost");

    const generate = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Create first draft"));
    await act(async () => generate?.click());
    await flush();
    await flush();
    await flush();

    expect(generatePayload).toMatchObject({
      sourceType: "article_keyword",
      sourceValue: "legal tech",
      personaId: null,
      modelId: "openai/gpt-4o-mini",
      variations: 1,
      articleWordCount: 1200,
      enableResearch: false,
      generateImages: false,
      siteId: "site-1",
    });
    expect(document.body).toHaveTextContent("Your first draft is ready");
    expect(document.body).toHaveTextContent("Legal tech for growing teams");
    expect(document.body).toHaveTextContent("$0.0370");
    expect(document.body).toHaveTextContent("Draft only");
    expect(document.querySelector('a[href="/library/posts/post-1/preview"]')).toHaveTextContent("Review draft");
  });
});

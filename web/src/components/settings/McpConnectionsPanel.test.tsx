import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpConnectionsPanel } from "./McpConnectionsPanel";

const { deleteMock, getMock, postMock, toastErrorMock, toastSuccessMock, writeTextMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  writeTextMock: vi.fn(),
}));

const capabilities = {
  tool_count: 20,
  tools: ["whoami", "list_sites", "list_personas", "list_publish_targets", "list_posts", "get_post", "generate_draft", "get_job", "get_workspace_digest", "list_action_items", "review_post", "get_search_console_dashboard", "get_search_console_insights", "refresh_search_console", "update_draft", "push_to_cms_draft", "inspect_search_console_url", "batch_inspect_search_console_urls", "list_search_console_sitemaps", "query_search_console_analytics"],
};

vi.mock("@/lib/api", () => ({
  api: { delete: deleteMock, get: getMock, post: postMock },
  retryTransientApiError: () => false,
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({
    sites: [{ id: "11111111-1111-4111-8111-111111111111", name: "Example", domain: "example.com" }],
    activeSite: { id: "11111111-1111-4111-8111-111111111111", name: "Example", domain: "example.com" },
    isLoading: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;

function button(label: string) {
  const match = Array.from(document.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match as HTMLButtonElement;
}

async function renderPanel(initialTokens?: unknown[], initialOAuthConnections?: unknown[]) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (initialTokens) queryClient.setQueryData(["mcp-tokens"], { tokens: initialTokens });
  if (initialOAuthConnections) {
    queryClient.setQueryData(["mcp-oauth-connections"], { connections: initialOAuthConnections });
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <McpConnectionsPanel />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await vi.waitFor(() => expect(getMock).toHaveBeenCalledWith("/mcp/tokens"));
  });
}

beforeEach(() => {
  localStorage.clear();
  deleteMock.mockReset().mockResolvedValue({ revoked: true });
  getMock.mockReset().mockResolvedValue({ tokens: [] });
  postMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  writeTextMock.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  queryClient?.clear();
  container?.remove();
  root = null;
  container = null;
  queryClient = null;
});

describe("MCP connections panel", () => {
  it("creates a site-scoped read token and clears its one-time secret", async () => {
    const secret = "bf_mcp_one_time_secret";
    postMock.mockResolvedValue({
      token: {
        id: "token-1",
        name: "Personal Codex",
        prefix: "bf_mcp_one",
        scopes: ["content:read"],
        site_ids: ["11111111-1111-4111-8111-111111111111"],
        expires_at: null,
        last_used_at: null,
        revoked_at: null,
        created_at: "2026-07-27T12:00:00.000Z",
      },
      secret,
    });
    await renderPanel();

    await act(async () => button("Copy OAuth setup").click());
    expect(writeTextMock).toHaveBeenCalledWith(
      "codex mcp add blogfactory --url https://blogfactory.io/mcp",
    );

    await act(async () => button("Create personal token").click());
    const nameInput = document.querySelector<HTMLInputElement>("#mcp-token-name");
    expect(nameInput).toBeInTheDocument();
    expect(document.querySelector('[role="checkbox"]')).toHaveAttribute("data-state", "checked");

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(nameInput, "  Personal Codex  ");
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    getMock.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => button("Create token").click());
    await act(async () => {
      await vi.waitFor(() => expect(document.body).toHaveTextContent(secret));
    });

    expect(postMock).toHaveBeenCalledWith("/mcp/tokens", {
      name: "Personal Codex",
      scopes: ["content:read", "drafts:write", "publish:draft"],
      site_ids: ["11111111-1111-4111-8111-111111111111"],
      expires_at: null,
    });
    expect(Object.values(localStorage)).not.toContain(secret);

    await act(async () => button("Copy token").click());
    expect(writeTextMock).toHaveBeenCalledWith(secret);

    await act(async () => button("I saved it").click());
    expect(document.body).not.toHaveTextContent(secret);
  });

  it("lists safe metadata and revokes an active connection after confirmation", async () => {
    const token = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Editorial client",
      prefix: "bf_mcp_abcd",
      scopes: ["content:read", "drafts:write", "publish:draft"],
      site_ids: ["11111111-1111-4111-8111-111111111111"],
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
      created_at: "2026-07-27T12:00:00.000Z",
    };
    getMock.mockResolvedValue({ tokens: [token] });
    await renderPanel([token]);

    expect(document.body).toHaveTextContent("bf_mcp_abcd");
    expect(document.body).toHaveTextContent("Read content");
    expect(document.body).toHaveTextContent("Active");
    expect(document.body).not.toHaveTextContent("one_time_secret");
    expect(button("Revoke")).toHaveAttribute("aria-label", "Revoke Editorial client");

    await act(async () => button("Revoke").click());
    expect(document.body).toHaveTextContent("Revoke this MCP connection?");
    await act(async () => button("Revoke connection").click());
    await act(async () => {
      await vi.waitFor(() => expect(deleteMock).toHaveBeenCalledWith("/mcp/tokens/22222222-2222-4222-8222-222222222222"));
    });
  });

  it("keeps revoke confirmation available when revocation fails", async () => {
    const token = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Retry client",
      prefix: "bf_mcp_retry",
      scopes: ["content:read"],
      site_ids: ["11111111-1111-4111-8111-111111111111"],
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
      created_at: "2026-07-27T12:00:00.000Z",
    };
    deleteMock.mockRejectedValue(new Error("Network unavailable"));
    getMock.mockResolvedValue({ tokens: [token] });
    await renderPanel([token]);

    await act(async () => button("Revoke").click());
    await act(async () => button("Revoke connection").click());
    await act(async () => {
      await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Network unavailable"));
    });

    expect(document.body).toHaveTextContent("Revoke this MCP connection?");
    expect(button("Revoke connection")).toBeEnabled();
  });

  it("lists and revokes a browser-authorized connection", async () => {
    const connection = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "OAuth MCP client",
      scopes: ["content:read"],
      site_id: "11111111-1111-4111-8111-111111111111",
      site_name: "Example",
      site_domain: "example.com",
      last_used_at: "2026-07-27T12:30:00.000Z",
      revoked_at: null,
      created_at: "2026-07-27T12:00:00.000Z",
    };
    getMock.mockImplementation((path: string) => Promise.resolve(
      path === "/mcp/oauth/connections" ? { connections: [connection] }
        : path === "/mcp/capabilities" ? capabilities
          : { tokens: [] },
    ));
    await renderPanel([], [connection]);

    expect(document.body).toHaveTextContent("MCP access");
    expect(document.body).toHaveTextContent("1 active");
    await vi.waitFor(() => expect(document.body).toHaveTextContent("20 available"));
    expect(document.body).toHaveTextContent("generate_draft");
    expect(document.body).toHaveTextContent("push_to_cms_draft");
    expect(document.body).toHaveTextContent("review_post");
    expect(document.body).toHaveTextContent("OAuth MCP client");
    expect(document.body).toHaveTextContent("Example — example.com");
    const revoke = document.querySelector<HTMLButtonElement>('[aria-label="Revoke OAuth MCP client"]');
    expect(revoke).toBeEnabled();
    await act(async () => revoke?.click());
    await act(async () => button("Revoke connection").click());
    await act(async () => {
      await vi.waitFor(() => expect(deleteMock).toHaveBeenCalledWith(
        "/mcp/oauth/connections/33333333-3333-4333-8333-333333333333",
      ));
    });
  });
});

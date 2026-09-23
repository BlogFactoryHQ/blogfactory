import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminStatus from "./AdminStatus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { get } }));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  get.mockReset();
});

describe("AdminStatus", () => {
  it("shows degraded operational signals without claiming the platform is healthy", async () => {
    get.mockResolvedValue({
      checkedAt: "2026-09-23T12:00:00Z",
      state: "attention",
      checks: [
        { id: "dependencies", label: "Database and object storage", state: "healthy", detail: "Readiness checks passed." },
        { id: "monitoring", label: "External worker heartbeat", state: "attention", detail: "No external heartbeat endpoint configured." },
      ],
      snapshot: { billing: { lastProcessedAt: null }, jobs: { completed24h: 2 } },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<QueryClientProvider client={queryClient}><MemoryRouter><AdminStatus /></MemoryRouter></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(document.body).toHaveTextContent("System status");
    expect(document.body).toHaveTextContent("No external heartbeat endpoint configured");
    expect(document.body).toHaveTextContent("Container, backup, and public uptime alerts still require an external monitor");
  });
});

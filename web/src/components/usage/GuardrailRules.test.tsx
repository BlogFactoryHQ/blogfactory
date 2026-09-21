import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuardrailRules } from "./GuardrailRules";
import type { DailyUsage } from "@/hooks/useUsageAnalytics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { get: apiMocks.get, put: apiMocks.put } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const daily: DailyUsage[] = [
  { date: "2026-09-18", requests: 40, tokens: 1000, cost: 10, failed: 1 },
  { date: "2026-09-19", requests: 80, tokens: 2000, cost: 20, failed: 2 },
  { date: "2026-09-20", requests: 60, tokens: 1500, cost: 45, failed: 0 },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <GuardrailRules daily={daily} />
      </QueryClientProvider>,
    );
  });
  // The settings query resolves over a few microtasks; wait for the rules to actually be on screen.
  for (let attempt = 0; attempt < 20 && !container.querySelector('[aria-label="daily spend ceiling"]'); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  return client;
}

function saveButton() {
  return [...container!.querySelectorAll("button")].find((button) => button.textContent?.includes("Save guardrails"))!;
}

function input(label: string) {
  return container!.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
}

function setInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  apiMocks.get.mockReset();
  apiMocks.put.mockReset();
  apiMocks.put.mockResolvedValue({});
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  root = null;
  container = null;
});

describe("GuardrailRules", () => {
  it("reports saved ceilings, their state, and leaves save disabled until something changes", async () => {
    apiMocks.get.mockResolvedValue({
      monthly_budget: 100,
      budget_paused: false,
      daily_cost_limit: 45,
      daily_request_limit: null,
      daily_failure_limit: 5,
    });
    await render();

    // Today's cost is 45 and the ceiling is 45, so the rule reads as firing, not merely close.
    expect(container!.textContent).toContain("1 firing");
    expect(container!.textContent).toContain("Firing");
    expect(container!.textContent).toContain("1 off");
    expect(saveButton().disabled).toBe(true);
  });

  it("sends every ceiling on save, with unset rules cleared to null", async () => {
    apiMocks.get.mockResolvedValue({
      monthly_budget: null,
      budget_paused: false,
      daily_cost_limit: 45,
      daily_request_limit: 200,
      daily_failure_limit: null,
    });
    await render();

    await act(async () => { setInput(input("daily requests ceiling"), ""); });
    await act(async () => { setInput(input("daily spend ceiling"), "80.5"); });

    expect(saveButton().disabled).toBe(false);
    await act(async () => { saveButton().click(); });
    await act(async () => { await Promise.resolve(); });

    expect(apiMocks.put).toHaveBeenCalledWith("/settings", {
      dailyCostLimit: 80.5,
      dailyRequestLimit: null,
      dailyFailureLimit: null,
    });
  });

  it("floors count ceilings and rejects a non-positive one instead of saving it", async () => {
    apiMocks.get.mockResolvedValue({
      monthly_budget: null,
      budget_paused: false,
      daily_cost_limit: null,
      daily_request_limit: null,
      daily_failure_limit: null,
    });
    await render();

    await act(async () => { setInput(input("failed calls ceiling"), "7.9"); });
    await act(async () => { saveButton().click(); });
    await act(async () => { await Promise.resolve(); });
    expect(apiMocks.put).toHaveBeenCalledWith("/settings", {
      dailyCostLimit: null,
      dailyRequestLimit: null,
      dailyFailureLimit: 7,
    });

    apiMocks.put.mockClear();
    await act(async () => { setInput(input("daily spend ceiling"), "-3"); });
    await act(async () => { saveButton().click(); });
    await act(async () => { await Promise.resolve(); });
    expect(apiMocks.put).not.toHaveBeenCalled();
  });

  it("keeps unsaved edits when the settings query refetches in the background", async () => {
    apiMocks.get.mockResolvedValue({
      monthly_budget: null,
      budget_paused: false,
      daily_cost_limit: 45,
      daily_request_limit: null,
      daily_failure_limit: null,
    });
    const client = await render();

    await act(async () => { setInput(input("daily spend ceiling"), "999"); });
    expect(apiMocks.get).toHaveBeenCalledTimes(1);

    // Force the real refetch the app performs on window focus. It resolves with the stored
    // ceiling, and the typed one must survive it.
    await act(async () => { await client.invalidateQueries({ queryKey: ["guardrail-settings"] }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(apiMocks.get.mock.calls.length).toBeGreaterThan(1);
    expect(input("daily spend ceiling").value).toBe("999");
  });
});

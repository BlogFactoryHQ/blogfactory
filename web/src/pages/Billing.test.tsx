import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Billing from "./Billing";
import { isCheckoutActivated, type BillingState } from "@/lib/billing";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: state.get, post: state.post } }));

const baseState: BillingState = {
  cloud_enforcement: true,
  checkout_enabled: true,
  managed_ai_enabled: false,
  write_access: false,
  plan: "none",
  subscription_state: null,
  entitlement_source: null,
  period_end: null,
  grace_ends_at: null,
  credits: { available: 0, reserved: 0, debt: 0, next_expiry: null },
  eligible_refunds: [],
  limits: { sites: 0, storageBytes: 0, concurrency: 0, activeFeeds: 0, monthlyDrafts: 0, monthlyAutomatedDrafts: 0 },
  usage: { sites: 0, storage_bytes: 0, concurrency: 0, active_feeds: 0, manual_completed: 0, manual_reserved: 0, automated_completed: 0, automated_reserved: 0 },
  warnings: { drafts_80_percent: false, drafts_limit_reached: false },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderBilling(billing: BillingState, url = "/billing") {
  state.get.mockResolvedValue(billing);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(
    <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[url]}><Billing /></MemoryRouter></QueryClientProvider>,
  ));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(() => { state.get.mockReset(); state.post.mockReset(); });
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Billing", () => {
  it("does not sell Managed AI credits while Managed AI is off", async () => {
    await renderBilling(baseState);
    expect(document.body).not.toHaveTextContent("Managed AI Credits");
    expect(document.body).not.toHaveTextContent("Buy 14,000");
    expect(document.body).toHaveTextContent("Choose a plan to start creating");
    expect(document.body).toHaveTextContent("Current plan: No plan");
  });

  it("offers credits when Managed AI is available", async () => {
    await renderBilling({ ...baseState, managed_ai_enabled: true });
    expect(document.body).toHaveTextContent("Buy 14,000 · $20");
  });

  it("shows activation progress after returning from checkout", async () => {
    await renderBilling(baseState, "/billing?checkout=success&checkout_id=chk_1");
    expect(document.body).toHaveTextContent("Payment received. Activating your plan");
    expect(document.body).not.toHaveTextContent("Choose a plan to start creating");
  });

  it("guides a newly active plan into workspace setup and flags reached limits", async () => {
    await renderBilling({
      ...baseState,
      write_access: true,
      plan: "cloud",
      entitlement_source: "polar",
      subscription_state: "active",
      limits: { ...baseState.limits, sites: 3, monthlyDrafts: 150 },
      usage: { ...baseState.usage, manual_completed: 150 },
      warnings: { drafts_80_percent: true, drafts_limit_reached: true },
    });
    expect(document.querySelector('a[href="/onboarding"]')).toHaveTextContent("Set up your workspace");
    expect(document.body).toHaveTextContent("You have used this month's draft allowance");
    expect(document.body).toHaveTextContent("Upgrade to Advanced");
    expect(document.body).toHaveTextContent("Current plan");
  });
});

describe("isCheckoutActivated", () => {
  it("waits for the Polar entitlement or new credits", () => {
    expect(isCheckoutActivated(undefined, null)).toBe(false);
    expect(isCheckoutActivated(baseState, 0)).toBe(false);
    expect(isCheckoutActivated({ ...baseState, entitlement_source: "transition", write_access: true, plan: "advanced" }, 0)).toBe(false);
    expect(isCheckoutActivated({ ...baseState, entitlement_source: "polar", write_access: true, plan: "cloud" }, 0)).toBe(true);
    expect(isCheckoutActivated({ ...baseState, credits: { ...baseState.credits, available: 14_000 } }, 0)).toBe(true);
  });
});

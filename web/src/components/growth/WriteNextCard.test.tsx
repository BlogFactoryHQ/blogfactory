import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { WriteNextCard } from "./WriteNextCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signals = vi.hoisted(() => ({ value: { isLoading: false, analyzed: false, suggestions: null as unknown, newTopics: 0 } }));
vi.mock("@/hooks/useGrowthSignals", () => ({ useGrowthSignals: () => signals.value }));

const digest = (items: unknown[]) => ({ site: { id: "site-1" }, search_growth: { connected: false, plan: items.length ? { summary: {}, next_items: items, data_through: null } : null } }) as unknown as WorkspaceDigest;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
async function render(data: WorkspaceDigest) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<MemoryRouter><WriteNextCard digest={data} /></MemoryRouter>));
  return container;
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  signals.value = { isLoading: false, analyzed: false, suggestions: null, newTopics: 0 };
});

describe("WriteNextCard", () => {
  it("opens a planned item as a draft with its plan context", async () => {
    const el = await render(digest([{ id: "item-1", planned_for: "2026-11-10", action_type: "new_content", target_query: "hair growth tracker", page_url: null }]));
    const link = el.querySelector("a[href^='/create']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("seoPlanItemId=item-1");
    expect(link.getAttribute("href")).toContain("targetQuery=hair+growth+tracker");
    expect(link.getAttribute("href")).toContain("siteId=site-1");
  });

  it("falls back to found topics, then to the analysis step", async () => {
    signals.value = { isLoading: false, analyzed: true, suggestions: { checkedAt: new Date().toISOString(), newCount: 1, topics: [{ keyword: "scalp care routine", intent: "informational", cluster: "care", score: 70 }] }, newTopics: 1 };
    let el = await render(digest([]));
    expect(el.textContent).toContain("scalp care routine");
    expect(el.querySelector("a[href='/overview/growth?view=topics']")?.textContent).toContain("Plan these");
    await act(async () => root?.unmount());
    el.remove();
    signals.value = { isLoading: false, analyzed: false, suggestions: null, newTopics: 0 };
    el = await render(digest([]));
    expect(el.textContent).toContain("Analyze your product");
  });
});

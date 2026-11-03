import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChecklistCard, type ChecklistItem } from "./ChecklistCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const items: ChecklistItem[] = [
  { id: "site", label: "Connect a site", done: true, onSelect: vi.fn() },
  { id: "generation", label: "Add AI access", done: false, onSelect: vi.fn() },
  { id: "cms", label: "Connect a CMS", done: false, attention: true, onSelect: vi.fn() },
];

describe("ChecklistCard", () => {
  it("shows progress and every step", async () => {
    const node = await render(<ChecklistCard title="Getting started" percent={33} items={items} />);
    expect(node.textContent).toContain("Getting started");
    expect(node.textContent).toContain("33% complete");
    expect(node.querySelectorAll("li")).toHaveLength(3);
  });

  it("hands each unfinished step off to its own flow", async () => {
    const onSelect = vi.fn();
    const node = await render(
      <ChecklistCard
        title="Getting started"
        percent={0}
        items={[{ id: "generation", label: "Add AI access", done: false, onSelect }]}
      />,
    );
    await act(async () => node.querySelector("li button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("can be dismissed", async () => {
    const onDismiss = vi.fn();
    const node = await render(<ChecklistCard title="Getting started" percent={50} items={items} onDismiss={onDismiss} />);
    const dismiss = node.querySelector('button[aria-label="Dismiss Getting started"]');
    await act(async () => dismiss?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("collapses to a single labelled control when the sidebar is collapsed", async () => {
    const onCompactClick = vi.fn();
    const node = await render(
      <ChecklistCard title="Getting started" percent={67} items={items} compact onCompactClick={onCompactClick} />,
    );
    const trigger = node.querySelector("button");
    expect(node.querySelectorAll("li")).toHaveLength(0);
    expect(trigger?.getAttribute("aria-label")).toBe("Getting started, 67% complete");
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCompactClick).toHaveBeenCalledOnce();
  });
});

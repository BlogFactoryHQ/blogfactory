import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<MemoryRouter>{node}</MemoryRouter>));
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("EmptyState", () => {
  it("states the next action, not only the absence", async () => {
    const onClick = vi.fn();
    const node = await render(
      <EmptyState
        title="No content yet"
        description="Generate an article to fill this list."
        primaryAction={{ label: "Create content", onClick }}
      />,
    );

    expect(node.textContent).toContain("No content yet");
    const button = node.querySelector("button");
    expect(button?.textContent).toBe("Create content");
    await act(async () => button?.click());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders an internal route action as a client-side link", async () => {
    const node = await render(
      <EmptyState title="No sources" primaryAction={{ label: "Add a source", href: "/sources/rss/new" }} />,
    );
    const anchor = node.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/sources/rss/new");
    expect(anchor?.getAttribute("target")).toBeNull();
  });

  it("marks external link actions as such", async () => {
    const node = await render(
      <EmptyState title="Docs" primaryAction={{ label: "Open docs", href: "https://example.com", external: true }} />,
    );
    const anchor = node.querySelector("a");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noreferrer");
  });

  it("keeps the row density to a single compact block for table bodies", async () => {
    const node = await render(<EmptyState size="row" title="No rows" description="Nothing matched." />);
    expect(node.querySelector("svg")).toBeNull();
    expect(node.textContent).toContain("No rows");
  });

  it("uses the error tone for failed reads", async () => {
    const node = await render(<EmptyState tone="error" title="Could not load" />);
    expect(node.innerHTML).toContain("status-error");
  });
});

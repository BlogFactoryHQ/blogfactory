import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchProgressRail, type BatchItemStatus } from "./BatchProgressRail";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const handlers = { run: vi.fn(), retry: vi.fn(), stop: vi.fn() };

async function render(statuses: BatchItemStatus[], isRunning = false) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <BatchProgressRail
        items={statuses.map((status, index) => ({ id: String(index), status }))}
        isRunning={isRunning}
        onRun={handlers.run}
        onRetryFailed={handlers.retry}
        onStop={handlers.stop}
      />,
    );
  });
  return container;
}

function button(text: string) {
  return [...container!.querySelectorAll("button")].find((element) => element.textContent?.includes(text));
}

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  root = null;
  container = null;
  handlers.run.mockReset();
  handlers.retry.mockReset();
  handlers.stop.mockReset();
});

describe("BatchProgressRail", () => {
  it("renders nothing until a batch is loaded", async () => {
    await render([]);
    expect(container!.textContent).toBe("");
  });

  it("counts each state and reports how much of the batch has settled", async () => {
    await render(["done", "done", "failed", "importing", "ready"]);
    expect(container!.textContent).toContain("5 items · 4 states");
    // Settled means finished either way: two done plus one failed, not the in-flight or queued ones.
    expect(container!.textContent).toContain("3 of 5 settled");
    expect(container!.textContent).toContain("done2");
    expect(container!.textContent).toContain("failed1");
    expect(container!.textContent).toContain("queued1");
  });

  it("offers a retry only while something has failed, and names the count", async () => {
    await render(["done", "ready"]);
    expect(button("Retry failed")).toBeUndefined();

    await act(async () => { root?.unmount(); });
    container?.remove();
    await render(["done", "failed", "failed"]);
    const retry = button("Retry failed 2")!;
    expect(retry).toBeDefined();
    await act(async () => { retry.click(); });
    expect(handlers.retry).toHaveBeenCalledTimes(1);
    expect(handlers.run).not.toHaveBeenCalled();
  });

  it("calls the run action a fresh batch, and offers to resume a partly settled one", async () => {
    await render(["ready", "ready"]);
    const run = button("Run batch")!;
    await act(async () => { run.click(); });
    expect(handlers.run).toHaveBeenCalledTimes(1);

    await act(async () => { root?.unmount(); });
    container?.remove();
    await render(["done", "ready"]);
    expect(button("Run remaining")).toBeDefined();
    expect(button("Run batch")).toBeUndefined();
  });

  it("swaps run for stop while the batch is in flight and locks retry", async () => {
    await render(["failed", "importing"], true);
    expect(button("Run batch")).toBeUndefined();
    expect(button("Run remaining")).toBeUndefined();
    expect(button("Retry failed 1")!.disabled).toBe(true);

    const stop = button("Stop batch")!;
    await act(async () => { stop.click(); });
    expect(handlers.stop).toHaveBeenCalledTimes(1);
  });
});

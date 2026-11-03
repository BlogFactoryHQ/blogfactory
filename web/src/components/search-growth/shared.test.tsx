import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, InlineError, Tag } from "@/components/search-growth/shared";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Schedule topics?" description="Nothing is published." confirmLabel="Schedule topics" onConfirm={onConfirm} />
    </>
  );
}

describe("Tag", () => {
  it("is a span so it can sit inside text, and carries the tone class", async () => {
    await render(<p><Tag tone="warning">Already covered</Tag></p>);
    const tag = container!.querySelector("span.status-badge");
    expect(tag?.textContent).toBe("Already covered");
    expect(tag?.className).toContain("status-badge-warning");
    expect(container!.querySelector("p div")).toBeNull();
  });
});

describe("InlineError", () => {
  it("announces the problem and offers a retry", async () => {
    const retry = vi.fn();
    await render(<InlineError message="The topical map could not be loaded." onRetry={retry} />);
    const alert = container!.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("The topical map could not be loaded.");
    await act(async () => { (Array.from(alert!.querySelectorAll("button")).find((button) => button.textContent === "Try again") as HTMLButtonElement).click(); });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("has no retry button when there is nothing to retry", async () => {
    await render(<InlineError message="Nope." />);
    expect(container!.querySelector("button")).toBeNull();
  });
});

describe("ConfirmDialog", () => {
  it("runs the action only when confirmed", async () => {
    const confirm = vi.fn();
    await render(<Harness onConfirm={confirm} />);
    await act(async () => { (container!.querySelector("button") as HTMLButtonElement).click(); });
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain("Schedule topics?");
    expect(confirm).not.toHaveBeenCalled();
    await act(async () => { (Array.from(dialog!.querySelectorAll("button")).find((button) => button.textContent === "Schedule topics") as HTMLButtonElement).click(); });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("gives focus back to the button that opened it when cancelled", async () => {
    await render(<Harness onConfirm={() => {}} />);
    const opener = container!.querySelector("button") as HTMLButtonElement;
    opener.focus();
    await act(async () => { opener.click(); });
    const dialog = document.querySelector('[role="alertdialog"]')!;
    await act(async () => { (Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Cancel") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

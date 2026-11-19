import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, InlineError } from "@/components/search-growth/shared";

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

describe("InlineError", () => {
  it("announces the problem as a status-error line", async () => {
    await render(<InlineError message="Could not compare the sitemap. Check the domain and try again." />);
    const alert = container!.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Could not compare the sitemap.");
    expect(alert?.className).toContain("text-status-error");
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

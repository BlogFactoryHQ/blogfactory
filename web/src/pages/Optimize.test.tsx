import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchConsoleDialog } from "@/components/search-growth/SearchConsoleDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderDialog(oauthEnabled: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<SearchConsoleDialog
    open
    integration={null}
    oauthEnabled={oauthEnabled}
    activeSiteDomain="example.com"
    onClose={() => {}}
    onOAuth={async () => {}}
    onSave={async () => {}}
    isSaving={false}
    isOAuthStarting={false}
    properties={[]}
    onSelectProperty={async () => {}}
    isSelectingProperty={false}
  />));
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Search Console connection options", () => {
  it("explains missing instance OAuth while preserving service-account setup", async () => {
    await renderDialog(false);

    expect(document.body).toHaveTextContent("Google OAuth is not configured on this server");
    expect(Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.includes("Continue with Google"))).toBe(false);
    expect(document.body).toHaveTextContent("Alternative: service account JSON (no OAuth)");
    expect(document.body).toHaveTextContent("GOOGLE_SEARCH_CONSOLE_CLIENT_ID");
    expect(document.body).toHaveTextContent("A service account is a Google identity for this BlogFactory server");
  });

  it("offers Google sign-in when instance OAuth is configured", async () => {
    await renderDialog(true);
    expect(document.body).toHaveTextContent("Continue with Google");
  });
});

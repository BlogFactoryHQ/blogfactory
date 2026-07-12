import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Integrations, { shouldReloadGhostAuthors } from "./Integrations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({
    activeSite: { id: "site-1", name: "Example", domain: "example.com" },
  }),
}));

vi.mock("@/hooks/useIntegrations", () => ({
  useIntegrations: () => ({
    integrations: [],
    isLoading: false,
    saveIntegration: { isPending: false, mutateAsync: vi.fn() },
    testIntegration: { isPending: false, mutateAsync: vi.fn() },
    deleteIntegration: { isPending: false, mutateAsync: vi.fn() },
  }),
  useGhostAuthors: () => ({ authors: [], isLoading: false, error: null }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Integrations />);
  });
}

function connectButton(provider: string) {
  const buttons = Array.from(document.querySelectorAll("button"));
  const button = buttons.find((candidate) => candidate.textContent?.includes(provider) && candidate.textContent?.includes("Connect"));
  if (!button) throw new Error(`Connect button not found for ${provider}`);
  return button as HTMLButtonElement;
}

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("Integrations setup dialog", () => {
  it("keeps an existing Ortak Alan connection open while replacement credentials reload authors", () => {
    expect(shouldReloadGhostAuthors(true, "ghost", "ortak_alan_news", true, false)).toBe(true);
    expect(shouldReloadGhostAuthors(true, "ghost", "ortak_alan_news", true, true)).toBe(false);
  });

  it.each(["WordPress", "Ghost", "Wix", "Framer"])("renders the %s provider form", async (provider) => {
    await renderPage();

    await act(async () => connectButton(provider).click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(`Connect ${provider}`);
  });

  it("opens the Ghost publishing profile options", async () => {
    await renderPage();
    await act(async () => connectButton("Ghost").click());

    const profileSelect = document.querySelector('[role="combobox"]');
    expect(profileSelect).toBeInTheDocument();

    await act(async () => {
      profileSelect?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    const options = Array.from(document.querySelectorAll('[role="option"]')).map((option) => option.textContent);
    expect(options).toEqual(expect.arrayContaining(["General Ghost", "Ghost – Ortak Alan Haber"]));
  });

  it("keeps API keys out of browser password autofill", async () => {
    await renderPage();
    await act(async () => connectButton("Ghost").click());

    const keyInput = document.querySelector('input[name="integration-ghost-adminApiKey-value"]');
    expect(keyInput).toHaveAttribute("type", "text");
    expect(keyInput).toHaveAttribute("autocomplete", "off");
    expect(keyInput).toHaveAttribute("data-form-type", "other");
  });
});

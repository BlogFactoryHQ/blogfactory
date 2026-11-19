import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const integrationMocks = vi.hoisted(() => ({
  save: vi.fn(),
  test: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/hooks/useIntegrations", () => ({
  useIntegrations: () => ({
    integrations: [],
    isLoading: false,
    saveIntegration: { isPending: false, mutateAsync: integrationMocks.save },
    testIntegration: { isPending: false, mutateAsync: integrationMocks.test },
    deleteIntegration: { isPending: false, mutateAsync: integrationMocks.remove },
  }),
  useGhostAuthors: () => ({ authors: [], isLoading: false, error: null }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPage(path = "/control/integrations") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={[path]}><Integrations /></MemoryRouter>);
  });
}

function connectButton(provider: string) {
  const buttons = Array.from(document.querySelectorAll("button"));
  const button = buttons.find((candidate) => candidate.textContent?.includes(provider) && candidate.textContent?.includes("Connect"));
  if (!button) throw new Error(`Connect button not found for ${provider}`);
  return button as HTMLButtonElement;
}

function button(label: string) {
  const candidate = Array.from(document.querySelectorAll("button")).find((element) => element.textContent?.includes(label));
  if (!candidate) throw new Error(`Button not found: ${label}`);
  return candidate as HTMLButtonElement;
}

async function enter(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`Input not found: ${name}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  const integration = {
    id: "integration-1",
    provider: "wix",
    displayName: "Wix",
    display_name: "Wix",
    status: "pending",
    config: {},
  };
  integrationMocks.save.mockReset().mockResolvedValue({ integration });
  integrationMocks.test.mockReset().mockResolvedValue({ success: true, message: "Connected", integration: { ...integration, status: "connected", ready: true } });
  integrationMocks.remove.mockReset();
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("Integrations setup dialog", () => {
  it("preserves first-draft context without implying live publishing", async () => {
    await renderPage("/control/integrations?from=first-draft&siteId=site-1");

    expect(document.body).toHaveTextContent("Choose where approved drafts should go");
    expect(document.body).toHaveTextContent("Nothing is published live");
    expect(document.body).toHaveTextContent("Choose a CMS");
    expect(document.body).not.toHaveTextContent("No integrations yet");
  });

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

  it("shows Wix credential guidance and blocks an incomplete connection", async () => {
    await renderPage();
    await act(async () => connectButton("Wix").click());

    expect(document.body).toHaveTextContent("Find this after /dashboard/ in the target site's dashboard URL");
    expect(document.querySelector('a[href="https://dev.wix.com/docs/rest/articles/getting-started/api-keys"]')).toBeInTheDocument();

    await act(async () => button("Connect and test").click());

    expect(integrationMocks.save).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('input[name="integration-wix-apiKey-value"]')?.validity.valueMissing).toBe(true);
  });

  it("saves and tests a complete Wix connection", async () => {
    await renderPage();
    await act(async () => connectButton("Wix").click());
    await enter("integration-wix-apiKey-value", "wix-key");
    await enter("integration-wix-siteId-value", "site-123");
    await enter("integration-wix-memberId-value", "member-123");

    await act(async () => button("Connect and test").click());

    expect(integrationMocks.save).toHaveBeenCalledWith(expect.objectContaining({
      provider: "wix",
      credentials: { apiKey: "wix-key", siteId: "site-123", memberId: "member-123" },
    }));
    expect(integrationMocks.test).toHaveBeenCalledWith("integration-1");
  });

  it("keeps the saved connection open when its test fails", async () => {
    integrationMocks.test.mockRejectedValueOnce(new Error("Wix rejected the key"));
    await renderPage();
    await act(async () => connectButton("Wix").click());
    await enter("integration-wix-apiKey-value", "wix-key");
    await enter("integration-wix-siteId-value", "site-123");
    await enter("integration-wix-memberId-value", "member-123");

    await act(async () => button("Connect and test").click());

    expect(document.querySelector('[role="dialog"]')).toHaveTextContent("Manage Wix");
  });
});

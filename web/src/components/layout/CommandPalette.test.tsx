import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  posts: [] as Array<{ id: string; title: string; status: string; updated_at: string }>,
  role: "user" as "user" | "admin",
  lastQueryEnabled: false,
}));

const navigate = vi.hoisted(() => vi.fn());
const activateSite = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { enabled?: boolean }) => {
    state.lastQueryEnabled = Boolean(options.enabled);
    return { data: options.enabled ? { items: state.posts } : undefined, isFetching: false };
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@example.com", role: state.role } }),
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({
    sites: [
      { id: "site-1", name: "Example", domain: "example.com" },
      { id: "site-2", name: "Second", domain: "second.com" },
    ],
    activeSiteId: "site-1",
    activateSite,
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function open() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(
    <MemoryRouter>
      <CommandPalette open onOpenChange={() => {}} />
    </MemoryRouter>,
  ));
  return document.body;
}

function itemByText(text: string) {
  return [...document.querySelectorAll("[cmdk-item]")].find((node) => node.textContent?.includes(text));
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  navigate.mockReset();
  activateSite.mockReset();
  state.posts = [];
  state.role = "user";
});

describe("CommandPalette", () => {
  it("offers every top-level surface, including ones with no sidebar entry", async () => {
    const body = await open();
    expect(body.textContent).toContain("Overview");
    expect(body.textContent).toContain("Control · Integrations");
    expect(body.textContent).toContain("Image Gallery");
    expect(body.textContent).toContain("Sources · Batch Import");
  });

  it("navigates on select", async () => {
    await open();
    const item = itemByText("Review Queue");
    await act(async () => item?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(navigate).toHaveBeenCalledWith("/review");
  });

  it("exposes site switching when more than one site exists", async () => {
    await open();
    const item = itemByText("second.com");
    expect(item).toBeTruthy();
    await act(async () => item?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(activateSite).toHaveBeenCalledWith("site-2");
  });

  it("does not switch away from the active site", async () => {
    await open();
    const item = itemByText("example.com");
    await act(async () => item?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(activateSite).not.toHaveBeenCalled();
  });

  it("hides admin-only actions from non-admins", async () => {
    await open();
    expect(itemByText("Manage users")).toBeFalsy();
  });

  it("shows admin actions to admins", async () => {
    state.role = "admin";
    await open();
    expect(itemByText("Manage users")).toBeTruthy();
  });

  it("does not search content until the query is long enough to be useful", async () => {
    await open();
    expect(state.lastQueryEnabled).toBe(false);
  });

  it("surfaces Docs and Help, which have no in-app navigation entry", async () => {
    const body = await open();
    expect(body.textContent).toContain("Documentation");
    expect(body.textContent).toContain("Help center");
  });
});

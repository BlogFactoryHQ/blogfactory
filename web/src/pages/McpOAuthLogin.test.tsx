import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import McpOAuthLogin from "./McpOAuthLogin";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { post: postMock } }));
vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({
    sites: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Ortakalan", domain: "ortakalan.io", status: "active" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Ideal Plastik", domain: "idealplastik.com.tr", status: "active" },
      { id: "33333333-3333-4333-8333-333333333333", name: "Inactive", domain: "inactive.example", status: "inactive" },
    ],
    isLoading: false,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function button(label: string) {
  const match = Array.from(document.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match as HTMLButtonElement;
}

beforeEach(async () => {
  postMock.mockReset().mockReturnValue(new Promise(() => {}));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/mcp/oauth?external_auth_id=ext_auth_01K0BLOGFACTORY"]}>
        <McpOAuthLogin />
      </MemoryRouter>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("McpOAuthLogin", () => {
  it("submits every selected active site", async () => {
    await act(async () => button("Select all sites").click());
    await act(async () => button("Continue").click());

    expect(postMock).toHaveBeenCalledWith("/mcp/oauth/complete", {
      external_auth_id: "ext_auth_01K0BLOGFACTORY",
      site_ids: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    expect(document.body).not.toHaveTextContent("inactive.example");
  });
});

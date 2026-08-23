import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Docs } from "./Docs";
import llms from "../public/llms.txt?raw";

describe("public documentation", () => {
  it("indexes task-focused guides and keeps Help as a separate support surface", () => {
    window.history.replaceState({}, "", "/docs");
    const html = renderToStaticMarkup(<Docs />);
    const document = new DOMParser().parseFromString(html, "text/html");
    const text = document.body.textContent || "";

    expect(document.querySelector("h1")?.textContent).toContain("reviewed content operation");
    expect(text).toContain("Getting Started");
    expect(text).toContain("Search Growth");
    expect(document.querySelector('input[placeholder*="MCP"]')).not.toBeNull();
    expect(document.querySelectorAll('a[href="/help"]')).not.toHaveLength(0);
  });

  it("renders canonical Markdown documentation at direct public routes", () => {
    window.history.replaceState({}, "", "/docs/mcp");
    const html = renderToStaticMarkup(<Docs />);
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector("h1")?.textContent).toContain("Connect a site-scoped MCP client");
    expect(html).toContain("expected_updated_at");
    expect(document.querySelectorAll('a[href*="/blob/main/docs/mcp.md"]')).toHaveLength(1);
  });

  it("publishes an LLM-readable index with safety boundaries", () => {
    expect(llms).toContain("https://blogfactory.io/docs/mcp");
    expect(llms).toContain("https://blogfactory.io/help");
    expect(llms).toContain("draft-only");
  });
});

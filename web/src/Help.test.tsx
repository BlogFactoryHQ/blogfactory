import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Help } from "./Help";

describe("help center", () => {
  it("offers the planned categories, documented safety boundaries, and GitHub Issues support", () => {
    const html = renderToStaticMarkup(<Help cloudMode={false} />);
    const document = new DOMParser().parseFromString(html, "text/html");
    const text = document.body.textContent || "";

    expect(["Getting Started", "Self-hosting", "MCP & Connections", "Content & Review", "CMS Draft Delivery", "Search Growth & Troubleshooting"].every((category) => text.includes(category))).toBe(true);
    expect(document.querySelector('input[placeholder*="MCP"]')).not.toBeNull();
    expect(text).toContain("Agents never publish live.");
    expect(text).not.toContain("Choose a plan and activate access");
    expect(text).toContain("Choose a supported deployment target");
    expect(text).toContain("A generation was interrupted by an API restart");
    expect(document.querySelectorAll('a[href="/docs/self-hosting"]')).not.toHaveLength(0);
    expect(document.querySelectorAll('a[href="https://github.com/BlogFactoryHQ/blogfactory/issues"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href*="/blob/main/docs/"]')).not.toHaveLength(0);
  });

  it("includes documented search targets for common MCP and revision problems", () => {
    const html = renderToStaticMarkup(<Help cloudMode={false} />);
    expect(html).toContain("MCP returns 401 or asks for authentication");
    expect(html).toContain("Resolve an expected_updated_at version conflict");
  });

  it("shows Cloud guidance without self-host operator instructions", () => {
    const html = renderToStaticMarkup(<Help cloudMode />);
    expect(html).toContain("Choose a plan and activate access");
    expect(html).toContain("Connect Search Console on Cloud");
    expect(html).not.toContain("ADMIN_EMAILS");
    expect(html).not.toContain("MinIO");
    expect(html).not.toContain("Google OAuth is not configured");
  });
});

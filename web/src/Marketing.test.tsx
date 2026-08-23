import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Marketing } from "./Marketing";

describe("marketing page", () => {
  it("uses one required HTTPS waitlist destination for every CTA", () => {
    const html = renderToStaticMarkup(<Marketing waitlistUrl="https://waitlist.example/form" />);
    const document = new DOMParser().parseFromString(html, "text/html");
    const waitlistLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[data-cta="cloud-waitlist"]')];

    expect(waitlistLinks.map((link) => link.href)).toEqual([
      "https://waitlist.example/form",
      "https://waitlist.example/form",
      "https://waitlist.example/form",
    ]);
    expect(waitlistLinks.map((link) => link.textContent?.trim()))
      .toEqual(["Cloud coming soon", "Cloud coming soon", "Cloud coming soon"]);
    expect(() => renderToStaticMarkup(<Marketing waitlistUrl="http://waitlist.example/form" />))
      .toThrow("VITE_WAITLIST_URL must be a valid HTTPS URL");
  });

  it("states the outcome, operating model, and draft-only boundary", () => {
    const html = renderToStaticMarkup(<Marketing waitlistUrl="https://waitlist.example/form" />);
    const document = new DOMParser().parseFromString(html, "text/html");
    const text = document.body.textContent || "";

    expect(document.querySelector("h1")?.textContent).toContain("reviewed CMS drafts");
    expect(text).toContain("Your AI can write. BlogFactory runs the operation.");
    expect(text).toContain("WordPress · Ghost · Wix · Framer");
    expect(text).toContain("Never publishes live");
    expect(text).toContain("Community self-hosted");
    expect(text).toContain("BlogFactory Cloud");
    expect(document.querySelectorAll('a[data-cta="source"]')).toHaveLength(3);
    expect(text).not.toMatch(/\b\d+[KMB]\+?\b/);
    expect([...document.querySelectorAll("nav a")].map((link) => link.getAttribute("href")))
      .toEqual(["#workflow", "#why-blogfactory", "#faq"]);
  });
});

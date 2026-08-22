import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Marketing } from "./Marketing";

describe("marketing page", () => {
  it("uses one required HTTPS waitlist destination for every CTA", () => {
    const html = renderToStaticMarkup(<Marketing waitlistUrl="https://waitlist.example/form" />);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(hrefs).toEqual([
      "https://waitlist.example/form",
      "https://waitlist.example/form",
    ]);
    expect([...document.querySelectorAll("a")].map((link) => link.textContent?.trim()))
      .toEqual(["Join the waitlist", "Join the waitlist"]);
    expect(() => renderToStaticMarkup(<Marketing waitlistUrl="http://waitlist.example/form" />))
      .toThrow("VITE_WAITLIST_URL must be a valid HTTPS URL");
  });
});

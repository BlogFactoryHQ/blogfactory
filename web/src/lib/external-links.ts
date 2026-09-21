/**
 * Destinations outside the authenticated SPA.
 *
 * Docs and Help ship as their own HTML entries (`docs.html`, `help.html`). The
 * app build serves every other path through `index.html`, where `/docs` and
 * `/help` would render the SPA's not-found page, so in-app links target the
 * entry files directly.
 */
export const DOCS_URL = "/docs.html";
export const HELP_URL = "/help.html";
export const FEEDBACK_URL = "https://github.com/BlogFactoryHQ/blogfactory/issues/new/choose";

export function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

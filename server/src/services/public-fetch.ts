// Outbound reads of public pages for research and audits. The network guard lives in safe-fetch.ts (DNS pinning, private
// ranges, redirect checks, size and time limits); this wrapper only turns "could not read it" into null.
import { safeFetch } from "./safe-fetch.js";

const USER_AGENT = "BlogFactoryBot/1.0 (+https://blogfactory.io)";

type Fetcher = typeof safeFetch;
let fetcher: Fetcher = safeFetch;

// Test seam: lets integration tests serve fixture pages without opening sockets. Pass null to restore the real guard.
export function setPublicFetcherForTests(next: Fetcher | null) {
  fetcher = next ?? safeFetch;
}

export async function publicFetchText(
  input: string,
  options: { accept: string; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; requireHtml?: boolean },
): Promise<{ text: string; url: string } | null> {
  try {
    const response = await fetcher(input, {
      headers: { "User-Agent": USER_AGENT, Accept: options.accept },
      timeoutMs: options.timeoutMs ?? 10_000,
      maxResponseBytes: options.maxBytes ?? 2_000_000,
      maxRedirects: options.maxRedirects ?? 3,
    });
    if (!response.ok) return null;
    if (options.requireHtml && !(response.headers.get("content-type") || "").includes("html")) return null;
    return { text: await response.text(), url: response.url || input };
  } catch {
    return null;
  }
}

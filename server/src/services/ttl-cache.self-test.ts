import assert from "node:assert/strict";
import { publicFetchText, setPublicFetcherForTests } from "./public-fetch.js";
import { createTtlCache } from "./ttl-cache.js";

const cache = createTtlCache<number>(50, 2);
cache.set("a", 1); cache.set("b", 2); cache.set("c", 3);
assert.equal(cache.get("a"), undefined, "oldest entry is evicted at capacity");
assert.equal(cache.get("c"), 3);
await new Promise((resolve) => setTimeout(resolve, 70));
assert.equal(cache.get("c"), undefined, "entries expire");

// publicFetchText never throws and never reaches a private address (the guard itself is covered by safe-fetch tests).
for (const url of ["http://localhost:9/x", "http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data", "http://[::1]/x", "http://10.0.0.5/x", "ftp://example.com/x", "not a url"]) {
  assert.equal(await publicFetchText(url, { accept: "*/*" }), null, url);
}

setPublicFetcherForTests(async () => new Response("<html>ok</html>", { headers: { "content-type": "text/html" } }));
assert.equal((await publicFetchText("https://example.com/", { accept: "text/html", requireHtml: true }))?.text, "<html>ok</html>");
setPublicFetcherForTests(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
assert.equal(await publicFetchText("https://example.com/", { accept: "text/html", requireHtml: true }), null, "non-HTML is refused when HTML is required");
setPublicFetcherForTests(async () => new Response("nope", { status: 404 }));
assert.equal(await publicFetchText("https://example.com/", { accept: "*/*" }), null, "error statuses become null");
setPublicFetcherForTests(async () => { throw new Error("Response is too large"); });
assert.equal(await publicFetchText("https://example.com/", { accept: "*/*" }), null, "guard errors become null");
setPublicFetcherForTests(null);

console.log("ttl-cache and public-fetch self-test passed");

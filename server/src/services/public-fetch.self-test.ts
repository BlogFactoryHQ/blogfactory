import assert from "node:assert/strict";
import { assertPublicUrl, isBlockedHostname, isPrivateAddress, publicFetchText } from "./public-fetch.js";
import { createTtlCache } from "./ttl-cache.js";

for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "[::1]"]) {
  assert.equal(isPrivateAddress(address), true, address);
}
for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111"]) {
  assert.equal(isPrivateAddress(address), false, address);
}
assert.equal(isPrivateAddress("not-an-ip"), true, "unknown formats fail closed");
assert.equal(isBlockedHostname("localhost"), true);
assert.equal(isBlockedHostname("app.localhost"), true);
assert.equal(isBlockedHostname("db.internal"), true);
assert.equal(isBlockedHostname("example.com"), false);

await assert.rejects(assertPublicUrl(new URL("http://127.0.0.1/x")));
await assert.rejects(assertPublicUrl(new URL("http://[::1]/x")));
await assert.rejects(assertPublicUrl(new URL("http://2130706433/x")), undefined, "decimal IPv4 normalizes to a private address");
await assert.rejects(assertPublicUrl(new URL("ftp://example.com/x")));
await assert.rejects(assertPublicUrl(new URL("http://intranet/x")));
await assertPublicUrl(new URL("https://1.1.1.1/"));
assert.equal(await publicFetchText("http://localhost:9/x", { accept: "*/*" }), null);

const cache = createTtlCache<number>(50, 2);
cache.set("a", 1); cache.set("b", 2); cache.set("c", 3);
assert.equal(cache.get("a"), undefined, "oldest entry is evicted at capacity");
assert.equal(cache.get("c"), 3);
await new Promise((resolve) => setTimeout(resolve, 70));
assert.equal(cache.get("c"), undefined, "entries expire");

console.log("public-fetch self-test passed");

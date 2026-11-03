import { resolvePublicAddresses, safeFetch, validatePublicRedirect, validatePublicUrl } from "./safe-fetch.js";

async function run() {
  validatePublicUrl("https://example.com/article");
  validatePublicUrl("https://8.8.8.8/feed.xml");

  for (const url of [
    "file:///etc/passwd",
    "http://user:pass@example.com",
    "http://localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "http://[::1]",
    "http://[::7f00:1]",
    "http://[::ffff:127.0.0.1]",
    "http://[2002:7f00:1::]",
    "http://169.254.169.254/latest/meta-data",
  ]) {
    let rejected = false;
    try {
      validatePublicUrl(url);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Expected private URL to be rejected: ${url}`);
  }

  let dnsRejected = false;
  try {
    await resolvePublicAddresses("example.com", async () => [{ address: "10.0.0.1", family: 4 }]);
  } catch {
    dnsRejected = true;
  }
  if (!dnsRejected) throw new Error("Expected a public hostname resolving privately to be rejected");

  let redirectRejected = false;
  try {
    validatePublicRedirect("http://169.254.169.254/latest/meta-data", new URL("https://example.com/start"));
  } catch {
    redirectRejected = true;
  }
  if (!redirectRejected) throw new Error("Expected a redirect to a private host to be rejected");

  let bodyRedirectRejected = false;
  try {
    validatePublicRedirect("https://attacker.example/collect", new URL("https://oauth.example/token"), "POST");
  } catch {
    bodyRedirectRejected = true;
  }
  if (!bodyRedirectRejected) throw new Error("Expected a cross-origin POST redirect to be rejected");

  const publicAnswers = await resolvePublicAddresses("example.com", async () => [{ address: "93.184.216.34", family: 4 }]);
  if (publicAnswers[0]?.address !== "93.184.216.34") throw new Error("Expected a public DNS answer to be preserved");

  let requestRejected = false;
  try {
    await safeFetch("http://127.0.0.1", { timeoutMs: 100 });
  } catch {
    requestRejected = true;
  }
  if (!requestRejected) throw new Error("Expected loopback fetch to be rejected before connecting");
}

await run();

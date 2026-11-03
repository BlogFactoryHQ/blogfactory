// Outbound fetches for user- or provider-supplied URLs. Resolves DNS and refuses private, loopback,
// link-local and metadata addresses on every redirect hop, and caps the body size.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const USER_AGENT = "BlogFactoryBot/1.0 (+https://blogfactory.io)";

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(ip) === 6) {
    return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith("ff");
  }
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
    || host.includes("metadata.google") || host.includes("instance-data");
}

export async function assertPublicUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http and https URLs are allowed");
  if (isBlockedHostname(url.hostname)) throw new Error("Private or internal hosts are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Private or internal hosts are not allowed");
    return;
  }
  if (!host.includes(".")) throw new Error("Private or internal hosts are not allowed");
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("Private or internal hosts are not allowed");
}

async function readCapped(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks)).slice(0, maxBytes);
}

export async function publicFetchText(
  input: string,
  options: { accept: string; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; requireHtml?: boolean },
): Promise<{ text: string; url: string } | null> {
  let current = new URL(input);
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop += 1) {
    try { await assertPublicUrl(current); } catch { return null; }
    const response = await fetch(current, { headers: { "User-Agent": USER_AGENT, Accept: options.accept }, redirect: "manual", signal: deadline }).catch(() => null);
    if (!response) return null;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try { current = new URL(location, current); } catch { return null; }
      continue;
    }
    if (!response.ok) return null;
    if (options.requireHtml && !(response.headers.get("content-type") || "").includes("html")) return null;
    return { text: await readCapped(response, options.maxBytes ?? 400_000), url: current.href };
  }
  return null;
}

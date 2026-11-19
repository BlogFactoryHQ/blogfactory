import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedIpv4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48],
  ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blockedIpv6.addSubnet(network, prefix, "ipv6");

type Address = { address: string; family: 4 | 6 };
type Resolver = (hostname: string) => Promise<Address[]>;

export interface SafeFetchInit extends RequestInit {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
}

export function validatePublicUrl(input: string | URL) {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("URL must use http or https");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || (!isIP(hostname) && !hostname.includes("."))) throw new Error("URL host must be a public hostname");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("URL host must be public");
  }
  if (isIP(hostname) && isBlockedAddress(hostname)) throw new Error("URL host must be public");
  return url;
}

export function validatePublicRedirect(location: string, currentUrl: URL, method = "GET") {
  const next = validatePublicUrl(new URL(location, currentUrl));
  if (next.origin !== currentUrl.origin && method !== "GET" && method !== "HEAD") {
    throw new Error("Cross-origin redirects are not allowed for requests with a body");
  }
  return next;
}

export async function resolvePublicAddresses(hostname: string, resolver: Resolver = resolveAddresses) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const literalFamily = isIP(normalized);
  const addresses = literalFamily
    ? [{ address: normalized, family: literalFamily as 4 | 6 }]
    : await resolver(normalized);
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("URL host resolves to a non-public address");
  }
  return addresses;
}

export async function safeFetch(input: string | URL | Request, init: SafeFetchInit = {}) {
  const source = new Request(input, init);
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = init.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(source.signal.reason);
  source.signal.addEventListener("abort", abort, { once: true });
  if (source.signal.aborted) abort();

  let url = validatePublicUrl(source.url);
  let method = source.method;
  let headers = new Headers(source.headers);
  let body = method === "GET" || method === "HEAD" ? undefined : Buffer.from(await source.arrayBuffer());

  try {
    for (let redirects = 0; ; redirects += 1) {
      const addresses = await abortable(resolvePublicAddresses(url.hostname), controller.signal);
      const response = await requestPinned(url, addresses[0], method, headers, body, controller.signal, maxResponseBytes);
      const location = response.headers.get("location");
      if (!location || ![301, 302, 303, 307, 308].includes(response.status) || source.redirect === "manual") return response;
      if (source.redirect === "error") throw new Error("Redirects are not allowed");
      if (redirects >= maxRedirects) throw new Error("Too many redirects");

      const next = validatePublicRedirect(location, url, method);
      if (next.origin !== url.origin) {
        headers.delete("authorization");
        headers.delete("cookie");
        headers.delete("proxy-authorization");
      }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
        headers.delete("content-type");
      }
      url = next;
    }
  } finally {
    clearTimeout(timeout);
    source.signal.removeEventListener("abort", abort);
  }
}

function isBlockedAddress(address: string) {
  const family = isIP(address);
  return !family || (family === 4 ? blockedIpv4.check(address, "ipv4") : blockedIpv6.check(address, "ipv6"));
}

async function resolveAddresses(hostname: string): Promise<Address[]> {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function requestPinned(
  url: URL,
  target: Address,
  method: string,
  sourceHeaders: Headers,
  body: Buffer | undefined,
  signal: AbortSignal,
  maxResponseBytes: number,
) {
  return new Promise<Response>((resolve, reject) => {
    const headers = new Headers(sourceHeaders);
    headers.delete("host");
    headers.delete("connection");
    headers.delete("transfer-encoding");
    headers.delete("content-length");
    headers.set("accept-encoding", "identity");
    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [target]);
      else callback(null, target.address, target.family);
    };
    const request = requester(url, {
      method,
      headers: Object.fromEntries(headers),
      signal,
      agent: false,
      servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
      lookup: pinnedLookup,
    }, (incoming) => {
      void (async () => {
        try {
          const contentLength = Number(incoming.headers["content-length"] || 0);
          if (contentLength > maxResponseBytes) throw new Error("Response is too large");
          const encoding = incoming.headers["content-encoding"];
          if (encoding && encoding !== "identity") throw new Error("Compressed responses are not supported");
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of incoming) {
            const bytes = Buffer.from(chunk);
            size += bytes.length;
            if (size > maxResponseBytes) throw new Error("Response is too large");
            chunks.push(bytes);
          }
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
          }
          const status = incoming.statusCode || 500;
          const response = new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
            status,
            statusText: incoming.statusMessage,
            headers: responseHeaders,
          });
          Object.defineProperties(response, {
            url: { value: url.toString() },
            redirected: { value: false },
          });
          resolve(response);
        } catch (error) {
          incoming.destroy();
          reject(error);
        }
      })();
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

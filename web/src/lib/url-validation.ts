import { z } from "zod";

// Private IP ranges that should be blocked to prevent SSRF
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // 127.0.0.0/8 (localhost)
  /^10\./,                           // 10.0.0.0/8 (private)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12 (private)
  /^192\.168\./,                     // 192.168.0.0/16 (private)
  /^169\.254\./,                     // 169.254.0.0/16 (link-local/metadata)
  /^0\./,                            // 0.0.0.0/8 (reserved)
  /^100\.(6[4-9]|[7-9][0-9]|1[0-2][0-7])\./,  // 100.64.0.0/10 (CGNAT)
  /^192\.0\.0\./,                    // 192.0.0.0/24 (IETF)
  /^192\.0\.2\./,                    // 192.0.2.0/24 (TEST-NET)
  /^198\.51\.100\./,                 // 198.51.100.0/24 (TEST-NET-2)
  /^203\.0\.113\./,                  // 203.0.113.0/24 (TEST-NET-3)
  /^224\./,                          // 224.0.0.0/4 (multicast)
  /^240\./,                          // 240.0.0.0/4 (reserved)
];

// Blocked hostnames
const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::]",
  "[::1]",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
];

// Check if hostname is a private/internal IP
function isPrivateIp(hostname: string): boolean {
  // Check blocked hostnames
  if (BLOCKED_HOSTNAMES.some((blocked) => hostname.toLowerCase().includes(blocked))) {
    return true;
  }

  // Check IP patterns
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

// Validate RSS/URL source
export function validateSourceUrl(url: string): { valid: boolean; error?: string } {
  // Basic URL format validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Protocol whitelist - only allow http and https
  const allowedProtocols = ["http:", "https:"];
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return { valid: false, error: "Only HTTP and HTTPS URLs are allowed" };
  }

  // Check for private/internal IPs
  const hostname = parsedUrl.hostname;
  if (isPrivateIp(hostname)) {
    return { valid: false, error: "Internal or private URLs are not allowed" };
  }

  // Basic hostname validation (must have at least one dot for domain)
  if (!hostname.includes(".") && hostname !== "localhost") {
    return { valid: false, error: "Invalid domain name" };
  }

  // Check for cloud metadata endpoints
  const metadataEndpoints = [
    "169.254.169.254",
    "metadata.google",
    "instance-data",
  ];
  if (metadataEndpoints.some((endpoint) => hostname.includes(endpoint))) {
    return { valid: false, error: "Cloud metadata endpoints are not allowed" };
  }

  return { valid: true };
}

// Zod schema for RSS URL validation
export const rssUrlSchema = z.string().refine(
  (url) => {
    const result = validateSourceUrl(url);
    return result.valid;
  },
  (url) => {
    const result = validateSourceUrl(url);
    return { message: result.error || "Invalid URL" };
  }
);

// Validate platform-specific inputs
export function validatePlatformInput(
  platform: string,
  value: string
): { valid: boolean; error?: string } {
  // Alphanumeric with underscores/hyphens for identifiers
  const identifierPattern = /^[a-zA-Z0-9_-]+$/;
  // Domain pattern
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

  switch (platform) {
    case "reddit":
      // Subreddit names: 3-21 chars, alphanumeric with underscores
      if (!/^[a-zA-Z0-9_]{3,21}$/.test(value)) {
        return { valid: false, error: "Invalid subreddit name (3-21 alphanumeric characters)" };
      }
      return { valid: true };

    case "lemmy":
      // Lemmy instance should be a valid domain
      if (!domainPattern.test(value)) {
        return { valid: false, error: "Invalid Lemmy instance domain" };
      }
      return { valid: true };

    case "github":
    case "lobsters":
    case "hackernews":
      // These use safe identifiers or predefined values
      if (value && !identifierPattern.test(value)) {
        return { valid: false, error: "Invalid characters in input" };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
}

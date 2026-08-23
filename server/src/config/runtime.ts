type RuntimeEnv = Record<string, string | undefined>;

export function isPlaceholderValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() || "";
  return !normalized
    || normalized.includes("change-me")
    || normalized.includes("changeme")
    || normalized.includes("replace-me")
    || normalized.includes("replace_with");
}

function strongSecret(value: string | undefined) {
  return !isPlaceholderValue(value) && value!.trim().length >= 32;
}

function validUrl(value: string | undefined, protocols: string[]) {
  try {
    const url = new URL(value || "");
    return protocols.includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validOrigin(value: string | undefined) {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol)
      && Boolean(url.hostname)
      && url.pathname === "/"
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function validAdminEmails(value: string | undefined) {
  const emails = (value || "").split(",").map((email) => email.trim()).filter(Boolean);
  return emails.length > 0 && emails.every((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
}

function validDatabaseUrl(value: string | undefined) {
  try {
    if (!validUrl(value, ["postgres:", "postgresql:"])) return false;
    return strongSecret(decodeURIComponent(new URL(value!).password));
  } catch {
    return false;
  }
}

export function resolvePort(value = process.env.PORT) {
  const port = Number(value || 3000);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3000;
}

export function resolveMcpEndpoint(env: RuntimeEnv = process.env, requestUrl?: string) {
  const base = env.MCP_RESOURCE_URL || env.WEB_APP_URL || requestUrl;
  if (!base) return "http://localhost:8080/mcp";
  return new URL("/mcp", base).toString();
}

export function validateSelfHostedConfig(env: RuntimeEnv = process.env) {
  if (env.BLOGFACTORY_SELF_HOSTED !== "true") return;

  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "API_KEY_ENCRYPTION_SECRET",
    "CRON_SECRET",
    "ADMIN_EMAILS",
    "WEB_APP_URL",
    "MCP_ALLOWED_ORIGINS",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ];
  const invalid = required.filter((name) => isPlaceholderValue(env[name]));
  for (const name of ["JWT_SECRET", "API_KEY_ENCRYPTION_SECRET", "CRON_SECRET", "S3_SECRET_ACCESS_KEY"]) {
    if (!strongSecret(env[name])) invalid.push(name);
  }
  if (!validDatabaseUrl(env.DATABASE_URL)) invalid.push("DATABASE_URL");
  if (!validAdminEmails(env.ADMIN_EMAILS)) invalid.push("ADMIN_EMAILS");
  if (!validOrigin(env.WEB_APP_URL)) invalid.push("WEB_APP_URL");
  if (!validUrl(env.S3_ENDPOINT, ["http:", "https:"])) invalid.push("S3_ENDPOINT");
  if (!(env.MCP_ALLOWED_ORIGINS || "").split(",").every((origin) => validOrigin(origin.trim()))) {
    invalid.push("MCP_ALLOWED_ORIGINS");
  }
  const uniqueInvalid = [...new Set(invalid)];
  if (uniqueInvalid.length) throw new Error(`Self-hosted configuration is incomplete: ${uniqueInvalid.join(", ")}`);
}

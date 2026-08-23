type RuntimeEnv = Record<string, string | undefined>;

function configured(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() || "";
  return Boolean(normalized) && !normalized.includes("change-me") && !normalized.includes("changeme");
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
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ];
  const invalid = required.filter((name) => !configured(env[name]));
  if (invalid.length) throw new Error(`Self-hosted configuration is incomplete: ${invalid.join(", ")}`);
}

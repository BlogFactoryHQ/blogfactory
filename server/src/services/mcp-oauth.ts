import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sites, users } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";
import { MCP_OAUTH_SITE_ID_CLAIM, getMcpOAuthConfig } from "../mcp/oauth.js";

type OAuthAccount = {
  id: string;
  email: string;
  sites: Array<{ id: string; name: string; domain: string }>;
};

type McpOAuthCompletionDependencies = {
  loadAccount: (userId: string) => Promise<OAuthAccount | undefined>;
  request: typeof fetch;
  env: Record<string, string | undefined>;
};

async function loadOAuthAccount(userId: string): Promise<OAuthAccount | undefined> {
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return undefined;
  return {
    ...user,
    sites: await db
      .select({ id: sites.id, name: sites.name, domain: sites.domain })
      .from(sites)
      .where(and(eq(sites.userId, userId), eq(sites.status, "active")))
      .orderBy(asc(sites.name), asc(sites.domain), asc(sites.id)),
  };
}

const productionDependencies: McpOAuthCompletionDependencies = {
  loadAccount: loadOAuthAccount,
  request: fetch,
  env: process.env,
};

export async function completeMcpOAuthLogin(
  userId: string,
  externalAuthId: unknown,
  dependencies = productionDependencies,
) {
  if (
    typeof externalAuthId !== "string"
    || !/^[A-Za-z0-9_-]{8,255}$/.test(externalAuthId)
  ) {
    throw new ApiError(400, "validation_error", "The authorization request is invalid or expired");
  }

  const config = getMcpOAuthConfig(dependencies.env);
  const apiKey = dependencies.env.WORKOS_API_KEY?.trim();
  if (!config || !apiKey) {
    throw new ApiError(503, "service_unavailable", "OAuth connection is not configured");
  }
  const account = await dependencies.loadAccount(userId);
  if (!account) throw new ApiError(404, "not_found", "User not found");
  if (!account.sites.length) {
    throw new ApiError(409, "conflict", "Add an active site before connecting an MCP client");
  }

  const response = await dependencies.request("https://api.workos.com/authkit/oauth2/complete", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      external_auth_id: externalAuthId,
      user: { id: account.id, email: account.email },
      user_consent_options: [{
        claim: MCP_OAUTH_SITE_ID_CLAIM,
        type: "enum",
        label: "BlogFactory site",
        choices: account.sites.map((site) => ({
          value: site.id,
          label: `${site.name} — ${site.domain}`,
        })),
      }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ApiError(
      response.status >= 400 && response.status < 500 ? 400 : 502,
      response.status >= 400 && response.status < 500 ? "validation_error" : "upstream_failure",
      response.status >= 400 && response.status < 500
        ? "The authorization request is invalid or expired"
        : "The authorization provider is unavailable",
    );
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.redirect_uri !== "string") {
    throw new ApiError(502, "upstream_failure", "The authorization provider returned an invalid response");
  }
  const redirect = new URL(body.redirect_uri);
  if (redirect.protocol !== "https:" || redirect.origin !== config.issuer) {
    throw new ApiError(502, "upstream_failure", "The authorization provider returned an invalid redirect");
  }
  return { redirect_uri: redirect.toString() };
}

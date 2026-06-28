import { importPKCS8, jwtVerify, SignJWT } from "jose";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { searchConsoleIntegrations, searchConsoleMetrics, sites } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "./api-keys.js";
import { refreshOptimizePages } from "./optimize.js";

const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const OAUTH_STATE_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

type IntegrationRow = typeof searchConsoleIntegrations.$inferSelect;

interface ServiceAccountCredentials {
  type?: "service_account";
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface OAuthCredentials {
  type: "oauth";
  refresh_token: string;
  token_uri?: string;
}

type GoogleCredentials = ServiceAccountCredentials | OAuthCredentials;

export interface SearchAnalyticsMetric {
  date: string;
  pageUrl: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export function normalizeSearchConsoleProperty(input: string) {
  const value = String(input || "").trim();
  if (!value) throw new Error("Search Console property is required");
  if (value.startsWith("sc-domain:")) {
    const host = comparableHost(value.slice("sc-domain:".length));
    if (!host || host.includes("/")) throw new Error("Domain property must look like sc-domain:example.com");
    return `sc-domain:${host}`;
  }

  const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS properties are supported");
  parsed.hash = "";
  parsed.search = "";
  if (!parsed.pathname) parsed.pathname = "/";
  return parsed.toString();
}

export function encryptSearchConsoleCredentials(input: unknown) {
  const credentials = validateServiceAccountCredentials(input);
  return {
    encrypted: encryptSecret(JSON.stringify(credentials)),
    hint: credentials.client_email,
  };
}

export function decryptSearchConsoleCredentials(row: IntegrationRow) {
  return validateCredentials(JSON.parse(decryptSecret(row.credentialsEncrypted)));
}

export function serializeSearchConsoleIntegration(row: IntegrationRow) {
  return {
    id: row.id,
    userId: row.userId,
    user_id: row.userId,
    siteId: row.siteId,
    site_id: row.siteId,
    propertyUrl: row.propertyUrl,
    property_url: row.propertyUrl,
    status: row.status,
    credentialHint: row.credentialHint,
    credential_hint: row.credentialHint,
    lastTestedAt: row.lastTestedAt,
    last_tested_at: row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    last_test_result: row.lastTestResult,
    lastSyncAt: row.lastSyncAt,
    last_sync_at: row.lastSyncAt,
    createdAt: row.createdAt,
    created_at: row.createdAt,
    updatedAt: row.updatedAt,
    updated_at: row.updatedAt,
  };
}

export function mapSearchAnalyticsRows(rows: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>) {
  return rows
    .map((row) => {
      const [date, pageUrl, query] = row.keys || [];
      if (!date || !pageUrl || !query) return null;
      return {
        date,
        pageUrl,
        query,
        clicks: Math.round(Number(row.clicks || 0)),
        impressions: Math.round(Number(row.impressions || 0)),
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0),
      };
    })
    .filter((row): row is SearchAnalyticsMetric => Boolean(row));
}

export async function getSearchConsoleDashboard(userId: string, siteId: string) {
  const [integration] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId)))
    .limit(1);

  const metrics = await db
    .select()
    .from(searchConsoleMetrics)
    .where(and(eq(searchConsoleMetrics.userId, userId), eq(searchConsoleMetrics.siteId, siteId)));

  const pageCount = new Set(metrics.map((metric) => metric.pageUrl)).size;
  const queryCount = new Set(metrics.map((metric) => metric.query)).size;
  const clicks = metrics.reduce((sum, metric) => sum + metric.clicks, 0);
  const impressions = metrics.reduce((sum, metric) => sum + metric.impressions, 0);

  return {
    integration: integration ? serializeSearchConsoleIntegration(integration) : null,
    stats: { pageCount, queryCount, clicks, impressions },
  };
}

export async function testSearchConsoleIntegration(row: IntegrationRow) {
  const credentials = decryptSearchConsoleCredentials(row);
  const token = await googleAccessToken(credentials);
  const sites = await listSearchConsoleSites(token);
  if (!sites.includes(row.propertyUrl)) throw new Error(`${credentialLabel(credentials)} cannot access ${row.propertyUrl}`);
  return { success: true, message: `Connected to ${row.propertyUrl}` };
}

export async function createSearchConsoleOAuthUrl(opts: { userId: string; siteId: string; propertyUrl: string; requestUrl: string }) {
  const config = googleOAuthConfig(opts.requestUrl);
  const propertyUrl = normalizeSearchConsoleProperty(opts.propertyUrl);
  const state = await new SignJWT({ userId: opts.userId, siteId: opts.siteId, propertyUrl })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(OAUTH_STATE_SECRET);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SEARCH_CONSOLE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeSearchConsoleOAuth(opts: { code: string; state: string; requestUrl: string }) {
  const config = googleOAuthConfig(opts.requestUrl);
  const { payload } = await jwtVerify(opts.state, OAUTH_STATE_SECRET);
  const userId = String(payload.userId || "");
  const siteId = String(payload.siteId || "");
  const propertyUrl = normalizeSearchConsoleProperty(String(payload.propertyUrl || ""));
  if (!userId || !siteId) throw new Error("Invalid Search Console OAuth state");

  const token = await exchangeOAuthCode(opts.code, config);
  if (!token.refresh_token) throw new Error("Google did not return a refresh token. Try again and approve offline access.");
  const sites = await listSearchConsoleSites(token.access_token);
  if (!sites.includes(propertyUrl)) throw new Error(`Google account cannot access ${propertyUrl}`);

  const credentials: OAuthCredentials = {
    type: "oauth",
    refresh_token: token.refresh_token,
    token_uri: GOOGLE_TOKEN_URI,
  };

  const [existing] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId)))
    .limit(1);

  const values = {
    propertyUrl,
    status: "connected",
    credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
    credentialHint: "Google OAuth",
    lastTestedAt: new Date(),
    lastTestResult: `Connected to ${propertyUrl}`,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(searchConsoleIntegrations)
      .set(values)
      .where(eq(searchConsoleIntegrations.id, existing.id))
      .returning();
    return serializeSearchConsoleIntegration(updated);
  }

  const [created] = await db
    .insert(searchConsoleIntegrations)
    .values({ userId, siteId, ...values })
    .returning();
  return serializeSearchConsoleIntegration(created);
}

export async function syncSearchConsoleMetrics(userId: string, siteId: string) {
  const [integration] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId)))
    .limit(1);
  if (!integration) throw new Error("Connect Search Console first");

  const end = daysAgo(3);
  const start = daysAgo(34);
  const metrics = await querySearchAnalytics(integration, isoDate(start), isoDate(end));

  for (const metric of metrics) {
    await db
      .insert(searchConsoleMetrics)
      .values({
        userId,
        siteId,
        date: metric.date,
        pageUrl: metric.pageUrl,
        query: metric.query,
        clicks: metric.clicks,
        impressions: metric.impressions,
        ctr: metric.ctr,
        position: metric.position,
      })
      .onConflictDoUpdate({
        target: [searchConsoleMetrics.siteId, searchConsoleMetrics.date, searchConsoleMetrics.pageUrl, searchConsoleMetrics.query],
        set: {
          clicks: metric.clicks,
          impressions: metric.impressions,
          ctr: metric.ctr,
          position: metric.position,
          updatedAt: new Date(),
        },
      });
  }

  const [updated] = await db
    .update(searchConsoleIntegrations)
    .set({ lastSyncAt: new Date(), status: "connected" })
    .where(eq(searchConsoleIntegrations.id, integration.id))
    .returning();

  return { synced: metrics.length, integration: serializeSearchConsoleIntegration(updated) };
}

export async function drainSearchConsoleSync(limit = 10) {
  const staleBefore = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(
      eq(searchConsoleIntegrations.status, "connected"),
      or(isNull(searchConsoleIntegrations.lastSyncAt), lt(searchConsoleIntegrations.lastSyncAt, staleBefore)),
    ))
    .orderBy(asc(searchConsoleIntegrations.lastSyncAt), asc(searchConsoleIntegrations.createdAt))
    .limit(limit);

  const results: Array<{ integrationId: string; siteId: string; synced: number; optimizePages: number; error?: string }> = [];
  for (const row of rows) {
    try {
      const synced = await syncSearchConsoleMetrics(row.userId, row.siteId);
      const refreshed = await refreshOptimizePages(row.userId, row.siteId);
      results.push({ integrationId: row.id, siteId: row.siteId, synced: synced.synced, optimizePages: refreshed.updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search Console sync failed";
      await db
        .update(searchConsoleIntegrations)
        .set({ status: "error", lastTestResult: message, updatedAt: new Date() })
        .where(eq(searchConsoleIntegrations.id, row.id));
      results.push({ integrationId: row.id, siteId: row.siteId, synced: 0, optimizePages: 0, error: message });
    }
  }

  return { checked: rows.length, results };
}

export async function hasSiteAccess(userId: string, siteId: string) {
  if (!siteId) return false;
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);
  return Boolean(site);
}

async function querySearchAnalytics(integration: IntegrationRow, startDate: string, endDate: string) {
  const credentials = decryptSearchConsoleCredentials(integration);
  const token = await googleAccessToken(credentials);
  const all: SearchAnalyticsMetric[] = [];
  const rowLimit = 25000;

  for (let startRow = 0; ; startRow += rowLimit) {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(integration.propertyUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["date", "page", "query"],
          type: "web",
          rowLimit,
          startRow,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await response.json() as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "Search Console sync failed");
    const rows = mapSearchAnalyticsRows(data.rows || []);
    all.push(...rows);
    if (rows.length < rowLimit) break;
  }

  return all;
}

function validateCredentials(input: unknown): GoogleCredentials {
  const value = typeof input === "string" ? parseJson(input) : input;
  if (!value || typeof value !== "object") throw new Error("Search Console credentials are required");
  const record = value as Record<string, unknown>;
  if (record.type === "oauth") {
    const credentials = {
      type: "oauth" as const,
      refresh_token: String(record.refresh_token || "").trim(),
      token_uri: String(record.token_uri || GOOGLE_TOKEN_URI).trim(),
    };
    if (!credentials.refresh_token) throw new Error("Google OAuth credentials must include refresh_token");
    return credentials;
  }
  return validateServiceAccountCredentials(record);
}

function validateServiceAccountCredentials(input: unknown): ServiceAccountCredentials {
  const value = typeof input === "string" ? parseJson(input) : input;
  if (!value || typeof value !== "object") throw new Error("Service account JSON is required");
  const record = value as Record<string, unknown>;
  const credentials = {
    type: "service_account" as const,
    client_email: String(record.client_email || "").trim(),
    private_key: String(record.private_key || "").replace(/\\n/g, "\n").trim(),
    token_uri: String(record.token_uri || GOOGLE_TOKEN_URI).trim(),
  };
  if (!credentials.client_email || !credentials.private_key.includes("PRIVATE KEY")) {
    throw new Error("Service account JSON must include client_email and private_key");
  }
  return credentials;
}

async function googleAccessToken(credentials: GoogleCredentials) {
  if (credentials.type === "oauth") {
    return refreshOAuthAccessToken(credentials);
  }

  const tokenUri = credentials.token_uri || GOOGLE_TOKEN_URI;
  const assertion = await new SignJWT({ scope: SEARCH_CONSOLE_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.client_email)
    .setSubject(credentials.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(await importPKCS8(credentials.private_key.replace(/\\n/g, "\n"), "RS256"));

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json() as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google token request failed");
  return data.access_token;
}

async function refreshOAuthAccessToken(credentials: OAuthCredentials) {
  const response = await fetch(credentials.token_uri || GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json() as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google token refresh failed");
  return data.access_token;
}

async function exchangeOAuthCode(code: string, config: { clientId: string; clientSecret: string; redirectUri: string }) {
  const response = await fetch(GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google OAuth token exchange failed");
  return { access_token: data.access_token, refresh_token: data.refresh_token };
}

async function listSearchConsoleSites(token: string) {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json() as { siteEntry?: Array<{ siteUrl?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Search Console test failed");
  return data.siteEntry?.map((site) => site.siteUrl).filter(Boolean) || [];
}

function googleOAuthConfig(requestUrl: string) {
  return {
    clientId: googleClientId(),
    clientSecret: googleClientSecret(),
    redirectUri: process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI || new URL("/api/search-console/oauth/callback", requestUrl).toString(),
  };
}

function googleClientId() {
  const value = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID;
  if (!value) throw new Error("GOOGLE_SEARCH_CONSOLE_CLIENT_ID is not configured");
  return value;
}

function googleClientSecret() {
  const value = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET;
  if (!value) throw new Error("GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET is not configured");
  return value;
}

function credentialLabel(credentials: GoogleCredentials) {
  return credentials.type === "oauth" ? "Google account" : "Service account";
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Service account JSON must be valid JSON");
  }
}

function comparableHost(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

import { createHash } from "node:crypto";
import { importPKCS8, jwtVerify, SignJWT } from "jose";
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  searchConsoleIntegrations,
  searchConsoleMetrics,
  searchConsoleQueryCache,
  searchConsoleUrlInspections,
  sites,
} from "../db/schema.js";
import { decryptSecret, encryptSecret, encryptedCredentialStatus } from "./api-keys.js";
import { refreshOptimizePages } from "./optimize.js";

const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const OAUTH_STATE_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");
const QUERY_CACHE_MS = 15 * 60 * 1000;
const INSPECTION_CACHE_MS = 24 * 60 * 60 * 1000;

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

export interface MetricDelta {
  value: number;
  baseline: number | null;
  delta: number | null;
  deltaPercent: number | null;
}

export type InsightKind = "risk" | "ctr" | "lift" | "improved" | "watch";

export interface InsightRow {
  label: string;
  pageUrl?: string;
  query?: string;
  value: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  deltaClicks: number | null;
  deltaPosition: number | null;
  kind: InsightKind;
}

export interface OpportunityBubble {
  label: string;
  value: number;
  kind: "risk" | "ctr" | "lift" | "improved";
  size: "sm" | "md" | "lg";
}

interface MetricSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchConsoleInsightInput {
  integration?: ReturnType<typeof serializeSearchConsoleIntegration> | null;
  metrics: SearchAnalyticsMetric[];
  performance?: CanonicalSearchPerformance;
}

export type SearchAnalyticsRange = 7 | 28 | 90;
export type SearchAnalyticsGroup = "page" | "query" | "country" | "device";
export type SearchAnalyticsType = "web" | "image" | "video" | "news";

export interface SearchAnalyticsQueryInput {
  range: SearchAnalyticsRange;
  compare: boolean;
  groupBy: SearchAnalyticsGroup;
  searchType: SearchAnalyticsType;
  country?: string;
  device?: "DESKTOP" | "MOBILE" | "TABLET";
  limit: number;
  includePreliminary?: boolean;
}

interface CanonicalPerformanceInput {
  range: SearchAnalyticsRange;
  compare: boolean;
  searchType: SearchAnalyticsType;
  country?: string;
  device?: "DESKTOP" | "MOBILE" | "TABLET";
  includePreliminary: boolean;
}

interface CanonicalSearchPerformance {
  range: { startDate: string; endDate: string; baselineStart: string | null; baselineEnd: string | null };
  totals: ReturnType<typeof analyticsMetricDeltas>;
  daily: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  metadata: Record<string, unknown> | null;
  provenance: {
    source: "google_search_console_api";
    property: string;
    scope: "site_total";
    fetched_at: string;
    complete_through: string;
    first_incomplete_date: string | null;
    data_status: "complete" | "preliminary";
    cache: "live" | "cached" | "stale";
  };
}

export interface SearchConsoleProperty {
  siteUrl: string;
  permissionLevel: string;
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

export function decryptSearchConsoleCredentials(row: Pick<IntegrationRow, "credentialsEncrypted" | "credentialHint">) {
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
    credentialStatus: encryptedCredentialStatus(row.credentialsEncrypted),
    credential_status: encryptedCredentialStatus(row.credentialsEncrypted),
    credentialHint: row.credentialHint,
    credential_hint: row.credentialHint,
    lastTestedAt: row.lastTestedAt,
    last_tested_at: row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    last_test_result: row.lastTestResult,
    lastSyncAt: row.lastSyncAt,
    last_sync_at: row.lastSyncAt,
    syncMetadata: row.syncMetadata,
    sync_metadata: row.syncMetadata,
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

export function searchConsoleOAuthEnabled(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID && env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET);
}

export async function getSearchConsoleDashboard(userId: string, siteId: string) {
  const [integration] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId)))
    .limit(1);

  if (!integration) {
    return {
      oauth_enabled: searchConsoleOAuthEnabled(),
      integration: null,
      range: { startDate: "", endDate: "", baselineStart: null, baselineEnd: null },
      stats: { clicks: 0, impressions: 0, ctr: 0, position: 0, pageCount: 0, queryCount: 0 },
      totals: emptyPerformanceTotals(),
      opportunity_scope: emptyOpportunityScope(null),
      provenance: null,
    };
  }

  const [performance, metrics] = await Promise.all([
    getCanonicalSearchConsolePerformance(userId, siteId, defaultCanonicalInput()),
    db.select().from(searchConsoleMetrics)
      .where(and(eq(searchConsoleMetrics.userId, userId), eq(searchConsoleMetrics.siteId, siteId))),
  ]);
  const latestRows = metrics.filter((metric) => metric.date >= performance.range.startDate && metric.date <= performance.range.endDate);
  const pageCount = new Set(latestRows.map((metric) => metric.pageUrl)).size;
  const queryCount = new Set(latestRows.map((metric) => metric.query)).size;

  return {
    oauth_enabled: searchConsoleOAuthEnabled(),
    integration: serializeSearchConsoleIntegration(integration),
    range: performance.range,
    stats: {
      pageCount,
      queryCount,
      clicks: performance.totals.clicks.value,
      impressions: performance.totals.impressions.value,
      ctr: performance.totals.ctr.value,
      position: performance.totals.position.value,
    },
    totals: performance.totals,
    opportunity_scope: opportunityScope(latestRows, integration.lastSyncAt),
    provenance: performance.provenance,
  };
}

export async function getSearchConsoleInsights(userId: string, siteId: string) {
  const [integration] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId)))
    .limit(1);

  if (!integration) return buildSearchConsoleInsights({ metrics: [] });

  const [metrics, performance] = await Promise.all([
    db.select().from(searchConsoleMetrics)
      .where(and(eq(searchConsoleMetrics.userId, userId), eq(searchConsoleMetrics.siteId, siteId))),
    getCanonicalSearchConsolePerformance(userId, siteId, defaultCanonicalInput()),
  ]);

  return buildSearchConsoleInsights({
    integration: serializeSearchConsoleIntegration(integration),
    performance,
    metrics: metrics.map((metric) => ({
      date: metric.date,
      pageUrl: metric.pageUrl,
      query: metric.query,
      clicks: metric.clicks,
      impressions: metric.impressions,
      ctr: metric.ctr,
      position: metric.position,
    })),
  });
}

export function buildSearchConsoleInsights({ integration = null, metrics, performance }: SearchConsoleInsightInput) {
  if (!metrics.length && !performance) {
    return {
      integration,
      range: { latestStart: "", latestEnd: "", baselineStart: null, baselineEnd: null },
      totals: emptyTotals(),
      daily: [],
      opportunityBubbles: buildOpportunityBubbles(0, 0, 0, 0),
      actionRows: { protectTraffic: [], liftCtr: [], strikingDistance: [] },
      topPages: [],
      topQueries: [],
      segments: { needsAttention: 0, ctrOpportunities: 0, strikingDistance: 0, improved: 0 },
      opportunity_scope: emptyOpportunityScope(integration?.lastSyncAt || null),
      provenance: null,
    };
  }

  const latestEnd = performance?.range.endDate || metrics.reduce((max, metric) => metric.date > max ? metric.date : max, metrics[0].date);
  const latestStart = performance?.range.startDate || shiftDate(latestEnd, -27);
  const baselineEnd = performance?.range.baselineEnd || shiftDate(latestStart, -1);
  const baselineStart = performance?.range.baselineStart || shiftDate(baselineEnd, -27);
  const latestRows = metrics.filter((metric) => metric.date >= latestStart && metric.date <= latestEnd);
  const baselineRows = metrics.filter((metric) => metric.date >= baselineStart && metric.date <= baselineEnd);
  const latest = performance ? metricSummaryFromDeltas(performance.totals) : summarizeSearchMetrics(latestRows);
  const baseline = baselineRows.length ? summarizeSearchMetrics(baselineRows) : null;
  const minImpressions = Math.max(25, Math.round(latest.impressions * 0.005));
  const grouped = groupMetrics(metrics, (metric) => `${metric.pageUrl}\n${metric.query}`);
  const classified = [...grouped.values()].map((rows) => classifyInsightRows(rows, latestStart, latestEnd, baselineStart, baselineEnd, latest.ctr, minImpressions));
  const needsAttention = classified.filter((row) => row.kind === "risk");
  const ctrOpportunities = classified.filter((row) => row.kind === "ctr");
  const strikingDistance = classified.filter((row) => row.kind === "lift");
  const improved = classified.filter((row) => row.kind === "improved");
  const lostClicks = needsAttention.reduce((sum, row) => sum + Math.max(0, -(row.deltaClicks || 0)), 0);
  const ctrUpside = ctrOpportunities.reduce((sum, row) => sum + Math.max(0, Math.round((latest.ctr - row.ctr) * row.impressions)), 0);
  const strikingImpressions = strikingDistance.reduce((sum, row) => sum + row.impressions, 0);
  const improvedClicks = improved.reduce((sum, row) => sum + Math.max(0, row.deltaClicks || 0), 0);

  return {
    integration,
    range: { latestStart, latestEnd, baselineStart: performance?.range.baselineStart || (baselineRows.length ? baselineStart : null), baselineEnd: performance?.range.baselineEnd || (baselineRows.length ? baselineEnd : null) },
    totals: performance?.totals || {
      clicks: metricDelta(latest.clicks, baseline?.clicks ?? null),
      impressions: metricDelta(latest.impressions, baseline?.impressions ?? null),
      ctr: metricDelta(latest.ctr, baseline?.ctr ?? null),
      position: metricDelta(latest.position, baseline?.position ?? null),
    },
    daily: performance?.daily || [...groupMetrics(latestRows, (metric) => metric.date).entries()]
      .map(([date, rows]) => ({ date, ...summarizeSearchMetrics(rows) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    opportunityBubbles: buildOpportunityBubbles(lostClicks, ctrUpside, strikingImpressions, improvedClicks),
    actionRows: {
      protectTraffic: rankActionRows(needsAttention),
      liftCtr: rankActionRows(ctrOpportunities),
      strikingDistance: rankActionRows(strikingDistance),
    },
    topPages: groupInsightRows(metrics, latestStart, latestEnd, baselineStart, baselineEnd, latest.ctr, minImpressions, (metric) => metric.pageUrl),
    topQueries: groupInsightRows(metrics, latestStart, latestEnd, baselineStart, baselineEnd, latest.ctr, minImpressions, (metric) => metric.query),
    segments: {
      needsAttention: needsAttention.length,
      ctrOpportunities: ctrOpportunities.length,
      strikingDistance: strikingDistance.length,
      improved: improved.length,
    },
    opportunity_scope: opportunityScope(latestRows, integration?.lastSyncAt || null),
    provenance: performance?.provenance || null,
  };
}

export async function testSearchConsoleIntegration(row: Pick<IntegrationRow, "propertyUrl" | "credentialsEncrypted" | "credentialHint">) {
  const credentials = decryptSearchConsoleCredentials(row);
  const token = await googleAccessToken(credentials);
  const properties = await fetchSearchConsoleProperties(token);
  if (!properties.some((property) => property.siteUrl === row.propertyUrl)) throw new Error(`${credentialLabel(credentials)} cannot access ${row.propertyUrl}`);
  return { success: true, message: `Connected to ${row.propertyUrl}` };
}

export async function createSearchConsoleOAuthUrl(opts: { userId: string; siteId: string; propertyUrl?: string; requestUrl: string }) {
  const config = googleOAuthConfig(opts.requestUrl);
  const propertyUrl = opts.propertyUrl?.trim() ? normalizeSearchConsoleProperty(opts.propertyUrl) : undefined;
  const state = await new SignJWT({ userId: opts.userId, siteId: opts.siteId, ...(propertyUrl ? { propertyUrl } : {}) })
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
  const requestedProperty = payload.propertyUrl ? normalizeSearchConsoleProperty(String(payload.propertyUrl)) : undefined;
  if (!userId || !siteId) throw new Error("Invalid Search Console OAuth state");

  const token = await exchangeOAuthCode(opts.code, config);
  if (!token.refresh_token) throw new Error("Google did not return a refresh token. Try again and approve offline access.");
  const properties = await fetchSearchConsoleProperties(token.access_token);
  if (!properties.length) throw new Error("Google account has no accessible Search Console properties");
  const [site] = await db.select({ domain: sites.domain }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  if (!site) throw new Error("Site not found");
  const selection = chooseSearchConsoleProperty(properties, site.domain, requestedProperty);

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
    propertyUrl: selection.property.siteUrl,
    status: selection.requiresSelection ? "property_selection_required" : "connected",
    credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
    credentialHint: "Google OAuth",
    lastTestedAt: new Date(),
    lastTestResult: selection.requiresSelection ? "Choose a Search Console property" : `Connected to ${selection.property.siteUrl}`,
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

export function chooseSearchConsoleProperty(properties: SearchConsoleProperty[], siteDomain: string, requested?: string) {
  if (!properties.length) throw new Error("Google account has no accessible Search Console properties");
  const exactRequested = requested && properties.find((property) => property.siteUrl === requested);
  if (requested && !exactRequested) throw new Error(`Google account cannot access ${requested}`);
  if (exactRequested) return { property: exactRequested, requiresSelection: false };

  const host = comparableHost(siteDomain);
  const domain = properties.find((property) => property.siteUrl === `sc-domain:${host}`);
  if (domain) return { property: domain, requiresSelection: false };
  const prefixes = properties.filter((property) => {
    if (property.siteUrl.startsWith("sc-domain:")) return false;
    try { return comparableHost(new URL(property.siteUrl).hostname) === host; } catch { return false; }
  });
  if (prefixes.length) return { property: prefixes.sort((a, b) => a.siteUrl.length - b.siteUrl.length)[0], requiresSelection: false };
  const sorted = [...properties].sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
  return { property: sorted[0], requiresSelection: sorted.length > 1 };
}

export async function listSearchConsoleProperties(userId: string, siteId: string) {
  const integration = await requireSearchConsoleIntegration(userId, siteId, true);
  const token = await googleAccessToken(decryptSearchConsoleCredentials(integration));
  return { integration: serializeSearchConsoleIntegration(integration), properties: await fetchSearchConsoleProperties(token) };
}

export async function selectSearchConsoleProperty(userId: string, siteId: string, propertyUrl: string) {
  const integration = await requireSearchConsoleIntegration(userId, siteId, true);
  const normalized = normalizeSearchConsoleProperty(propertyUrl);
  const token = await googleAccessToken(decryptSearchConsoleCredentials(integration));
  const properties = await fetchSearchConsoleProperties(token);
  if (!properties.some((property) => property.siteUrl === normalized)) throw new Error(`Google account cannot access ${normalized}`);
  const [updated] = await db.update(searchConsoleIntegrations).set({
    propertyUrl: normalized,
    status: "connected",
    lastTestedAt: new Date(),
    lastTestResult: `Connected to ${normalized}`,
    updatedAt: new Date(),
  }).where(eq(searchConsoleIntegrations.id, integration.id)).returning();
  return serializeSearchConsoleIntegration(updated);
}

export async function refreshSearchConsoleData(userId: string, siteId: string) {
  const integration = await requireSearchConsoleIntegration(userId, siteId);
  const performance = await getCanonicalSearchConsolePerformance(userId, siteId, defaultCanonicalInput(), true);
  if (performance.provenance.cache === "stale") throw new Error("Search Console refresh could not load current performance data");
  const snapshotStart = performance.range.baselineStart || performance.range.startDate;
  const { rows: metrics } = await querySearchAnalytics(integration, snapshotStart, performance.range.endDate, "final");
  const syncedAt = new Date();

  const updated = await replaceSearchConsoleSnapshot({
    userId,
    siteId,
    integrationId: integration.id,
    startDate: snapshotStart,
    endDate: performance.range.endDate,
    metrics,
    syncedAt,
    syncMetadata: {
      first_incomplete_date: performance.provenance.first_incomplete_date,
      complete_through: performance.provenance.complete_through,
      fetched_at: performance.provenance.fetched_at,
    },
  });
  const refreshed = await refreshOptimizePages(userId, siteId);
  return { synced: metrics.length, optimizePages: refreshed.updated, integration: serializeSearchConsoleIntegration(updated), range: performance.range, provenance: performance.provenance };
}

export async function replaceSearchConsoleSnapshot(input: {
  userId: string;
  siteId: string;
  integrationId: string;
  startDate: string;
  endDate: string;
  metrics: SearchAnalyticsMetric[];
  syncedAt: Date;
  syncMetadata: Record<string, unknown>;
}) {
  return db.transaction(async (tx) => {
    await tx.delete(searchConsoleMetrics).where(and(
      eq(searchConsoleMetrics.userId, input.userId),
      eq(searchConsoleMetrics.siteId, input.siteId),
      gte(searchConsoleMetrics.date, input.startDate),
      lte(searchConsoleMetrics.date, input.endDate),
    ));
    for (const metrics of chunkSearchConsoleMetrics(input.metrics)) {
      await tx.insert(searchConsoleMetrics).values(
        metrics.map((metric) => ({ userId: input.userId, siteId: input.siteId, ...metric })),
      );
    }
    const [row] = await tx.update(searchConsoleIntegrations).set({
      lastSyncAt: input.syncedAt,
      status: "connected",
      syncMetadata: input.syncMetadata,
    }).where(and(
      eq(searchConsoleIntegrations.id, input.integrationId),
      eq(searchConsoleIntegrations.userId, input.userId),
      eq(searchConsoleIntegrations.siteId, input.siteId),
    )).returning();
    if (!row) throw new Error("Search Console integration not found");
    return row;
  });
}

export function chunkSearchConsoleMetrics(metrics: SearchAnalyticsMetric[], size = 1000) {
  const batchSize = Math.max(1, Math.floor(size));
  const batches: SearchAnalyticsMetric[][] = [];
  for (let index = 0; index < metrics.length; index += batchSize) {
    batches.push(metrics.slice(index, index + batchSize));
  }
  return batches;
}

export const syncSearchConsoleMetrics = refreshSearchConsoleData;

export async function listDueSearchConsoleIntegrations(limit = 10, now = new Date()) {
  const staleBefore = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  return db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(
      eq(searchConsoleIntegrations.status, "connected"),
      or(isNull(searchConsoleIntegrations.lastSyncAt), lt(searchConsoleIntegrations.lastSyncAt, staleBefore)),
    ))
    .orderBy(sql`${searchConsoleIntegrations.lastSyncAt} asc nulls first`, asc(searchConsoleIntegrations.createdAt))
    .limit(limit);
}

export async function drainSearchConsoleSync(limit = 10) {
  const rows = await listDueSearchConsoleIntegrations(limit);

  const results: Array<{ integrationId: string; siteId: string; synced: number; optimizePages: number; error?: string }> = [];
  for (const row of rows) {
    try {
      const synced = await refreshSearchConsoleData(row.userId, row.siteId);
      results.push({ integrationId: row.id, siteId: row.siteId, synced: synced.synced, optimizePages: synced.optimizePages });
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

async function querySearchAnalytics(integration: IntegrationRow, startDate: string, endDate: string, dataState: "all" | "final" = "all") {
  const credentials = decryptSearchConsoleCredentials(integration);
  const token = await googleAccessToken(credentials);
  const all: SearchAnalyticsMetric[] = [];
  let metadata: Record<string, unknown> | undefined;
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
          dataState,
          rowLimit,
          startRow,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await response.json() as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>; metadata?: Record<string, unknown>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "Search Console sync failed");
    const rows = mapSearchAnalyticsRows(data.rows || []);
    all.push(...rows);
    metadata ||= data.metadata;
    if (rows.length < rowLimit) break;
  }

  return { rows: all, metadata };
}

export async function querySearchConsoleAnalytics(userId: string, siteId: string, input: SearchAnalyticsQueryInput) {
  const integration = await requireSearchConsoleIntegration(userId, siteId);
  const normalized = normalizeAnalyticsInput(input);
  const performance = await getCanonicalSearchConsolePerformance(userId, siteId, {
    range: normalized.range,
    compare: normalized.compare,
    searchType: normalized.searchType,
    country: normalized.country,
    device: normalized.device,
    includePreliminary: Boolean(normalized.includePreliminary),
  });
  const groupedResult = await cachedSearchConsoleQuery(userId, siteId, "analytics_rows", {
    propertyUrl: integration.propertyUrl,
    range: performance.range,
    groupBy: normalized.groupBy,
    searchType: normalized.searchType,
    country: normalized.country,
    device: normalized.device,
    limit: normalized.limit,
    includePreliminary: Boolean(normalized.includePreliminary),
  }, async () => {
    const token = await googleAccessToken(decryptSearchConsoleCredentials(integration));
    const filters = analyticsFilters(normalized);
    const common = { type: normalized.searchType, dataState: normalized.includePreliminary ? "all" : "final", ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}) };
    const grouped = (from: string, to: string) => fetchSearchAnalytics(token, integration.propertyUrl, {
      ...common, startDate: from, endDate: to, dimensions: [normalized.groupBy], rowLimit: normalized.limit,
    });
    const [currentRows, baselineRows] = await Promise.all([
      grouped(performance.range.startDate, performance.range.endDate),
      normalized.compare && performance.range.baselineStart && performance.range.baselineEnd
        ? grouped(performance.range.baselineStart, performance.range.baselineEnd)
        : Promise.resolve({ rows: [] }),
    ]);
    const baselineByLabel = new Map((baselineRows.rows || []).map((row) => [String(row.keys?.[0] || ""), row]));
    const rows = (currentRows.rows || []).map((row) => {
      const label = String(row.keys?.[0] || "");
      const baseline = baselineByLabel.get(label);
      return {
        label,
        ...normalizeAnalyticsMetrics(row),
        baseline: baseline ? normalizeAnalyticsMetrics(baseline) : null,
        deltaClicks: baseline ? Number(row.clicks || 0) - Number(baseline.clicks || 0) : null,
        deltaPosition: baseline ? Number((Number(row.position || 0) - Number(baseline.position || 0)).toFixed(2)) : null,
      };
    });
    return { rows };
  });
  const performanceCache = performance.provenance.cache;
  const rowsCache = groupedResult.stale ? "stale" : groupedResult.cached ? "cached" : "live";
  const cache = performanceCache === "stale" || rowsCache === "stale"
    ? "stale"
    : performanceCache === rowsCache ? performanceCache : "mixed";
  return {
    input: normalized,
    range: performance.range,
    totals: performance.totals,
    daily: performance.daily,
    rows: groupedResult.rows,
    metadata: performance.metadata,
    provenance: { ...performance.provenance, cache },
    cached: cache === "cached",
  };
}

export async function getCanonicalSearchConsolePerformance(
  userId: string,
  siteId: string,
  input: CanonicalPerformanceInput,
  force = false,
): Promise<CanonicalSearchPerformance> {
  const integration = await requireSearchConsoleIntegration(userId, siteId);
  const asOf = searchConsoleDate();
  const cached = await cachedSearchConsoleQuery(userId, siteId, "performance", {
    propertyUrl: integration.propertyUrl,
    asOf,
    ...input,
  }, async () => {
    const token = await googleAccessToken(decryptSearchConsoleCredentials(integration));
    const filters = analyticsFilters({ ...input, groupBy: "page", limit: 1 });
    const days = input.range * (input.compare ? 2 : 1) + 7;
    const response = await fetchSearchAnalytics(token, integration.propertyUrl, {
      startDate: shiftDate(asOf, -(days - 1)),
      endDate: asOf,
      dimensions: ["date"],
      type: input.searchType,
      dataState: "all",
      rowLimit: Math.min(250, days),
      ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}),
    });
    return buildCanonicalSearchPerformance(response.rows, response.metadata || null, input, asOf, integration.propertyUrl);
  }, force);
  return {
    ...cached,
    provenance: {
      ...cached.provenance,
      fetched_at: cached.fetchedAt,
      cache: cached.stale ? "stale" : cached.cached ? "cached" : "live",
    },
  };
}

export function buildCanonicalSearchPerformance(
  rows: GoogleAnalyticsRow[],
  metadata: Record<string, unknown> | null,
  input: CanonicalPerformanceInput,
  asOf: string,
  property: string,
) {
  const firstIncompleteDate = typeof metadata?.first_incomplete_date === "string" ? metadata.first_incomplete_date : null;
  const completeThrough = firstIncompleteDate ? shiftDate(firstIncompleteDate, -1) : asOf;
  const endDate = input.includePreliminary ? asOf : completeThrough;
  const startDate = shiftDate(endDate, -(input.range - 1));
  const baselineEnd = input.compare ? shiftDate(startDate, -1) : null;
  const baselineStart = baselineEnd ? shiftDate(baselineEnd, -(input.range - 1)) : null;
  const daily = rows
    .map((row) => ({ date: String(row.keys?.[0] || ""), ...normalizeAnalyticsMetrics(row) }))
    .filter((row) => row.date >= startDate && row.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const baselineDaily = baselineStart && baselineEnd
    ? rows.map((row) => ({ date: String(row.keys?.[0] || ""), ...normalizeAnalyticsMetrics(row) }))
      .filter((row) => row.date >= baselineStart && row.date <= baselineEnd)
    : [];
  const current = summarizeDailyAnalytics(daily);
  const baseline = input.compare ? summarizeDailyAnalytics(baselineDaily) : null;
  return {
    range: { startDate, endDate, baselineStart, baselineEnd },
    totals: analyticsMetricDeltas(current, baseline || undefined),
    daily,
    metadata,
    provenance: {
      source: "google_search_console_api" as const,
      property,
      scope: "site_total" as const,
      fetched_at: "",
      complete_through: completeThrough,
      first_incomplete_date: firstIncompleteDate,
      data_status: input.includePreliminary ? "preliminary" as const : "complete" as const,
      cache: "live" as const,
    },
  };
}

export async function listSearchConsoleSitemaps(userId: string, siteId: string, sitemapIndex?: string) {
  const integration = await requireSearchConsoleIntegration(userId, siteId);
  const params = { propertyUrl: integration.propertyUrl, sitemapIndex: sitemapIndex?.trim() || null };
  return cachedSearchConsoleQuery(userId, siteId, "sitemaps", params, async () => {
    const token = await googleAccessToken(decryptSearchConsoleCredentials(integration));
    const url = new URL(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(integration.propertyUrl)}/sitemaps`);
    if (params.sitemapIndex) url.searchParams.set("sitemapIndex", params.sitemapIndex);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const data = await response.json() as { sitemap?: Array<Record<string, unknown>>; error?: { message?: string } };
    if (!response.ok) throw googleError(response.status, data.error?.message || "Failed to load Search Console sitemaps");
    return {
      items: (data.sitemap || []).map((item) => ({
        path: String(item.path || ""),
        type: item.isSitemapsIndex ? "index" : "sitemap",
        isPending: Boolean(item.isPending),
        lastSubmitted: item.lastSubmitted || null,
        lastDownloaded: item.lastDownloaded || null,
        errors: Number(item.errors || 0),
        warnings: Number(item.warnings || 0),
        contents: Array.isArray(item.contents) ? item.contents : [],
      })),
      cached: false,
    };
  });
}

export async function inspectSearchConsoleUrl(userId: string, siteId: string, rawUrl: string, force = false) {
  const integration = await requireSearchConsoleIntegration(userId, siteId);
  const url = normalizeInspectionUrl(rawUrl, integration.propertyUrl);
  const [cached] = await db.select().from(searchConsoleUrlInspections)
    .where(and(eq(searchConsoleUrlInspections.userId, userId), eq(searchConsoleUrlInspections.siteId, siteId), eq(searchConsoleUrlInspections.url, url)))
    .limit(1);
  if (!force && cached?.result && Date.now() - cached.inspectedAt.getTime() < INSPECTION_CACHE_MS) {
    return { url, result: cached.result, inspectedAt: cached.inspectedAt, cached: true, stale: false };
  }

  try {
    const token = await googleAccessToken(decryptSearchConsoleCredentials(integration));
    const response = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: integration.propertyUrl, languageCode: "en-US" }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json() as { inspectionResult?: Record<string, unknown>; error?: { message?: string } };
    if (!response.ok || !data.inspectionResult) throw googleError(response.status, data.error?.message || "URL inspection failed");
    const result = normalizeInspectionResult(data.inspectionResult);
    const now = new Date();
    await db.insert(searchConsoleUrlInspections).values({ userId, siteId, url, status: "ok", result, inspectedAt: now })
      .onConflictDoUpdate({
        target: [searchConsoleUrlInspections.siteId, searchConsoleUrlInspections.url],
        set: { status: "ok", result, errorMessage: null, inspectedAt: now, updatedAt: now },
      });
    return { url, result, inspectedAt: now, cached: false, stale: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "URL inspection failed";
    if (cached?.result && isTransientSearchConsoleError(error)) return { url, result: cached.result, inspectedAt: cached.inspectedAt, cached: true, stale: true, warning: message };
    const now = new Date();
    await db.insert(searchConsoleUrlInspections).values({ userId, siteId, url, status: "error", errorMessage: message, inspectedAt: now })
      .onConflictDoUpdate({
        target: [searchConsoleUrlInspections.siteId, searchConsoleUrlInspections.url],
        set: { status: "error", result: null, errorMessage: message, inspectedAt: now, updatedAt: now },
      });
    throw error;
  }
}

export async function inspectSearchConsoleUrls(userId: string, siteId: string, urls: string[], force = false) {
  if (!urls.length || urls.length > 10) throw new Error("Choose between 1 and 10 URLs to inspect");
  const results = [];
  for (const url of [...new Set(urls)]) {
    try {
      results.push({ ok: true, ...(await inspectSearchConsoleUrl(userId, siteId, url, force)) });
    } catch (error) {
      results.push({ ok: false, url, error: error instanceof Error ? error.message : "URL inspection failed" });
    }
  }
  return { results, inspected: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length };
}

export function normalizeAnalyticsInput(input: SearchAnalyticsQueryInput): SearchAnalyticsQueryInput {
  if (![7, 28, 90].includes(input.range)) throw new Error("Analytics range must be 7, 28, or 90 days");
  if (!["page", "query", "country", "device"].includes(input.groupBy)) throw new Error("Unsupported analytics group");
  if (!["web", "image", "video", "news"].includes(input.searchType)) throw new Error("Unsupported search type");
  const country = input.country?.trim().toLowerCase();
  if (country && !/^[a-z]{3}$/.test(country)) throw new Error("Country must be a three-letter Search Console country code");
  if (input.device && !["DESKTOP", "MOBILE", "TABLET"].includes(input.device)) throw new Error("Unsupported device");
  return { ...input, country: country || undefined, includePreliminary: Boolean(input.includePreliminary), limit: Math.min(250, Math.max(1, Math.round(input.limit || 50))) };
}

function analyticsFilters(input: SearchAnalyticsQueryInput) {
  return [
    ...(input.country ? [{ dimension: "country", operator: "equals", expression: input.country }] : []),
    ...(input.device ? [{ dimension: "device", operator: "equals", expression: input.device }] : []),
  ];
}

type GoogleAnalyticsRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

async function fetchSearchAnalytics(token: string, propertyUrl: string, body: Record<string, unknown>) {
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json() as { rows?: GoogleAnalyticsRow[]; metadata?: Record<string, unknown>; error?: { message?: string } };
  if (!response.ok) throw googleError(response.status, data.error?.message || "Search Console analytics query failed");
  return { rows: data.rows || [], metadata: data.metadata };
}

function normalizeAnalyticsMetrics(row: GoogleAnalyticsRow = {}) {
  return {
    clicks: Math.round(Number(row.clicks || 0)),
    impressions: Math.round(Number(row.impressions || 0)),
    ctr: Number(row.ctr || 0),
    position: Number(Number(row.position || 0).toFixed(2)),
  };
}

function analyticsMetricDeltas(current: GoogleAnalyticsRow = {}, baseline?: GoogleAnalyticsRow) {
  const latest = normalizeAnalyticsMetrics(current);
  const previous = baseline ? normalizeAnalyticsMetrics(baseline) : null;
  return {
    clicks: metricDelta(latest.clicks, previous?.clicks ?? null),
    impressions: metricDelta(latest.impressions, previous?.impressions ?? null),
    ctr: metricDelta(latest.ctr, previous?.ctr ?? null),
    position: metricDelta(latest.position, previous?.position ?? null),
  };
}

async function cachedSearchConsoleQuery<T>(userId: string, siteId: string, kind: string, params: unknown, load: () => Promise<T>, force = false): Promise<T & { cached: boolean; stale?: boolean; fetchedAt: string }> {
  const cacheKey = createHash("sha256").update(`${kind}:${JSON.stringify(params)}`).digest("hex");
  const [cached] = await db.select().from(searchConsoleQueryCache)
    .where(and(eq(searchConsoleQueryCache.userId, userId), eq(searchConsoleQueryCache.siteId, siteId), eq(searchConsoleQueryCache.cacheKey, cacheKey)))
    .limit(1);
  if (!force && cached && cached.expiresAt.getTime() > Date.now()) {
    return { ...(cached.result as T), cached: true, fetchedAt: cached.updatedAt.toISOString() };
  }
  let result: T;
  try {
    result = await load();
  } catch (error) {
    if (cached?.result && isTransientSearchConsoleError(error)) {
      return {
        ...(cached.result as T),
        cached: true,
        stale: true,
        fetchedAt: cached.updatedAt.toISOString(),
        warning: error instanceof Error ? error.message : "Search Console request failed",
      };
    }
    throw error;
  }
  const now = new Date();
  await db.insert(searchConsoleQueryCache).values({
    userId, siteId, cacheKey, kind, params, result, expiresAt: new Date(now.getTime() + QUERY_CACHE_MS),
  }).onConflictDoUpdate({
    target: [searchConsoleQueryCache.siteId, searchConsoleQueryCache.cacheKey],
    set: { params, result, expiresAt: new Date(now.getTime() + QUERY_CACHE_MS), updatedAt: now },
  });
  await db.delete(searchConsoleQueryCache).where(lt(searchConsoleQueryCache.expiresAt, now));
  return { ...result, cached: false, fetchedAt: now.toISOString() };
}

export function normalizeInspectionUrl(rawUrl: string, propertyUrl: string) {
  const url = new URL(String(rawUrl || "").trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("Inspection URL must use HTTP or HTTPS");
  url.hash = "";
  if (propertyUrl.startsWith("sc-domain:")) {
    const propertyHost = comparableHost(propertyUrl.slice("sc-domain:".length));
    const host = comparableHost(url.hostname);
    if (host !== propertyHost && !host.endsWith(`.${propertyHost}`)) throw new Error("URL is outside the selected Search Console property");
  } else if (!url.toString().startsWith(propertyUrl)) {
    throw new Error("URL is outside the selected Search Console property");
  }
  return url.toString();
}

export function normalizeInspectionResult(result: Record<string, unknown>) {
  const index = (result.indexStatusResult || {}) as Record<string, unknown>;
  const rich = (result.richResultsResult || {}) as Record<string, unknown>;
  return {
    verdict: index.verdict || "VERDICT_UNSPECIFIED",
    coverageState: index.coverageState || null,
    robotsTxtState: index.robotsTxtState || null,
    indexingState: index.indexingState || null,
    pageFetchState: index.pageFetchState || null,
    lastCrawlTime: index.lastCrawlTime || null,
    crawledAs: index.crawledAs || null,
    googleCanonical: index.googleCanonical || null,
    userCanonical: index.userCanonical || null,
    referringUrls: index.referringUrls || [],
    sitemaps: index.sitemap || [],
    richResultsVerdict: rich.verdict || null,
    richResultItems: rich.detectedItems || [],
    inspectionResultLink: result.inspectionResultLink || null,
  };
}

async function requireSearchConsoleIntegration(userId: string, siteId: string, allowPending = false) {
  const [integration] = await db.select().from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId))).limit(1);
  if (!integration) throw new Error("Connect Search Console first");
  if (!allowPending && integration.status === "property_selection_required") throw new Error("Choose a Search Console property first");
  return integration;
}

function googleError(status: number, message: string) {
  if (status === 429) return new Error(`Search Console quota exceeded: ${message}`);
  if (status === 401 || status === 403) return new Error(`Search Console permission denied: ${message}`);
  if (status >= 500) return new Error(`Search Console provider unavailable: ${message}`);
  return new Error(message);
}

function isTransientSearchConsoleError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /quota exceeded|timeout|aborted|provider unavailable/i.test(message);
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

function emptyTotals() {
  return {
    clicks: metricDelta(0, null),
    impressions: metricDelta(0, null),
    ctr: metricDelta(0, null),
    position: metricDelta(0, null),
  };
}

const emptyPerformanceTotals = emptyTotals;

function defaultCanonicalInput(): CanonicalPerformanceInput {
  return { range: 28, compare: true, searchType: "web", includePreliminary: false };
}

function emptyOpportunityScope(lastSyncedAt: Date | string | null) {
  return {
    scope: "page_query_rows" as const,
    page_count: 0,
    query_count: 0,
    row_count: 0,
    last_synced_at: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
  };
}

function opportunityScope(rows: Array<Pick<SearchAnalyticsMetric, "pageUrl" | "query">>, lastSyncedAt: Date | string | null) {
  return {
    scope: "page_query_rows" as const,
    page_count: new Set(rows.map((row) => row.pageUrl)).size,
    query_count: new Set(rows.map((row) => row.query)).size,
    row_count: rows.length,
    last_synced_at: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
  };
}

function summarizeDailyAnalytics(rows: Array<{ clicks: number; impressions: number; position: number }>) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : 0,
  };
}

function metricSummaryFromDeltas(totals: ReturnType<typeof analyticsMetricDeltas>): MetricSummary {
  return {
    clicks: totals.clicks.value,
    impressions: totals.impressions.value,
    ctr: totals.ctr.value,
    position: totals.position.value,
  };
}

function summarizeSearchMetrics(rows: SearchAnalyticsMetric[]): MetricSummary {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const position = impressions
    ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions
    : rows.length
      ? rows.reduce((sum, row) => sum + row.position, 0) / rows.length
      : 0;
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: Number(position.toFixed(2)),
  };
}

function metricDelta(value: number, baseline: number | null): MetricDelta {
  if (baseline === null) return { value: roundMetric(value), baseline: null, delta: null, deltaPercent: null };
  const delta = value - baseline;
  return {
    value: roundMetric(value),
    baseline: roundMetric(baseline),
    delta: roundMetric(delta),
    deltaPercent: baseline ? Number((delta / baseline).toFixed(4)) : null,
  };
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function groupMetrics<T extends SearchAnalyticsMetric>(rows: T[], keyFor: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function rankActionRows(rows: InsightRow[]) {
  return [...rows]
    .sort((a, b) => Math.abs(b.deltaClicks || 0) - Math.abs(a.deltaClicks || 0) || b.impressions - a.impressions)
    .slice(0, 3);
}

function groupInsightRows(
  rows: SearchAnalyticsMetric[],
  latestStart: string,
  latestEnd: string,
  baselineStart: string,
  baselineEnd: string,
  siteCtr: number,
  minImpressions: number,
  keyFor: (row: SearchAnalyticsMetric) => string,
) {
  return [...groupMetrics(rows, keyFor).entries()]
    .map(([label, groupRows]) => ({ ...classifyInsightRows(groupRows, latestStart, latestEnd, baselineStart, baselineEnd, siteCtr, minImpressions), label }))
    .filter((row) => row.impressions > 0)
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 8);
}

function classifyInsightRows(
  rows: SearchAnalyticsMetric[],
  latestStart: string,
  latestEnd: string,
  baselineStart: string,
  baselineEnd: string,
  siteCtr: number,
  minImpressions: number,
): InsightRow {
  const latest = summarizeSearchMetrics(rows.filter((row) => row.date >= latestStart && row.date <= latestEnd));
  const baselineRows = rows.filter((row) => row.date >= baselineStart && row.date <= baselineEnd);
  const baseline = baselineRows.length ? summarizeSearchMetrics(baselineRows) : null;
  const deltaClicks = baseline ? latest.clicks - baseline.clicks : null;
  const deltaPosition = baseline ? Number((latest.position - baseline.position).toFixed(2)) : null;
  const clickDrop = baseline && baseline.clicks > 0 ? (baseline.clicks - latest.clicks) / baseline.clicks : 0;
  const clickGain = baseline && baseline.clicks > 0 ? (latest.clicks - baseline.clicks) / baseline.clicks : latest.clicks > 0 ? 1 : 0;
  const enoughData = Math.max(latest.impressions, baseline?.impressions || 0) >= minImpressions;
  const kind: InsightKind = enoughData && baseline && (clickDrop >= 0.2 || (deltaPosition || 0) >= 3)
    ? "risk"
    : enoughData && baseline && (clickGain >= 0.2 || (deltaPosition || 0) <= -3)
      ? "improved"
      : enoughData && latest.impressions >= minImpressions && latest.position >= 4 && latest.position <= 15
        ? "lift"
        : enoughData && siteCtr > 0 && latest.ctr < siteCtr * 0.75
          ? "ctr"
          : "watch";

  return {
    label: rows[0]?.query || rows[0]?.pageUrl || "",
    pageUrl: rows[0]?.pageUrl,
    query: rows[0]?.query,
    value: latest.clicks,
    clicks: latest.clicks,
    impressions: latest.impressions,
    ctr: latest.ctr,
    position: latest.position,
    deltaClicks,
    deltaPosition,
    kind,
  };
}

function buildOpportunityBubbles(lostClicks: number, ctrUpside: number, strikingImpressions: number, improvedClicks: number): OpportunityBubble[] {
  const values = [lostClicks, ctrUpside, strikingImpressions, improvedClicks];
  const max = Math.max(...values, 1);
  return [
    { label: "Traffic at risk", value: lostClicks, kind: "risk", size: bubbleSize(lostClicks, max) },
    { label: "CTR upside", value: ctrUpside, kind: "ctr", size: bubbleSize(ctrUpside, max) },
    { label: "Striking distance", value: strikingImpressions, kind: "lift", size: bubbleSize(strikingImpressions, max) },
    { label: "Improved clicks", value: improvedClicks, kind: "improved", size: bubbleSize(improvedClicks, max) },
  ];
}

function bubbleSize(value: number, max: number): "sm" | "md" | "lg" {
  const ratio = max ? value / max : 0;
  if (ratio >= 0.66) return "lg";
  if (ratio >= 0.25) return "md";
  return "sm";
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

async function fetchSearchConsoleProperties(token: string): Promise<SearchConsoleProperty[]> {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json() as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Search Console test failed");
  return (data.siteEntry || [])
    .filter((site): site is { siteUrl: string; permissionLevel?: string } => Boolean(site.siteUrl))
    .map((site) => ({ siteUrl: site.siteUrl, permissionLevel: site.permissionLevel || "unknown" }));
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
  const value = hostname.trim().toLowerCase();
  try { return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "").replace(/\.$/, ""); }
  catch { return value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.$/, ""); }
}

function searchConsoleDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

import { importPKCS8, SignJWT } from "jose";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { indexingIntegrations, indexingSubmissions, sites } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "./api-keys.js";

export type IndexingProvider = "indexnow" | "google";
export type SubmissionSource = "manual" | "publish";

export const INDEXING_PROVIDERS: IndexingProvider[] = ["indexnow", "google"];

type IntegrationRow = typeof indexingIntegrations.$inferSelect;
type SiteRow = typeof sites.$inferSelect;

interface IndexNowCredentials {
  key: string;
  keyLocation: string;
}

interface GoogleCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function isIndexingProvider(value: string): value is IndexingProvider {
  return (INDEXING_PROVIDERS as string[]).includes(value);
}

export function serializeIndexingIntegration(row: IntegrationRow) {
  return {
    id: row.id,
    userId: row.userId,
    user_id: row.userId,
    siteId: row.siteId,
    site_id: row.siteId,
    provider: row.provider,
    displayName: row.displayName,
    display_name: row.displayName,
    status: row.status,
    autoSubmit: row.autoSubmit,
    auto_submit: row.autoSubmit,
    credentialHint: row.credentialHint,
    credential_hint: row.credentialHint,
    config: row.config || {},
    lastTestedAt: row.lastTestedAt,
    last_tested_at: row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    last_test_result: row.lastTestResult,
    lastSubmitAt: row.lastSubmitAt,
    last_submit_at: row.lastSubmitAt,
    createdAt: row.createdAt,
    created_at: row.createdAt,
    updatedAt: row.updatedAt,
    updated_at: row.updatedAt,
  };
}

export function serializeIndexingSubmission(row: typeof indexingSubmissions.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    user_id: row.userId,
    siteId: row.siteId,
    site_id: row.siteId,
    integrationId: row.integrationId,
    integration_id: row.integrationId,
    provider: row.provider,
    url: row.url,
    source: row.source,
    status: row.status,
    errorMessage: row.errorMessage,
    error_message: row.errorMessage,
    responseData: row.responseData,
    response_data: row.responseData,
    submittedAt: row.submittedAt,
    submitted_at: row.submittedAt,
    createdAt: row.createdAt,
    created_at: row.createdAt,
    updatedAt: row.updatedAt,
    updated_at: row.updatedAt,
  };
}

export function encryptIndexingCredentials(provider: IndexingProvider, input: unknown) {
  const credentials = validateCredentials(provider, input);
  return {
    encrypted: encryptSecret(JSON.stringify(credentials)),
    hint: credentialHint(provider, credentials),
  };
}

export function decryptIndexingCredentials(row: IntegrationRow) {
  return validateCredentials(row.provider as IndexingProvider, JSON.parse(decryptSecret(row.credentialsEncrypted)));
}

export async function listIndexingIntegrations(userId: string, siteId: string) {
  const rows = await db
    .select()
    .from(indexingIntegrations)
    .where(and(eq(indexingIntegrations.userId, userId), eq(indexingIntegrations.siteId, siteId)))
    .orderBy(desc(indexingIntegrations.createdAt));
  return rows.map(serializeIndexingIntegration);
}

export async function getIndexingDashboard(userId: string, siteId: string) {
  const [accepted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(indexingSubmissions)
    .where(and(eq(indexingSubmissions.userId, userId), eq(indexingSubmissions.siteId, siteId), eq(indexingSubmissions.status, "accepted")));
  const [failed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(indexingSubmissions)
    .where(and(eq(indexingSubmissions.userId, userId), eq(indexingSubmissions.siteId, siteId), eq(indexingSubmissions.status, "failed")));
  const [queued] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(indexingSubmissions)
    .where(and(eq(indexingSubmissions.userId, userId), eq(indexingSubmissions.siteId, siteId), eq(indexingSubmissions.status, "queued")));

  const submissions = await db
    .select()
    .from(indexingSubmissions)
    .where(and(eq(indexingSubmissions.userId, userId), eq(indexingSubmissions.siteId, siteId)))
    .orderBy(desc(indexingSubmissions.createdAt))
    .limit(100);

  return {
    integrations: await listIndexingIntegrations(userId, siteId),
    submissions: submissions.map(serializeIndexingSubmission),
    stats: {
      accepted: accepted?.count || 0,
      failed: failed?.count || 0,
      queued: queued?.count || 0,
    },
  };
}

export async function testIndexingIntegration(row: IntegrationRow) {
  const provider = row.provider as IndexingProvider;
  const credentials = decryptIndexingCredentials(row);
  if (provider === "indexnow") return testIndexNow(credentials as IndexNowCredentials);
  return testGoogle(credentials as GoogleCredentials);
}

export async function submitPublishedUrl(userId: string, siteId: string, url: string) {
  return submitUrlsForSite(userId, siteId, [url], "publish", true);
}

export async function submitUrlsForSite(userId: string, siteId: string, rawUrls: string[], source: SubmissionSource, autoOnly = false) {
  const site = await getUserSite(userId, siteId);
  const urls = normalizeSubmittedUrls(rawUrls, site.domain);
  if (urls.length === 0) return { submitted: 0, submissions: [] };

  const rows = await db
    .select()
    .from(indexingIntegrations)
    .where(and(eq(indexingIntegrations.userId, userId), eq(indexingIntegrations.siteId, siteId), eq(indexingIntegrations.status, "connected")));

  const integrations = autoOnly ? rows.filter((row) => row.autoSubmit) : rows;
  if (integrations.length === 0) return { submitted: 0, submissions: [] };

  const created: Array<ReturnType<typeof serializeIndexingSubmission>> = [];
  for (const integration of integrations) {
    try {
      const submitted = integration.provider === "indexnow"
        ? await submitIndexNow(integration, site, urls, source)
        : await submitGoogle(integration, site, urls, source);
      created.push(...submitted);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed";
      for (const url of urls) {
        created.push(await insertSubmission({
          userId,
          siteId,
          integrationId: integration.id,
          provider: integration.provider,
          url,
          source,
          status: "failed",
          errorMessage: message,
        }));
      }
    }
  }

  return { submitted: created.length, submissions: created };
}

export function normalizeSubmittedUrls(rawUrls: string[], siteDomain: string, max = 1000) {
  const acceptedHosts = new Set([comparableHost(siteDomain), `www.${comparableHost(siteDomain)}`]);
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawUrls.slice(0, max + 1)) {
    const value = String(raw || "").trim();
    if (!value) continue;
    if (urls.length >= max) throw new Error(`Submit at most ${max} URLs at once`);

    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      throw new Error(`Invalid URL: ${value}`);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`Only HTTP and HTTPS URLs are supported: ${value}`);
    if (!acceptedHosts.has(comparableHost(parsed.hostname)) && !acceptedHosts.has(parsed.hostname.toLowerCase())) {
      throw new Error(`URL does not belong to ${siteDomain}: ${value}`);
    }
    parsed.hash = "";
    const normalized = parsed.toString();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }

  return urls;
}

export function isGoogleIndexingEligibleHtml(html: string) {
  const hasJobPosting = /["']@type["']\s*:\s*["']JobPosting["']|itemtype=["'][^"']*schema\.org\/JobPosting/i.test(html);
  const hasVideoObject = /["']@type["']\s*:\s*["']VideoObject["']|itemtype=["'][^"']*schema\.org\/VideoObject/i.test(html);
  const hasBroadcastEvent = /["']@type["']\s*:\s*["']BroadcastEvent["']|itemtype=["'][^"']*schema\.org\/BroadcastEvent/i.test(html);
  return hasJobPosting || (hasVideoObject && hasBroadcastEvent);
}

function validateCredentials(provider: IndexingProvider, input: unknown) {
  if (!input) throw new Error("Credentials are required");
  const value = typeof input === "string" && provider === "google" ? parseJson(input) : input;
  if (!value || typeof value !== "object") throw new Error("Credentials are required");
  const record = value as Record<string, unknown>;

  if (provider === "indexnow") {
    const credentials = {
      key: String(record.key || "").trim(),
      keyLocation: normalizeHttpUrl(String(record.keyLocation || record.key_location || "").trim()),
    };
    if (!/^[A-Za-z0-9-]{8,128}$/.test(credentials.key)) {
      throw new Error("IndexNow key must be 8-128 letters, numbers, or dashes");
    }
    return credentials;
  }

  const credentials = {
    client_email: String(record.client_email || "").trim(),
    private_key: String(record.private_key || "").replace(/\\n/g, "\n").trim(),
    token_uri: String(record.token_uri || "https://oauth2.googleapis.com/token").trim(),
  };
  if (!credentials.client_email || !credentials.private_key.includes("PRIVATE KEY")) {
    throw new Error("Google service account JSON must include client_email and private_key");
  }
  return credentials;
}

function credentialHint(provider: IndexingProvider, credentials: IndexNowCredentials | GoogleCredentials) {
  if (provider === "indexnow") return (credentials as IndexNowCredentials).key.slice(-8);
  return (credentials as GoogleCredentials).client_email;
}

async function getUserSite(userId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);
  if (!site) throw new Error("Site not found");
  return site;
}

async function testIndexNow(credentials: IndexNowCredentials) {
  const response = await fetch(credentials.keyLocation, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Key file returned ${response.status}`);
  const text = (await response.text()).trim();
  if (text !== credentials.key) throw new Error("Key file does not contain the IndexNow key");
  return { success: true, message: "IndexNow key file verified" };
}

async function testGoogle(credentials: GoogleCredentials) {
  await new SignJWT({ ok: true })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.client_email)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(await googlePrivateKey(credentials));
  return { success: true, message: `Google service account parsed for ${credentials.client_email}` };
}

async function submitIndexNow(integration: IntegrationRow, site: SiteRow, urls: string[], source: SubmissionSource) {
  const credentials = decryptIndexingCredentials(integration) as IndexNowCredentials;
  const endpoints = ["https://api.indexnow.org/indexnow", "https://yandex.com/indexnow"];
  const groups = groupByHost(urls);
  const responses: Array<{ endpoint: string; host: string; status: number; body: string }> = [];

  for (const [host, urlList] of groups) {
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host, key: credentials.key, keyLocation: credentials.keyLocation, urlList }),
        signal: AbortSignal.timeout(15000),
      });
      responses.push({ endpoint, host, status: response.status, body: (await response.text()).slice(0, 500) });
    }
  }

  const failed = responses.find((response) => ![200, 202].includes(response.status));
  const status = failed ? "failed" : "accepted";
  const errorMessage = failed ? `IndexNow ${new URL(failed.endpoint).hostname} returned ${failed.status}` : undefined;
  await db.update(indexingIntegrations).set({ lastSubmitAt: new Date() }).where(eq(indexingIntegrations.id, integration.id));

  const created = [];
  for (const url of urls) {
    created.push(await insertSubmission({
      userId: integration.userId,
      siteId: site.id,
      integrationId: integration.id,
      provider: "indexnow",
      url,
      source,
      status,
      errorMessage,
      responseData: { responses },
      submittedAt: new Date(),
    }));
  }
  return created;
}

async function submitGoogle(integration: IntegrationRow, site: SiteRow, urls: string[], source: SubmissionSource) {
  const credentials = decryptIndexingCredentials(integration) as GoogleCredentials;
  const created = [];
  let token: string | null = null;

  for (const url of urls) {
    const quotaUsed = await googleQuotaUsed(integration.id);
    if (quotaUsed >= 200) {
      created.push(await insertSubmission({
        userId: integration.userId,
        siteId: site.id,
        integrationId: integration.id,
        provider: "google",
        url,
        source,
        status: "queued",
        errorMessage: "Google daily quota reached",
      }));
      continue;
    }

    if (!await isGoogleIndexingEligibleUrl(url)) {
      created.push(await insertSubmission({
        userId: integration.userId,
        siteId: site.id,
        integrationId: integration.id,
        provider: "google",
        url,
        source,
        status: "skipped",
        errorMessage: "Google Indexing API only supports JobPosting or BroadcastEvent pages",
      }));
      continue;
    }

    token ||= await googleAccessToken(credentials);
    const result = await publishGoogleUrl(token, url);
    created.push(await insertSubmission({
      userId: integration.userId,
      siteId: site.id,
      integrationId: integration.id,
      provider: "google",
      url,
      source,
      status: result.ok ? "accepted" : "failed",
      errorMessage: result.ok ? undefined : `Google returned ${result.status}`,
      responseData: result,
      submittedAt: new Date(),
    }));
  }

  await db.update(indexingIntegrations).set({ lastSubmitAt: new Date() }).where(eq(indexingIntegrations.id, integration.id));
  return created;
}

export async function drainQueuedGoogleIndexing(limit = 50) {
  const queued = await db
    .select()
    .from(indexingSubmissions)
    .where(and(eq(indexingSubmissions.provider, "google"), eq(indexingSubmissions.status, "queued")))
    .orderBy(asc(indexingSubmissions.createdAt))
    .limit(limit);

  let accepted = 0;
  let skipped = 0;
  let failed = 0;
  const tokens = new Map<string, string>();

  for (const row of queued) {
    if (!row.integrationId || !row.siteId) {
      await markQueuedGoogle(row.id, "failed", "Missing integration or site");
      failed += 1;
      continue;
    }

    const [integration] = await db.select().from(indexingIntegrations).where(eq(indexingIntegrations.id, row.integrationId)).limit(1);
    if (!integration || integration.status !== "connected") {
      await markQueuedGoogle(row.id, "failed", "Google integration is not connected");
      failed += 1;
      continue;
    }
    if (await googleQuotaUsed(integration.id) >= 200) break;
    if (!await isGoogleIndexingEligibleUrl(row.url)) {
      await markQueuedGoogle(row.id, "skipped", "Google Indexing API only supports JobPosting or BroadcastEvent pages");
      skipped += 1;
      continue;
    }

    try {
      let token = tokens.get(integration.id);
      if (!token) {
        token = await googleAccessToken(decryptIndexingCredentials(integration) as GoogleCredentials);
        tokens.set(integration.id, token);
      }
      const result = await publishGoogleUrl(token, row.url);
      await db.update(indexingSubmissions).set({
        status: result.ok ? "accepted" : "failed",
        errorMessage: result.ok ? null : `Google returned ${result.status}`,
        responseData: result,
        submittedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(indexingSubmissions.id, row.id));
      if (result.ok) accepted += 1;
      else failed += 1;
    } catch (error) {
      await markQueuedGoogle(row.id, "failed", error instanceof Error ? error.message : "Google submission failed");
      failed += 1;
    }
  }

  return { queued: queued.length, accepted, skipped, failed };
}

async function markQueuedGoogle(id: string, status: "accepted" | "skipped" | "failed", errorMessage: string) {
  await db.update(indexingSubmissions).set({
    status,
    errorMessage,
    submittedAt: status === "accepted" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(indexingSubmissions.id, id));
}

async function isGoogleIndexingEligibleUrl(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return false;
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("html")) return false;
  return isGoogleIndexingEligibleHtml(await response.text());
}

async function googleAccessToken(credentials: GoogleCredentials) {
  const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token";
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/indexing" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.client_email)
    .setSubject(credentials.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(await googlePrivateKey(credentials));

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

async function publishGoogleUrl(token: string, url: string) {
  const response = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, type: "URL_UPDATED" }),
    signal: AbortSignal.timeout(15000),
  });
  return { ok: response.ok, status: response.status, body: (await response.text()).slice(0, 1000) };
}

async function googlePrivateKey(credentials: GoogleCredentials) {
  return importPKCS8(credentials.private_key.replace(/\\n/g, "\n"), "RS256");
}

async function googleQuotaUsed(integrationId: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(indexingSubmissions)
    .where(and(
      eq(indexingSubmissions.integrationId, integrationId),
      eq(indexingSubmissions.provider, "google"),
      eq(indexingSubmissions.status, "accepted"),
      gte(indexingSubmissions.submittedAt, start),
    ));
  return row?.count || 0;
}

async function insertSubmission(input: typeof indexingSubmissions.$inferInsert) {
  const [row] = await db.insert(indexingSubmissions).values(input).returning();
  return serializeIndexingSubmission(row);
}

function normalizeHttpUrl(value: string) {
  const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported");
  return parsed.toString();
}

function comparableHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function groupByHost(urls: string[]) {
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    const host = new URL(url).host;
    groups.set(host, [...(groups.get(host) || []), url]);
  }
  return groups;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Google service account must be valid JSON");
  }
}

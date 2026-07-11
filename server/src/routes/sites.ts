import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { feeds, sites } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import { buildInternalLinkIndex, sanitizeInternalLinkIndex, type InternalLinkIndex } from "../services/internal-linking.js";
import { getActiveSiteId, getGlobalSettings, updateGlobalSettings, updateSiteSettings } from "../services/user-settings.js";

export const sitesRoutes = new Hono();

const COMMON_TOPIC_WORDS = new Set([
  "about", "blog", "category", "contact", "home", "page", "post", "posts",
  "the", "and", "for", "with", "from", "your", "you", "our", "all",
  "bir", "ile", "icin", "için", "olan", "daha", "gibi", "ve", "veya",
]);

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  if (host.includes("metadata.google") || host.includes("instance-data")) return true;
  return false;
}

function normalizeSiteInput(input: string) {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS sites are supported");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Private or internal sites are not allowed");
  }
  return {
    url: parsed.toString(),
    domain: parsed.hostname.replace(/^www\./, ""),
  };
}

function defaultSitemapUrl(inputUrl: string) {
  const parsed = new URL(inputUrl);
  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = "/sitemap.xml";
  }
  return parsed.toString();
}

function comparableSiteHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function titleCaseDomain(domain: string) {
  const first = domain.split(".")[0] || domain;
  return first
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function detectLanguage(index: InternalLinkIndex) {
  const sample = index.pages.slice(0, 15).map((page) => `${page.title} ${page.description || ""}`).join(" ");
  if (/[çğıöşüİĞÜŞÖÇ]/.test(sample)) return "tr";
  return "en";
}

function extractTopics(index: InternalLinkIndex) {
  const counts = new Map<string, number>();
  for (const page of index.pages.slice(0, 80)) {
    const text = `${page.title} ${page.path}`
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s/-]/gu, " ");
    const tokens = text.split(/[\s/-]+/).filter((token) => token.length > 3 && !COMMON_TOPIC_WORDS.has(token));
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic]) => topic);
}

function serializeSite(site: typeof sites.$inferSelect) {
  return {
    id: site.id,
    user_id: site.userId,
    userId: site.userId,
    name: site.name,
    domain: site.domain,
    sitemap_url: site.sitemapUrl,
    sitemapUrl: site.sitemapUrl,
    status: site.status,
    page_count: site.pageCount || 0,
    pageCount: site.pageCount || 0,
    vector_count: site.vectorCount || 0,
    vectorCount: site.vectorCount || 0,
    topics: site.topics || [],
    editorial_topics: site.editorialTopics || [],
    editorialTopics: site.editorialTopics || [],
    language: site.language,
    cta: site.cta,
    internal_link_index: sanitizeInternalLinkIndex(site.internalLinkIndex),
    internalLinkIndex: sanitizeInternalLinkIndex(site.internalLinkIndex),
    internal_link_last_synced_at: site.internalLinkLastSyncedAt,
    internalLinkLastSyncedAt: site.internalLinkLastSyncedAt,
    created_at: site.createdAt,
    createdAt: site.createdAt,
    updated_at: site.updatedAt,
    updatedAt: site.updatedAt,
  };
}

async function syncActiveSite(userId: string, site: typeof sites.$inferSelect) {
  await updateGlobalSettings(userId, { activeSiteId: site.id });
  return updateSiteSettings(userId, site.id, {
    enableInternalLinks: Boolean(site.internalLinkIndex),
    internalLinkSitemapUrl: site.sitemapUrl,
    internalLinkStatus: site.internalLinkIndex ? "connected" : "disconnected",
    internalLinkMode: "all",
    internalLinkDensity: "balanced",
    internalLinkIndex: site.internalLinkIndex as never,
    internalLinkLastSyncedAt: site.internalLinkLastSyncedAt,
  });
}

async function listSitesForUser(userId: string) {
  const rows = await db.select().from(sites).where(eq(sites.userId, userId));
  return rows.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

async function bootstrapSitesFromSettings(userId: string) {
  const rows = await listSitesForUser(userId);
  if (rows.length > 0) return rows;

  const settings = await getGlobalSettings(userId);

  const index = settings?.internalLinkIndex as InternalLinkIndex | null | undefined;
  if (!settings?.internalLinkSitemapUrl || !index?.siteHost) return rows;

  const now = new Date();
  const [site] = await db
    .insert(sites)
    .values({
      userId,
      name: titleCaseDomain(index.siteHost),
      domain: index.siteHost,
      sitemapUrl: settings.internalLinkSitemapUrl,
      status: "active",
      pageCount: index.pageCount || 0,
      vectorCount: index.vectorCount || 0,
      topics: extractTopics(index),
      language: detectLanguage(index),
      internalLinkIndex: index as never,
      internalLinkLastSyncedAt: settings.internalLinkLastSyncedAt || now,
      updatedAt: now,
    } as never)
    .returning();

  await syncActiveSite(userId, site);
  return [site];
}

sitesRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await bootstrapSitesFromSettings(userId);
  let activeSiteId = await getActiveSiteId(userId);

  if (!activeSiteId && rows.length > 0) {
    await syncActiveSite(userId, rows[0]);
    activeSiteId = rows[0].id;
  }

  return c.json({
    sites: rows.map(serializeSite),
    active_site_id: activeSiteId,
    activeSiteId,
  });
});

sitesRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const input = asText(body.url ?? body.domain ?? body.siteUrl);
  const requestedName = asText(body.name);

  if (!input) {
    return c.json({ error: "Site URL is required" }, 400);
  }

  try {
    const normalized = normalizeSiteInput(input);
    let index: InternalLinkIndex | null = null;
    let indexingError: string | null = null;

    try {
      index = await buildInternalLinkIndex(normalized.url);
    } catch (err: any) {
      indexingError = err.message || "We could not index this site's sitemap yet";
    }

    const now = new Date();
    const domain = index?.siteHost || normalized.domain;
    const sitemapUrl = index?.sitemapUrl || defaultSitemapUrl(normalized.url);
    const existingSites = await listSitesForUser(userId);
    const existingSite = existingSites.find((site) => comparableSiteHost(site.domain) === comparableSiteHost(domain));

    if (existingSite) {
      const [site] = await db
        .update(sites)
        .set({
          name: requestedName || existingSite.name || titleCaseDomain(domain),
          domain,
          sitemapUrl,
          status: "active",
          pageCount: index?.pageCount || existingSite.pageCount || 0,
          vectorCount: index?.vectorCount || existingSite.vectorCount || 0,
          topics: index ? extractTopics(index) : existingSite.topics || [],
          language: index ? detectLanguage(index) : existingSite.language,
          internalLinkIndex: index ? index as never : existingSite.internalLinkIndex as never,
          internalLinkLastSyncedAt: index ? now : existingSite.internalLinkLastSyncedAt,
          updatedAt: now,
        } as never)
        .where(and(eq(sites.id, existingSite.id), eq(sites.userId, userId)))
        .returning();

      await syncActiveSite(userId, site);

      return c.json({
        site: serializeSite(site),
        active_site_id: site.id,
        activeSiteId: site.id,
        indexing_error: indexingError,
        indexingError,
      });
    }

    const [site] = await db
      .insert(sites)
      .values({
        userId,
        name: requestedName || titleCaseDomain(domain),
        domain,
        sitemapUrl,
        status: "active",
        pageCount: index?.pageCount || 0,
        vectorCount: index?.vectorCount || 0,
        topics: index ? extractTopics(index) : [],
        language: index ? detectLanguage(index) : null,
        internalLinkIndex: index as never,
        internalLinkLastSyncedAt: index ? now : null,
        updatedAt: now,
      } as never)
      .returning();

    await syncActiveSite(userId, site);

    return c.json({
      site: serializeSite(site),
      active_site_id: site.id,
      activeSiteId: site.id,
      indexing_error: indexingError,
      indexingError,
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to connect site" }, 400);
  }
});

sitesRoutes.post("/:id/activate", async (c) => {
  const userId = getUserId(c);
  const siteId = c.req.param("id");
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);

  if (!site) return c.json({ error: "Site not found" }, 404);

  await syncActiveSite(userId, site);
  return c.json({ site: serializeSite(site), active_site_id: site.id, activeSiteId: site.id });
});

sitesRoutes.post("/:id/refresh", async (c) => {
  const userId = getUserId(c);
  const siteId = c.req.param("id");
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);

  if (!site) return c.json({ error: "Site not found" }, 404);

  try {
    const index = await buildInternalLinkIndex(site.sitemapUrl || site.domain);
    const now = new Date();
    const [updated] = await db
      .update(sites)
      .set({
        sitemapUrl: index.sitemapUrl,
        pageCount: index.pageCount,
        vectorCount: index.vectorCount,
        topics: extractTopics(index),
        language: detectLanguage(index),
        internalLinkIndex: index as never,
        internalLinkLastSyncedAt: now,
        updatedAt: now,
      } as never)
      .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
      .returning();

    const activeSiteId = await getActiveSiteId(userId);
    if (activeSiteId === updated.id) {
      await syncActiveSite(userId, updated);
    }

    return c.json({ site: serializeSite(updated) });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to refresh site" }, 400);
  }
});

sitesRoutes.put("/:id/editorial-topics", async (c) => {
  const userId = getUserId(c);
  const siteId = c.req.param("id");
  const body = await c.req.json();
  const rawTopics: unknown[] = Array.isArray(body.topics) ? body.topics : [];
  const seen = new Set<string>();
  const editorialTopics = rawTopics
    .map(asText)
    .filter((topic) => {
      if (!topic) return false;
      const key = topic.toLocaleLowerCase("tr-TR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
  const [site] = await db
    .update(sites)
    .set({ editorialTopics, updatedAt: new Date() })
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .returning();
  if (!site) return c.json({ error: "Site not found" }, 404);
  return c.json({ site: serializeSite(site) });
});

sitesRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const siteId = c.req.param("id");
  const activeSiteId = await getActiveSiteId(userId);

  await db.update(feeds).set({ isActive: false, integrationId: null }).where(and(eq(feeds.siteId, siteId), eq(feeds.userId, userId)));
  await db.delete(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId)));

  if (activeSiteId === siteId) {
    const remaining = await listSitesForUser(userId);
    if (remaining.length > 0) {
      await syncActiveSite(userId, remaining[0]);
    } else {
      await updateGlobalSettings(userId, { activeSiteId: null });
    }
  }

  const rows = await listSitesForUser(userId);
  const nextActiveSiteId = await getActiveSiteId(userId);
  return c.json({ sites: rows.map(serializeSite), active_site_id: nextActiveSiteId, activeSiteId: nextActiveSiteId });
});

import { Hono } from "hono";
import { waitUntil } from "@vercel/functions";
import { db } from "../db/index.js";
import { jobs, personas, userSettings, sites, feeds, siteIntegrations } from "../db/schema.js";
import { eq, and, desc, ilike, or, sql, type SQL } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { getPinnedSiteSettings } from "../services/user-settings.js";
import { markStaleRunningJobs } from "../services/job-timeouts.js";
import { readJsonObject } from "../http/error-contract.js";
import { pagination, parseJobListQuery } from "./list-query.js";

export const jobsRoutes = new Hono();
const FEED_SOURCE_TYPES = new Set(["rss_feed", "reddit", "hackernews", "github"]);

function imageConfigFromSettings(settings: typeof userSettings.$inferSelect | undefined) {
  const imageConfig: Record<string, unknown> = {};
  const imageOptions = settings?.imageAdvancedOptions && typeof settings.imageAdvancedOptions === "object" && !Array.isArray(settings.imageAdvancedOptions)
    ? settings.imageAdvancedOptions as Record<string, unknown>
    : {};
  const coverResolution = imageOptions.coverResolution === "512" ? "512" : "1K";
  const inlineResolution = imageOptions.inlineResolution === "512" ? "512" : "1K";
  if (settings?.coverEnabled) {
    imageConfig.cover = { resolution: coverResolution };
  }
  const inlineCount = Math.max(0, Number(settings?.inlineCount ?? 2) || 0);
  const inlineEnabled = Boolean(settings?.inlineEnabled && inlineCount > 0);
  if (inlineEnabled) {
    imageConfig.inline = {
      count: inlineCount,
      resolution: inlineResolution,
    };
  }
  const generateImages = Boolean(settings?.coverEnabled || inlineEnabled);
  return { generateImages, imageConfig: generateImages ? imageConfig : undefined };
}

function requestedSourceItemsFromPlan(plan: unknown) {
  if (!plan || typeof plan !== "object") return undefined;
  const value = (plan as Record<string, unknown>).requestedSourceItems;
  const count = Math.round(Number(value));
  return Number.isFinite(count) && count > 0 ? count : undefined;
}

function feedItemOffsetFromPlan(plan: unknown) {
  if (!plan || typeof plan !== "object") return undefined;
  const value = (plan as Record<string, unknown>).feedItemOffset;
  const offset = Math.floor(Number(value));
  return Number.isFinite(offset) && offset >= 0 ? offset : undefined;
}

function retryIndicesFromBody(body: unknown) {
  if (!body || typeof body !== "object") return [];
  const value = (body as Record<string, unknown>).retryIndices;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => Math.floor(Number(item))).filter((item) => Number.isFinite(item) && item >= 0))];
}

jobsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  await markStaleRunningJobs(userId);
  const query = parseJobListQuery(c.req.query());
  const conditions: SQL[] = [eq(jobs.userId, userId)];
  if (query.status) conditions.push(eq(jobs.status, query.status));
  if (query.siteId) conditions.push(eq(jobs.siteId, query.siteId));
  if (query.feedId) conditions.push(eq(jobs.feedId, query.feedId));
  if (query.campaignId) conditions.push(eq(jobs.campaignId, query.campaignId));
  if (query.search) conditions.push(or(
    sql`${jobs.id}::text ilike ${`%${query.search}%`}`,
    ilike(jobs.sourceValue, `%${query.search}%`),
  )!);

  const rows = await db
    .select({
      id: jobs.id,
      site_id: jobs.siteId,
      feed_id: jobs.feedId,
      preferred_integration_id: jobs.preferredIntegrationId,
      source_type: jobs.sourceType,
      source_value: jobs.sourceValue,
      model_id: jobs.modelId,
      persona_id: jobs.personaId,
      status: jobs.status,
      current_step: jobs.currentStep,
      error_message: jobs.errorMessage,
      generation_error: jobs.generationError,
      generation_plan: sql<Record<string, unknown>>`coalesce(jsonb_build_object(
        'failedDrafts', ${jobs.generationPlan}->'failedDrafts',
        'batchId', ${jobs.generationPlan}->'batchId',
        'variationCount', ${jobs.generationPlan}->'variationCount',
        'totalDrafts', ${jobs.generationPlan}->'totalDrafts',
        'variationIndex', ${jobs.generationPlan}->'variationIndex',
        'imagesEnabled', ${jobs.generationPlan}->'imagesEnabled',
        'imageDeliveryMode', ${jobs.generationPlan}->'imageDeliveryMode'
      ), '{}'::jsonb)`,
      result_post_ids: jobs.resultPostIds,
      token_cost: jobs.tokenCost,
      total_cost: jobs.totalCost,
      created_at: jobs.createdAt,
      completed_at: jobs.completedAt,
      persona_name: personas.name,
      site_name: sites.name,
      feed_name: feeds.name,
      integration_name: siteIntegrations.displayName,
      integration_provider: siteIntegrations.provider,
      integration_status: siteIntegrations.status,
      integration_site_id: siteIntegrations.siteId,
    })
    .from(jobs)
    .leftJoin(personas, eq(jobs.personaId, personas.id))
    .leftJoin(sites, and(eq(jobs.siteId, sites.id), eq(sites.userId, userId)))
    .leftJoin(feeds, and(eq(jobs.feedId, feeds.id), eq(feeds.userId, userId)))
    .leftJoin(siteIntegrations, and(eq(jobs.preferredIntegrationId, siteIntegrations.id), eq(siteIntegrations.userId, userId)))
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const items = rows.map(({ persona_name, integration_site_id, ...job }) => ({
    ...job,
    routing_status: job.site_id && job.preferred_integration_id && integration_site_id === job.site_id && job.integration_status === "connected" ? "ready" : "needs_routing",
    personas: persona_name ? { name: persona_name } : null,
  }));
  const [[countRow], [stats]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(jobs).where(and(...conditions)),
    db.select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${jobs.status} = 'pending')::int`,
      running: sql<number>`count(*) filter (where ${jobs.status} = 'running')::int`,
      completed: sql<number>`count(*) filter (where ${jobs.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')::int`,
      totalCost: sql<number>`coalesce(sum(${jobs.totalCost}), 0)::float8`,
    }).from(jobs).where(eq(jobs.userId, userId)),
  ]);
  const total = Number(countRow?.total || 0);
  return c.json({
    items,
    pagination: pagination(query.page, query.limit, total),
    facets: {
      statusCounts: {
        all: Number(stats?.total || 0), pending: Number(stats?.pending || 0), running: Number(stats?.running || 0),
        completed: Number(stats?.completed || 0), failed: Number(stats?.failed || 0),
      },
      totalCost: Number(stats?.totalCost || 0),
    },
  });
});

jobsRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  await markStaleRunningJobs(userId, id);

  const [job] = await db
    .select({
      id: jobs.id,
      site_id: jobs.siteId,
      feed_id: jobs.feedId,
      preferred_integration_id: jobs.preferredIntegrationId,
      user_id: jobs.userId,
      source_type: jobs.sourceType,
      source_value: jobs.sourceValue,
      model_id: jobs.modelId,
      persona_id: jobs.personaId,
      status: jobs.status,
      current_step: jobs.currentStep,
      error_message: jobs.errorMessage,
      generation_error: jobs.generationError,
      generation_plan: jobs.generationPlan,
      result_post_ids: jobs.resultPostIds,
      summary_result: jobs.summaryResult,
      summary_completed_at: jobs.summaryCompletedAt,
      campaign_id: jobs.campaignId,
      campaign_item_id: jobs.campaignItemId,
      token_cost: jobs.tokenCost,
      total_cost: jobs.totalCost,
      created_at: jobs.createdAt,
      completed_at: jobs.completedAt,
      site_name: sites.name,
      feed_name: feeds.name,
      integration_name: siteIntegrations.displayName,
      integration_provider: siteIntegrations.provider,
      integration_status: siteIntegrations.status,
      integration_site_id: siteIntegrations.siteId,
    })
    .from(jobs)
    .leftJoin(sites, and(eq(jobs.siteId, sites.id), eq(sites.userId, userId)))
    .leftJoin(feeds, and(eq(jobs.feedId, feeds.id), eq(feeds.userId, userId)))
    .leftJoin(siteIntegrations, and(eq(jobs.preferredIntegrationId, siteIntegrations.id), eq(siteIntegrations.userId, userId)))
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);
  const { integration_site_id, ...result } = job;
  return c.json({
    ...result,
    routing_status: result.site_id && result.preferred_integration_id && integration_site_id === result.site_id && result.integration_status === "connected" ? "ready" : "needs_routing",
  });
});

jobsRoutes.put("/:id/stop", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [updated] = await db
    .update(jobs)
    .set({ status: "failed", errorMessage: "Stopped by user", completedAt: new Date() } as any)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Job not found" }, 404);
  return c.json(updated);
});

jobsRoutes.post("/:id/retry", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await readJsonObject(c);

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);
  const settings = await getPinnedSiteSettings(userId, job.siteId);
  const imageSettings = imageConfigFromSettings(settings);
  const retryIndices = retryIndicesFromBody(body);

  if (retryIndices.length && FEED_SOURCE_TYPES.has(job.sourceType)) {
    const { generateContent } = await import("../services/generate-content.js");
    const retries = retryIndices.map(async (index) => {
      const plan = job.generationPlan && typeof job.generationPlan === "object" && !Array.isArray(job.generationPlan)
        ? { ...job.generationPlan as Record<string, unknown>, feedItemOffset: index, requestedSourceItems: 1 }
        : { feedItemOffset: index, requestedSourceItems: 1 };
      const [retryJob] = await db.insert(jobs).values({
        userId,
        siteId: job.siteId,
        feedId: job.feedId,
        preferredIntegrationId: job.preferredIntegrationId,
        sourceType: job.sourceType,
        sourceValue: job.sourceValue,
        modelId: job.modelId,
        personaId: job.personaId,
        status: "pending",
        currentStep: "queued",
        generationPlan: plan,
      }).returning();
      return generateContent({
        jobId: retryJob.id,
        userId,
        sourceType: job.sourceType,
        sourceValue: job.sourceValue,
        modelId: job.modelId,
        personaId: job.personaId,
        postsPerRun: 1,
        variations: 1,
        feedItemOffset: index,
        feedId: job.feedId || undefined,
        siteId: job.siteId,
        preferredIntegrationId: job.preferredIntegrationId,
        generateImages: imageSettings.generateImages,
        imageConfig: imageSettings.imageConfig,
      });
    });
    waitUntil(Promise.allSettled(retries).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") console.error(`[retry] Feed draft ${index + 1} error:`, result.reason);
      });
    }));
    return c.json({ status: "retrying", retryCount: retryIndices.length });
  }

  // Reset job to pending status
  const [updated] = await db
    .update(jobs)
    .set({
      status: "pending",
      currentStep: "queued",
      errorMessage: null,
      generationError: null,
      completedAt: null,
    } as any)
    .where(eq(jobs.id, id))
    .returning();

  // Trigger re-generation in the background
  const { generateContent } = await import("../services/generate-content.js");
  const retry = generateContent({
    jobId: updated.id,
    userId,
    sourceType: updated.sourceType,
    sourceValue: updated.sourceValue,
    modelId: updated.modelId,
    personaId: updated.personaId,
    postsPerRun: requestedSourceItemsFromPlan(updated.generationPlan),
    variations: requestedSourceItemsFromPlan(updated.generationPlan),
    feedItemOffset: feedItemOffsetFromPlan(updated.generationPlan),
    feedId: updated.feedId || undefined,
    siteId: updated.siteId,
    preferredIntegrationId: updated.preferredIntegrationId,
    generateImages: imageSettings.generateImages,
    imageConfig: imageSettings.imageConfig,
  }).catch((err) => console.error("[retry] Generation error:", err));
  waitUntil(retry);

  return c.json(updated);
});

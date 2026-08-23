import { Hono } from "hono";
import { waitUntil } from "@vercel/functions";
import { asc, and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaignItems, campaigns, jobs, personas, posts, userSettings } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import { isCampaignMode, normalizeOutline, parseCampaignLines, type ParsedCampaignItem } from "../services/campaign-parser.js";
import { reconcileStaleCampaignItems, retryCampaignItems, runCampaign, stopCampaign } from "../services/campaign-runner.js";
import { materializeProgrammaticItems } from "../services/programmatic.js";
import { getEffectiveSettings } from "../services/user-settings.js";
import { safeError } from "../http/error-contract.js";
import { seoMetadata, seoStatusForArticle } from "../services/seo-metadata.js";
import { hasSiteAccess } from "../services/search-console.js";
import { SEO_PLAN_MODE } from "../services/seo-growth-plan.js";

export const campaignsRoutes = new Hono();

const snapshotKeys = [
  "articleWordCount",
  "articleLanguage",
  "articleVoice",
  "voiceMode",
  "customVoiceProfile",
  "voiceTrainingSamples",
  "contentRules",
  "customArticleInstructions",
  "includeTableOfContents",
  "enableResearch",
  "enableInternalLinks",
  "internalLinkDensity",
  "internalLinkRules",
  "internalLinkIndex",
  "brandCompanyName",
  "brandDescription",
  "brandTargetAudience",
  "brandMentions",
  "brandValueProps",
  "brandCtas",
  "knowledgeBaseEnabled",
  "knowledgeDocuments",
  "imageModel",
  "imageAdvancedOptions",
  "imageStylePrompt",
] as const;
const internalLinkDensities = new Set(["minimal", "light", "balanced", "rich"]);

function imageConfigFromSettings(settings: typeof userSettings.$inferSelect | undefined) {
  const imageConfig: Record<string, unknown> = {};
  const imageOptions = settings?.imageAdvancedOptions && typeof settings.imageAdvancedOptions === "object" && !Array.isArray(settings.imageAdvancedOptions)
    ? settings.imageAdvancedOptions as Record<string, unknown>
    : {};
  const coverResolution = imageOptions.coverResolution === "512" ? "512" : "1K";
  const inlineResolution = imageOptions.inlineResolution === "512" ? "512" : "1K";
  if (settings?.coverEnabled) imageConfig.cover = { resolution: coverResolution };
  const inlineCount = Math.max(0, Number(settings?.inlineCount ?? 2) || 0);
  if (settings?.inlineEnabled && inlineCount > 0) {
    imageConfig.inline = { count: inlineCount, resolution: inlineResolution };
  }
  const generateImages = Boolean(Object.keys(imageConfig).length);
  return { generateImages, imageConfig: generateImages ? imageConfig : null };
}

async function buildSettingsSnapshot(userId: string, body: any) {
  const settings = await getEffectiveSettings(userId);
  const snapshot: Record<string, unknown> = {};
  for (const key of snapshotKeys) snapshot[key] = settings?.[key] ?? null;
  if (internalLinkDensities.has(body.internalLinkDensity)) snapshot.internalLinkDensity = body.internalLinkDensity;
  if (body.imageDeliveryMode === "manual_prompt" || body.imageDeliveryMode === "generate") {
    snapshot.imageDeliveryMode = body.imageDeliveryMode;
  }
  if (body.manualImageProvider === "midjourney") {
    snapshot.manualImageProvider = body.manualImageProvider;
  }
  snapshot.customInstructions = typeof body.customInstructions === "string" ? body.customInstructions.trim() : "";
  const defaultImageSettings = imageConfigFromSettings(settings);
  snapshot.generateImages = typeof body.generateImages === "boolean" ? body.generateImages : defaultImageSettings.generateImages;
  snapshot.imageConfig = body.imageConfig || defaultImageSettings.imageConfig;
  return snapshot;
}

campaignsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), ne(campaigns.mode, SEO_PLAN_MODE)))
    .orderBy(desc(campaigns.createdAt));
  return c.json(rows);
});

campaignsRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mode = body.mode;
  if (!name) return c.json({ error: "Campaign name is required" }, 400);
  if (!isCampaignMode(mode)) return c.json({ error: "Invalid campaign mode" }, 400);
  const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
  if (!modelId) return c.json({ error: "Model is required" }, 400);
  const siteId = typeof body.siteId === "string" ? body.siteId : typeof body.site_id === "string" ? body.site_id : null;
  if (siteId && !(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  let items: ParsedCampaignItem[];
  let programmatic: ReturnType<typeof materializeProgrammaticItems> | null = null;
  try {
    if (mode === "programmatic") {
      programmatic = materializeProgrammaticItems(body.programmatic);
      items = programmatic.items;
    } else {
      items = parseCampaignLines(String(body.lines || ""), mode);
    }
  } catch (err: any) {
    return c.json({ error: err.message || "Invalid campaign input" }, 400);
  }
  if (!items.length) return c.json({ error: "Add at least one campaign item" }, 400);

  const outlineMode = mode === "programmatic" ? "programmatic" : ["shared", "per_item"].includes(body.outlineMode) ? body.outlineMode : "none";
  const sharedOutline = outlineMode === "shared" ? normalizeOutline(body.sharedOutline) : [];
  if (mode === "title_outline" && outlineMode === "shared" && !sharedOutline.length) {
    return c.json({ error: "Shared outline is required" }, 400);
  }
  const settingsSnapshot = await buildSettingsSnapshot(userId, body);
  if (programmatic) {
    settingsSnapshot.programmatic = {
      template: programmatic.template,
      dataMode: programmatic.dataMode,
      variables: programmatic.variables,
      rowCount: programmatic.rows.length,
    };
  }
  const personaId = typeof body.personaId === "string" && body.personaId.trim() ? body.personaId.trim() : null;

  if (personaId) {
    const [persona] = await db
      .select({ id: personas.id })
      .from(personas)
      .where(and(eq(personas.id, personaId), eq(personas.userId, userId)))
      .limit(1);
    if (!persona) return c.json({ error: "Invalid brand voice" }, 400);
  }

  const [campaign] = await db.insert(campaigns).values({
    userId,
    siteId,
    name,
    mode,
    outlineMode,
    status: "draft",
    modelId,
    personaId,
    settingsSnapshot,
    sharedOutline: sharedOutline.length ? sharedOutline : null,
    totalItems: items.length,
  }).returning();

  const createdItems = await db.insert(campaignItems).values(items.map((item, index) => ({
    campaignId: campaign.id,
    userId,
    position: index + 1,
    input: item.input,
    keyword: item.keyword || null,
    title: item.title || null,
    outline: item.outline || null,
    variables: item.variables || null,
    status: "queued",
  }))).returning();

  return c.json({ campaign, items: createdItems }, 201);
});

campaignsRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  let [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId))).limit(1);
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  const reconciled = await reconcileStaleCampaignItems(id, userId);
  if (reconciled.stale > 0) {
    [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId))).limit(1);
    if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  }

  const itemRows = await db
    .select()
    .from(campaignItems)
    .where(eq(campaignItems.campaignId, id))
    .orderBy(asc(campaignItems.position));

  const itemJobIds = itemRows.map((item) => item.jobId).filter((jobId): jobId is string => Boolean(jobId));
  const itemJobs = itemJobIds.length
    ? await db
      .select({
        id: jobs.id,
        status: jobs.status,
        currentStep: jobs.currentStep,
        errorMessage: jobs.errorMessage,
        totalCost: jobs.totalCost,
      })
      .from(jobs)
      .where(inArray(jobs.id, itemJobIds))
    : [];
  const jobById = new Map(itemJobs.map((job) => [job.id, job]));
  const postIds = itemRows.map((item) => item.postId).filter((postId): postId is string => Boolean(postId));
  const postRows = postIds.length
    ? await db.select({ id: posts.id, title: posts.title, content: posts.content, seoMetadata: posts.seoMetadata }).from(posts).where(and(eq(posts.userId, userId), inArray(posts.id, postIds)))
    : [];
  const seoByPost = new Map(postRows.map((post) => {
    const metadata = seoMetadata(post.seoMetadata);
    const status = seoStatusForArticle(metadata, post.title, post.content);
    return [post.id, {
      status,
      error: metadata?.error || metadata?.validationErrors.join(" ") || null,
    }];
  }));
  const items = itemRows.map((item) => {
    const job = item.jobId ? jobById.get(item.jobId) : null;
    return {
      ...item,
      jobStatus: job?.status || null,
      currentStep: job?.currentStep || null,
      jobErrorMessage: job?.errorMessage || null,
      jobTotalCost: job?.totalCost || null,
      seoStatus: item.postId ? seoByPost.get(item.postId)?.status || "missing" : "missing",
      seoError: item.postId ? seoByPost.get(item.postId)?.error || null : null,
    };
  });

  const history = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      currentStep: jobs.currentStep,
      errorMessage: jobs.errorMessage,
      totalCost: jobs.totalCost,
      resultPostIds: jobs.resultPostIds,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .where(eq(jobs.campaignId, id))
    .orderBy(desc(jobs.createdAt))
    .limit(25);

  return c.json({ campaign, items, history });
});

campaignsRoutes.post("/:id/start", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [existing] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId))).limit(1);
  if (!existing) return c.json({ error: "Campaign not found" }, 404);
  if (existing.mode === SEO_PLAN_MODE) return c.json({ error: "SEO growth plans are started item by item" }, 409);
  if (!["draft", "stopped"].includes(existing.status)) {
    return c.json({ error: "Campaign cannot be started from this state" }, 409);
  }

  if (existing.status === "stopped") {
    const resumedItems = await db
      .update(campaignItems)
      .set({ status: "queued", errorMessage: null, startedAt: null, completedAt: null })
      .where(and(eq(campaignItems.campaignId, id), eq(campaignItems.status, "stopped")))
      .returning({ id: campaignItems.id });
    if (!resumedItems.length) return c.json({ error: "No stopped campaign items to resume" }, 409);
  }

  const [campaign] = await db
    .update(campaigns)
    .set({ status: "running", startedAt: new Date(), completedAt: null, errorMessage: null })
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .returning();

  waitUntil(runCampaign(id, { maxItems: 3 }).catch((err) => console.error("[campaign] Run failed", safeError(err))));
  return c.json({ campaign });
});

campaignsRoutes.post("/:id/run-next", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [existing] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId))).limit(1);
  if (!existing) return c.json({ error: "Campaign not found" }, 404);
  if (existing.status !== "running") {
    return c.json({ error: "Campaign must be running to process the next batch" }, 409);
  }

  await reconcileStaleCampaignItems(id, userId);
  waitUntil(runCampaign(id, { maxItems: 3 }).catch((err) => console.error("[campaign] Run next failed", safeError(err))));
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId))).limit(1);
  return c.json({ campaign, queued: true }, 202);
});

campaignsRoutes.post("/:id/stop", async (c) => {
  const userId = getUserId(c);
  const stopped = await stopCampaign(c.req.param("id"), userId);
  if (!stopped) return c.json({ error: "Campaign not found" }, 404);
  return c.json({ campaign: stopped });
});

campaignsRoutes.post("/:id/retry-failed", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const campaign = await retryCampaignItems(id, userId);
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  waitUntil(runCampaign(id, { maxItems: 3 }).catch((err) => console.error("[campaign] Retry failed", safeError(err))));
  return c.json({ campaign });
});

campaignsRoutes.post("/:id/items/:itemId/retry", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const campaign = await retryCampaignItems(id, userId, [c.req.param("itemId")]);
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  waitUntil(runCampaign(id, { maxItems: 3 }).catch((err) => console.error("[campaign] Retry item failed", safeError(err))));
  return c.json({ campaign });
});

campaignsRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const [deleted] = await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, c.req.param("id")), eq(campaigns.userId, userId)))
    .returning();
  if (!deleted) return c.json({ error: "Campaign not found" }, 404);
  return c.json({ ok: true });
});

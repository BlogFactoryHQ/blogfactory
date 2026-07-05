import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaignItems, campaigns, jobs, userSettings } from "../db/schema.js";
import { generateContent } from "./generate-content.js";
import type { CampaignMode, OutlineHeading } from "./campaign-parser.js";
import { renderProgrammaticArticle, type ProgrammaticTemplate, type ProgrammaticRow } from "./programmatic.js";
import { getEffectiveSettings } from "./user-settings.js";

const CAMPAIGN_CONCURRENCY = 3;
const STALE_ITEM_MINUTES = 45;

type Campaign = typeof campaigns.$inferSelect;
type CampaignItem = typeof campaignItems.$inferSelect;

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

async function campaignImageSettings(campaign: Campaign) {
  const snapshot = campaign.settingsSnapshot as Record<string, unknown> | null;
  if (snapshot?.generateImages && snapshot.imageConfig) {
    return { settingsSnapshot: snapshot, generateImages: true, imageConfig: snapshot.imageConfig };
  }
  if (campaign.mode !== "programmatic") {
    return { settingsSnapshot: snapshot, generateImages: Boolean(snapshot?.generateImages), imageConfig: snapshot?.imageConfig || null };
  }

  const settings = await getEffectiveSettings(campaign.userId);
  const defaults = imageConfigFromSettings(settings);
  return {
    settingsSnapshot: {
      ...(snapshot || {}),
      generateImages: defaults.generateImages,
      imageConfig: defaults.imageConfig,
      imageAdvancedOptions: snapshot?.imageAdvancedOptions || settings?.imageAdvancedOptions || null,
      imageStylePrompt: snapshot?.imageStylePrompt || settings?.imageStylePrompt || null,
    },
    generateImages: defaults.generateImages,
    imageConfig: defaults.imageConfig,
  };
}

function itemOutline(item: CampaignItem, campaign: Campaign) {
  const own = Array.isArray(item.outline) ? item.outline as OutlineHeading[] : [];
  if (own.length) return own;
  return Array.isArray(campaign.sharedOutline) ? campaign.sharedOutline as OutlineHeading[] : [];
}

function programmaticArticle(campaign: Campaign, item: CampaignItem) {
  if (campaign.mode !== "programmatic") return null;
  const snapshot = campaign.settingsSnapshot as { programmatic?: { template?: ProgrammaticTemplate } };
  const template = snapshot?.programmatic?.template as ProgrammaticTemplate | undefined;
  if (!template) throw new Error("Programmatic template snapshot is missing");
  const variables = (item.variables || {}) as ProgrammaticRow;
  const rendered = renderProgrammaticArticle(template, variables);
  return {
    mode: "programmatic" as CampaignMode,
    title: rendered.title,
    outline: rendered.outline,
    sharedContext: campaign.name,
    programmatic: {
      templateName: template.name,
      variables,
      sections: rendered.sections,
      wordRange: template.wordRange,
    },
  };
}

async function refreshCampaignCounters(campaignId: string) {
  const [campaign] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  const items = await db
    .select({ status: campaignItems.status })
    .from(campaignItems)
    .where(eq(campaignItems.campaignId, campaignId));

  const total = items.length;
  const completed = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const running = items.some((item) => item.status === "running" || item.status === "queued");
  const status = campaign?.status === "stopped" ? "stopped" : running ? "running" : failed ? "failed" : "completed";
  const [cost] = await db
    .select({ total: sql<number>`COALESCE(SUM(${jobs.totalCost}), 0)` })
    .from(jobs)
    .where(eq(jobs.campaignId, campaignId));

  await db.update(campaigns).set({
    totalItems: total,
    completedItems: completed,
    failedItems: failed,
    totalCost: Number(cost?.total || 0),
    status,
    completedAt: running && status !== "stopped" ? null : new Date(),
  }).where(eq(campaigns.id, campaignId));

  return { total, completed, failed, running };
}

async function runCampaignItem(campaign: Campaign, item: CampaignItem) {
  const [current] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, campaign.id))
    .limit(1);

  if (current?.status === "stopped") {
    await db
      .update(campaignItems)
      .set({ status: "stopped", completedAt: new Date() })
      .where(and(eq(campaignItems.id, item.id), eq(campaignItems.status, "queued")));
    return;
  }

  const [claimed] = await db.update(campaignItems).set({
    status: "running",
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
  }).where(and(eq(campaignItems.id, item.id), eq(campaignItems.status, "queued"))).returning();
  if (!claimed) return;

  let result: Awaited<ReturnType<typeof generateContent>>;
  try {
    const article = programmaticArticle(campaign, item);
    const imageSettings = await campaignImageSettings(campaign);
    result = await generateContent({
      userId: campaign.userId,
      sourceType: "campaign",
      sourceValue: item.input,
      modelId: campaign.modelId,
      personaId: campaign.personaId,
      campaignId: campaign.id,
      campaignItemId: item.id,
      settingsSnapshot: imageSettings.settingsSnapshot,
      generateImages: imageSettings.generateImages,
      imageConfig: imageSettings.imageConfig,
      campaignArticle: article || {
        mode: campaign.mode as CampaignMode,
        keyword: item.keyword,
        title: item.title,
        outline: itemOutline(item, campaign),
        sharedContext: campaign.name,
      },
    });
  } catch (err) {
    await db.update(campaignItems).set({
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Campaign item failed",
      completedAt: new Date(),
    }).where(and(eq(campaignItems.id, item.id), eq(campaignItems.status, "running")));
    return;
  }

  const postId = Array.isArray(result.postIds) ? result.postIds[0] : null;
  await db.update(campaignItems).set({
    status: result.status === "completed" && postId ? "completed" : "failed",
    jobId: result.jobId || null,
    postId: postId || null,
    errorMessage: result.error || null,
    completedAt: new Date(),
  }).where(and(eq(campaignItems.id, item.id), eq(campaignItems.status, "running")));
}

export async function runCampaign(campaignId: string, options: { maxItems?: number } = {}) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign || campaign.status === "stopped") return;
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  let processed = 0;

  await db.update(campaigns).set({
    status: "running",
    startedAt: campaign.startedAt || new Date(),
    completedAt: null,
    errorMessage: null,
  }).where(eq(campaigns.id, campaignId));

  while (processed < maxItems) {
    const [current] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (current?.status === "stopped") return;

    const items = await db
      .select()
      .from(campaignItems)
      .where(and(eq(campaignItems.campaignId, campaignId), eq(campaignItems.status, "queued")))
      .orderBy(asc(campaignItems.position))
      .limit(Math.min(CAMPAIGN_CONCURRENCY, maxItems - processed));

    if (!items.length) break;
    await Promise.allSettled(items.map((item) => runCampaignItem(campaign, item)));
    processed += items.length;
    await refreshCampaignCounters(campaignId);
  }

  await refreshCampaignCounters(campaignId);
  return processed;
}

export async function drainCampaignQueue(maxCampaigns = 5, maxItemsPerCampaign = CAMPAIGN_CONCURRENCY) {
  const staleBefore = new Date(Date.now() - STALE_ITEM_MINUTES * 60 * 1000);
  await db.update(campaignItems).set({ status: "queued", errorMessage: "Resumed after stale run", completedAt: null })
    .where(and(
      eq(campaignItems.status, "running"),
      lt(campaignItems.startedAt, staleBefore),
      sql`${campaignItems.campaignId} in (select id from campaigns where status = 'running')`,
    ));

  const rows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.status, "running"))
    .orderBy(asc(campaigns.startedAt), desc(campaigns.createdAt))
    .limit(maxCampaigns);

  let processed = 0;
  for (const row of rows) {
    // ponytail: bounded cron chunks; add a real external queue if single articles exceed function duration.
    processed += await runCampaign(row.id, { maxItems: maxItemsPerCampaign }) || 0;
  }
  return { campaigns: rows.length, processed };
}

export async function stopCampaign(campaignId: string, userId: string) {
  const [campaign] = await db
    .update(campaigns)
    .set({ status: "stopped", errorMessage: "Stopped by user", completedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
    .returning();

  if (!campaign) return null;

  await db
    .update(campaignItems)
    .set({ status: "stopped", completedAt: new Date() })
    .where(and(eq(campaignItems.campaignId, campaignId), inArray(campaignItems.status, ["queued"])));

  await refreshCampaignCounters(campaignId);
  return campaign;
}

export async function retryCampaignItems(campaignId: string, userId: string, itemIds?: string[]) {
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId))).limit(1);
  if (!campaign) return null;

  const where = itemIds?.length
    ? and(eq(campaignItems.campaignId, campaignId), inArray(campaignItems.id, itemIds), eq(campaignItems.status, "failed"))
    : and(eq(campaignItems.campaignId, campaignId), eq(campaignItems.status, "failed"));

  await db.update(campaignItems).set({
    status: "queued",
    jobId: null,
    postId: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
  }).where(where);

  await db.update(campaigns).set({ status: "running", completedAt: null, errorMessage: null }).where(eq(campaigns.id, campaignId));
  runCampaign(campaignId, { maxItems: CAMPAIGN_CONCURRENCY }).catch((err) => console.error("[campaign] Retry failed:", err));
  return campaign;
}

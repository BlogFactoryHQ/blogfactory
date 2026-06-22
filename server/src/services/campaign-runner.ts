import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaignItems, campaigns, jobs } from "../db/schema.js";
import { generateContent } from "./generate-content.js";
import type { CampaignMode, OutlineHeading } from "./campaign-parser.js";

const CAMPAIGN_CONCURRENCY = 3;

type Campaign = typeof campaigns.$inferSelect;
type CampaignItem = typeof campaignItems.$inferSelect;

function itemOutline(item: CampaignItem, campaign: Campaign) {
  const own = Array.isArray(item.outline) ? item.outline as OutlineHeading[] : [];
  if (own.length) return own;
  return Array.isArray(campaign.sharedOutline) ? campaign.sharedOutline as OutlineHeading[] : [];
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
    await db.update(campaignItems).set({ status: "stopped", completedAt: new Date() }).where(eq(campaignItems.id, item.id));
    return;
  }

  await db.update(campaignItems).set({
    status: "running",
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
  }).where(eq(campaignItems.id, item.id));

  const result = await generateContent({
    userId: campaign.userId,
    sourceType: "campaign",
    sourceValue: item.input,
    modelId: campaign.modelId,
    personaId: campaign.personaId,
    campaignId: campaign.id,
    campaignItemId: item.id,
    settingsSnapshot: campaign.settingsSnapshot,
    generateImages: Boolean((campaign.settingsSnapshot as any)?.generateImages),
    imageConfig: (campaign.settingsSnapshot as any)?.imageConfig,
    campaignArticle: {
      mode: campaign.mode as CampaignMode,
      keyword: item.keyword,
      title: item.title,
      outline: itemOutline(item, campaign),
      sharedContext: campaign.name,
    },
  });

  const postId = Array.isArray(result.postIds) ? result.postIds[0] : null;
  await db.update(campaignItems).set({
    status: result.status === "completed" && postId ? "completed" : "failed",
    jobId: result.jobId || null,
    postId: postId || null,
    errorMessage: result.error || null,
    completedAt: new Date(),
  }).where(eq(campaignItems.id, item.id));
}

export async function runCampaign(campaignId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign || campaign.status === "stopped") return;

  await db.update(campaigns).set({
    status: "running",
    startedAt: campaign.startedAt || new Date(),
    completedAt: null,
    errorMessage: null,
  }).where(eq(campaigns.id, campaignId));

  while (true) {
    const [current] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (current?.status === "stopped") return;

    const items = await db
      .select()
      .from(campaignItems)
      .where(and(eq(campaignItems.campaignId, campaignId), eq(campaignItems.status, "queued")))
      .orderBy(asc(campaignItems.position))
      .limit(CAMPAIGN_CONCURRENCY);

    if (!items.length) break;
    await Promise.allSettled(items.map((item) => runCampaignItem(campaign, item)));
    await refreshCampaignCounters(campaignId);
  }

  await refreshCampaignCounters(campaignId);
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
  runCampaign(campaignId).catch((err) => console.error("[campaign] Retry failed:", err));
  return campaign;
}

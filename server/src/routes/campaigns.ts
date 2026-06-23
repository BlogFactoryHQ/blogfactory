import { Hono } from "hono";
import { asc, and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaignItems, campaigns, jobs, personas, userSettings } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import { isCampaignMode, normalizeOutline, parseCampaignLines, type ParsedCampaignItem } from "../services/campaign-parser.js";
import { retryCampaignItems, runCampaign, stopCampaign } from "../services/campaign-runner.js";
import { materializeProgrammaticItems } from "../services/programmatic.js";

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
  "imageStylePrompt",
] as const;

async function buildSettingsSnapshot(userId: string, body: any) {
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const snapshot: Record<string, unknown> = {};
  for (const key of snapshotKeys) snapshot[key] = settings?.[key] ?? null;
  snapshot.customInstructions = typeof body.customInstructions === "string" ? body.customInstructions.trim() : "";
  snapshot.generateImages = Boolean(body.generateImages);
  snapshot.imageConfig = body.imageConfig || null;
  return snapshot;
}

campaignsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
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
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId))).limit(1);
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);

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
  const items = itemRows.map((item) => {
    const job = item.jobId ? jobById.get(item.jobId) : null;
    return {
      ...item,
      jobStatus: job?.status || null,
      currentStep: job?.currentStep || null,
      jobErrorMessage: job?.errorMessage || null,
      jobTotalCost: job?.totalCost || null,
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

  runCampaign(id, { maxItems: 3 }).catch((err) => console.error("[campaign] Run failed:", err));
  return c.json({ campaign });
});

campaignsRoutes.post("/:id/stop", async (c) => {
  const userId = getUserId(c);
  const stopped = await stopCampaign(c.req.param("id"), userId);
  if (!stopped) return c.json({ error: "Campaign not found" }, 404);
  return c.json({ campaign: stopped });
});

campaignsRoutes.post("/:id/retry-failed", async (c) => {
  const userId = getUserId(c);
  const campaign = await retryCampaignItems(c.req.param("id"), userId);
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  return c.json({ campaign });
});

campaignsRoutes.post("/:id/items/:itemId/retry", async (c) => {
  const userId = getUserId(c);
  const campaign = await retryCampaignItems(c.req.param("id"), userId, [c.req.param("itemId")]);
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
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

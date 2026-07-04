import { Hono } from "hono";
import { db } from "../db/index.js";
import { jobs, personas, userSettings } from "../db/schema.js";
import { eq, and, desc, lt, isNull } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const jobsRoutes = new Hono();
const STALE_RUNNING_MS = 10 * 60 * 1000;
const NO_DRAFT_TIMEOUT_MESSAGE =
  "Text model did not return before the job timed out. Try a faster model, fewer variations, or a shorter source.";

type FailedDraft = { index: number; error: string };

function partialTimeoutMessage(createdCount: number, totalDrafts: number) {
  return `Generation timed out after ${createdCount}/${totalDrafts} drafts were created. The remaining drafts did not finish; try a faster model or fewer variations.`;
}

export function staleTimeoutUpdateForJob(job: {
  generationPlan: unknown;
  resultPostIds: string[] | null;
  currentStep?: string | null;
}) {
  const plan = job.generationPlan && typeof job.generationPlan === "object"
    ? job.generationPlan as Record<string, unknown>
    : {};
  const createdCount = Array.isArray(job.resultPostIds) ? job.resultPostIds.length : 0;
  const plannedTotal = Number(plan.totalDrafts);
  const totalDrafts = Number.isFinite(plannedTotal) && plannedTotal > 0
    ? plannedTotal
    : Math.max(createdCount, 1);
  const existingFailedDrafts = Array.isArray(plan.failedDrafts)
    ? plan.failedDrafts.filter((draft): draft is FailedDraft => {
        return Boolean(
          draft &&
          typeof draft === "object" &&
          typeof (draft as FailedDraft).index === "number"
        );
      })
    : [];
  const failedIndexes = new Set(existingFailedDrafts.map((draft) => draft.index));

  if (createdCount > 0 && createdCount >= totalDrafts) {
    return {
      status: "completed",
      currentStep: "done",
      errorMessage: null,
      generationPlan: { ...plan, totalDrafts },
      completedAt: new Date(),
    };
  }

  if (createdCount > 0 && createdCount < totalDrafts) {
    const message = partialTimeoutMessage(createdCount, totalDrafts);
    const failedDrafts = [...existingFailedDrafts];
    for (let index = createdCount; index < totalDrafts; index += 1) {
      if (!failedIndexes.has(index)) {
        failedDrafts.push({ index, error: message });
      }
    }

    return {
      status: "completed",
      currentStep: "done",
      errorMessage: null,
      generationError: message,
      generationPlan: { ...plan, totalDrafts, failedDrafts },
      completedAt: new Date(),
    };
  }

  const timeoutMessage = NO_DRAFT_TIMEOUT_MESSAGE;
  const failedDrafts = [...existingFailedDrafts];
  for (let index = 0; index < totalDrafts; index += 1) {
    if (!failedIndexes.has(index)) {
      failedDrafts.push({ index, error: timeoutMessage });
    }
  }

  return {
    status: "failed",
    currentStep: "timeout",
    errorMessage: timeoutMessage,
    generationPlan: { ...plan, totalDrafts, failedDrafts },
    completedAt: new Date(),
  };
}

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

async function markStaleRunningJobs(userId: string, jobId?: string) {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const staleClauses = [
    eq(jobs.userId, userId),
    eq(jobs.status, "running"),
    isNull(jobs.campaignId),
    lt(jobs.createdAt, staleBefore),
  ];
  if (jobId) staleClauses.push(eq(jobs.id, jobId));

  const staleJobs = await db
    .select({
      id: jobs.id,
      generationPlan: jobs.generationPlan,
      resultPostIds: jobs.resultPostIds,
      currentStep: jobs.currentStep,
    })
    .from(jobs)
    .where(and(...staleClauses));

  await Promise.all(
    staleJobs.map((job) => db
      .update(jobs)
      .set(staleTimeoutUpdateForJob(job) as any)
      .where(eq(jobs.id, job.id)))
  );

  const failedClauses = [
    eq(jobs.userId, userId),
    eq(jobs.status, "failed"),
    isNull(jobs.campaignId),
  ];
  if (jobId) failedClauses.push(eq(jobs.id, jobId));

  const failedJobs = await db
    .select({
      id: jobs.id,
      generationPlan: jobs.generationPlan,
      resultPostIds: jobs.resultPostIds,
      currentStep: jobs.currentStep,
    })
    .from(jobs)
    .where(and(...failedClauses));

  await Promise.all(
    failedJobs
      .filter((job) => Array.isArray(job.resultPostIds) && job.resultPostIds.length > 0)
      .map((job) => db
        .update(jobs)
        .set(staleTimeoutUpdateForJob(job) as any)
        .where(eq(jobs.id, job.id)))
  );
}

jobsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  await markStaleRunningJobs(userId);

  const rows = await db
    .select({
      id: jobs.id,
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
      persona_name: personas.name,
    })
    .from(jobs)
    .leftJoin(personas, eq(jobs.personaId, personas.id))
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt));

  return c.json(rows.map(({ persona_name, ...job }) => ({
    ...job,
    personas: persona_name ? { name: persona_name } : null,
  })));
});

jobsRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  await markStaleRunningJobs(userId, id);

  const [job] = await db
    .select({
      id: jobs.id,
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
    })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);
  return c.json(job);
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

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const imageSettings = imageConfigFromSettings(settings);

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
  generateContent({
    jobId: updated.id,
    userId,
    sourceType: updated.sourceType,
    sourceValue: updated.sourceValue,
    modelId: updated.modelId,
    personaId: updated.personaId,
    postsPerRun: requestedSourceItemsFromPlan(updated.generationPlan),
    variations: requestedSourceItemsFromPlan(updated.generationPlan),
    generateImages: imageSettings.generateImages,
    imageConfig: imageSettings.imageConfig,
  }).catch((err) => console.error("[retry] Generation error:", err));

  return c.json(updated);
});

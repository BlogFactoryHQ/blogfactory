import { Hono } from "hono";
import { db } from "../db/index.js";
import { jobs, personas } from "../db/schema.js";
import { eq, and, desc, lt, isNull } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const jobsRoutes = new Hono();
const STALE_RUNNING_MS = 2 * 60 * 1000;
const TIMEOUT_MESSAGE = "Generation timed out before creating content. Try again with a faster model or shorter source.";

jobsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);

  await db
    .update(jobs)
    .set({
      status: "failed",
      currentStep: "timeout",
      errorMessage: TIMEOUT_MESSAGE,
      completedAt: new Date(),
    })
    .where(and(eq(jobs.userId, userId), eq(jobs.status, "running"), isNull(jobs.campaignId), lt(jobs.createdAt, staleBefore)));

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
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);

  await db
    .update(jobs)
    .set({
      status: "failed",
      currentStep: "timeout",
      errorMessage: TIMEOUT_MESSAGE,
      completedAt: new Date(),
    })
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId), eq(jobs.status, "running"), isNull(jobs.campaignId), lt(jobs.createdAt, staleBefore)));

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
    .set({ status: "failed", errorMessage: "Stopped by user", completedAt: new Date() })
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

  // Reset job to pending status
  const [updated] = await db
    .update(jobs)
    .set({
      status: "pending",
      currentStep: "queued",
      errorMessage: null,
      generationError: null,
      completedAt: null,
    })
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
  }).catch((err) => console.error("[retry] Generation error:", err));

  return c.json(updated);
});

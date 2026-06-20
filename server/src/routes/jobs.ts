import { Hono } from "hono";
import { db } from "../db/index.js";
import { jobs, personas } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const jobsRoutes = new Hono();

jobsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select({
      id: jobs.id,
      sourceType: jobs.sourceType,
      sourceValue: jobs.sourceValue,
      modelId: jobs.modelId,
      personaId: jobs.personaId,
      status: jobs.status,
      currentStep: jobs.currentStep,
      errorMessage: jobs.errorMessage,
      generationError: jobs.generationError,
      generationPlan: jobs.generationPlan,
      resultPostIds: jobs.resultPostIds,
      summaryResult: jobs.summaryResult,
      summaryCompletedAt: jobs.summaryCompletedAt,
      tokenCost: jobs.tokenCost,
      totalCost: jobs.totalCost,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
      personaName: personas.name,
    })
    .from(jobs)
    .leftJoin(personas, eq(jobs.personaId, personas.id))
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt));

  return c.json(rows);
});

jobsRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [job] = await db
    .select()
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

import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";

export const NO_DRAFT_TIMEOUT_MESSAGE =
  "Text model did not return before the job timed out. Try a faster model, fewer variations, or a shorter source.";
export const STALE_RUNNING_MS = 10 * 60 * 1000;

type FailedDraft = { index: number; error: string };

function partialTimeoutMessage(createdCount: number, totalDrafts: number) {
  return `Generation timed out after ${createdCount}/${totalDrafts} drafts were created. The remaining drafts did not finish; try a faster model or fewer variations.`;
}

export function staleTimeoutUpdateForJob(job: {
  generationPlan: unknown;
  resultPostIds: string[] | null;
  currentStep?: string | null;
}, completedAt = new Date()) {
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
      completedAt,
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
      completedAt,
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
    completedAt,
  };
}

export function reconciledJobForRead<T extends {
  sourceType: string;
  status: string;
  campaignId: string | null;
  generationPlan: unknown;
  resultPostIds: string[] | null;
  currentStep: string | null;
  errorMessage: string | null;
  generationError: string | null;
  createdAt: Date;
  completedAt: Date | null;
}>(job: T, now = new Date()) {
  if (job.sourceType === "seo_metadata") return job;
  const timedOut = job.status === "running"
    && job.createdAt.getTime() < now.getTime() - STALE_RUNNING_MS;
  const failedWithResults = job.status === "failed" && Boolean(job.resultPostIds?.length);
  if (job.campaignId || (!timedOut && !failedWithResults)) return job;
  const completedAt = job.completedAt
    || (timedOut ? new Date(job.createdAt.getTime() + STALE_RUNNING_MS) : job.createdAt);
  return { ...job, ...staleTimeoutUpdateForJob(job, completedAt) };
}

export async function markStaleRunningJobs(userId: string, jobId?: string) {
  const staleClauses = [
    eq(jobs.userId, userId),
    eq(jobs.status, "running"),
    ne(jobs.sourceType, "seo_metadata"),
    isNull(jobs.campaignId),
    lt(jobs.createdAt, new Date(Date.now() - STALE_RUNNING_MS)),
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

  const failedClauses = [
    eq(jobs.userId, userId),
    eq(jobs.status, "failed"),
    ne(jobs.sourceType, "seo_metadata"),
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
    [...staleJobs, ...failedJobs.filter((job) => job.resultPostIds?.length)]
      .map((job) => db
        .update(jobs)
        .set(staleTimeoutUpdateForJob(job) as any)
        .where(eq(jobs.id, job.id)))
  );
}

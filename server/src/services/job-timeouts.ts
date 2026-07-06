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

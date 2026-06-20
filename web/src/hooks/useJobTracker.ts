import { useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { GenerationStep, DraftProgress } from "@/components/content/GenerationProgress";
import { SourceType } from "@/components/content/GenerationProgress";

export interface TrackedJob {
  id: string;
  jobId: string | null;
  sourceType: SourceType;
  sourceLabel: string;
  variations: number;
  step: GenerationStep;
  error: string;
  draftProgress: DraftProgress | null;
  startedAt: Date;
}

const MAX_PARALLEL_JOBS = 3;

const parseDraftProgress = (step: string, plan: any, resultPostIds: string[]): DraftProgress | null => {
  const total = plan?.totalDrafts || plan?.items?.length || 0;
  if (total <= 1) return null;

  const match = step.match(/(?:generating_post|completed_post|generating_images|failed_post|retrying_draft)_(\d+)_of_(\d+)/);
  if (match) {
    const current = parseInt(match[1], 10);
    const completed = (resultPostIds || []).length;
    return { current, total: parseInt(match[2], 10), completed };
  }
  return { current: 1, total, completed: (resultPostIds || []).length };
};

export function useJobTracker(onJobComplete?: () => void) {
  const [activeJobs, setActiveJobs] = useState<TrackedJob[]>([]);
  const pollingRefs = useRef<Map<string, boolean>>(new Map());
  const pollJobRef = useRef<(trackId: string, jobId: string, totalVariations: number) => void>(() => {});

  const runningCount = activeJobs.filter(
    (j) => j.step !== "idle" && j.step !== "complete" && j.step !== "error"
  ).length;

  const canStartParallel = runningCount < MAX_PARALLEL_JOBS;

  const updateJob = useCallback((trackId: string, updates: Partial<TrackedJob>) => {
    setActiveJobs((prev) => {
      const existing = prev.find((j) => j.id === trackId);
      if (updates.jobId && existing && !existing.jobId && !pollingRefs.current.has(trackId)) {
        const variations = existing.variations;
        setTimeout(() => pollJobRef.current(trackId, updates.jobId!, variations), 0);
      }
      return prev.map((j) => (j.id === trackId ? { ...j, ...updates } : j));
    });
  }, []);

  const removeJob = useCallback((trackId: string) => {
    pollingRefs.current.delete(trackId);
    setActiveJobs((prev) => prev.filter((j) => j.id !== trackId));
  }, []);

  const pollJob = useCallback(
    async (trackId: string, jobId: string, totalVariations: number) => {
      pollingRefs.current.set(trackId, true);
      const maxPolls = 120;

      for (let i = 0; i < maxPolls; i++) {
        if (!pollingRefs.current.has(trackId)) return;
        await new Promise((r) => setTimeout(r, 5000));
        if (!pollingRefs.current.has(trackId)) return;

        try {
          const job = await api.get<any>(`/jobs/${jobId}`);
          if (!job) break;

          const step = job.current_step || "";
          const progress = parseDraftProgress(step, job.generation_plan, job.result_post_ids || []);

          let genStep: GenerationStep = "generating";
          if (step.startsWith("generating_images")) genStep = "images";
          else if (step.startsWith("generating_post") || step.startsWith("completed_post") || step.startsWith("retrying")) genStep = "generating";

          updateJob(trackId, { draftProgress: progress, step: genStep });

          if (job.status === "completed" || job.status === "failed") {
            const postIds = job.result_post_ids || [];
            if (postIds.length > 0) {
              updateJob(trackId, {
                step: "complete",
                draftProgress: { current: totalVariations, total: totalVariations, completed: postIds.length },
              });
            } else {
              updateJob(trackId, {
                step: "error",
                error: job.error_message || "No posts were generated",
              });
            }
            pollingRefs.current.delete(trackId);
            onJobComplete?.();
            setTimeout(() => removeJob(trackId), 8000);
            return;
          }
        } catch {
          break;
        }
      }

      updateJob(trackId, {
        step: "error",
        error: "Generation timed out. Check the Jobs page for status.",
      });
      pollingRefs.current.delete(trackId);
    },
    [updateJob, removeJob, onJobComplete]
  );

  pollJobRef.current = pollJob;

  const startJob = useCallback(
    (params: {
      jobId: string | null;
      sourceType: SourceType;
      sourceLabel: string;
      variations: number;
      immediateComplete?: boolean;
    }) => {
      const trackId = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const newJob: TrackedJob = {
        id: trackId,
        jobId: params.jobId,
        sourceType: params.sourceType,
        sourceLabel: params.sourceLabel,
        variations: params.variations,
        step: params.immediateComplete ? "complete" : "extracting",
        error: "",
        draftProgress: null,
        startedAt: new Date(),
      };

      setActiveJobs((prev) => [newJob, ...prev]);

      if (params.immediateComplete) {
        setTimeout(() => removeJob(trackId), 5000);
      } else if (params.jobId) {
        pollJob(trackId, params.jobId, params.variations);
      }

      return trackId;
    },
    [pollJob, removeJob]
  );

  const dismissJob = useCallback(
    (trackId: string) => {
      pollingRefs.current.delete(trackId);
      removeJob(trackId);
    },
    [removeJob]
  );

  return {
    activeJobs,
    runningCount,
    canStartParallel,
    maxParallel: MAX_PARALLEL_JOBS,
    startJob,
    dismissJob,
    updateJob,
  };
}

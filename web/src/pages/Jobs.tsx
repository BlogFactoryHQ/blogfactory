import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, RotateCcw, Rss, FileText, Youtube, Link as LinkIcon, Copy, CheckCircle, AlertCircle, X, Loader2, StopCircle, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DraftProgressList, type DraftProgressItem } from "@/components/content/DraftProgressList";

const sourceIcons: Record<string, typeof FileText> = {
  article_keyword: FileText,
  article_title: FileText,
  rss_feed: Rss,
  url: LinkIcon,
  pdf: FileText,
  raw_text: FileText,
  youtube: Youtube,
};

type StatusFilter = "all" | "pending" | "running" | "completed" | "failed";

interface Job {
  id: string;
  source_type: string;
  source_value: string;
  persona_id: string | null;
  model_id: string;
  status: string;
  current_step: string;
  error_message: string | null;
  generation_error: string | null;
  token_cost: number | null;
  total_cost: number | null;
  result_post_ids: string[] | null;
  created_at: string;
  completed_at: string | null;
  generation_plan: any;
  personas?: { name: string } | null;
  child_jobs?: Job[];
  is_batch?: boolean;
}

interface Post {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

interface SeoQaResult {
  postId: string;
  title: string;
  qa: {
    score: number;
    passed: number;
    total: number;
    articleType?: string;
    checks: Array<{ label: string; ok: boolean | null; detail: string }>;
  };
}

const normalizeJob = (job: any): Job => ({
  id: job.id,
  source_type: job.source_type ?? job.sourceType ?? "unknown",
  source_value: job.source_value ?? job.sourceValue ?? "",
  persona_id: job.persona_id ?? job.personaId ?? null,
  model_id: job.model_id ?? job.modelId ?? "",
  status: job.status,
  current_step: job.current_step ?? job.currentStep ?? "queued",
  error_message: job.error_message ?? job.errorMessage ?? null,
  generation_error: job.generation_error ?? job.generationError ?? null,
  token_cost: job.token_cost ?? job.tokenCost ?? null,
  total_cost: job.total_cost ?? job.totalCost ?? null,
  result_post_ids: job.result_post_ids ?? job.resultPostIds ?? null,
  created_at: job.created_at ?? job.createdAt,
  completed_at: job.completed_at ?? job.completedAt ?? null,
  generation_plan: job.generation_plan ?? job.generationPlan,
  personas: job.personas ?? (job.personaName ? { name: job.personaName } : null),
});

const failedDraftsFor = (job: Job): Array<{ index: number; error: string }> => {
  return Array.isArray(job.generation_plan?.failedDrafts) ? job.generation_plan.failedDrafts : [];
};

export const jobGroupKey = (job: Pick<Job, "generation_plan" | "source_type" | "source_value" | "persona_id" | "model_id" | "created_at">) => {
  if (job.generation_plan?.batchId) return `batch-${job.generation_plan.batchId}`;
  const total = Number(job.generation_plan?.variationCount || job.generation_plan?.totalDrafts || 0);
  if (total <= 1) return "";
  return [
    "split",
    job.source_type,
    job.source_value,
    job.persona_id || "",
    job.model_id || "",
    total,
    job.created_at.slice(0, 10),
  ].join("|");
};

const variationIndexFor = (job: Job, fallback: number) => Number(job.generation_plan?.variationIndex) || fallback;

const batchStatus = (jobs: Job[]) => {
  if (jobs.some((job) => job.status === "running")) return "running";
  if (jobs.some((job) => job.status === "pending")) return "pending";
  if (jobs.every((job) => job.status === "failed")) return "failed";
  return "completed";
};

const aggregateJobBatch = (jobs: Job[]): Job => {
  if (jobs.length === 1) return jobs[0];

  const sorted = [...jobs].sort((a, b) => variationIndexFor(a, 999) - variationIndexFor(b, 999));
  const first = sorted[0];
  const active = sorted.find((job) => job.status === "running" || job.status === "pending");
  const failedDrafts = new Map<number, { index: number; error: string }>();

  sorted.forEach((job, idx) => {
    const draftIndex = variationIndexFor(job, idx + 1) - 1;
    const existing = failedDraftsFor(job);
    if (existing.length) {
      existing.forEach((draft) => failedDrafts.set(draftIndex, { index: draftIndex, error: draft.error }));
    } else if (job.status === "failed") {
      failedDrafts.set(draftIndex, { index: draftIndex, error: job.error_message || job.generation_error || "Draft failed to finish." });
    }
  });

  const totalDrafts = Math.max(
    Number(first.generation_plan?.variationCount || first.generation_plan?.totalDrafts || 0),
    sorted.length
  );
  const activeIndex = active ? variationIndexFor(active, sorted.indexOf(active) + 1) : 0;
  const currentStep = active?.current_step && activeIndex
    ? active.current_step.replace(/_\d+_of_\d+$/, `_${activeIndex}_of_${totalDrafts}`)
    : first.current_step;
  const completedAt = sorted.every((job) => job.completed_at)
    ? sorted.map((job) => job.completed_at).filter(Boolean).sort().at(-1) || null
    : null;

  return {
    ...first,
    status: batchStatus(sorted),
    current_step: currentStep,
    token_cost: sorted.reduce((sum, job) => sum + (Number(job.token_cost) || 0), 0),
    total_cost: sorted.reduce((sum, job) => sum + (Number(job.total_cost) || 0), 0),
    result_post_ids: sorted.flatMap((job) => job.result_post_ids || []),
    completed_at: completedAt,
    generation_plan: {
      ...first.generation_plan,
      totalDrafts,
      variationCount: totalDrafts,
      failedDrafts: [...failedDrafts.values()].sort((a, b) => a.index - b.index),
      childJobIds: sorted.map((job) => job.id),
    },
    child_jobs: sorted,
    is_batch: true,
  };
};

export const aggregateJobRows = (jobs: Job[]) => {
  const groups = new Map<string, Job[]>();
  jobs.forEach((job) => {
    const key = jobGroupKey(job) || `job-${job.id}`;
    groups.set(key, [...(groups.get(key) || []), job]);
  });
  return [...groups.values()]
    .map(aggregateJobBatch)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

const activeJobIdsFor = (job: Job) => (job.child_jobs || [job])
  .filter((child) => child.status === "running" || child.status === "pending")
  .map((child) => child.id);

const failedJobIdsFor = (job: Job) => (job.child_jobs || [])
  .filter((child) => child.status === "failed")
  .map((child) => child.id);

const failedJobIdForDraft = (job: Job, draftIndex: number) => {
  return (job.child_jobs || []).find((child, idx) => variationIndexFor(child, idx + 1) - 1 === draftIndex && child.status === "failed")?.id;
};

const draftStatsFor = (job: Job) => {
  const created = job.result_post_ids?.length ?? 0;
  const failed = failedDraftsFor(job).length;
  const plannedTotal = Number(job.generation_plan?.totalDrafts);
  const total = Number.isFinite(plannedTotal) && plannedTotal > 0
    ? plannedTotal
    : Math.max(created + failed, created, 1);

  return { created, failed, total, partial: created > 0 && failed > 0 };
};

export const parseStepProgress = (step: string, resultPostIds: string[] | null, generationPlan?: any) => {
  const postsCompleted = resultPostIds?.length ?? 0;
  const failedDrafts: Array<{index: number, error: string}> = generationPlan?.failedDrafts || [];
  const failedIndices = new Set(failedDrafts.map(f => f.index));
  const normalizedStep = step || "pending";

  const totalMatch = normalizedStep.match(/_of_(\d+)$/);
  const total = totalMatch ? parseInt(totalMatch[1]) : (generationPlan?.totalDrafts || 0);
  const currentMatch = normalizedStep.match(/_(\d+)_of_/) || normalizedStep.match(/_draft_(\d+)$/);
  const current = currentMatch ? parseInt(currentMatch[1]) : 0;

  const phaseIndex = (() => {
    if (normalizedStep === "pending" || normalizedStep === "queued" || normalizedStep === "starting") return 0;
    if (normalizedStep === "fetching_content" || normalizedStep === "fetching_source") return 1;
    if (normalizedStep.startsWith("generating_draft")) return 2;
    if (normalizedStep.startsWith("repairing_length")) return 3;
    if (normalizedStep.startsWith("packaging_seo")) return 4;
    if (normalizedStep.startsWith("resolving_images")) return 5;
    if (normalizedStep === "done") return 6;
    return 2;
  })();
  const includeImages = generationPlan?.imagesEnabled !== false;
  const baseSteps: DraftProgressItem[] = [
    { label: "Fetch source content", done: phaseIndex > 1, active: phaseIndex === 1 },
    { label: "Write draft", done: phaseIndex > 2 || postsCompleted > 0, active: phaseIndex === 2 },
    ...(phaseIndex === 3 ? [{ label: "Repair short draft", done: false, active: true } as DraftProgressItem] : []),
    { label: "Package SEO fields", done: phaseIndex > 4 || postsCompleted > 0, active: phaseIndex === 4 },
    ...(includeImages ? [{ label: "Find stock/source images or queue AI images", done: phaseIndex > 5, active: phaseIndex === 5 } as DraftProgressItem] : []),
  ];

  if (normalizedStep === "pending" || normalizedStep === "queued" || normalizedStep === "starting") {
    return { label: "Initializing...", percent: 5, steps: baseSteps };
  }
  if (normalizedStep === "fetching_content" || normalizedStep === "fetching_source") {
    return { label: "Fetching source content", percent: 10, steps: baseSteps };
  }

  const steps: DraftProgressItem[] = [...baseSteps];
  const effectiveTotal = total || Math.max(postsCompleted + failedDrafts.length + 1, 1);

  for (let i = 0; i < effectiveTotal; i++) {
    const draftNum = i + 1;
    const failed = failedIndices.has(i);
    const failedInfo = failedDrafts.find(f => f.index === i);

    if (failed) {
      steps.push({ label: `Draft ${draftNum}`, done: false, active: false, failed: true, error: failedInfo?.error });
    } else if (i < postsCompleted + failedDrafts.filter(f => f.index < i).length) {
      const completedBefore = postsCompleted - failedDrafts.filter(f => f.index > i).length;
      if (completedBefore > 0 || i < postsCompleted) {
        steps.push({ label: `Draft ${draftNum}`, done: true, active: false });
      } else {
        steps.push({ label: `Draft ${draftNum}`, done: false, active: false });
      }
    } else if (draftNum === current) {
      const isImages = normalizedStep.startsWith("resolving_images");
      const isRepair = normalizedStep.startsWith("repairing_length");
      const isSeo = normalizedStep.startsWith("packaging_seo");
      const isGen = normalizedStep.startsWith("generating_draft") || normalizedStep.startsWith("generating_post");
      const isFailed = normalizedStep.startsWith("failed_post");
      steps.push({
        label: `Draft ${draftNum}${isImages ? " (images)" : isRepair ? " (length repair)" : isSeo ? " (SEO)" : isGen ? " (writing)" : isFailed ? " (failed)" : ""}`,
        done: false,
        active: !isFailed,
        failed: isFailed,
      });
    } else {
      steps.push({ label: `Draft ${draftNum}`, done: false, active: false });
    }
  }

  if (effectiveTotal > 0) {
    const perPost = 90 / effectiveTotal;
    let pct = 10;
    pct += (postsCompleted + failedDrafts.length) * perPost;
    if (normalizedStep.startsWith("generating_draft") || normalizedStep.startsWith("generating_post")) pct += perPost * 0.3;
    if (normalizedStep.startsWith("packaging_seo")) pct += perPost * 0.55;
    if (normalizedStep.startsWith("resolving_images")) pct += perPost * 0.75;
    const label = current ? `Draft ${current} of ${effectiveTotal}` : normalizedStep.replace(/_/g, " ");
    return { label, percent: Math.min(Math.round(pct), 99), steps };
  }

  return { label: normalizedStep.replace(/_/g, " "), percent: 50, steps };
};

export default function Jobs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const queryClient = useQueryClient();

  const stopJobMutation = useMutation({
    mutationFn: async (jobIds: string | string[]) => {
      await Promise.all((Array.isArray(jobIds) ? jobIds : [jobIds]).map((jobId) => api.put(`/jobs/${jobId}/stop`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job stopped successfully");
      setSelectedJob(null);
    },
    onError: (error) => {
      toast.error("Failed to stop job: " + error.message);
    },
  });

  const retryDraftsMutation = useMutation({
    mutationFn: async ({ jobId, indices, jobIds }: { jobId?: string; indices?: number[]; jobIds?: string[] }) => {
      if (jobIds?.length) {
        await Promise.all(jobIds.map((id) => api.post<any>(`/jobs/${id}/retry`, {})));
        return null;
      }
      const data = await api.post<any>(`/jobs/${jobId}/retry`, { retryIndices: indices || [] });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Retrying failed drafts...");
    },
    onError: (error) => {
      toast.error("Failed to retry: " + error.message);
    },
  });

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      return (await api.get<any[]>("/jobs")).map(normalizeJob);
    },
    // Always poll every 5s -- lightweight query, ensures we catch state changes
    refetchInterval: 5000,
  });

  // Fetch posts for selected job
  const { data: jobPosts = [] } = useQuery({
    queryKey: ["job-posts", selectedJob?.id],
    queryFn: async () => {
      if (!selectedJob?.result_post_ids?.length) return [];
      // Fetch each post by ID - the API should support this
      const postIds = selectedJob.result_post_ids.join(",");
      return api.get<Post[]>(`/posts?ids=${postIds}`);
    },
    enabled: !!selectedJob?.result_post_ids?.length,
  });

  const jobRows = useMemo(() => aggregateJobRows(jobs), [jobs]);

  useEffect(() => {
    if (!selectedJob) return;
    const selectedBatchId = selectedJob.generation_plan?.batchId;
    const updated = jobRows.find((job) => job.id === selectedJob.id || (selectedBatchId && job.generation_plan?.batchId === selectedBatchId));
    if (updated) setSelectedJob(updated);
  }, [jobRows, selectedJob]);

  const statusCounts = {
    all: jobRows.length,
    pending: jobRows.filter((j) => j.status === "pending").length,
    running: jobRows.filter((j) => j.status === "running").length,
    completed: jobRows.filter((j) => j.status === "completed").length,
    failed: jobRows.filter((j) => j.status === "failed").length,
  };

  const filteredJobs = jobRows.filter((job) => {
    const query = searchQuery.toLowerCase();
    const ids = [job.id, ...(job.child_jobs || []).map((child) => child.id)].join(" ").toLowerCase();
    const matchesSearch = ids.includes(query);
    const matchesFilter = filter === "all" || job.status === filter;
    return matchesSearch && matchesFilter;
  });

  const copyPrompt = () => {
    toast.success("Full prompt copied to clipboard.");
  };

  const getStatusBadgeType = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "running":
        return "running";
      case "pending":
        return "pending";
      case "failed":
        return "error";
      default:
        return "pending";
    }
  };

  const getJobStatusBadge = (job: Job) => {
    const stats = draftStatsFor(job);
    if (stats.partial) {
      return {
        status: "warning" as const,
        label: `${stats.created}/${stats.total} made · ${stats.failed} failed`,
      };
    }

    return { status: getStatusBadgeType(job.status) as any, label: undefined };
  };

  const formatModelName = (modelId: string) => {
    const modelMap: Record<string, string> = {
      "google/gemini-3-flash-preview": "Gemini 3 Flash",
      "google/gemini-2.5-pro": "Gemini 2.5 Pro",
      "google/gemini-2.5-flash": "Gemini 2.5 Flash",
      "openai/gpt-5": "GPT-5",
      "openai/gpt-5-mini": "GPT-5 Mini",
    };
    return modelMap[modelId] || modelId;
  };

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Job Queue"
        description={`Monitoring generation pipeline. ${statusCounts.running} active job${statusCounts.running !== 1 ? "s" : ""} running.`}
      />

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Job ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)} className="mb-6">
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            All Jobs
            <span className="text-xs opacity-70">{statusCounts.all}</span>
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            <span className="text-xs text-status-pending">{statusCounts.pending}</span>
          </TabsTrigger>
          <TabsTrigger value="running" className="gap-2">
            Running
            <span className="text-xs text-status-running">{statusCounts.running}</span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            Completed
            <span className="text-xs text-status-success">{statusCounts.completed}</span>
          </TabsTrigger>
          <TabsTrigger value="failed" className="gap-2">
            Failed
            <span className="text-xs text-status-error">{statusCounts.failed}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <div className="calm-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Job ID</TableHead>
              <TableHead>Source Type</TableHead>
              <TableHead>Persona</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No jobs found. Generate content to see jobs here.
                </TableCell>
              </TableRow>
            ) : (
              filteredJobs.map((job) => {
                const SourceIcon = sourceIcons[job.source_type] || FileText;
                const statusBadge = getJobStatusBadge(job);

                return (
                  <TableRow
                    key={job.id}
                    className={cn(
                      "table-row-calm cursor-pointer",
                      selectedJob?.id === job.id && "bg-muted/50"
                    )}
                    onClick={() => setSelectedJob(job)}
                  >
                    <TableCell className="font-mono text-sm">
                      #{job.id.slice(0, 8)}
                      {job.is_batch && (
                        <span className="ml-2 font-sans text-xs text-muted-foreground">
                          {draftStatsFor(job).created}/{draftStatsFor(job).total} drafts
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SourceIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize">{job.source_type.replace("_", " ")}</span>
                      </div>
                    </TableCell>
                    <TableCell>{job.personas?.name || "—"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                        {formatModelName(job.model_id)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={statusBadge.status} label={statusBadge.label} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Job Detail Sheet */}
      <Sheet open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <SheetContent className="w-[450px] sm:max-w-[450px] overflow-y-auto">
          {selectedJob && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="section-label mb-1">Selected Job</p>
                    <div className="flex items-center gap-3">
                      <SheetTitle className="font-mono">
                        #{selectedJob.id.slice(0, 8)}
                        {selectedJob.is_batch && (
                          <span className="ml-2 font-sans text-sm font-medium text-muted-foreground">
                            Batch
                          </span>
                        )}
                      </SheetTitle>
                      <StatusBadge
                        status={getJobStatusBadge(selectedJob).status}
                        label={getJobStatusBadge(selectedJob).label}
                      />
                    </div>
                  </div>
                  {selectedJob.status === "running" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => stopJobMutation.mutate(activeJobIdsFor(selectedJob))}
                      disabled={stopJobMutation.isPending}
                    >
                      {stopJobMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <StopCircle className="h-4 w-4 mr-1.5" />
                      )}
                      Stop
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setSelectedJob(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </SheetHeader>

              {/* Live Progress for running jobs */}
              {(selectedJob.status === "running" || selectedJob.status === "pending") && (() => {
                const progress = parseStepProgress(selectedJob.current_step, selectedJob.result_post_ids, selectedJob.generation_plan);
                return (
                  <div className="p-4 rounded-lg border border-status-running/30 bg-[hsl(var(--status-running)/0.05)] mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-[hsl(var(--status-running))]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="font-medium text-sm">In Progress</span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{progress.percent}%</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 rounded-full bg-muted mb-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-status-running transition-all duration-700 ease-in-out"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{progress.label}</p>
                    {/* Step list */}
                    {progress.steps.length > 0 && (
                      <DraftProgressList steps={progress.steps} className="mt-3" />
                    )}
                  </div>
                );
              })()}

              {/* Result or Error */}
              {(selectedJob.status === "completed" || draftStatsFor(selectedJob).partial) && (() => {
                const plan = selectedJob.generation_plan;
                const failedDrafts: Array<{index: number, error: string}> = plan?.failedDrafts || [];
                const seoQa: SeoQaResult[] = Array.isArray(plan?.seoQa) ? plan.seoQa : [];
                const draftStats = draftStatsFor(selectedJob);
                const isPartial = draftStats.partial;

                return (
                  <div className={cn(
                    "p-4 rounded-lg border mb-6",
                    isPartial
                      ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10"
                      : "border-status-success/30 bg-[hsl(var(--status-success)/0.05)]"
                  )}>
                    <div className={cn("flex items-center gap-2 mb-3", isPartial ? "text-amber-700 dark:text-amber-400" : "text-[hsl(158_64%_30%)]")}>
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium text-sm">
                        {isPartial ? `${draftStats.created}/${draftStats.total} drafts created · ${draftStats.failed} failed` : "Generation Successful"}
                      </span>
                    </div>
                    {jobPosts.map((post) => (
                      <div key={post.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border mb-1.5 last:mb-0">
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium truncate max-w-[250px]">{post.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {post.status} • {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {seoQa.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">SEO QA</p>
                        {seoQa.map((item) => {
                          const failedChecks = item.qa.checks.filter((qaCheck) => qaCheck.ok === false);
                          const skippedChecks = item.qa.checks.filter((qaCheck) => qaCheck.ok === null);
                          const passedChecks = item.qa.checks.filter((qaCheck) => qaCheck.ok === true);
                          const orderedChecks = [...failedChecks, ...skippedChecks, ...passedChecks];
                          return (
                          <div key={item.postId} className="rounded-lg border border-border bg-card p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{item.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {passedChecks.length}/{item.qa.total} passed
                                  {failedChecks.length ? ` • ${failedChecks.length} fix` : ""}
                                  {skippedChecks.length ? ` • ${skippedChecks.length} skipped` : ""}
                                </p>
                              </div>
                              <div className={cn(
                                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                item.qa.score >= 80 ? "bg-status-success/10 text-[hsl(158_64%_30%)]" : item.qa.score >= 60 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-status-error/10 text-status-error"
                              )}>
                                {item.qa.score}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {orderedChecks.map((qaCheck) => (
                                <div key={qaCheck.label} className="flex items-start gap-2 text-xs">
                                  {qaCheck.ok === null ? (
                                    <div className="mt-0.5 h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
                                  ) : qaCheck.ok ? (
                                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-status-success" />
                                  ) : (
                                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-status-error" />
                                  )}
                                  <span className="flex-1">
                                    {qaCheck.label}
                                    <span className="text-muted-foreground"> - {qaCheck.detail}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                    {failedDrafts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Failed drafts:</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => {
                              const jobIds = failedJobIdsFor(selectedJob);
                              retryDraftsMutation.mutate(jobIds.length ? { jobIds } : { jobId: selectedJob.id, indices: failedDrafts.map(fd => fd.index) });
                            }}
                            disabled={retryDraftsMutation.isPending}
                          >
                            {retryDraftsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Retry All Failed
                          </Button>
                        </div>
                        {failedDrafts.map((fd, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2">
                            <p className="text-xs text-status-error truncate flex-1">
                              Draft {fd.index + 1}: {fd.error}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 flex-shrink-0"
                              onClick={() => {
                                const jobId = failedJobIdForDraft(selectedJob, fd.index);
                                retryDraftsMutation.mutate(jobId ? { jobIds: [jobId] } : { jobId: selectedJob.id, indices: [fd.index] });
                              }}
                              disabled={retryDraftsMutation.isPending}
                              title={`Retry draft ${fd.index + 1}`}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {selectedJob.status === "failed" && !draftStatsFor(selectedJob).partial && (() => {
                const plan = selectedJob.generation_plan;
                const failedDrafts: Array<{index: number, error: string}> = plan?.failedDrafts || [];
                const hasRetryableItems = failedDrafts.length > 0;

                return (
                  <div className="p-4 rounded-lg border border-status-error/30 bg-[hsl(var(--status-error)/0.05)] mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-[hsl(0_72%_40%)]">
                        <AlertCircle className="h-4 w-4" />
                        <span className="font-medium text-sm">Generation Failed</span>
                      </div>
                      {hasRetryableItems && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => {
                            const jobIds = failedJobIdsFor(selectedJob);
                            retryDraftsMutation.mutate(jobIds.length ? { jobIds } : { jobId: selectedJob.id, indices: failedDrafts.map(fd => fd.index) });
                          }}
                          disabled={retryDraftsMutation.isPending}
                        >
                          {retryDraftsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Retry Failed
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedJob.error_message || "Unknown error occurred"}
                    </p>
                    {failedDrafts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        {failedDrafts.map((fd, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2">
                            <p className="text-xs text-status-error truncate flex-1">
                              Draft {fd.index + 1}: {fd.error}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 flex-shrink-0"
                              onClick={() => {
                                const jobId = failedJobIdForDraft(selectedJob, fd.index);
                                retryDraftsMutation.mutate(jobId ? { jobIds: [jobId] } : { jobId: selectedJob.id, indices: [fd.index] });
                              }}
                              disabled={retryDraftsMutation.isPending}
                              title={`Retry draft ${fd.index + 1}`}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Input Configuration */}
              <div className="space-y-4 mb-6">
                <p className="section-label">Input Configuration</p>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Source</span>
                    <span className="font-medium capitalize">
                      {selectedJob.source_type.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Persona</span>
                    <span className="font-medium">
                      {selectedJob.personas?.name || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Model</span>
                    <span className="font-medium">
                      {formatModelName(selectedJob.model_id)}
                    </span>
                  </div>
                  {selectedJob.token_cost !== null && selectedJob.token_cost > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Token Cost</span>
                        <p className="font-medium">
                          {(selectedJob.token_cost / 1000).toFixed(1)}k tokens
                        </p>
                      </div>
                      {selectedJob.total_cost != null && selectedJob.total_cost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Cost</span>
                          <p className="font-medium">
                            {selectedJob.total_cost < 0.01 ? "<$0.01" : `$${Number(selectedJob.total_cost).toFixed(4)}`}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Job Timeline */}
              <div className="space-y-4 mb-6">
                <p className="section-label">Job Timeline</p>
                <div className="space-y-4">
                  {selectedJob.completed_at && (
                    <div className="flex gap-3">
                      <div className={cn(
                        "h-2 w-2 rounded-full mt-1.5",
                        selectedJob.status === "completed" ? "bg-status-success" : "bg-status-error"
                      )} />
                      <div>
                        <p className="text-sm font-medium">
                          {selectedJob.status === "completed" ? "Completed" : "Failed"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(selectedJob.completed_at), "h:mm:ss a")}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30 mt-1.5" />
                    <div>
                      <p className="text-sm font-medium">Job Created</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(selectedJob.created_at), "h:mm:ss a")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="section-label">Source Content</p>
                  <Button variant="ghost" size="sm" onClick={copyPrompt}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy
                  </Button>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <p className="text-sm font-mono text-muted-foreground leading-relaxed line-clamp-4">
                    {selectedJob.source_value}
                  </p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

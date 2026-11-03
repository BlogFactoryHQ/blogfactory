import { formatSourceType } from "@/lib/source-labels";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/search-insights";
import { safeFormatDate } from "@/lib/date-format";
import type { Job } from "@/pages/Jobs";

const MAX_ROWS = 12;
const BUCKETS = 16;

type RunSpan = {
  job: Job;
  start: number;
  end: number;
  duration: number;
  open: boolean;
};

function statusTone(status: string) {
  if (status === "failed") return { bar: "bg-status-error", text: "text-status-error" };
  if (status === "running") return { bar: "bg-status-running", text: "text-status-running" };
  if (status === "pending") return { bar: "bg-byword-border", text: "text-muted-foreground" };
  return { bar: "bg-status-success", text: "text-status-success" };
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

/**
 * Runs are placed on one shared clock using the start and completion timestamps the jobs API
 * already returns. Nothing here claims per-step timing, which the API does not expose.
 */
export function RunWaterfall({
  jobs,
  selectedJobId,
  onSelect,
}: {
  jobs: Job[];
  selectedJobId?: string | null;
  onSelect: (job: Job) => void;
}) {
  // Reading the clock during render would rebuild the memo every pass and freeze in-flight bars
  // at their first paint. A slow tick keeps them growing without churning the whole card.
  const [now, setNow] = useState(() => Date.now());
  const hasOpenRun = jobs.some((job) => !job.completed_at);

  useEffect(() => {
    if (!hasOpenRun) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [hasOpenRun]);

  const spans = useMemo<RunSpan[]>(() => {
    return jobs
      .map((job) => {
        const start = new Date(job.created_at).getTime();
        if (!Number.isFinite(start)) return null;
        const completed = job.completed_at ? new Date(job.completed_at).getTime() : null;
        const open = completed === null || !Number.isFinite(completed);
        const end = open ? now : (completed as number);
        return { job, start, end: Math.max(end, start), duration: Math.max(end - start, 0), open };
      })
      .filter((span): span is RunSpan => span !== null)
      .sort((a, b) => b.start - a.start)
      .slice(0, MAX_ROWS);
  }, [jobs, now]);

  const window = useMemo(() => {
    if (!spans.length) return null;
    const from = Math.min(...spans.map((span) => span.start));
    const to = Math.max(...spans.map((span) => span.end));
    return { from, to, span: Math.max(to - from, 1) };
  }, [spans]);

  const stats = useMemo(() => {
    const durations = spans.filter((span) => !span.open && span.duration > 0).map((span) => span.duration).sort((a, b) => a - b);
    return {
      durations,
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: durations[durations.length - 1] || 0,
    };
  }, [spans]);

  const histogram = useMemo(() => {
    if (!stats.durations.length) return [];
    const max = stats.max || 1;
    const bins = new Array(BUCKETS).fill(0);
    for (const duration of stats.durations) {
      const index = Math.min(BUCKETS - 1, Math.floor((duration / max) * BUCKETS));
      bins[index] += 1;
    }
    const peak = Math.max(...bins, 1);
    return bins.map((count) => ({ count, height: count / peak }));
  }, [stats]);

  if (!window || !spans.length) return null;

  const selected = spans.find((span) => span.job.id === selectedJobId);
  const selectedBucket = selected && !selected.open && stats.max
    ? Math.min(BUCKETS - 1, Math.floor((selected.duration / stats.max) * BUCKETS))
    : null;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="type-meta">
          {safeFormatDate(new Date(window.from).toISOString(), "MMM d HH:mm")} → {safeFormatDate(new Date(window.to).toISOString(), "MMM d HH:mm")}
        </span>
        <span className="type-meta">{formatDuration(window.span)} window · {spans.length} runs</span>
      </div>

      <div className="space-y-px">
        {spans.map((span) => {
          const tone = statusTone(span.job.status);
          const left = ((span.start - window.from) / window.span) * 100;
          const width = Math.max((span.duration / window.span) * 100, 0.75);
          const isSelected = span.job.id === selectedJobId;
          return (
            <button
              key={span.job.id}
              type="button"
              onClick={() => onSelect(span.job)}
              aria-pressed={isSelected}
              title={`${formatSourceType(span.job.source_type)} · started ${safeFormatDate(span.job.created_at, "MMM d HH:mm")} · ${span.open ? "still running" : formatDuration(span.duration)}`}
              className={cn(
                "grid w-full grid-cols-[minmax(4.5rem,6rem)_minmax(0,1fr)_3rem] items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-calm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 sm:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_4rem] sm:gap-3",
                isSelected && "bg-byword-blue-soft",
              )}
            >
              <span className="truncate font-mono text-[11px] text-foreground">
                {formatSourceType(span.job.source_type)}
                <span className="ml-1.5 hidden text-muted-foreground sm:inline">{safeFormatDate(span.job.created_at, "HH:mm")}</span>
              </span>
              <span className="relative h-3 rounded-sm bg-muted/60">
                <span
                  className={cn(
                    "absolute inset-y-0 rounded-sm",
                    tone.bar,
                    span.open && "animate-pulse-gentle",
                  )}
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                />
              </span>
              <span className={cn("text-right font-mono text-[11px] tabular-nums", tone.text)}>
                {span.open ? "running" : formatDuration(span.duration)}
              </span>
            </button>
          );
        })}
      </div>

      {stats.durations.length > 1 && (
        <div className="border-t border-byword-border pt-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="section-label">Duration spread · completed runs in view</span>
            <span className="type-meta shrink-0">
              p50 {formatDuration(stats.p50)} · p95 {formatDuration(stats.p95)}
            </span>
          </div>
          <div className="mt-3 flex h-14 items-end gap-0.5">
            {histogram.map((bin, index) => (
              <span
                key={index}
                className={cn(
                  "flex-1 rounded-t-[2px] transition-calm",
                  index === selectedBucket ? "bg-byword-blue" : bin.count ? "bg-byword-blue/45" : "bg-byword-border/50",
                )}
                style={{ height: `${Math.max(bin.height * 100, bin.count ? 12 : 4)}%` }}
                title={`${bin.count} run${bin.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="type-meta">0</span>
            {selected && !selected.open && (
              <span className="font-mono text-[11px] font-semibold text-byword-blue">
                this run {formatDuration(selected.duration)}
              </span>
            )}
            <span className="type-meta">{formatDuration(stats.max)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { safeFormatDistanceToNow } from "@/lib/date-format";
import { ListSkeleton } from "@/components/patterns/PageSkeleton";
import { EmptyState } from "@/components/patterns/EmptyState";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";

export type FeedSyncState = "running" | "paused" | "never" | "overdue" | "synced";

export type FeedSyncHealth = {
  feed_id: string;
  name: string;
  platform: string;
  state: FeedSyncState;
  frequency: string;
  interval_ms: number;
  effective_interval_ms: number;
  last_run_at: string | null;
  next_due_at: string | null;
  window_progress: number | null;
  total_articles: number;
  runs_7d: number;
  failures_7d: number;
  last_error: string | null;
};

export type FeedHealthResponse = {
  summary: {
    total: number;
    on_schedule: number;
    overdue: number;
    paused: number;
    never: number;
    running: number;
    tick_ms: number;
  };
  feeds: FeedSyncHealth[];
};

const HOUR = 60 * 60 * 1000;

const STATE_STYLE: Record<FeedSyncState, { ring: string; status: StatusType }> = {
  synced: { ring: "hsl(var(--accent))", status: "success" },
  running: { ring: "hsl(var(--status-running))", status: "running" },
  overdue: { ring: "hsl(var(--status-error))", status: "error" },
  paused: { ring: "hsl(var(--byword-border))", status: "paused" },
  never: { ring: "hsl(var(--byword-border))", status: "warning" },
};

function stateLabel(entry: FeedSyncHealth) {
  const since = entry.last_run_at ? safeFormatDistanceToNow(entry.last_run_at) : null;
  switch (entry.state) {
    case "running": return "Running";
    case "paused": return since ? `Paused · ${since}` : "Paused";
    case "never": return "Never run";
    case "overdue": return since ? `Overdue · ${since}` : "Overdue";
    default: return since ? `Synced · ${since}` : "Synced";
  }
}

function tickLabel(ms: number) {
  const hours = ms / HOUR;
  return Number.isInteger(hours) ? `${hours} h` : `${Math.round(ms / 60_000)} min`;
}

/**
 * One row per source with how far it is into its schedule window, rendered as a ring. The ring
 * fills against the interval the scheduler can actually deliver, so a feed labelled "hourly" on
 * a 6 h scheduler is not shown as permanently late.
 */
export function SourceSyncHealth() {
  const { data, isLoading, error } = useQuery({
    // Under the ["feeds"] prefix so pausing, running or deleting a source refreshes this too.
    queryKey: ["feeds", "health"],
    queryFn: () => api.get<FeedHealthResponse>("/feeds/health"),
    refetchInterval: 60_000,
  });

  if (isLoading) return <ListSkeleton rows={4} className="p-4 sm:p-5" />;
  if (error || !data) {
    return (
      <EmptyState
        size="panel"
        tone="error"
        title="Source health could not be loaded"
        description={error instanceof Error ? error.message : "Try again in a moment."}
      />
    );
  }
  if (!data.feeds.length) {
    return (
      <EmptyState
        size="panel"
        tone="empty"
        title="No sources yet"
        description="Add an RSS feed or campaign and its sync schedule will show up here."
      />
    );
  }

  const { summary } = data;
  const throttled = data.feeds.filter((entry) => entry.interval_ms < entry.effective_interval_ms && entry.state !== "paused");
  const segments = [
    { key: "on_schedule", count: summary.on_schedule, bar: "bg-accent", label: "on schedule" },
    { key: "overdue", count: summary.overdue, bar: "bg-status-error", label: "overdue" },
    { key: "never", count: summary.never, bar: "bg-status-warning", label: "never run" },
    { key: "paused", count: summary.paused, bar: "bg-byword-border", label: "paused" },
  ].filter((segment) => segment.count > 0);

  return (
    <div>
      <ul className="divide-y divide-byword-border">
        {data.feeds.map((entry) => (
          <li key={entry.feed_id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
              {/* On a phone the pill column is dropped, so the state rides under the name instead. */}
              <p className={cn("mt-0.5 font-mono text-[11px] sm:hidden", entry.state === "overdue" ? "text-status-error" : "text-muted-foreground")}>
                {stateLabel(entry)}
              </p>
              <p className="type-meta mt-0.5">
                {entry.platform} · {entry.total_articles.toLocaleString()} articles · {entry.frequency.replace(/_/g, " ")}
                {entry.failures_7d > 0 && (
                  <span className="text-status-error" title={entry.last_error || undefined}>
                    {" · "}{entry.failures_7d} failed this week
                  </span>
                )}
              </p>
            </div>
            <FreshnessRing entry={entry} />
            <span
              className="hidden w-44 shrink-0 justify-end sm:flex"
              title={entry.next_due_at ? `Next due ${new Date(entry.next_due_at).toLocaleString()}` : undefined}
            >
              <StatusBadge status={STATE_STYLE[entry.state].status} label={stateLabel(entry)} showIcon={false} className="max-w-full truncate" />
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-byword-border px-4 py-3 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="section-label">Sources on schedule</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {summary.on_schedule} of {summary.total}
          </span>
        </div>
        <div
          className="flex h-2 w-full gap-px overflow-hidden rounded-sm bg-muted"
          role="img"
          aria-label={segments.map((segment) => `${segment.count} ${segment.label}`).join(", ")}
        >
          {segments.map((segment) => (
            <span key={segment.key} className={cn("h-full", segment.bar)} style={{ width: `${(segment.count / summary.total) * 100}%` }} />
          ))}
        </div>
        {throttled.length > 0 && (
          <p className="type-meta">
            The scheduler wakes every {tickLabel(summary.tick_ms)}, so {throttled.length === 1 ? "one source set" : `${throttled.length} sources set`} to run more often
            {" "}actually run{throttled.length === 1 ? "s" : ""} once per {tickLabel(summary.tick_ms)}.
          </p>
        )}
      </div>
    </div>
  );
}

function FreshnessRing({ entry }: { entry: FeedSyncHealth }) {
  const size = 28;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = entry.state === "never" ? 0 : Math.min(entry.window_progress ?? 0, 1);
  const color = STATE_STYLE[entry.state].ring;
  const label = entry.state === "paused"
    ? "Paused"
    : entry.state === "never"
      ? "Has never run"
      : `${Math.round((entry.window_progress ?? 0) * 100)}% of its schedule window elapsed`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={label}>
      <title>{`${stateLabel(entry)} — ${label}`}</title>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
      {entry.state === "running" ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.3} ${circumference}`}
          className="origin-center animate-spin motion-reduce:animate-none"
          style={{ animationDuration: "1.6s" }}
        />
      ) : (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

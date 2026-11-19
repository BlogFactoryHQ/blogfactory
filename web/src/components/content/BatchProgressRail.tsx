import { RotateCcw, Square, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BatchItemStatus = "ready" | "importing" | "publishing" | "done" | "failed";

type StateSpec = {
  status: BatchItemStatus;
  label: string;
  bar: string;
  chip: string;
};

/** Order matters: the bar is stacked in this order so finished work reads left to right. */
const STATES: StateSpec[] = [
  { status: "done", label: "done", bar: "bg-status-success", chip: "border-status-success/30 bg-status-success/10 text-status-success" },
  { status: "failed", label: "failed", bar: "bg-status-error", chip: "border-status-error/30 bg-status-error/10 text-status-error" },
  { status: "importing", label: "importing", bar: "bg-status-running", chip: "border-status-running/30 bg-status-running/10 text-status-running" },
  { status: "publishing", label: "publishing", bar: "bg-status-running", chip: "border-status-running/30 bg-status-running/10 text-status-running" },
  { status: "ready", label: "queued", bar: "bg-byword-border", chip: "border-byword-border bg-muted text-muted-foreground" },
];

/**
 * Turns a batch into one readable line: how far it got, what broke, and the two actions that
 * matter next. "Retry failed" re-runs only the failed items so a single bad archive entry does
 * not mean re-uploading everything that already succeeded.
 */
export function BatchProgressRail({
  items,
  isRunning,
  onRun,
  onRetryFailed,
  onStop,
}: {
  items: Array<{ id: string; status: BatchItemStatus }>;
  isRunning: boolean;
  onRun: () => void;
  onRetryFailed: () => void;
  onStop: () => void;
}) {
  const total = items.length;
  if (!total) return null;

  const counts = STATES.map((state) => ({
    ...state,
    count: items.filter((item) => item.status === state.status).length,
  })).filter((state) => state.count > 0);

  const failed = items.filter((item) => item.status === "failed").length;
  const done = items.filter((item) => item.status === "done").length;
  const settled = done + failed;

  return (
    <div className="space-y-3 rounded-sm border border-byword-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="type-meta">
          {total} item{total === 1 ? "" : "s"} · {counts.length} state{counts.length === 1 ? "" : "s"}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{settled}</span> of {total} settled
        </span>
      </div>

      <div
        className="flex h-2 w-full overflow-hidden rounded-sm bg-muted"
        role="img"
        aria-label={`${done} done, ${failed} failed, ${total - settled} still queued out of ${total}`}
      >
        {counts.map((state) => (
          <span
            key={state.status}
            className={cn("h-full transition-calm", state.bar)}
            style={{ width: `${(state.count / total) * 100}%` }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {counts.map((state) => (
            <span
              key={state.status}
              className={cn("inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px]", state.chip)}
            >
              {state.label}
              <span className="font-semibold tabular-nums">{state.count}</span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {failed > 0 && (
            <Button type="button" variant="outline" size="sm" disabled={isRunning} onClick={onRetryFailed}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Retry failed {failed}
            </Button>
          )}
          {isRunning ? (
            <Button type="button" variant="destructive" size="sm" onClick={onStop}>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Stop batch
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={onRun}>
              <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
              {settled > 0 ? "Run remaining" : "Run batch"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

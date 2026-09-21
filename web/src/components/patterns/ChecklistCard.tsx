import { Check, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ChecklistItem = {
  id: string;
  label: string;
  description?: string;
  done: boolean;
  /** Renders as an attention state rather than a plain to-do. */
  attention?: boolean;
  onSelect: () => void;
};

export interface ChecklistCardProps {
  title: string;
  items: ChecklistItem[];
  percent: number;
  /** Compact ring-only rendering, for a collapsed sidebar. */
  compact?: boolean;
  onDismiss?: () => void;
  onCompactClick?: () => void;
  className?: string;
}

function ProgressRing({ percent, className }: { percent: number; className?: string }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100);
  return (
    <svg viewBox="0 0 24 24" className={cn("h-6 w-6 -rotate-90", className)} aria-hidden="true">
      <circle cx="12" cy="12" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

/**
 * Persistent setup progress. The checklist is the *seeing* surface: each row
 * hands off to the existing setup flow rather than duplicating it.
 */
export function ChecklistCard({
  title,
  items,
  percent,
  compact,
  onDismiss,
  onCompactClick,
  className,
}: ChecklistCardProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onCompactClick}
        aria-label={`${title}, ${percent}% complete`}
        title={`${title} · ${percent}%`}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-sm border border-sidebar-border bg-card text-sidebar-muted transition-calm hover:border-byword-blue/60 hover:bg-byword-blue-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
          className,
        )}
      >
        <ProgressRing percent={percent} className="h-5 w-5" />
      </button>
    );
  }

  return (
    <section className={cn("rounded-sm border border-sidebar-border bg-card", className)} aria-label={title}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <ProgressRing percent={percent} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold leading-tight text-foreground">{title}</p>
          <p className="text-[10px] leading-tight text-sidebar-muted">{percent}% complete</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss ${title}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-sidebar-muted transition-calm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <ul className="border-t border-sidebar-border p-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={item.onSelect}
              className="group flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left transition-calm hover:bg-byword-blue-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
                  item.done
                    ? "border-status-success bg-status-success text-status-success-foreground"
                    : item.attention
                      ? "border-status-warning bg-status-warning/15 text-status-warning"
                      : "border-border bg-card",
                )}
                aria-hidden="true"
              >
                {item.done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : item.attention ? "!" : ""}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[12px] leading-tight",
                  item.done ? "text-sidebar-muted line-through" : "text-sidebar-foreground",
                )}
              >
                {item.label}
              </span>
              {!item.done && (
                <ChevronRight className="h-3 w-3 shrink-0 text-sidebar-muted transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

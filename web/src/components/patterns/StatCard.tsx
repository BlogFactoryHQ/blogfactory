import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { type LucideIcon } from "lucide-react";

import { BywordCard } from "@/components/layout/BywordSurface";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "success" | "warning" | "error" | "running";

const toneDot: Record<StatTone, string> = {
  neutral: "bg-status-pending",
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
  running: "bg-status-running",
};

const toneBorder: Record<StatTone, string> = {
  neutral: "",
  success: "border-status-success/35",
  warning: "border-status-warning/35",
  error: "border-status-error/35",
  running: "border-status-running/35",
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  href?: string;
  className?: string;
}

/**
 * One metric tile. Tone drives the status dot and border only — never a filled
 * background, so a row of tiles stays readable.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = "neutral", href, className }: StatCardProps) {
  const body = (
    <BywordCard
      className={cn(
        "h-full transition-calm",
        toneBorder[tone],
        href && "group-hover:-translate-y-0.5 group-hover:border-byword-blue/50",
        className,
      )}
    >
      <div className="flex items-end justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="type-kicker flex items-center gap-2">
            {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />}
            {label}
          </p>
          <p className="mt-2 truncate text-3xl font-semibold tabular-nums text-foreground">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn("mb-1 h-2 w-2 shrink-0 rounded-full", toneDot[tone])} aria-hidden="true" />
      </div>
    </BywordCard>
  );

  if (!href) return body;

  return (
    <Link
      to={href}
      className="group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {body}
    </Link>
  );
}

/**
 * A horizontal strip of small key/value facts, used at the top of control pages
 * (active site, ready connections, last delivery, …).
 */
export function StatStrip({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <div className={cn("grid overflow-hidden rounded-md border border-border bg-card md:grid-cols-3", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
        >
          <p className="type-kicker">{item.label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

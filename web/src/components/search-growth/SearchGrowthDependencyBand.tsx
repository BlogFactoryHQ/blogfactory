import { type ReactNode } from "react";
import { Target } from "lucide-react";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";

export type DependencyState = "ready" | "warning" | "blocked" | "idle";

export interface SearchGrowthDependency {
  label: string;
  value: string;
  detail: string;
  state: DependencyState;
  action?: ReactNode;
}

const stateBadge: Record<DependencyState, { status: StatusType; label: string }> = {
  ready: { status: "success", label: "Ready" },
  warning: { status: "warning", label: "Attention" },
  blocked: { status: "error", label: "Blocked" },
  idle: { status: "pending", label: "Not set up" },
};

export function SearchGrowthDependencyBand({
  title = "Search growth dependencies",
  description = "The optimization cockpit needs data, submission, and internal-link support to close the loop.",
  items,
}: {
  title?: string;
  description?: string;
  items: SearchGrowthDependency[];
}) {
  return (
    <BywordCard>
      <SectionHeader icon={Target} title={title} description={description} />
      <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-3 lg:p-6">
        {items.map((item) => {
          const badge = stateBadge[item.state];
          return (
            <div key={item.label} className="rounded-sm border border-border bg-muted/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-kicker">{item.label}</p>
                  <p className="mt-2 truncate font-semibold text-foreground">{item.value}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p>
                </div>
                <StatusBadge status={badge.status} label={badge.label} className="shrink-0" />
              </div>
              {item.action && <div className="mt-4">{item.action}</div>}
            </div>
          );
        })}
      </div>
    </BywordCard>
  );
}

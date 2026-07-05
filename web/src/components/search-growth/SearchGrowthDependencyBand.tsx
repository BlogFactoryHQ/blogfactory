import { type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Target } from "lucide-react";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DependencyState = "ready" | "warning" | "blocked" | "idle";

export interface SearchGrowthDependency {
  label: string;
  value: string;
  detail: string;
  state: DependencyState;
  action?: ReactNode;
}

const stateTone: Record<DependencyState, string> = {
  ready: "border-[hsl(var(--status-success)/0.3)] bg-[hsl(var(--status-success)/0.08)]",
  warning: "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.08)]",
  blocked: "border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.08)]",
  idle: "border-byword-border bg-muted/20",
};

const stateIcon = {
  ready: CheckCircle2,
  warning: AlertTriangle,
  blocked: AlertTriangle,
  idle: Clock,
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
          const Icon = stateIcon[item.state];
          return (
            <div key={item.label} className={cn("rounded-md border p-4", stateTone[item.state])}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <p className="font-mono text-[11px] font-bold uppercase text-foreground">{item.label}</p>
                  </div>
                  <p className="mt-2 truncate font-semibold text-foreground">{item.value}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p>
                </div>
                <Badge variant={item.state === "blocked" ? "destructive" : "secondary"}>{item.state}</Badge>
              </div>
              {item.action && <div className="mt-4">{item.action}</div>}
            </div>
          );
        })}
      </div>
    </BywordCard>
  );
}

import { useState } from "react";
import { ArrowRight, ListChecks, Server, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ListSkeleton } from "@/components/patterns/PageSkeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";
import { useCapabilityMap } from "@/hooks/useCapabilityMap";
import { REQUIREMENTS, type CapabilityResult, type CapabilityStatus } from "@/lib/capabilities";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { cn } from "@/lib/utils";

const STATUS: Record<CapabilityStatus, { status: StatusType; label: string }> = {
  ready: { status: "success", label: "Ready" },
  limited: { status: "warning", label: "Works, less rich" },
  blocked: { status: "pending", label: "Needs setup" },
};

const ORDER: Record<CapabilityStatus, number> = { blocked: 0, limited: 1, ready: 2 };

function Requirement({ id, optional }: { id: keyof typeof REQUIREMENTS; optional?: boolean }) {
  const info = REQUIREMENTS[id];
  const Icon = info.owner === "server" ? Server : UserRound;
  return <div className="flex items-start gap-3 text-xs leading-5 text-muted-foreground">
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    <div className="min-w-0 flex-1">
      <p><strong className="font-semibold text-foreground">{info.label}</strong>{optional ? " · optional upgrade" : " · required"}</p>
      <p>{info.how}</p>
    </div>
    {info.action && <Button asChild variant="outline" size="sm" className="shrink-0"><Link to={info.action.href}>{info.action.label}</Link></Button>}
  </div>;
}

function Row({ result }: { result: CapabilityResult }) {
  const { def, status, missing, upgrades } = result;
  const badge = STATUS[status];
  const needsDetail = status !== "ready";
  return <li className="space-y-3 p-4 sm:px-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{def.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{def.outcome}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={badge.status} label={badge.label} />
        {status !== "blocked" && <Button asChild variant="ghost" size="sm"><Link to={def.href}>Open<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
      </div>
    </div>
    {needsDetail && <div className={cn("space-y-3 rounded-md border border-byword-border bg-muted/25 p-3")}>
      {missing.map((id) => <Requirement key={id} id={id} />)}
      {upgrades.map((id) => <Requirement key={id} id={id} optional />)}
      {def.fallback && status === "blocked" && <p className="text-xs leading-5 text-muted-foreground">Meanwhile: {def.fallback}</p>}
      {def.fallback && status === "limited" && <p className="text-xs leading-5 text-muted-foreground">{def.fallback}</p>}
    </div>}
  </li>;
}

/** Every feature, whether it can run now, and exactly what to add when it cannot. */
export function CapabilityMap({ digest, collapsedCount }: { digest: WorkspaceDigest; collapsedCount?: number }) {
  const [expanded, setExpanded] = useState(false);
  const { results, summary, next, isLoading, error, refetch } = useCapabilityMap(digest);
  const sorted = [...results].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const collapsible = Boolean(collapsedCount && sorted.length > collapsedCount);
  const shown = collapsible && !expanded ? sorted.slice(0, collapsedCount) : sorted;
  const nextInfo = next ? REQUIREMENTS[next.id] : null;
  return <BywordCard>
    <SectionHeader
      icon={ListChecks}
      title="What works right now"
      description={results.length ? `${summary.ready} ready · ${summary.limited} less rich · ${summary.blocked} need setup. ${nextInfo && next ? `Adding the ${nextInfo.label.toLowerCase()} unlocks ${next.unlocks} more.` : ""}` : "Each feature, and what it needs."}
      action={nextInfo?.action ? <Button asChild size="sm"><Link to={nextInfo.action.href}>{nextInfo.action.label}<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button> : undefined}
    />
    {isLoading && <ListSkeleton rows={4} />}
    {error && <EmptyState size="panel" tone="error" title="Could not load what works right now" description="Nothing was lost. Try again." primaryAction={{ label: "Try again", onClick: () => refetch() }} />}
    {!isLoading && !error && <ul className="divide-y divide-byword-border">{shown.map((result) => <Row key={result.def.id} result={result} />)}</ul>}
    {collapsible && !isLoading && !error && <div className="border-t border-byword-border p-3 text-center"><Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "Show fewer" : `Show all ${sorted.length}`}</Button></div>}
  </BywordCard>;
}

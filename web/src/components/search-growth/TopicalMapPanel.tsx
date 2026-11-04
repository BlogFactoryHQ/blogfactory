import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, GitBranch } from "lucide-react";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ListSkeleton } from "@/components/patterns/PageSkeleton";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

interface MapItem { id: string; keyword: string; stage: string; plannedFor: string | null; postId: string | null }
interface TopicalMap { clusters: Array<{ label: string; pillar: MapItem; spokes: MapItem[] }>; total: number }

const stageBadge: Record<string, { status: StatusType; label: string }> = {
  planned: { status: "pending", label: "Planned" },
  drafting: { status: "running", label: "Drafting" },
  review: { status: "warning", label: "Review" },
  delivered: { status: "success", label: "Delivered" },
  blocked: { status: "error", label: "Blocked" },
  measuring: { status: "active", label: "Measuring" },
};

export function TopicalMapPanel({ onOpenTopics }: { onOpenTopics?: () => void }) {
  const { activeSiteId } = useSites();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["topical-map", activeSiteId],
    queryFn: () => api.get<TopicalMap>(`/product-seo/topical-map?siteId=${encodeURIComponent(activeSiteId || "")}`),
    enabled: Boolean(activeSiteId),
  });
  if (!activeSiteId) return null;

  const row = (item: MapItem, role: "Pillar" | "Spoke") => {
    const params = new URLSearchParams({ siteId: activeSiteId, seoPlanItemId: item.id, seoAction: "new_content", targetQuery: item.keyword });
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className={role === "Pillar" ? "type-object-title" : "text-sm text-foreground"}>{item.keyword}</span>
          {item.plannedFor && <span className="type-meta ml-2">{item.plannedFor}</span>}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={(stageBadge[item.stage] ?? { status: "pending" }).status} label={(stageBadge[item.stage] ?? { label: item.stage }).label} />
          {item.postId
            ? <Button size="sm" variant="ghost" asChild><Link to={`/library/posts/${item.postId}/edit`}>Open draft<span className="sr-only"> for {item.keyword}</span></Link></Button>
            : <Button size="sm" variant="ghost" asChild><Link to={`/create?${params.toString()}`}><FilePlus2 className="mr-1 h-4 w-4" aria-hidden="true" />Create draft<span className="sr-only"> for {item.keyword}</span></Link></Button>}
        </div>
      </div>
    );
  };

  return (
    <BywordCard>
      <SectionHeader icon={GitBranch} title="Topical map" description="Planned topics grouped by theme. The shortest term is the pillar. Link every spoke to it." />
      <div className="border-t border-byword-border p-4 sm:p-5">
        {isLoading && <ListSkeleton rows={3} />}
        {isError && <EmptyState tone="error" title="Could not load the topical map" description="Nothing was lost." primaryAction={{ label: "Retry", onClick: () => refetch() }} />}
        {data && !data.clusters.length && (
          <EmptyState
            title="No planned topics yet"
            description="Add topics to the plan and the map builds itself."
            primaryAction={onOpenTopics ? { label: "Find topics", onClick: onOpenTopics } : undefined}
          />
        )}
        {data && data.clusters.length > 0 && (
          <ul className="grid gap-4 lg:grid-cols-2">
            {data.clusters.map((cluster) => (
              <li key={cluster.pillar.id} className="min-w-0 rounded-sm border border-byword-border p-3">
                <p className="type-kicker mb-2">Pillar · {cluster.spokes.length ? `${cluster.spokes.length} spoke${cluster.spokes.length === 1 ? "" : "s"}` : "no spokes yet"}</p>
                {row(cluster.pillar, "Pillar")}
                {cluster.spokes.length > 0 && (
                  <ul className="mt-1 ml-3 space-y-1 border-l border-byword-border pl-3" aria-label={`Spokes of ${cluster.pillar.keyword}`}>
                    {cluster.spokes.map((spoke) => <li key={spoke.id}>{row(spoke, "Spoke")}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BywordCard>
  );
}

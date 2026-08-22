import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bot, CircleDollarSign, FileCheck2, FileText, Loader2, PlayCircle, SearchCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { useSites } from "@/hooks/useSites";
import { safeFormatDistanceToNow } from "@/lib/date-format";

export default function Overview() {
  const { activeSite } = useSites();
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["control-plane-overview", activeSite?.id],
    queryFn: () => api.get<WorkspaceDigest>(`/control-plane/overview?site_id=${encodeURIComponent(activeSite!.id)}`),
    enabled: Boolean(activeSite?.id),
    refetchInterval: 15_000,
  });

  return <BywordPageShell className="max-w-7xl">
    <PageHeader title="Overview" description={activeSite ? `${activeSite.domain} · agent and editorial operations` : "Agent and editorial operations"}>
      <div className="flex flex-wrap items-center justify-end gap-3"><span className="type-meta inline-flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "animate-pulse bg-amber-500" : "bg-green-600"}`} />{isFetching ? "Refreshing" : "Live · 15s"}</span><Button asChild><Link to="/create">Create content</Link></Button></div>
    </PageHeader>
    {isLoading && <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
    {error && <BywordCard><p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Overview could not be loaded."}</p></BywordCard>}
    {data && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Blockers" value={data.attention.blocker} tone="red" href="/review?severity=blocker" />
        <Metric label="Editorial review" value={data.attention.review} tone="amber" href="/review?severity=review" />
        <Metric label="Warnings" value={data.attention.warning} tone="slate" href="/review?severity=warning" />
      </div>

      <BywordCard>
        <SectionHeader icon={AlertTriangle} title="Needs attention" description="Only drafts with a real editorial or delivery action." action={<Button asChild variant="outline" size="sm"><Link to="/review">Open queue <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>} />
        <div className="divide-y divide-byword-border">
          {data.action_items.map((item) => <Link key={item.id} to={`/review?post=${item.id}`} className="group flex flex-col gap-2 p-4 transition-calm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm font-semibold group-hover:text-byword-blue">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.suggested_action}</p><p className="type-meta mt-1.5">{item.source_type.replace(/_/g, " ")} · revision {item.revision_number || "—"}</p></div>
            <div className="flex items-center gap-2"><Badge variant={item.severity === "blocker" ? "destructive" : "secondary"}>{item.severity}</Badge><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
          </Link>)}
          {!data.action_items.length && <p className="p-6 text-sm text-muted-foreground">No drafts need attention.</p>}
        </div>
      </BywordCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <BywordCard>
          <SectionHeader icon={PlayCircle} title="Runs" description={`${data.runs.running} active · ${data.runs.failed} failed`} action={<Button asChild variant="outline" size="sm"><Link to="/runs">View runs</Link></Button>} />
          <div className="divide-y divide-byword-border">{data.runs.recent.map((run) => <Link to="/runs" key={run.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-calm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><div><p className="text-sm font-medium">{run.source_type.replace(/_/g, " ")}</p><p className="type-meta mt-0.5">{run.current_step} · {safeFormatDistanceToNow(run.created_at)}</p></div><Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge></Link>)}{!data.runs.recent.length && <p className="p-5 text-sm text-muted-foreground">No recent runs.</p>}</div>
        </BywordCard>
        <BywordCard>
          <SectionHeader icon={FileCheck2} title="30-day outcomes" description="Draft and CMS delivery volume." />
          <div className="grid grid-cols-2 gap-px bg-byword-border sm:grid-cols-4"><Outcome icon={FileText} label="Drafts" value={data.outcomes.drafts} /><Outcome icon={FileCheck2} label="CMS drafts" value={data.outcomes.cms_drafts} /><Outcome icon={CircleDollarSign} label="Cost" value={`$${data.outcomes.cost.toFixed(2)}`} /><Outcome icon={Bot} label="MCP connections" value={data.connections.active} /></div>
        </BywordCard>
      </div>

      <BywordCard>
        <SectionHeader icon={FileText} title="Recent outputs" description="Latest content created or updated for this site." action={<Button asChild variant="outline" size="sm"><Link to="/library">Open content</Link></Button>} />
        <div className="divide-y divide-byword-border">{data.recent_outputs.map((post) => <Link key={post.id} to={`/library/posts/${post.id}/preview`} className="flex items-center justify-between gap-3 px-5 py-3 transition-calm hover:bg-muted/30"><div className="min-w-0"><p className="truncate text-sm font-medium">{post.title}</p><p className="text-xs text-muted-foreground">{post.source_type.replace(/_/g, " ")} · {safeFormatDistanceToNow(post.updated_at)}</p></div><Badge variant="secondary">{post.editorial_state.replace(/_/g, " ")}</Badge></Link>)}{!data.recent_outputs.length && <p className="p-5 text-sm text-muted-foreground">No recent outputs.</p>}</div>
      </BywordCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <BywordCard>
          <SectionHeader icon={SearchCheck} title="Search Growth" description={data.search_growth.connected ? "Latest synchronized Search Console opportunity signals." : "Connect Search Console to add growth signals."} action={<Button asChild variant="outline" size="sm"><Link to="/overview/growth">Open Search Growth</Link></Button>} />
          <div className="p-5 text-sm text-muted-foreground">{data.search_growth.connected ? `${Object.values(data.search_growth.segments || {}).filter((value): value is number => typeof value === "number").reduce((total, value) => total + value, 0)} opportunities across ${Object.keys(data.search_growth.segments || {}).length} segments.` : "No connected Search Console property."}</div>
        </BywordCard>
        <BywordCard>
          <SectionHeader icon={Bot} title="Connection health" description="MCP, CMS, and Search Console readiness." action={<Button asChild variant="outline" size="sm"><Link to="/control/connections">Manage</Link></Button>} />
          <div className="grid grid-cols-3 gap-px bg-byword-border"><Outcome icon={Bot} label="MCP active" value={data.connections.active} /><Outcome icon={FileCheck2} label={data.connections.cms.attention ? `${data.connections.cms.attention} need attention` : "CMS ready"} value={`${data.connections.cms.connected}/${data.connections.cms.total}`} /><Outcome icon={SearchCheck} label="Search Console" value={data.connections.search_console.connected ? "Ready" : "Off"} /></div>
        </BywordCard>
      </div>
      <BywordCard>
        <SectionHeader icon={Bot} title="Agent activity" description="Recent MCP and important web operations." />
        <div className="divide-y divide-byword-border">{data.activity.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{event.action.replace(/_/g, " ")}</p><p className="type-meta mt-0.5">{event.client_name || event.origin} · {safeFormatDistanceToNow(event.created_at)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{event.origin}</Badge><Badge variant={event.status === "failed" ? "destructive" : "secondary"}>{event.status}</Badge></div></div>)}{!data.activity.length && <p className="p-5 text-sm text-muted-foreground">No recorded operations yet.</p>}</div>
      </BywordCard>
    </div>}
  </BywordPageShell>;
}

function Metric({ label, value, tone, href }: { label: string; value: number; tone: "red" | "amber" | "slate"; href: string }) {
  return <Link to={href} className="group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><BywordCard className={`h-full transition-calm group-hover:-translate-y-0.5 group-hover:border-byword-blue/50 ${tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : ""}`}><div className="flex items-end justify-between gap-3 p-5"><div><p className="type-kicker text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div><span className={`mb-1 h-2 w-2 rounded-full ${tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-400"}`} /></div></BywordCard></Link>;
}

function Outcome({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string | number }) {
  return <div className="bg-card p-5"><Icon className="h-4 w-4 text-byword-blue" /><p className="mt-5 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

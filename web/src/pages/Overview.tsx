import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, CircleDollarSign, FileCheck2, FileText, ListChecks, PlayCircle, SearchCheck, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ListSkeleton, StatRowSkeleton } from "@/components/patterns/PageSkeleton";
import { StatCard } from "@/components/patterns/StatCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";
import { formatSourceType } from "@/lib/source-labels";
import { api } from "@/lib/api";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { useSites } from "@/hooks/useSites";
import { safeFormatDistanceToNow } from "@/lib/date-format";
import { EDITORIAL_STATE_BADGES } from "@/lib/editorial-state";
import { WorkspaceSetupGuide, type WorkspaceSetupStep } from "@/components/setup/WorkspaceSetupGuide";

const editorialStates = EDITORIAL_STATE_BADGES;

const severityBadges: Record<string, { status: StatusType; label: string }> = {
  blocker: { status: "error", label: "Blocker" },
  review: { status: "warning", label: "Review" },
  warning: { status: "warning", label: "Warning" },
};

function sentence(value: string) {
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function runStatus(status: string): StatusType {
  if (status === "failed") return "error";
  if (status === "completed") return "success";
  if (status === "running" || status === "processing") return "running";
  return "pending";
}

function eventStatus(status: string): StatusType {
  return status === "succeeded" ? "success" : status === "failed" ? "error" : "running";
}

function setupStep(value: string | null): WorkspaceSetupStep {
  return value === "site" || value === "generation" || value === "cms" || value === "search-console" || value === "mcp" || value === "create" ? value : "generation";
}

export default function Overview() {
  const { activeSite } = useSites();
  const [params, setParams] = useSearchParams();
  const [setupOpen, setSetupOpen] = useState(Boolean(params.get("setup")));
  const [activeSetupStep, setActiveSetupStep] = useState<WorkspaceSetupStep>(() => setupStep(params.get("setup")));
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["control-plane-overview", activeSite?.id],
    queryFn: () => api.get<WorkspaceDigest>(`/control-plane/overview?site_id=${encodeURIComponent(activeSite!.id)}`),
    enabled: Boolean(activeSite?.id),
    refetchInterval: 60_000,
  });
  const hasFirstDraft = Boolean(data && (data.outcomes.drafts > 0 || data.recent_outputs.length > 0));
  const searchConsoleDegraded = data?.connections.search_console.status === "unavailable";

  const openSetup = (step: WorkspaceSetupStep = "generation") => {
    setActiveSetupStep(step);
    setSetupOpen(true);
  };

  const setSetupVisibility = (open: boolean) => {
    setSetupOpen(open);
    if (!open && params.has("setup")) {
      const next = new URLSearchParams(params);
      next.delete("setup");
      setParams(next, { replace: true });
    }
  };

  return <BywordPageShell className="max-w-7xl">
    <PageHeader title="Overview" description={activeSite ? `${activeSite.domain} · agent and editorial operations` : "Agent and editorial operations"}>
      <div className="flex flex-wrap items-center justify-end gap-3"><span className="type-meta inline-flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "animate-pulse bg-status-warning" : "bg-status-success"}`} />{isFetching ? "Refreshing" : "Live · 60s"}</span>{hasFirstDraft && <Button type="button" variant="outline" onClick={() => openSetup(data?.connections.generation.ready ? "cms" : "generation")}><ListChecks className="mr-1.5 h-4 w-4" />Connections &amp; setup</Button>}<Button asChild><Link to={hasFirstDraft ? "/create" : "/onboarding"}>{hasFirstDraft ? "Create content" : "Create first draft"}</Link></Button></div>
    </PageHeader>
    {isLoading && <div className="space-y-5"><StatRowSkeleton /><BywordCard><ListSkeleton rows={3} /></BywordCard><div className="grid gap-6 xl:grid-cols-2"><BywordCard><ListSkeleton rows={3} /></BywordCard><BywordCard><ListSkeleton rows={3} /></BywordCard></div></div>}
    {error && <BywordCard><EmptyState tone="error" title="Overview could not be loaded" description={error instanceof Error ? error.message : "The workspace digest request failed."} primaryAction={{ label: "Try again", onClick: () => refetch() }} /></BywordCard>}
    {data && <div className="space-y-5">
      <SetupReadinessCard key={data.site.id} digest={data} onOpenSetup={openSetup} />
      {hasFirstDraft && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Blockers" value={data.attention.blocker} tone="error" href="/review?severity=blocker" />
        <StatCard label="Editorial review" value={data.attention.review} tone="warning" href="/review?severity=review" />
        <StatCard label="Warnings" value={data.attention.warning} tone="neutral" href="/review?severity=warning" />
      </div>

      <BywordCard>
        <SectionHeader icon={AlertTriangle} title="Needs attention" description="Only drafts with a real editorial or delivery action." action={<Button asChild variant="outline" size="sm"><Link to="/review">Open queue <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>} />
        <div className="divide-y divide-byword-border">
          {data.action_items.map((item) => <Link key={item.id} to={`/review?post=${item.id}`} className="group flex flex-col gap-2 p-4 transition-calm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm font-semibold group-hover:text-byword-blue">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.suggested_action}</p><p className="type-meta mt-1.5">{formatSourceType(item.source_type)} · Revision {item.revision_number || "—"}</p></div>
            <div className="flex items-center gap-2"><StatusBadge status={severityBadges[item.severity]?.status ?? "pending"} label={severityBadges[item.severity]?.label ?? sentence(item.severity)} /><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
          </Link>)}
          {!data.action_items.length && <EmptyState size="row" icon={CheckCircle2} title="Queue clear" description="No draft is waiting on an editorial or delivery decision." />}
        </div>
      </BywordCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <BywordCard>
          <SectionHeader icon={PlayCircle} title="Runs" description={`${data.runs.running} active · ${data.runs.failed} failed`} action={<Button asChild variant="outline" size="sm"><Link to="/runs">View runs</Link></Button>} />
          <div className="divide-y divide-byword-border">{data.runs.recent.map((run) => <Link to="/runs" key={run.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-calm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><div><p className="text-sm font-medium">{formatSourceType(run.source_type)}</p><p className="type-meta mt-0.5">{sentence(run.current_step)} · {safeFormatDistanceToNow(run.created_at)}</p></div><StatusBadge status={runStatus(run.status)} label={sentence(run.status)} /></Link>)}{!data.runs.recent.length && <EmptyState size="row" title="No runs yet" description="Generation jobs appear here while they work." primaryAction={{ label: "Create content", href: "/create" }} />}</div>
        </BywordCard>
        <BywordCard>
          <SectionHeader icon={FileCheck2} title="30-day outcomes" description="Draft and CMS delivery volume." />
          <div className="grid grid-cols-2 gap-px bg-byword-border sm:grid-cols-4"><Outcome icon={FileText} label="Drafts" value={data.outcomes.drafts} /><Outcome icon={FileCheck2} label="CMS drafts" value={data.outcomes.cms_drafts} /><Outcome icon={CircleDollarSign} label="Cost" value={`$${data.outcomes.cost.toFixed(2)}`} /><Outcome icon={Bot} label="MCP connections" value={data.connections.active} /></div>
        </BywordCard>
      </div>

      <BywordCard>
        <SectionHeader icon={FileText} title="Recent outputs" description="Latest content created or updated for this site." action={<Button asChild variant="outline" size="sm"><Link to="/library">Open content</Link></Button>} />
        <div className="divide-y divide-byword-border">{data.recent_outputs.map((post) => <Link key={post.id} to={`/library/posts/${post.id}/preview`} className="flex items-center justify-between gap-3 px-5 py-3 transition-calm hover:bg-muted/30"><div className="min-w-0"><p className="truncate text-sm font-medium">{post.title}</p><p className="text-xs text-muted-foreground">{formatSourceType(post.source_type)} · {safeFormatDistanceToNow(post.updated_at)}</p></div><StatusBadge status={editorialStates[post.editorial_state]?.status ?? "draft"} label={editorialStates[post.editorial_state]?.label ?? sentence(post.editorial_state)} className="shrink-0" /></Link>)}{!data.recent_outputs.length && <EmptyState size="row" title="No content yet" description="Drafts created for this site collect here." primaryAction={{ label: "Create content", href: "/create" }} />}</div>
      </BywordCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <BywordCard>
          <SectionHeader icon={SearchCheck} title="Search Growth" description={searchConsoleDegraded ? "Search Console could not be refreshed; showing the last synchronized numbers." : data.search_growth.connected ? "Latest synchronized opportunities and plan progress." : "Connect Search Console to add growth signals."} action={<Button asChild variant="outline" size="sm"><Link to="/overview/growth?tab=plan">Open growth plan</Link></Button>} />
          <div className="space-y-3 p-5 text-sm text-muted-foreground">{searchConsoleDegraded && <p className="text-status-warning">Reconnect the property in Connections to refresh this data.</p>}{data.search_growth.connected ? <><p>{Object.values(data.search_growth.segments || {}).filter((value): value is number => typeof value === "number").reduce((total, value) => total + value, 0)} opportunities across {Object.keys(data.search_growth.segments || {}).length} segments.</p>{data.search_growth.plan ? <div className="grid grid-cols-4 gap-2">{(["planned", "review", "blocked", "measuring"] as const).map((key) => <div key={key} className="rounded-sm border border-border bg-muted/40 p-2"><p className="type-kicker">{sentence(key)}</p><p className="mt-1 text-lg font-semibold text-foreground">{data.search_growth.plan!.summary[key] || 0}</p></div>)}</div> : <p>No 30-day plan generated yet.</p>}</> : "No connected Search Console property."}</div>
        </BywordCard>
        <BywordCard>
          <SectionHeader icon={Bot} title="Connection health" description="MCP, CMS, and Search Console readiness." action={<Button asChild variant="outline" size="sm"><Link to="/control/connections">Manage</Link></Button>} />
          <div className="grid grid-cols-3 gap-px bg-byword-border"><Outcome icon={Bot} label="MCP access" value={data.connections.active} /><Outcome icon={FileCheck2} label={data.connections.cms.attention ? `${data.connections.cms.attention} need attention` : "CMS ready"} value={`${data.connections.cms.connected}/${data.connections.cms.total}`} /><Outcome icon={SearchCheck} label="Search Console" value={searchConsoleDegraded ? "Attention" : data.connections.search_console.connected ? "Ready" : "Off"} /></div>
        </BywordCard>
      </div>
      <BywordCard>
        <SectionHeader icon={Bot} title="Agent activity" description="Recent MCP and important web operations." />
        <div className="divide-y divide-byword-border">{data.activity.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{sentence(event.action.replace(/\./g, " "))}</p><p className="type-meta mt-0.5">{event.client_name || event.origin} · {safeFormatDistanceToNow(event.created_at)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{event.origin}</Badge><StatusBadge status={eventStatus(event.status)} label={sentence(event.status)} /></div></div>)}{!data.activity.length && <EmptyState size="row" title="No agent operations yet" description="MCP and web operations are recorded here for 30 days." />}</div>
      </BywordCard>
      </>}
    </div>}
    {data && setupOpen && <WorkspaceSetupGuide open={setupOpen} onOpenChange={setSetupVisibility} digest={data} initialStep={activeSetupStep} />}
  </BywordPageShell>;
}

const setupDismissalKey = (siteId: string) => `blogfactory:connections-setup:${siteId}`;

function SetupReadinessCard({ digest, onOpenSetup }: { digest: WorkspaceDigest; onOpenSetup: (step: WorkspaceSetupStep) => void }) {
  const generation = digest.connections.generation;
  const hasFirstDraft = digest.outcomes.drafts > 0 || digest.recent_outputs.length > 0;
  const storageKey = setupDismissalKey(digest.site.id);
  const cmsReady = digest.connections.cms.connected > 0;
  const searchConsoleReady = digest.connections.search_console.connected && digest.connections.search_console.status !== "unavailable";
  const mcpConfigured = digest.connections.active > 0;
  const fingerprint = [generation.credential_status, cmsReady, searchConsoleReady, mcpConfigured].join(":");
  const [dismissedFingerprint, setDismissedFingerprint] = useState(() => localStorage.getItem(storageKey));

  if (!hasFirstDraft) {
    return <section aria-labelledby="first-draft-title"><BywordCard>
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40 text-byword-blue"><FileText className="h-5 w-5" /></span>
          <div>
            <p className="type-kicker">Start here</p>
            <h2 id="first-draft-title" className="mt-1 text-xl font-semibold">Create your first draft</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{generation.ready ? "Choose a real topic from your site, see the estimate, and get a reviewable text-only draft." : generation.credential_status === "undecryptable" ? "Your saved OpenRouter key cannot be read. Re-save it inline, then create a real draft." : "Connect OpenRouter inline, choose a real site topic, and create a reviewable draft."}</p>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0"><Link to="/onboarding">{generation.ready ? "Choose a topic" : generation.credential_status === "undecryptable" ? "Repair AI access" : "Continue setup"}<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
      </div>
    </BywordCard></section>;
  }

  if (dismissedFingerprint === fingerprint) return null;

  const optionalReady = [cmsReady, searchConsoleReady, mcpConfigured].filter(Boolean).length;
  const nextStep: WorkspaceSetupStep = !cmsReady ? "cms" : !searchConsoleReady ? "search-console" : "mcp";

  const dismiss = () => {
    localStorage.setItem(storageKey, fingerprint);
    setDismissedFingerprint(fingerprint);
  };

  if (!generation.ready) {
    return <Alert variant="warning" aria-labelledby="connections-setup-title">
      <AlertTriangle />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <AlertTitle id="connections-setup-title">AI access needs attention</AlertTitle>
          <AlertDescription>Your saved OpenRouter key is missing or unreadable. Repair it before the next generation run.</AlertDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenSetup("generation")}>Repair AI access<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={dismiss} aria-label="Dismiss connections setup"><X className="h-4 w-4" /></Button>
        </div>
      </div>
    </Alert>;
  }

  return <section className="relative rounded-md border border-byword-border bg-card" aria-labelledby="connections-setup-title">
    <div className="flex flex-col gap-4 p-4 pr-12 sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pr-14">
      <div className="min-w-0">
        <p className="type-kicker text-muted-foreground">Optional</p>
        <h2 id="connections-setup-title" className="mt-1 text-base font-semibold">Connections &amp; setup</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{`${optionalReady} of 3 optional capabilities configured. Add them only when you need delivery, search evidence, or an AI client.`}</p>
        <div className="mt-3 flex flex-wrap gap-2"><ConnectionPill label="CMS" ready={cmsReady} /><ConnectionPill label="Search" ready={searchConsoleReady} /><ConnectionPill label="MCP" ready={mcpConfigured} /></div>
      </div>
      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onOpenSetup(nextStep)}>Open setup<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2" onClick={dismiss} aria-label="Dismiss connections setup"><X className="h-4 w-4" /></Button>
    </div>
  </section>;
}

function ConnectionPill({ label, ready }: { label: string; ready: boolean }) {
  return <StatusBadge status={ready ? "success" : "pending"} label={`${label} · ${ready ? "set" : "off"}`} />;
}

function Outcome({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string | number }) {
  return <div className="bg-card p-5"><Icon className="h-4 w-4 text-byword-blue" /><p className="mt-5 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

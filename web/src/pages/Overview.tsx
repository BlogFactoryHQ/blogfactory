import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bot, CircleDollarSign, FileCheck2, FileText, ListChecks, Loader2, PlayCircle, SearchCheck, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { useSites } from "@/hooks/useSites";
import { safeFormatDistanceToNow } from "@/lib/date-format";
import { WorkspaceSetupGuide, type WorkspaceSetupStep } from "@/components/setup/WorkspaceSetupGuide";

function setupStep(value: string | null): WorkspaceSetupStep {
  return value === "site" || value === "generation" || value === "cms" || value === "search-console" || value === "mcp" || value === "create" ? value : "generation";
}

export default function Overview() {
  const { activeSite } = useSites();
  const [params, setParams] = useSearchParams();
  const [setupOpen, setSetupOpen] = useState(Boolean(params.get("setup")));
  const [activeSetupStep, setActiveSetupStep] = useState<WorkspaceSetupStep>(() => setupStep(params.get("setup")));
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["control-plane-overview", activeSite?.id],
    queryFn: () => api.get<WorkspaceDigest>(`/control-plane/overview?site_id=${encodeURIComponent(activeSite!.id)}`),
    enabled: Boolean(activeSite?.id),
    refetchInterval: 15_000,
  });
  const hasFirstDraft = Boolean(data && (data.outcomes.drafts > 0 || data.recent_outputs.length > 0));

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
      <div className="flex flex-wrap items-center justify-end gap-3"><span className="type-meta inline-flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "animate-pulse bg-amber-500" : "bg-green-600"}`} />{isFetching ? "Refreshing" : "Live · 15s"}</span>{hasFirstDraft && <Button type="button" variant="outline" onClick={() => openSetup(data?.connections.generation.ready ? "cms" : "generation")}><ListChecks className="mr-1.5 h-4 w-4" />Connections &amp; setup</Button>}<Button asChild><Link to={hasFirstDraft ? "/create" : "/onboarding"}>{hasFirstDraft ? "Create content" : "Create first draft"}</Link></Button></div>
    </PageHeader>
    {isLoading && <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
    {error && <BywordCard><p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Overview could not be loaded."}</p></BywordCard>}
    {data && <div className="space-y-5">
      <SetupReadinessCard key={data.site.id} digest={data} onOpenSetup={openSetup} />
      {hasFirstDraft && <>
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
          <SectionHeader icon={SearchCheck} title="Search Growth" description={data.search_growth.connected ? "Latest synchronized opportunities and plan progress." : "Connect Search Console to add growth signals."} action={<Button asChild variant="outline" size="sm"><Link to="/overview/growth?tab=plan">Open growth plan</Link></Button>} />
          <div className="space-y-3 p-5 text-sm text-muted-foreground">{data.search_growth.connected ? <><p>{Object.values(data.search_growth.segments || {}).filter((value): value is number => typeof value === "number").reduce((total, value) => total + value, 0)} opportunities across {Object.keys(data.search_growth.segments || {}).length} segments.</p>{data.search_growth.plan ? <div className="grid grid-cols-4 gap-2">{(["planned", "review", "blocked", "measuring"] as const).map((key) => <div key={key} className="rounded-sm border border-byword-border p-2"><p className="font-mono text-[9px] uppercase">{key}</p><p className="mt-1 text-lg font-semibold text-foreground">{data.search_growth.plan!.summary[key] || 0}</p></div>)}</div> : <p>No 30-day plan generated yet.</p>}</> : "No connected Search Console property."}</div>
        </BywordCard>
        <BywordCard>
          <SectionHeader icon={Bot} title="Connection health" description="MCP, CMS, and Search Console readiness." action={<Button asChild variant="outline" size="sm"><Link to="/control/connections">Manage</Link></Button>} />
          <div className="grid grid-cols-3 gap-px bg-byword-border"><Outcome icon={Bot} label="MCP access" value={data.connections.active} /><Outcome icon={FileCheck2} label={data.connections.cms.attention ? `${data.connections.cms.attention} need attention` : "CMS ready"} value={`${data.connections.cms.connected}/${data.connections.cms.total}`} /><Outcome icon={SearchCheck} label="Search Console" value={data.connections.search_console.connected ? "Ready" : "Off"} /></div>
        </BywordCard>
      </div>
      <BywordCard>
        <SectionHeader icon={Bot} title="Agent activity" description="Recent MCP and important web operations." />
        <div className="divide-y divide-byword-border">{data.activity.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{event.action.replace(/_/g, " ")}</p><p className="type-meta mt-0.5">{event.client_name || event.origin} · {safeFormatDistanceToNow(event.created_at)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{event.origin}</Badge><Badge variant={event.status === "failed" ? "destructive" : "secondary"}>{event.status}</Badge></div></div>)}{!data.activity.length && <p className="p-5 text-sm text-muted-foreground">No recorded operations yet.</p>}</div>
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
  const searchConsoleReady = digest.connections.search_console.connected;
  const mcpConfigured = digest.connections.active > 0;
  const fingerprint = [generation.credential_status, cmsReady, searchConsoleReady, mcpConfigured].join(":");
  const [dismissedFingerprint, setDismissedFingerprint] = useState(() => localStorage.getItem(storageKey));

  if (!hasFirstDraft) {
    return <section className="relative overflow-hidden rounded-md border border-byword-border bg-card" aria-labelledby="first-draft-title">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
      <div className="flex flex-col gap-5 p-5 pl-6 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pl-7">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-primary/25 bg-primary/5 text-primary"><FileText className="h-5 w-5" /></span>
          <div>
            <p className="type-kicker text-byword-blue">Start here</p>
            <h2 id="first-draft-title" className="mt-1 text-xl font-semibold">Create your first draft</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{generation.ready ? "Choose a real topic from your site, see the estimate, and get a reviewable text-only draft." : generation.credential_status === "undecryptable" ? "Your saved OpenRouter key cannot be read. Re-save it inline, then create a real draft." : "Connect OpenRouter inline, choose a real site topic, and create a reviewable draft."}</p>
          </div>
        </div>
        <Button asChild className="shrink-0"><Link to="/onboarding">{generation.ready ? "Choose a topic" : generation.credential_status === "undecryptable" ? "Repair AI access" : "Continue setup"}<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
      </div>
    </section>;
  }

  if (dismissedFingerprint === fingerprint) return null;

  const optionalReady = [cmsReady, searchConsoleReady, mcpConfigured].filter(Boolean).length;
  const nextStep: WorkspaceSetupStep = !cmsReady ? "cms" : !searchConsoleReady ? "search-console" : "mcp";

  const dismiss = () => {
    localStorage.setItem(storageKey, fingerprint);
    setDismissedFingerprint(fingerprint);
  };

  return <section className={`relative rounded-md border bg-card ${generation.ready ? "border-byword-border" : "border-amber-300"}`} aria-labelledby="connections-setup-title">
    <div className="flex flex-col gap-4 p-4 pr-12 sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pr-14">
      <div className="min-w-0">
        <p className="type-kicker text-muted-foreground">{generation.ready ? "Optional" : "Action needed"}</p>
        <h2 id="connections-setup-title" className="mt-1 text-base font-semibold">{generation.ready ? "Connections & setup" : "AI access needs attention"}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{generation.ready ? `${optionalReady} of 3 optional capabilities configured. Add them only when you need delivery, search evidence, or an AI client.` : "Your saved OpenRouter key is missing or unreadable. Repair it before the next generation run."}</p>
        {generation.ready && <div className="mt-3 flex flex-wrap gap-2"><ConnectionPill label="CMS" ready={cmsReady} /><ConnectionPill label="Search" ready={searchConsoleReady} /><ConnectionPill label="MCP" ready={mcpConfigured} /></div>}
      </div>
      <Button type="button" variant={generation.ready ? "outline" : "default"} size="sm" className="shrink-0" onClick={() => onOpenSetup(generation.ready ? nextStep : "generation")}>{generation.ready ? "Open setup" : "Repair AI access"}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2" onClick={dismiss} aria-label="Dismiss connections setup"><X className="h-4 w-4" /></Button>
    </div>
  </section>;
}

function ConnectionPill({ label, ready }: { label: string; ready: boolean }) {
  return <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-byword-border bg-muted/40 text-muted-foreground"}`}>{label} · {ready ? "set" : "off"}</span>;
}

function Metric({ label, value, tone, href }: { label: string; value: number; tone: "red" | "amber" | "slate"; href: string }) {
  return <Link to={href} className="group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><BywordCard className={`h-full transition-calm group-hover:-translate-y-0.5 group-hover:border-byword-blue/50 ${tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : ""}`}><div className="flex items-end justify-between gap-3 p-5"><div><p className="type-kicker text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div><span className={`mb-1 h-2 w-2 rounded-full ${tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-400"}`} /></div></BywordCard></Link>;
}

function Outcome({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string | number }) {
  return <div className="bg-card p-5"><Icon className="h-4 w-4 text-byword-blue" /><p className="mt-5 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

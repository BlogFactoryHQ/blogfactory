import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useIndexing } from "@/hooks/useIndexing";
import { useSites } from "@/hooks/useSites";
import {
  FileText,
  Rss,
  ListTodo,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Loader2,
  Clock,
  Timer,
  PenTool,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { formatCompactCurrency, formatCompactNumber, safePercent, semanticToneClass, type SemanticTone } from "@/lib/search-insights";
import { safeFormatDistanceToNow } from "@/lib/date-format";

interface DashboardStats {
  totalPosts: number;
  drafts: number;
  published: number;
  totalJobs: number;
  activeFeeds: number;
  monthCost: number;
}

export default function Dashboard() {
  const { data: dashStats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      return api.get<DashboardStats>("/dashboard/stats");
    },
  });

  const postCount = dashStats?.totalPosts ?? 0;
  const draftCount = dashStats?.drafts ?? 0;
  const publishedCount = dashStats?.published ?? 0;
  const activeFeedCount = dashStats?.activeFeeds ?? 0;
  const totalJobCount = dashStats?.totalJobs ?? 0;
  const { activeSite } = useSites();
  const { integrations } = useIntegrations();
  const { integrations: indexingIntegrations } = useIndexing();
  const connectedIntegrations = integrations.filter((integration) => integration.status === "connected");
  const connectedIndexing = indexingIntegrations.filter((integration) => integration.status === "connected");
  const internalLinksReady = Boolean(activeSite?.internalLinkIndex?.pages?.length || activeSite?.vectorCount);

  const { data: recentJobs = [], isLoading: isLoadingJobs } = useQuery({
    queryKey: ["recent-jobs"],
    queryFn: async () => {
      return api.get<any[]>("/jobs?limit=5");
    },
  });

  const { data: schedulerLogs = [], isLoading: isLoadingScheduler } = useQuery({
    queryKey: ["scheduler-logs"],
    queryFn: async () => {
      return api.get<any[]>("/scheduler/logs?limit=5");
    },
  });

  const jobStatusSummary = {
    completed: recentJobs.filter((job: any) => job.status === "completed").length,
    running: recentJobs.filter((job: any) => job.status === "running").length,
    pending: recentJobs.filter((job: any) => job.status === "pending").length,
    failed: recentJobs.filter((job: any) => job.status === "failed").length,
  };
  const scaleChecklist = [
    {
      title: "Publish Drafts",
      description: draftCount ? `${draftCount} draft${draftCount === 1 ? "" : "s"} ready to publish.` : "No draft backlog.",
      href: "/posts?status=draft",
      action: "Open drafts",
      done: draftCount === 0 && publishedCount > 0,
      warn: draftCount > 0,
    },
    {
      title: "Internal Links",
      description: internalLinksReady ? "Sitemap index is ready." : "Index your sitemap before scaling.",
      href: "/search-growth?tab=internal-links",
      action: "Search Growth",
      done: internalLinksReady,
    },
    {
      title: "Publishing",
      description: connectedIntegrations.length ? `${connectedIntegrations.length} CMS connection${connectedIntegrations.length === 1 ? "" : "s"} ready.` : "Connect a CMS before bulk publishing.",
      href: "/integrations",
      action: "Integrations",
      done: connectedIntegrations.length > 0,
    },
    {
      title: "Indexing",
      description: connectedIndexing.length ? "Auto-submit can start after publishing." : "Connect IndexNow before large batches.",
      href: "/search-growth?tab=indexing",
      action: "Search Growth",
      done: connectedIndexing.length > 0,
    },
  ];
  const completedScaleItems = scaleChecklist.filter((item) => item.done).length;
  const scaleProgress = (completedScaleItems / scaleChecklist.length) * 100;
  const nextScaleItem = scaleChecklist.find((item) => !item.done) || scaleChecklist[0];

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="Pipeline health, next actions, and the latest factory activity."
      >
        <Button asChild>
          <Link to="/content-creator">
            <PenTool className="h-4 w-4" />
            Create content
          </Link>
        </Button>
      </PageHeader>

      <PipelinePulse
        postCount={postCount}
        draftCount={draftCount}
        publishedCount={publishedCount}
        activeFeedCount={activeFeedCount}
        totalJobCount={totalJobCount}
        monthCost={dashStats?.monthCost ?? 0}
        searchReady={connectedIndexing.length > 0 && internalLinksReady ? publishedCount : 0}
      />

      <BywordCard className="mb-6">
        <SectionHeader
          icon={CheckCircle}
          title="What needs attention now"
          description="Publish first, index fast, then improve posts that earn demand."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{completedScaleItems}/{scaleChecklist.length} ready</Badge>
              <Button asChild variant="outline" size="sm">
                <Link to={nextScaleItem.href}>
                  {nextScaleItem.done ? "Review posts" : nextScaleItem.action}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          }
        />
        <div className="p-4 sm:p-5 lg:p-6">
          <Progress value={scaleProgress} className="mb-4 h-2" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {scaleChecklist.map((item) => {
              const Icon = item.done ? CheckCircle : item.warn ? AlertCircle : Clock;
              const isNext = item.title === nextScaleItem.title && !item.done;
              return (
                <Link
                  key={item.title}
                  to={item.href}
                  className={cn(
                    "group rounded-md border p-4 transition-calm hover:border-byword-blue/45 hover:bg-byword-blue-soft/30",
                    isNext ? "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.12)]" : "border-byword-border bg-card"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.done ? "text-status-success" : item.warn ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{item.title}</p>
                        {isNext && <Badge variant="outline" className="border-[hsl(var(--status-warning)/0.45)] bg-card text-[10px] text-[hsl(var(--status-warning))]">Next best</Badge>}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                      <span className="mt-3 inline-flex items-center text-xs font-medium text-muted-foreground group-hover:text-foreground">
                        {item.action}
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </BywordCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent Jobs */}
        <BywordCard className="lg:col-span-3">
          <SectionHeader
            icon={ListTodo}
            title="Recent jobs"
            description="Latest generation work across the active workspace."
            action={<Button asChild variant="outline" size="sm"><Link to="/jobs">View all <ArrowRight className="h-4 w-4" /></Link></Button>}
          />
          <div className="divide-y divide-border">
            {isLoadingJobs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : recentJobs.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No jobs yet. Generate content to see activity here.
              </div>
            ) : (
              recentJobs.map((job: any) => {
                const sourceType = job.source_type ?? job.sourceType ?? "unknown";
                const modelId = job.model_id ?? job.modelId ?? "";
                const createdAt = job.created_at ?? job.createdAt;

                return (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 px-4 py-3 transition-calm hover:bg-muted/40"
                  >
                    <div
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        job.status === "completed"
                          ? "bg-status-success"
                          : job.status === "failed"
                          ? "bg-status-error"
                          : "bg-status-running animate-pulse"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">
                        #{job.id.slice(0, 8)}
                      </span>
                      <span className="text-sm text-muted-foreground ml-2 capitalize">
                        {sourceType.replace("_", " ")}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {modelId.split("/").pop()}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {safeFormatDistanceToNow(createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </BywordCard>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Queue Summary */}
          <BywordCard>
            <SectionHeader icon={ListTodo} title="Job queue" description="Current queue mix from recent jobs." />
            <div className="space-y-2.5 p-4">
              {[
                { label: "Completed", count: jobStatusSummary.completed, color: "bg-status-success" },
                { label: "Running", count: jobStatusSummary.running, color: "bg-status-running", pulse: true },
                { label: "Pending", count: jobStatusSummary.pending, color: "bg-muted-foreground/40" },
                { label: "Failed", count: jobStatusSummary.failed, color: "bg-status-error" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("h-1.5 w-1.5 rounded-full", row.color, row.pulse && "animate-pulse")} />
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{row.count}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <Link to="/jobs" className="text-xs text-muted-foreground hover:text-foreground transition-calm">
                  View queue →
                </Link>
              </div>
            </div>
          </BywordCard>

          {/* Scheduler */}
          <BywordCard>
            <SectionHeader
              icon={Timer}
              title="Scheduler"
              description="Recent feed drain activity."
              action={<Button asChild variant="outline" size="sm"><Link to="/rss-feeds">Feeds <ArrowRight className="h-4 w-4" /></Link></Button>}
            />
            <div className="divide-y divide-border">
              {isLoadingScheduler ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : schedulerLogs.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground px-4">
                  <Timer className="h-5 w-5 mx-auto mb-2 opacity-30" />
                  No scheduler runs yet.
                </div>
              ) : (
                schedulerLogs.map((log: any) => (
                  <div key={log.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {log.feeds_checked} feed{log.feeds_checked !== 1 ? "s" : ""} checked
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {safeFormatDistanceToNow(log.triggered_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.feeds_triggered > 0 && (
                        <span className="text-xs text-status-success">{log.feeds_triggered} triggered</span>
                      )}
                      {log.feeds_skipped > 0 && (
                        <span className="text-xs text-muted-foreground">{log.feeds_skipped} skipped</span>
                      )}
                      {log.feeds_errored > 0 && (
                        <span className="text-xs text-status-error">{log.feeds_errored} errors</span>
                      )}
                      {log.feeds_triggered === 0 && log.feeds_errored === 0 && log.feeds_skipped === 0 && (
                        <span className="text-xs text-muted-foreground">No feeds due</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </BywordCard>

          {/* Quick Actions */}
          <BywordCard>
            <SectionHeader icon={PenTool} title="Quick actions" description="Common next moves." />
            <div className="space-y-2 p-4">
              {[
                { label: "Generate Content", sub: "Create new drafts", href: "/content-creator", icon: PenTool },
                { label: "Add RSS Feed", sub: "New content source", href: "/rss-feeds/new", icon: Rss },
                { label: "Brand Voice", sub: "Profiles and brand defaults", href: "/brand-voice", icon: Users },
              ].map((action) => (
                <Link key={action.href} to={action.href}>
                  <div className="flex items-center gap-3 rounded-md border border-border p-3 transition-calm hover:border-byword-blue/40 hover:bg-byword-blue-soft/40 cursor-pointer">
                    <action.icon className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.sub}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </BywordCard>
        </div>
      </div>
    </BywordPageShell>
  );
}

function PipelinePulse({
  postCount,
  draftCount,
  publishedCount,
  activeFeedCount,
  totalJobCount,
  monthCost,
  searchReady,
}: {
  postCount: number;
  draftCount: number;
  publishedCount: number;
  activeFeedCount: number;
  totalJobCount: number;
  monthCost: number;
  searchReady: number;
}) {
  const metrics = [
    { label: "Posts", value: formatCompactNumber(postCount), icon: FileText, tone: "performance" as SemanticTone, href: "/posts" },
    { label: "Drafts", value: formatCompactNumber(draftCount), icon: PenTool, tone: draftCount ? "opportunity" as SemanticTone : "success" as SemanticTone, href: "/posts?status=draft" },
    { label: "Published", value: formatCompactNumber(publishedCount), icon: CheckCircle, tone: "success" as SemanticTone, href: "/posts?status=published" },
    { label: "Active feeds", value: formatCompactNumber(activeFeedCount), icon: Rss, tone: activeFeedCount ? "performance" as SemanticTone : "neutral" as SemanticTone, href: "/rss-feeds" },
    { label: "Jobs", value: formatCompactNumber(totalJobCount), icon: ListTodo, tone: totalJobCount ? "neutral" as SemanticTone : "opportunity" as SemanticTone, href: "/jobs" },
    { label: "Month spend", value: formatCompactCurrency(monthCost), icon: Timer, tone: "neutral" as SemanticTone, href: "/usage" },
  ];
  const steps = [
    { label: "Created", value: postCount, tone: "performance" as SemanticTone },
    { label: "Draft", value: draftCount, tone: "opportunity" as SemanticTone },
    { label: "Published", value: publishedCount, tone: "success" as SemanticTone },
    { label: "Indexed / Ready", value: searchReady, tone: searchReady ? "success" as SemanticTone : "neutral" as SemanticTone },
  ];
  const max = Math.max(postCount, 1);

  return (
    <BywordCard className="mb-6">
      <SectionHeader
        icon={FileText}
        title="Content pipeline pulse"
        description="Top-level publishing health before the operational tables."
      />
      <div className="p-4 sm:p-5 lg:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <Link key={metric.label} to={metric.href} className={cn("rounded-md border p-4 transition-calm hover:border-byword-blue/45 hover:bg-byword-blue-soft/30", semanticToneClass(metric.tone))}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase opacity-75">{metric.label}</p>
                <metric.icon className="h-4 w-4 opacity-70" />
              </div>
              <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
            </Link>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {steps.map((step) => (
            <div key={step.label} className="rounded-md border border-byword-border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">{step.label}</span>
                <span>{formatCompactNumber(step.value)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    step.tone === "performance" && "bg-byword-blue",
                    step.tone === "opportunity" && "bg-amber-500",
                    step.tone === "success" && "bg-green-500",
                    step.tone === "neutral" && "bg-muted-foreground/40"
                  )}
                  style={{ width: `${Math.max(8, safePercent(step.value, max))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </BywordCard>
  );
}

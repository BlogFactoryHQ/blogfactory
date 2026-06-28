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
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

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

  const stats = [
    {
      title: "Posts",
      value: postCount,
      icon: FileText,
      href: "/posts",
    },
    {
      title: "Active Feeds",
      value: activeFeedCount,
      icon: Rss,
      href: "/rss-feeds",
    },
    {
      title: "Jobs",
      value: totalJobCount,
      icon: ListTodo,
      href: "/jobs",
    },
    {
      title: "Published",
      value: publishedCount,
      detail: draftCount ? `${draftCount} drafts` : undefined,
      icon: CheckCircle,
      href: "/posts?status=published",
    },
  ];

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
      href: "/settings",
      action: "Article settings",
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
      href: "/indexing",
      action: "Indexing",
      done: connectedIndexing.length > 0,
    },
  ];
  const completedScaleItems = scaleChecklist.filter((item) => item.done).length;
  const scaleProgress = (completedScaleItems / scaleChecklist.length) * 100;
  const nextScaleItem = scaleChecklist.find((item) => !item.done) || scaleChecklist[0];

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Overview of your content pipeline."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {stats.map((stat, i) => (
          <Link key={stat.title} to={stat.href}>
            <div
              className="group calm-card p-5 hover:border-foreground/15 transition-calm cursor-pointer"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{stat.title}</span>
                <stat.icon className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tracking-tight">{stat.value}</span>
                {stat.detail && (
                  <span className="text-sm text-muted-foreground">{stat.detail}</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="calm-card mb-10 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Scale Publishing</h2>
            <p className="mt-1 text-sm text-muted-foreground">Publish first, index fast, then improve posts that earn demand.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{completedScaleItems}/{scaleChecklist.length} ready</Badge>
            <Button asChild variant="outline" size="sm">
              <Link to={nextScaleItem.href}>
                {nextScaleItem.done ? "Review posts" : nextScaleItem.action}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <Progress value={scaleProgress} className="mb-4 h-2" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {scaleChecklist.map((item) => {
            const Icon = item.done ? CheckCircle : item.warn ? AlertCircle : Clock;
            return (
              <Link key={item.title} to={item.href} className="group rounded-lg border border-border p-4 transition-calm hover:border-foreground/15 hover:bg-muted/30">
                <div className="flex items-start gap-3">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.done ? "text-status-success" : item.warn ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Jobs */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Recent Jobs</h2>
            <Link
              to="/jobs"
              className="text-xs text-muted-foreground hover:text-foreground transition-calm flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="calm-card divide-y divide-border">
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
                      {createdAt ? formatDistanceToNow(new Date(createdAt), { addSuffix: true }) : "—"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Queue Summary */}
          <div>
            <h2 className="text-sm font-semibold mb-4">Job Queue</h2>
            <div className="calm-card p-4 space-y-2.5">
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
          </div>

          {/* Scheduler */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Scheduler</h2>
              <Link
                to="/rss-feeds"
                className="text-xs text-muted-foreground hover:text-foreground transition-calm"
              >
                Feeds →
              </Link>
            </div>
            <div className="calm-card divide-y divide-border">
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
                        {formatDistanceToNow(new Date(log.triggered_at), { addSuffix: true })}
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
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-sm font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-1.5">
              {[
                { label: "Generate Content", sub: "Create new drafts", href: "/content-creator", icon: PenTool },
                { label: "Add RSS Feed", sub: "New content source", href: "/rss-feeds/new", icon: Rss },
                { label: "Brand Voice", sub: "Profiles and brand defaults", href: "/brand-voice", icon: Users },
              ].map((action) => (
                <Link key={action.href} to={action.href}>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-foreground/15 hover:bg-muted/30 transition-calm cursor-pointer">
                    <action.icon className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.sub}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

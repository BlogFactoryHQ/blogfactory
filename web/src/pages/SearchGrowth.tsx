import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import {
  type LucideIcon,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Eye,
  Info,
  Link as LinkIcon,
  Loader2,
  Minus,
  MousePointerClick,
  RefreshCw,
  Send,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { safeFormatIsoDate } from "@/lib/date-format";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIndexing } from "@/hooks/useIndexing";
import {
  type MetricDelta,
  type SearchConsoleInsights,
  type SearchInsightRow,
  type SearchOpportunityBubble,
  useSearchConsole,
  useSearchConsoleInsights,
} from "@/hooks/useSearchConsole";
import { useSites } from "@/hooks/useSites";
import { InternalLinksPanel } from "@/components/search-growth/InternalLinksPanel";
import { SearchGrowthDependencyBand } from "@/components/search-growth/SearchGrowthDependencyBand";
import { IndexingPanel } from "@/pages/Indexing";
import { SearchAnalyticsPanel } from "@/pages/SearchAnalytics";
import { OptimizePanel } from "@/pages/Optimize";
import { api } from "@/lib/api";
import { connectionReady, displayConnectionStatus } from "@/lib/credential-status";
import { formatCompactNumber, formatDelta, formatPercent, type TrendTone } from "@/lib/search-insights";
import { cn } from "@/lib/utils";

const tabs = new Set(["overview", "optimize", "analytics", "indexing", "internal-links"]);

interface InternalLinkSettings {
  internal_link_status?: string | null;
  internal_link_index?: { pageCount?: number } | null;
}

const INSIGHT_COLORS = {
  performance: "#2F8EDB",
  opportunity: "#D68400",
  risk: "#D92D20",
  improved: "#00856A",
};

const rowTone: Record<SearchInsightRow["kind"], string> = {
  risk: "bg-[hsl(var(--status-error)/0.12)] text-[hsl(var(--status-error))]",
  ctr: "bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
  lift: "bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
  improved: "bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))]",
  watch: "bg-muted text-muted-foreground",
};

export default function SearchGrowth() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.has(params.get("tab") || "") ? params.get("tab")! : "overview";
  const setTab = (value: string) => setParams(value === "overview" ? {} : { tab: value });
  const openOptimize = (filter?: { status?: string; opportunity?: string }) => {
    const next = new URLSearchParams({ tab: "optimize" });
    if (filter?.status) next.set("status", filter.status);
    if (filter?.opportunity) next.set("opportunity", filter.opportunity);
    setParams(next);
  };

  useEffect(() => {
    const result = params.get("gsc");
    if (!result) return;
    if (result === "connected") toast.success("Search Console connected");
    if (result === "select") toast.info("Choose the Search Console property to finish setup");
    if (result === "error") toast.error(params.get("message") || "Search Console connection failed");
    const next = new URLSearchParams(params);
    next.delete("gsc");
    next.delete("message");
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Search Growth"
        description="Coordinate performance monitoring, indexing, and semantic internal links for the active site."
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="optimize">Optimize</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="indexing">Indexing</TabsTrigger>
          <TabsTrigger value="internal-links">Internal Links</TabsTrigger>
        </TabsList>

        {tab === "overview" && (
          <TabsContent value="overview" className="mt-0">
            <SearchGrowthOverview onSelectTab={setTab} onOpenOptimize={openOptimize} />
          </TabsContent>
        )}
        {tab === "optimize" && (
          <TabsContent value="optimize" className="mt-0">
            <OptimizePanel />
          </TabsContent>
        )}
        {tab === "analytics" && (
          <TabsContent value="analytics" className="mt-0">
            <SearchAnalyticsPanel />
          </TabsContent>
        )}
        {tab === "indexing" && (
          <TabsContent value="indexing" className="mt-0">
            <IndexingPanel />
          </TabsContent>
        )}
        {tab === "internal-links" && (
          <TabsContent value="internal-links" className="mt-0">
            <InternalLinksPanel />
          </TabsContent>
        )}
      </Tabs>
    </BywordPageShell>
  );
}

function SearchGrowthOverview({
  onSelectTab,
  onOpenOptimize,
}: {
  onSelectTab: (tab: string) => void;
  onOpenOptimize: (filter?: { status?: string; opportunity?: string }) => void;
}) {
  const { activeSite } = useSites();
  const { integration: searchConsoleFallback, sync } = useSearchConsole();
  const insightsQuery = useSearchConsoleInsights();
  const insights = insightsQuery.data || null;
  const searchConsole = insights?.integration || searchConsoleFallback;
  const { integrations: indexingIntegrations, stats: indexingStats } = useIndexing();
  const { data: internalLinks } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.get<InternalLinkSettings>("/settings"),
  });

  const connectedIndexing = indexingIntegrations.filter((integration) => connectionReady(integration) && integration.provider !== "google").length;
  const internalStatus = internalLinks?.internal_link_status || (internalLinks?.internal_link_index ? "connected" : "disconnected");
  const internalPageCount = internalLinks?.internal_link_index?.pageCount || 0;
  const supportCards = (
    <SupportCards
      connectedIndexing={connectedIndexing}
      indexingStats={indexingStats}
      internalStatus={internalStatus}
      internalPageCount={internalPageCount}
      onSelectTab={onSelectTab}
    />
  );

  const handleSync = async () => {
    try {
      const result = await sync.mutateAsync();
      toast.success(`${result.synced} GSC rows synced`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    }
  };

  if (!activeSite) {
    return (
      <div className="space-y-6">
        <EmptyInsightState
          icon={Target}
          title="Select a site"
          description="Search insights need an active site before GSC, indexing, and internal-link data can be compared."
        />
      </div>
    );
  }

  if (insightsQuery.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-byword-border bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading Search Console insights
      </div>
    );
  }

  if (!searchConsole) {
    return (
      <div className="space-y-6">
        <EmptyInsightState
          icon={BarChart3}
          title="Connect Search Console"
          description="GSC powers the search pulse, opportunity map, and page/query trend analysis."
          action={<Button onClick={() => onSelectTab("optimize")}>Open Optimize <ArrowRight className="ml-1.5 h-4 w-4" /></Button>}
        />
        {supportCards}
      </div>
    );
  }

  if (!insights || insights.daily.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyInsightState
          icon={BarChart3}
          title="No synced Search Console rows yet"
          description="Sync GSC to build the search pulse, opportunity map, and page/query trend views."
          action={
            <Button onClick={handleSync} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-1.5 h-4 w-4" />}
              Sync now
            </Button>
          }
        />
        {supportCards}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <GrowthBriefing siteDomain={activeSite.domain} insights={insights} onOpenOptimize={onOpenOptimize} />
        <SearchGrowthDependencyBand
          items={[
            {
              label: "Search Console",
              value: connectionReady(searchConsole) ? "Connected" : displayConnectionStatus(searchConsole),
              detail: insights.provenance ? `Fetched: ${new Date(insights.provenance.fetched_at).toLocaleString()}` : "No performance data fetched yet.",
              state: connectionReady(searchConsole) ? "ready" : "warning",
              action: <Button variant="outline" size="sm" onClick={handleSync} disabled={sync.isPending}>{sync.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Refresh Search Console</Button>,
            },
            {
              label: "Indexing",
              value: connectedIndexing ? `${connectedIndexing} provider connected` : "Not connected",
              detail: connectedIndexing ? `${indexingStats.accepted} accepted, ${indexingStats.queued} queued, ${indexingStats.failed} failed.` : "Connect Bing Webmaster or IndexNow to submit edited pages.",
              state: connectedIndexing ? "ready" : "idle",
              action: <Button variant="outline" size="sm" onClick={() => onSelectTab("indexing")}>Open Indexing</Button>,
            },
            {
              label: "Internal Links",
              value: internalStatus === "connected" ? "Ready" : internalStatus,
              detail: internalStatus === "connected" ? `${internalPageCount} pages available for semantic links.` : "Build a sitemap index to support page-one pushes.",
              state: internalStatus === "connected" ? "ready" : internalStatus === "failed" ? "blocked" : "idle",
              action: <Button variant="outline" size="sm" onClick={() => onSelectTab("internal-links")}>Open Links</Button>,
            },
          ]}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
          <PerformanceCard insights={insights} />
          <OpportunityLedger insights={insights} onOpenOptimize={onOpenOptimize} />
        </div>

        <OptimizationQueue insights={insights} onOpenOptimize={onOpenOptimize} />

        <div className="grid gap-6 lg:grid-cols-2">
          <RankedBars title="Top pages by clicks" icon={Eye} rows={insights.topPages} color={INSIGHT_COLORS.performance} />
          <RankedBars title="Top queries by clicks" icon={MousePointerClick} rows={insights.topQueries} color={INSIGHT_COLORS.opportunity} />
        </div>
      </div>
    </TooltipProvider>
  );
}

function GrowthBriefing({
  siteDomain,
  insights,
  onOpenOptimize,
}: {
  siteDomain: string;
  insights: SearchConsoleInsights;
  onOpenOptimize: (filter?: { status?: string; opportunity?: string }) => void;
}) {
  const rangeLabel = insights.range.latestStart && insights.range.latestEnd
    ? `${safeFormatIsoDate(insights.range.latestStart, "MMM d")} - ${safeFormatIsoDate(insights.range.latestEnd, "MMM d")}`
    : "Latest sync";
  const nextMove = getNextMove(insights);

  return (
    <BywordCard>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="border-b border-byword-border p-5 lg:border-b-0 lg:border-r lg:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">Growth briefing</span>
                <Badge variant="secondary">{siteDomain}</Badge>
                {!insights.range.baselineStart && <Badge variant="outline">Baseline building</Badge>}
                <Badge variant="outline">{insights.provenance?.data_status === "preliminary" ? "Preliminary data" : `Complete through ${insights.provenance?.complete_through || "—"}`}</Badge>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-foreground">Search operations pulse</h2>
              <p className="mt-1 text-sm text-muted-foreground">{rangeLabel} from Google Search Console data.</p>
            </div>
            <div className="rounded-md border border-byword-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-mono uppercase">Window</span>
              <span className="ml-2 text-foreground">{rangeLabel}</span>
            </div>
          </div>
          {insights.provenance && (
            <div className="mt-5 grid gap-3 rounded-md border border-byword-border bg-muted/20 p-3 font-mono text-[11px] sm:grid-cols-2 xl:grid-cols-5">
              <ProvenanceItem label="Source" value="Google Search Console API" />
              <ProvenanceItem label="Range" value={`${insights.range.latestStart} – ${insights.range.latestEnd}`} />
              <ProvenanceItem label="Fetched" value={new Date(insights.provenance.fetched_at).toLocaleString()} />
              <ProvenanceItem label="Data" value={`Complete through ${insights.provenance.complete_through}`} />
              <ProvenanceItem label="Cache" value={insights.provenance.cache} />
            </div>
          )}
          <SignalStack insights={insights} />
        </div>
        <div className={cn("p-5 lg:p-6", nextMove.toneClass)}>
          <p className="font-mono text-[11px] font-bold uppercase opacity-75">Next best move</p>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground">{nextMove.title}</h3>
              <p className="mt-1 text-sm leading-6 opacity-80">{nextMove.detail}</p>
              {nextMove.row && (
                <p className="mt-2 truncate font-mono text-xs opacity-75">
                  {nextMove.row.query || compactUrl(nextMove.row.label)} · {formatCompactNumber(nextMove.row.impressions)} impressions · pos {nextMove.row.position.toFixed(1)}
                </p>
              )}
            </div>
            <Button size="sm" variant={nextMove.kind === "risk" ? "destructive" : "outline"} onClick={() => onOpenOptimize(nextMove.filter)}>
              {nextMove.action}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <MetricRail insights={insights} />
    </BywordCard>
  );
}

function SignalStack({ insights }: { insights: SearchConsoleInsights }) {
  const signals = [
    {
      label: "Attention",
      value: insights.segments.needsAttention,
      detail: "declining rows",
      tone: "border-[hsl(var(--status-error)/0.25)] bg-[hsl(var(--status-error)/0.07)] text-[hsl(var(--status-error))]",
    },
    {
      label: "CTR upside",
      value: insights.segments.ctrOpportunities,
      detail: "snippet tests",
      tone: "border-[hsl(var(--status-warning)/0.3)] bg-[hsl(var(--status-warning)/0.08)] text-[hsl(var(--status-warning))]",
    },
    {
      label: "Page-one push",
      value: insights.segments.strikingDistance,
      detail: "near wins",
      tone: "border-byword-blue/25 bg-byword-blue-soft text-byword-blue",
    },
  ];

  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-3">
      {signals.map((signal) => (
        <div key={signal.label} className={cn("rounded-md border px-3 py-2", signal.tone)}>
          <p className="font-mono text-[10px] font-bold uppercase opacity-80">{signal.label}</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold text-foreground">{formatCompactNumber(signal.value)}</span>
            <span className="truncate text-xs opacity-80">{signal.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricRail({ insights }: { insights: SearchConsoleInsights }) {
  return (
    <div className="grid divide-y divide-byword-border md:grid-cols-3 md:divide-x md:divide-y-0 xl:grid-cols-6">
      <PulseMetric label="Clicks" value={formatCompactNumber(insights.totals.clicks.value)} metric={insights.totals.clicks} />
      <PulseMetric label="Impressions" value={formatCompactNumber(insights.totals.impressions.value)} metric={insights.totals.impressions} />
      <PulseMetric
        label="CTR"
        value={formatPercent(insights.totals.ctr.value)}
        metric={insights.totals.ctr}
        percent
        tooltip="Clicks divided by impressions."
      />
      <PulseMetric
        label="Avg position"
        value={insights.totals.position.value ? insights.totals.position.value.toFixed(1) : "0"}
        metric={insights.totals.position}
        lowerIsBetter
        tooltip="Lower average position is better."
      />
      <PulseStatic label="Analyzed pages" value={formatCompactNumber(insights.opportunity_scope.page_count)} />
      <PulseStatic label="Analyzed queries" value={formatCompactNumber(insights.opportunity_scope.query_count)} />
    </div>
  );
}

function ProvenanceItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="uppercase text-muted-foreground">{label}</p><p className="mt-1 truncate text-foreground" title={value}>{value}</p></div>;
}

function PulseMetric({
  label,
  value,
  metric,
  percent,
  lowerIsBetter,
  tooltip,
}: {
  label: string;
  value: string;
  metric: MetricDelta;
  percent?: boolean;
  lowerIsBetter?: boolean;
  tooltip?: string;
}) {
  const delta = percent ? metric.delta : lowerIsBetter ? metric.delta : metric.deltaPercent;
  const trend = formatDelta(delta, { percent: percent || !lowerIsBetter, lowerIsBetter });
  return (
    <div className="min-w-0 p-5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold text-foreground">{value}</p>
      <TrendPill tone={trend.tone} label={trend.label} />
    </div>
  );
}

function PulseStatic({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">Latest window</p>
    </div>
  );
}

function PerformanceCard({ insights }: { insights: SearchConsoleInsights }) {
  const [lineMetric, setLineMetric] = useState<"clicks" | "ctr" | "position">("clicks");
  const lineLabel = lineMetric === "clicks" ? "Clicks" : lineMetric === "ctr" ? "CTR" : "Avg position";

  return (
    <BywordCard>
      <div className="flex flex-col gap-4 border-b border-byword-border px-6 py-5 md:flex-row md:items-center md:justify-between">
        <SectionTitle icon={BarChart3} title="Performance trend" description="Impressions set the backdrop; the line shows the selected performance signal." />
        <div className="inline-flex w-fit rounded-md border border-border bg-muted p-1">
          {[
            ["clicks", "Clicks"],
            ["ctr", "CTR"],
            ["position", "Position"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLineMetric(value as typeof lineMetric)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-calm",
                lineMetric === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <LegendDot color={INSIGHT_COLORS.performance} label="Impressions" />
          <LegendDot color={INSIGHT_COLORS.opportunity} label={lineLabel} />
        </div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={insights.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(value) => safeFormatIsoDate(value, "MMM d")} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="impressions" tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="line" orientation="right" tickFormatter={(value) => chartValueLabel(Number(value), lineMetric)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <ChartTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "0.75rem",
                }}
                labelFormatter={(value) => safeFormatIsoDate(value, "MMM d, yyyy")}
                formatter={(value, name) => [chartValueLabel(Number(value), String(name) as typeof lineMetric | "impressions"), chartName(String(name), lineMetric)]}
              />
              <Bar yAxisId="impressions" dataKey="impressions" fill="hsl(202 84% 38% / 0.18)" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="line"
                type="monotone"
                dataKey={lineMetric}
                stroke={INSIGHT_COLORS.opportunity}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--card))" }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </BywordCard>
  );
}

function OpportunityLedger({
  insights,
  onOpenOptimize,
}: {
  insights: SearchConsoleInsights;
  onOpenOptimize: (filter?: { status?: string; opportunity?: string }) => void;
}) {
  const max = Math.max(...insights.opportunityBubbles.map((bubble) => bubble.value), 1);
  const ledger = buildOpportunityLedger(insights).sort((a, b) => b.value - a.value);

  return (
    <BywordCard>
      <div className="border-b border-byword-border px-6 py-5">
        <SectionTitle icon={Target} title="Opportunity ledger" description="Ranked search upside with the first evidence row and the next tool to open." />
      </div>
      <div className="divide-y divide-byword-border">
        {ledger.map((item, index) => {
          const isEmpty = item.value <= 0;
          return (
          <button
            key={item.label}
            type="button"
            onClick={() => onOpenOptimize(item.filter)}
            className={cn(
              "group grid w-full gap-3 px-4 py-4 text-left transition-calm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byword-blue/40 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-5",
              isEmpty
                ? "text-muted-foreground hover:bg-muted/20"
                : "hover:bg-muted/20"
            )}
          >
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-md border font-mono text-xs font-bold", isEmpty ? "border-byword-border bg-muted/30" : item.toneClass)}>
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold uppercase opacity-75">{item.label}</span>
                <Badge variant="outline">{item.countLabel}</Badge>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem] sm:items-center">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", item.barClass)} style={{ width: isEmpty ? "0%" : `${Math.max(4, (item.value / max) * 100)}%` }} />
                </div>
                <p className={cn("font-mono text-sm font-semibold sm:text-right", isEmpty ? "text-muted-foreground" : "text-foreground")}>{formatCompactNumber(item.value)}</p>
              </div>
              <p className="mt-2 truncate text-sm opacity-80">{item.example}</p>
            </div>
            <span className={cn("inline-flex shrink-0 items-center gap-1 text-sm font-semibold sm:justify-end", isEmpty ? "text-muted-foreground" : "text-foreground")}>
                {item.action}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
          );
        })}
      </div>
    </BywordCard>
  );
}

function getNextMove(insights: SearchConsoleInsights) {
  const risk = insights.actionRows.protectTraffic[0];
  if (risk) {
    return {
      kind: "risk",
      title: "Protect the page/query losing momentum",
      detail: "A tracked search row is losing clicks or position versus baseline. Start here before chasing upside.",
      action: "Review page",
      row: risk,
      filter: { status: "needs_attention" },
      toneClass: "border-l-4 border-[hsl(var(--status-error))] bg-[hsl(var(--status-error)/0.08)]",
    };
  }

  const ctr = insights.actionRows.liftCtr[0];
  if (ctr) {
    return {
      kind: "ctr",
      title: "Rewrite the snippet that is under-clicking",
      detail: "There is enough impression volume to matter, but the current title/meta promise is not earning clicks.",
      action: "Lift CTR",
      row: ctr,
      filter: { opportunity: "low_ctr" },
      toneClass: "border-l-4 border-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning)/0.08)]",
    };
  }

  const lift = insights.actionRows.strikingDistance[0];
  if (lift) {
    return {
      kind: "lift",
      title: "Push a near-page-one query",
      detail: "This query is close enough to move with stronger topical coverage and internal links.",
      action: "Build links",
      row: lift,
      filter: { opportunity: "almost_ranking" },
      toneClass: "border-l-4 border-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning)/0.08)]",
    };
  }

  return {
    kind: "improved",
    title: "No urgent search issue in this window",
    detail: "Use Optimize to review tracked pages, or refresh Search Console after the next publishing batch.",
    action: "Open Optimize",
    row: null,
    filter: { status: "tracking" },
    toneClass: "border-l-4 border-[hsl(var(--status-success))] bg-[hsl(var(--status-success)/0.08)]",
  };
}

function buildOpportunityLedger(insights: SearchConsoleInsights) {
  const bubbleValue = (kind: SearchOpportunityBubble["kind"]) => insights.opportunityBubbles.find((bubble) => bubble.kind === kind)?.value || 0;
  const improvedExample = insights.topPages.find((row) => row.kind === "improved") || insights.topQueries.find((row) => row.kind === "improved");
  const items = [
    {
      label: "Traffic at risk",
      value: bubbleValue("risk"),
      countLabel: `${insights.segments.needsAttention} rows`,
      example: evidenceLabel(insights.actionRows.protectTraffic[0], "No declining rows in this window."),
      action: "Review page",
      filter: { status: "needs_attention" },
      toneClass: "border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.08)] hover:border-[hsl(var(--status-error)/0.55)]",
      barClass: "bg-[hsl(var(--status-error))]",
    },
    {
      label: "CTR upside",
      value: bubbleValue("ctr"),
      countLabel: `${insights.segments.ctrOpportunities} rows`,
      example: evidenceLabel(insights.actionRows.liftCtr[0], "No under-clicking high-impression rows."),
      action: "Rewrite snippet",
      filter: { opportunity: "low_ctr" },
      toneClass: "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.08)] hover:border-[hsl(var(--status-warning)/0.55)]",
      barClass: "bg-[hsl(var(--status-warning))]",
    },
    {
      label: "Striking distance",
      value: bubbleValue("lift"),
      countLabel: `${insights.segments.strikingDistance} rows`,
      example: evidenceLabel(insights.actionRows.strikingDistance[0], "No near-page-one query with enough volume."),
      action: "Build links",
      filter: { opportunity: "almost_ranking" },
      toneClass: "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.08)] hover:border-[hsl(var(--status-warning)/0.55)]",
      barClass: "bg-[hsl(var(--status-warning))]",
    },
    {
      label: "Improved wins",
      value: bubbleValue("improved"),
      countLabel: `${insights.segments.improved} rows`,
      example: evidenceLabel(improvedExample, "No confirmed wins yet."),
      action: "Review wins",
      filter: { status: "improved" },
      toneClass: "border-[hsl(var(--status-success)/0.35)] bg-[hsl(var(--status-success)/0.08)] hover:border-[hsl(var(--status-success)/0.55)]",
      barClass: "bg-[hsl(var(--status-success))]",
    },
  ];
  return items;
}

function evidenceLabel(row: SearchInsightRow | undefined, fallback: string) {
  if (!row) return fallback;
  const subject = row.query || compactUrl(row.label);
  return `${subject} · ${formatCompactNumber(row.impressions)} impressions · pos ${row.position.toFixed(1)}`;
}

function OptimizationQueue({
  insights,
  onOpenOptimize,
}: {
  insights: SearchConsoleInsights;
  onOpenOptimize: (filter?: { status?: string; opportunity?: string }) => void;
}) {
  const [filter, setFilter] = useState<"all" | "risk" | "ctr" | "lift">("all");
  const rows = useMemo(() => {
    const queue = [
      ...insights.actionRows.protectTraffic.map((row) => queueItem(row, "risk" as const, "Protect traffic", "Review page", { status: "needs_attention" })),
      ...insights.actionRows.liftCtr.map((row) => queueItem(row, "ctr" as const, "Lift CTR", "Rewrite snippet", { opportunity: "low_ctr" })),
      ...insights.actionRows.strikingDistance.map((row) => queueItem(row, "lift" as const, "Build page-one push", "Build links", { opportunity: "almost_ranking" })),
    ];
    return queue
      .filter((item) => filter === "all" || item.kind === filter)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [filter, insights.actionRows.liftCtr, insights.actionRows.protectTraffic, insights.actionRows.strikingDistance]);

  const counts = {
    all: insights.segments.needsAttention + insights.segments.ctrOpportunities + insights.segments.strikingDistance,
    risk: insights.segments.needsAttention,
    ctr: insights.segments.ctrOpportunities,
    lift: insights.segments.strikingDistance,
  };

  return (
    <BywordCard>
      <div className="flex flex-col gap-4 border-b border-byword-border px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <SectionTitle icon={AlertTriangle} title="Optimization queue" description="One ranked work list across risk, CTR, and page-one opportunities." />
        <div className="inline-flex w-fit flex-wrap rounded-md border border-border bg-muted p-1">
          {[
            ["all", "All"],
            ["risk", "Risk"],
            ["ctr", "CTR"],
            ["lift", "Page one"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value as typeof filter)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-calm",
                filter === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className="font-mono text-xs">({counts[value as keyof typeof counts]})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-byword-border">
        {rows.length ? rows.map((item) => {
          const trend = formatDelta(item.row.deltaClicks, {});
          return (
            <div key={`${item.kind}-${item.row.pageUrl}-${item.row.query}`} className={cn("grid gap-3 border-l-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_420px_auto] lg:items-center lg:px-6", queueTone(item.kind))}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.kind === "risk" ? "destructive" : "secondary"}>{item.label}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{queueEvidence(item.row, item.kind)}</span>
                </div>
                <p className="mt-2 truncate font-semibold text-foreground">{item.row.query || compactUrl(item.row.label)}</p>
                {item.row.pageUrl && <p className="mt-1 truncate text-sm text-muted-foreground">{compactUrl(item.row.pageUrl)}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <QueueMetric label="Clicks" value={formatCompactNumber(item.row.clicks)} />
                <QueueMetric label="Impr." value={formatCompactNumber(item.row.impressions)} />
                <QueueMetric label="CTR" value={formatPercent(item.row.ctr)} />
                <QueueMetric label="Pos." value={item.row.position.toFixed(1)} />
                <QueueMetric label="Delta" value={trend.label} />
              </div>
              <Button variant="outline" size="sm" onClick={() => onOpenOptimize(item.filter)}>
                {item.action}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          );
        }) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No actionable search signal in this window.</div>
        )}
      </div>
    </BywordCard>
  );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-byword-border bg-muted/20 px-2 py-1.5">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-foreground">{value}</p>
    </div>
  );
}

function queueTone(kind: "risk" | "ctr" | "lift") {
  if (kind === "risk") return "border-[hsl(var(--status-error))] bg-[hsl(var(--status-error)/0.035)]";
  if (kind === "ctr") return "border-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning)/0.035)]";
  return "border-byword-blue bg-byword-blue-soft/45";
}

function queueEvidence(row: SearchInsightRow, kind: "risk" | "ctr" | "lift") {
  if (kind === "risk") {
    const position = row.deltaPosition ? `, ${row.deltaPosition > 0 ? "+" : ""}${row.deltaPosition.toFixed(1)} pos.` : "";
    return `${row.deltaClicks > 0 ? "+" : ""}${row.deltaClicks || 0} clicks${position}`;
  }
  if (kind === "ctr") return `${formatCompactNumber(row.impressions)} impressions, ${formatPercent(row.ctr)} CTR`;
  return `pos ${row.position.toFixed(1)}, ${formatCompactNumber(row.impressions)} impressions`;
}

function queueItem(
  row: SearchInsightRow,
  kind: "risk" | "ctr" | "lift",
  label: string,
  action: string,
  filter: { status?: string; opportunity?: string },
) {
  const score = kind === "risk"
    ? Math.max(1, Math.abs(row.deltaClicks || 0) * 20 + Math.max(0, row.deltaPosition || 0) * 10 + row.impressions)
    : kind === "ctr"
      ? Math.max(1, row.impressions * Math.max(0.05, 0.12 - row.ctr))
      : Math.max(1, row.impressions / Math.max(1, row.position));
  return { row, kind, label, action, filter, score };
}

function RankedBars({ title, icon, rows, color }: { title: string; icon: LucideIcon; rows: SearchInsightRow[]; color: string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <BywordCard>
      <div className="border-b border-byword-border px-6 py-5">
        <SectionTitle icon={icon} title={title} description="Horizontal bars keep comparisons precise and fast to scan." />
      </div>
      <div className="space-y-4 p-6">
        {rows.length ? rows.map((row) => (
          <div key={row.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-foreground">{compactUrl(row.label)}</span>
              <span className="shrink-0 text-muted-foreground">{formatCompactNumber(row.clicks)} clicks</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(4, (row.value / max) * 100)}%`, backgroundColor: color }} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{formatCompactNumber(row.impressions)} impressions</span>
              <span>{formatPercent(row.ctr)} CTR</span>
              <span>pos {row.position.toFixed(1)}</span>
              <span className={cn("rounded px-1.5 py-0.5", rowTone[row.kind])}>{row.kind}</span>
            </div>
          </div>
        )) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No rows in this window.</p>
        )}
      </div>
    </BywordCard>
  );
}

function SupportCards({
  connectedIndexing,
  indexingStats,
  internalStatus,
  internalPageCount,
  onSelectTab,
}: {
  connectedIndexing: number;
  indexingStats: { accepted: number; failed: number; queued: number; skipped: number };
  internalStatus: string;
  internalPageCount: number;
  onSelectTab: (tab: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SupportCard
        icon={Send}
        title="URL Indexing"
        badge={connectedIndexing ? `${connectedIndexing} connected` : "Not connected"}
        description={connectedIndexing ? `${indexingStats.accepted} accepted, ${indexingStats.queued} queued, ${indexingStats.failed} failed.` : "Connect Bing Webmaster or IndexNow for normal articles."}
        action="Open Indexing"
        onClick={() => onSelectTab("indexing")}
      />
      <SupportCard
        icon={LinkIcon}
        title="Internal Links"
        badge={internalStatus === "connected" ? "Ready" : internalStatus}
        description={internalStatus === "connected" ? `${internalPageCount} pages available for semantic internal links.` : "Build a sitemap-based index for generated articles."}
        action="Open Internal Links"
        onClick={() => onSelectTab("internal-links")}
      />
    </div>
  );
}

function SupportCard({
  icon,
  title,
  badge,
  description,
  action,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  badge: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <BywordCard>
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start justify-between gap-4">
          <IconTile icon={icon} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground">{title}</h3>
              <Badge variant="secondary">{badge}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onClick} className="shrink-0">
          {action}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </BywordCard>
  );
}

function EmptyInsightState({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <BywordCard>
      <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <IconTile icon={icon} />
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </BywordCard>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <IconTile icon={Icon} />
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground hover:text-foreground" aria-label={text}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function TrendPill({ tone, label }: { tone: TrendTone; label: string }) {
  const Icon = tone === "good" ? TrendingUp : tone === "bad" ? TrendingDown : Minus;
  return (
    <div className={cn(
      "mt-2 inline-flex max-w-full items-center gap-1 rounded px-2 py-1 text-xs font-medium",
      tone === "good" && "bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))]",
      tone === "bad" && "bg-[hsl(var(--status-error)/0.12)] text-[hsl(var(--status-error))]",
      tone === "flat" && "bg-muted text-muted-foreground",
      tone === "pending" && "bg-muted text-muted-foreground",
    )}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function chartValueLabel(value: number, metric: "clicks" | "ctr" | "position" | "impressions") {
  if (metric === "ctr") return formatPercent(value);
  if (metric === "position") return value.toFixed(1);
  return formatCompactNumber(value);
}

function chartName(name: string, lineMetric: "clicks" | "ctr" | "position") {
  if (name === "impressions") return "Impressions";
  if (lineMetric === "ctr") return "CTR";
  if (lineMetric === "position") return "Avg position";
  return "Clicks";
}

function compactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

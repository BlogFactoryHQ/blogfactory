import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
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
  Send,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
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
import { IndexingPanel } from "@/pages/Indexing";
import { OptimizePanel } from "@/pages/Optimize";
import { api } from "@/lib/api";
import { bucketBubbleSize, formatCompactNumber, formatDelta, formatPercent, type TrendTone } from "@/lib/search-insights";
import { cn } from "@/lib/utils";

const tabs = new Set(["overview", "optimize", "indexing", "internal-links"]);

interface InternalLinkSettings {
  internal_link_status?: string | null;
  internal_link_index?: { pageCount?: number } | null;
}

const INSIGHT_COLORS = {
  performance: "#2EA7C9",
  opportunity: "#D9A94E",
  risk: "#E4513D",
  improved: "#26B36B",
};

const bubbleTone: Record<SearchOpportunityBubble["kind"], string> = {
  risk: "border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.12)] text-[hsl(var(--status-error))]",
  ctr: "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
  lift: "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
  improved: "border-[hsl(var(--status-success)/0.35)] bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))]",
};

const rowTone: Record<SearchInsightRow["kind"], string> = {
  risk: "bg-[hsl(var(--status-error)/0.12)] text-[hsl(var(--status-error))]",
  ctr: "bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
  lift: "bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
  improved: "bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))]",
  watch: "bg-secondary text-secondary-foreground",
};

export default function SearchGrowth() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.has(params.get("tab") || "") ? params.get("tab")! : "overview";
  const setTab = (value: string) => setParams(value === "overview" ? {} : { tab: value });

  useEffect(() => {
    const result = params.get("gsc");
    if (!result) return;
    if (result === "connected") toast.success("Search Console connected");
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
          <TabsTrigger value="indexing">Indexing</TabsTrigger>
          <TabsTrigger value="internal-links">Internal Links</TabsTrigger>
        </TabsList>

        {tab === "overview" && (
          <TabsContent value="overview" className="mt-0">
            <SearchGrowthOverview onSelectTab={setTab} />
          </TabsContent>
        )}
        {tab === "optimize" && (
          <TabsContent value="optimize" className="mt-0">
            <OptimizePanel />
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

function SearchGrowthOverview({ onSelectTab }: { onSelectTab: (tab: string) => void }) {
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

  const connectedIndexing = indexingIntegrations.filter((integration) => integration.status === "connected").length;
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
        <SearchPulseCard siteDomain={activeSite.domain} insights={insights} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
          <PerformanceCard insights={insights} />
          <OpportunityMap insights={insights} />
        </div>

        <ActionLanes insights={insights} onSelectTab={onSelectTab} />

        <div className="grid gap-6 lg:grid-cols-2">
          <RankedBars title="Top pages by clicks" icon={Eye} rows={insights.topPages} color={INSIGHT_COLORS.performance} />
          <RankedBars title="Top queries by clicks" icon={MousePointerClick} rows={insights.topQueries} color={INSIGHT_COLORS.opportunity} />
        </div>

        {supportCards}
      </div>
    </TooltipProvider>
  );
}

function SearchPulseCard({ siteDomain, insights }: { siteDomain: string; insights: SearchConsoleInsights }) {
  const rangeLabel = insights.range.latestStart && insights.range.latestEnd
    ? `${format(parseISO(insights.range.latestStart), "MMM d")} - ${format(parseISO(insights.range.latestEnd), "MMM d")}`
    : "Latest sync";

  return (
    <BywordCard>
      <div className="flex flex-col gap-4 border-b border-byword-border px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Search pulse</h2>
            <Badge variant="secondary">{siteDomain}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{rangeLabel} from synced Google Search Console data.</p>
        </div>
        {!insights.range.baselineStart && (
          <Badge variant="outline" className="w-fit">Baseline building</Badge>
        )}
      </div>
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
        <PulseStatic label="Tracked pages" value={formatCompactNumber(insights.totals.pageCount)} />
        <PulseStatic label="Tracked queries" value={formatCompactNumber(insights.totals.queryCount)} />
      </div>
    </BywordCard>
  );
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
        <div className="inline-flex w-fit rounded-md bg-secondary p-1">
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
              <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(String(value)), "MMM d")} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="impressions" tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="line" orientation="right" tickFormatter={(value) => chartValueLabel(Number(value), lineMetric)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <ChartTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "0.75rem",
                }}
                labelFormatter={(value) => format(parseISO(String(value)), "MMM d, yyyy")}
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

function OpportunityMap({ insights }: { insights: SearchConsoleInsights }) {
  const bubbles = useMemo(() => {
    const max = Math.max(...insights.opportunityBubbles.map((bubble) => bubble.value), 1);
    return insights.opportunityBubbles
      .map((bubble) => ({ ...bubble, size: bucketBubbleSize(bubble.value, max) }))
      .sort((a, b) => b.value - a.value);
  }, [insights.opportunityBubbles]);

  return (
    <BywordCard>
      <div className="border-b border-byword-border px-6 py-5">
        <SectionTitle icon={Target} title="Opportunity map" description="Fixed bubble sizes keep small signals readable while labels preserve the numbers." />
      </div>
      <div className="grid gap-6 p-6">
        <div className="flex min-h-[220px] flex-wrap items-center justify-center gap-4">
          {bubbles.map((bubble) => (
            <div
              key={bubble.label}
              className={cn(
                "flex shrink-0 flex-col items-center justify-center rounded-full border text-center shadow-sm",
                bubbleTone[bubble.kind],
                bubble.size === "lg" && "h-36 w-36",
                bubble.size === "md" && "h-28 w-28",
                bubble.size === "sm" && "h-20 w-20",
              )}
            >
              <span className="text-lg font-semibold">{formatCompactNumber(bubble.value)}</span>
              <span className="mt-1 max-w-[92px] px-2 text-[11px] font-medium leading-4">{bubble.label}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {bubbles.map((bubble) => (
            <div key={bubble.label} className="flex items-center justify-between gap-3 rounded-md border border-byword-border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", bubbleDotClass(bubble.kind))} />
                <span className="truncate text-sm font-medium text-foreground">{bubble.label}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{formatCompactNumber(bubble.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </BywordCard>
  );
}

function ActionLanes({ insights, onSelectTab }: { insights: SearchConsoleInsights; onSelectTab: (tab: string) => void }) {
  const lanes = [
    {
      title: "Protect traffic",
      description: "Click drops or position losses.",
      icon: AlertTriangle,
      count: insights.segments.needsAttention,
      kind: "risk" as const,
      rows: insights.actionRows.protectTraffic,
      tooltip: "Needs attention means a page/query lost clicks or ranking versus baseline.",
    },
    {
      title: "Lift CTR",
      description: "High impressions with weak click-through.",
      icon: MousePointerClick,
      count: insights.segments.ctrOpportunities,
      kind: "ctr" as const,
      rows: insights.actionRows.liftCtr,
      tooltip: "CTR opportunities have meaningful impressions but trail the site average CTR.",
    },
    {
      title: "Push striking distance",
      description: "Queries near page-one wins.",
      icon: TrendingUp,
      count: insights.segments.strikingDistance,
      kind: "lift" as const,
      rows: insights.actionRows.strikingDistance,
      tooltip: "Striking distance is average position 4-15 with enough impressions to matter.",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {lanes.map((lane) => (
        <BywordCard key={lane.title}>
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <IconTile icon={lane.icon} className={cn(lane.kind === "risk" && "border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.12)] text-[hsl(var(--status-error))]", lane.kind !== "risk" && "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]")} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-foreground">{lane.title}</h3>
                    <InfoTip text={lane.tooltip} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{lane.description}</p>
                </div>
              </div>
              <Badge variant="secondary">{lane.count}</Badge>
            </div>
            <div className="space-y-2">
              {lane.rows.length ? lane.rows.slice(0, 3).map((row) => (
                <MiniInsightRow key={`${lane.title}-${row.label}`} row={row} />
              )) : (
                <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">No active signal in this window.</p>
              )}
            </div>
            <Button variant="outline" className="w-full" onClick={() => onSelectTab("optimize")}>
              Open Optimize <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </BywordCard>
      ))}
    </div>
  );
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
            <div className="h-2 rounded-full bg-secondary">
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
        description={connectedIndexing ? `${indexingStats.accepted} accepted, ${indexingStats.queued} queued, ${indexingStats.failed} failed.` : "Connect IndexNow for normal articles."}
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
      tone === "flat" && "bg-secondary text-secondary-foreground",
      tone === "pending" && "bg-secondary text-muted-foreground",
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

function MiniInsightRow({ row }: { row: SearchInsightRow }) {
  const trend = formatDelta(row.deltaClicks, {});
  return (
    <div className="rounded-md border border-byword-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{row.query || compactUrl(row.label)}</span>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium", rowTone[row.kind])}>{row.kind}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {row.pageUrl && <span className="max-w-full truncate">{compactUrl(row.pageUrl)}</span>}
        <span>{formatCompactNumber(row.clicks)} clicks</span>
        <span>{formatCompactNumber(row.impressions)} impressions</span>
        <span>{trend.label}</span>
      </div>
    </div>
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

function bubbleDotClass(kind: SearchOpportunityBubble["kind"]) {
  if (kind === "risk") return "bg-[hsl(var(--status-error))]";
  if (kind === "improved") return "bg-[hsl(var(--status-success))]";
  return "bg-[hsl(var(--status-warning))]";
}

function compactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

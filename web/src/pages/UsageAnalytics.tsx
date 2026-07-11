import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageCostsSection } from "@/components/usage/ImageCostsSection";
import {
  DollarSign,
  Zap,
  Clock,
  Hash,
  Loader2,
  BarChart3,
  TrendingUp,
  Image,
  AlertTriangle,
} from "lucide-react";
import { useUsageAnalytics } from "@/hooks/useUsageAnalytics";
import { UsageTokenChart } from "@/components/usage/UsageTokenChart";
import { ModelBreakdownTable } from "@/components/usage/ModelBreakdownTable";
import { BudgetCard } from "@/components/usage/BudgetCard";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { safeFormatDate, safeFormatIsoDate } from "@/lib/date-format";
import {
  formatCompactCurrency,
  formatCompactNumber,
  formatDuration,
  safePercent,
  semanticToneClass,
  type SemanticTone,
} from "@/lib/search-insights";

export default function UsageAnalytics() {
  const [days, setDays] = useState(30);
  const { summary, modelBreakdown, dailyUsage, isLoading, error, costs, openRouterUsage } = useUsageAnalytics(days);
  const currentMonthSpend = costs?.monthToDateSpend || 0;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(amount);

  const formatNumber = (num: number) => new Intl.NumberFormat("en-US").format(Math.round(num));
  const openRouterData = openRouterUsage?.data || openRouterUsage || {};
  const openRouterRemaining = Number(openRouterData.limit_remaining ?? openRouterData.limitRemaining ?? openRouterData.credits ?? 0);
  const recentCalls = costs?.recentCalls || [];
  const imageSummary = costs?.imageSummary;

  const dailyCostBreakdown = useMemo(() => {
    return dailyUsage.map((day) => {
      const textCost = day.text_cost ?? Math.max(0, day.cost - (day.image_cost || 0));
      const imageCost = day.image_cost ?? Math.max(0, day.cost - textCost);
      return {
        date: day.date,
        textCost,
        imageCost,
        total: textCost + imageCost,
      };
    });
  }, [dailyUsage]);

  const openRouterCapacity = openRouterRemaining > 0 ? currentMonthSpend + openRouterRemaining : 0;
  const openRouterUsedPercent = safePercent(currentMonthSpend, openRouterCapacity);

  const pulseMetrics = [
    {
      title: "Total Cost",
      value: formatCompactCurrency(summary.totalCost),
      icon: DollarSign,
      description: `Last ${days} days`,
      tone: "performance" as SemanticTone,
    },
    {
      title: "Text Cost",
      value: formatCompactCurrency(summary.textCost),
      icon: Hash,
      description: `${formatCompactNumber(summary.totalTokens)} tokens`,
      tone: "performance" as SemanticTone,
    },
    {
      title: "Image Cost",
      value: formatCompactCurrency(summary.imageCost),
      icon: Image,
      description: imageSummary ? `${imageSummary.ai} AI · ${imageSummary.stock} stock` : "Generated images",
      tone: summary.imageCost > summary.textCost ? "opportunity" as SemanticTone : "neutral" as SemanticTone,
    },
    {
      title: "Avg / Post",
      value: summary.avgCostPerPost ? formatCompactCurrency(summary.avgCostPerPost) : "—",
      icon: Clock,
      description: `${summary.postCount || 0} attributed posts`,
      tone: "neutral" as SemanticTone,
    },
    {
      title: "Failed Calls",
      value: formatCompactNumber(summary.failedCalls),
      icon: AlertTriangle,
      description: `${formatCompactNumber(summary.totalRequests)} requests`,
      tone: summary.failedCalls > 0 ? "risk" as SemanticTone : "success" as SemanticTone,
    },
    {
      title: "Credits Left",
      value: openRouterRemaining ? formatCompactCurrency(openRouterRemaining) : "—",
      icon: Zap,
      description: openRouterRemaining ? "OpenRouter balance" : "Not reported",
      tone: openRouterRemaining > 0 ? "success" as SemanticTone : "neutral" as SemanticTone,
    },
  ];

  const costDrivers = useMemo(() => {
    const expensive = modelBreakdown[0];
    const slow = [...modelBreakdown].filter((row) => row.avg_latency).sort((a, b) => b.avg_latency - a.avg_latency)[0];
    const imageShare = safePercent(summary.imageCost, summary.totalCost);
    return [
      {
        title: "Expensive models",
        value: expensive ? formatCompactCurrency(expensive.total_cost) : "—",
        label: expensive?.model_id?.split("/").pop() || "No model spend yet",
        detail: expensive ? `${formatCompactNumber(expensive.requests)} calls` : "Generate content to build the ranking.",
        tone: expensive?.total_cost ? "opportunity" as SemanticTone : "neutral" as SemanticTone,
      },
      {
        title: "High latency",
        value: slow ? formatDuration(slow.avg_latency) : "—",
        label: slow?.model_id?.split("/").pop() || "No latency signal yet",
        detail: slow ? "Slowest model by average response time." : "Latency appears after provider calls.",
        tone: slow?.avg_latency && slow.avg_latency > 15_000 ? "risk" as SemanticTone : "neutral" as SemanticTone,
      },
      {
        title: "Image spend",
        value: `${Math.round(imageShare)}%`,
        label: imageSummary ? `${imageSummary.cover} cover · ${imageSummary.inline} inline` : "Images not used yet",
        detail: `${formatCompactCurrency(summary.imageCost)} of total spend.`,
        tone: imageShare > 35 ? "opportunity" as SemanticTone : "success" as SemanticTone,
      },
      {
        title: "Failed / retried calls",
        value: formatCompactNumber(summary.failedCalls + (imageSummary?.retries || 0)),
        label: summary.failedCalls ? "Provider calls need review" : "Stable generation",
        detail: imageSummary ? `${imageSummary.retries} image retries` : "No image retry data.",
        tone: summary.failedCalls || imageSummary?.failed ? "risk" as SemanticTone : "success" as SemanticTone,
      },
    ];
  }, [imageSummary, modelBreakdown, summary.failedCalls, summary.imageCost, summary.totalCost]);

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Usage Analytics"
        description="Track your AI generation costs, tokens, and model performance."
      >
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {error ? (
        <BywordCard className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <p className="font-medium text-foreground">Usage analytics could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Try again shortly."}</p>
          </div>
        </BywordCard>
      ) : isLoading ? (
        <BywordCard className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </BywordCard>
      ) : (
        <>
          <BywordCard className="mb-8">
            <SectionHeader
              icon={DollarSign}
              title="Spend pulse"
              description="Cost, reliability, and remaining credits for the selected window."
              action={
                <div className="min-w-[220px] rounded-md border border-byword-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Month-to-date</span>
                    <span>{openRouterCapacity ? `${Math.round(openRouterUsedPercent)}% of visible credits` : "Budget tracked below"}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-byword-blue" style={{ width: `${openRouterUsedPercent}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-medium">{formatCompactCurrency(currentMonthSpend)} spent this month</p>
                </div>
              }
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:p-6 xl:grid-cols-6">
              {pulseMetrics.map((stat) => (
                <div key={stat.title} className={cn("rounded-md border p-4", semanticToneClass(stat.tone))}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase opacity-75">{stat.title}</p>
                    <stat.icon className="h-4 w-4 opacity-70" />
                  </div>
                  <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                  <p className="mt-1 text-xs opacity-75">{stat.description}</p>
                </div>
              ))}
            </div>
          </BywordCard>

          <div className="mb-8 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <BywordCard>
              <SectionHeader icon={BarChart3} title="Daily cost stack" description="Text and image spend by day." />
              <div className="p-4 sm:p-5 lg:p-6">
                <SpendStackChart data={dailyCostBreakdown} />
              </div>
            </BywordCard>

            <BywordCard>
              <SectionHeader icon={TrendingUp} title="Cost drivers" description="Models and retries most likely to move spend." />
              <div className="grid gap-3 p-4 sm:p-5 lg:p-6">
                {costDrivers.map((driver) => (
                  <div key={driver.title} className={cn("rounded-md border p-3", semanticToneClass(driver.tone))}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase opacity-75">{driver.title}</p>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">{driver.label}</p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold text-foreground">{driver.value}</p>
                    </div>
                    <p className="mt-2 text-xs opacity-75">{driver.detail}</p>
                  </div>
                ))}
              </div>
            </BywordCard>
          </div>

          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <BywordCard>
              <SectionHeader icon={Zap} title="OpenRouter key" />
              <div className="grid gap-3 p-4 text-sm sm:p-5">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-medium">{openRouterRemaining ? formatCurrency(openRouterRemaining) : "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Daily usage</span>
                  <span className="font-medium">{formatCurrency(Number(openRouterData.usage_daily || 0))}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Monthly usage</span>
                  <span className="font-medium">{formatCurrency(Number(openRouterData.usage_monthly || 0))}</span>
                </div>
              </div>
            </BywordCard>
            <BywordCard>
              <SectionHeader icon={Hash} title="Calls" />
              <div className="grid gap-3 p-4 text-sm sm:p-5">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Requests</span><span className="font-medium">{formatNumber(summary.totalRequests)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Failed</span><span className="font-medium">{formatNumber(summary.failedCalls)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Avg latency</span><span className="font-medium">{summary.avgLatency ? `${formatNumber(summary.avgLatency)}ms` : "—"}</span></div>
              </div>
            </BywordCard>
            <BywordCard>
              <SectionHeader icon={Image} title="Images" />
              <div className="grid gap-3 p-4 text-sm sm:p-5">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Cover / inline</span><span className="font-medium">{imageSummary ? `${imageSummary.cover} / ${imageSummary.inline}` : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Queued / failed</span><span className="font-medium">{imageSummary ? `${imageSummary.queued} / ${imageSummary.failed}` : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Retries</span><span className="font-medium">{imageSummary ? formatNumber(imageSummary.retries) : "—"}</span></div>
              </div>
            </BywordCard>
          </div>

          <Tabs defaultValue="tokens" className="mb-8">
            <TabsList>
              <TabsTrigger value="tokens" className="gap-1.5">
                <Zap className="h-4 w-4" />
                Tokens Over Time
              </TabsTrigger>
            </TabsList>
            <TabsContent value="tokens" className="mt-4">
              <BywordCard>
                <SectionHeader icon={Zap} title="Daily token usage" />
                <div className="p-4 sm:p-5 lg:p-6">
                  <UsageTokenChart data={dailyUsage} />
                </div>
              </BywordCard>
            </TabsContent>
          </Tabs>

          {/* Budget Controls */}
          <div className="mb-8">
            <BudgetCard currentMonthSpend={currentMonthSpend} />
          </div>

          {/* Model Breakdown */}
          <BywordCard>
            <SectionHeader icon={BarChart3} title="Model breakdown" />
            <div className="p-4 sm:p-5 lg:p-6">
              <ModelBreakdownTable data={modelBreakdown} />
            </div>
          </BywordCard>

          <BywordCard className="mt-8">
            <SectionHeader icon={Clock} title="Recent provider calls" description="Latest API activity in this reporting window." />
            <div className="overflow-x-auto p-4 sm:p-5 lg:p-6">
              {recentCalls.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Provider / Model</TableHead>
                      <TableHead>Post / Job</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCalls.slice(0, 25).map((call) => (
                      <TableRow key={call.id}>
                        <TableCell className="whitespace-nowrap text-xs">{safeFormatDate(call.created_at, "MMM d HH:mm")}</TableCell>
                        <TableCell>{call.usage_type}</TableCell>
                        <TableCell>
                          <div className="text-sm">{call.provider}</div>
                          <div className="max-w-[280px] truncate font-mono text-xs text-muted-foreground">{call.model_id}</div>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">{call.post_id || call.session_id || "—"}</TableCell>
                        <TableCell className="text-right">{formatNumber(call.total_tokens || 0)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(call.cost || 0))}</TableCell>
                        <TableCell>{call.status || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No provider calls in this range.</p>
              )}
            </div>
          </BywordCard>

          {/* Image Generation Costs */}
          <div className="mt-8">
            <ImageCostsSection breakdown={costs?.imageBreakdown || []} days={days} />
          </div>
        </>
      )}
    </BywordPageShell>
  );
}

function SpendStackChart({ data }: { data: Array<{ date: string; textCost: number; imageCost: number; total: number }> }) {
  if (!data.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No usage data for this period.
      </div>
    );
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tickFormatter={(val) => safeFormatIsoDate(val, "MMM d")}
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(val) => `$${Number(val).toFixed(2)}`}
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
            }}
            labelFormatter={(val) => safeFormatIsoDate(val, "MMM d, yyyy")}
            formatter={(value: number, name: string) => [
              formatCompactCurrency(value),
              name === "textCost" ? "Text cost" : "Image cost",
            ]}
          />
          <Bar dataKey="textCost" stackId="cost" fill="#1481c0" radius={[0, 0, 3, 3]} />
          <Bar dataKey="imageCost" stackId="cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1481c0]" /> Text</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Images</span>
      </div>
    </div>
  );
}

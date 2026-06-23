import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { usageDayKey, useUsageAnalytics } from "@/hooks/useUsageAnalytics";
import { UsageCostChart } from "@/components/usage/UsageCostChart";
import { UsageTokenChart } from "@/components/usage/UsageTokenChart";
import { ModelBreakdownTable } from "@/components/usage/ModelBreakdownTable";
import { BudgetCard } from "@/components/usage/BudgetCard";
import { startOfMonth, format } from "date-fns";

export default function UsageAnalytics() {
  const [days, setDays] = useState(30);
  const { summary, modelBreakdown, dailyUsage, isLoading, logs, costs, openRouterUsage } = useUsageAnalytics(days);

  // Calculate current month spend from logs
  const currentMonthSpend = useMemo(() => {
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    return logs
      .filter((l) => {
        const date = usageDayKey(l.created_at);
        return date && date >= monthStart;
      })
      .reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
  }, [logs]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(amount);

  const formatNumber = (num: number) => new Intl.NumberFormat("en-US").format(Math.round(num));
  const openRouterData = (openRouterUsage as any)?.data || openRouterUsage || {};
  const openRouterRemaining = Number(openRouterData.limit_remaining ?? openRouterData.limitRemaining ?? openRouterData.credits ?? 0);
  const recentCalls = costs?.recentCalls || [];
  const imageSummary = costs?.imageSummary;

  const statCards = [
    {
      title: "Total Cost",
      value: formatCurrency(summary.totalCost),
      icon: DollarSign,
      description: `Last ${days} days`,
    },
    {
      title: "Text Cost",
      value: formatCurrency(summary.textCost),
      icon: Hash,
      description: `${formatNumber(summary.totalTokens)} tokens`,
    },
    {
      title: "Image Cost",
      value: formatCurrency(summary.imageCost),
      icon: Image,
      description: imageSummary ? `${imageSummary.ai} AI · ${imageSummary.stock} stock` : "Generated images",
    },
    {
      title: "Avg / Post",
      value: summary.avgCostPerPost ? formatCurrency(summary.avgCostPerPost) : "—",
      icon: Clock,
      description: `${summary.postCount || 0} attributed posts`,
    },
  ];

  return (
    <div className="p-8 max-w-7xl">
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

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statCards.map((stat) => (
              <Card key={stat.title}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                      <stat.icon className="h-5 w-5 text-accent-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 mb-8 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">OpenRouter Key</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Calls</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Requests</span><span className="font-medium">{formatNumber(summary.totalRequests)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Failed</span><span className="font-medium">{formatNumber(summary.failedCalls)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Avg latency</span><span className="font-medium">{summary.avgLatency ? `${formatNumber(summary.avgLatency)}ms` : "—"}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Images</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Cover / inline</span><span className="font-medium">{imageSummary ? `${imageSummary.cover} / ${imageSummary.inline}` : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Queued / failed</span><span className="font-medium">{imageSummary ? `${imageSummary.queued} / ${imageSummary.failed}` : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Retries</span><span className="font-medium">{imageSummary ? formatNumber(imageSummary.retries) : "—"}</span></div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <Tabs defaultValue="cost" className="mb-8">
            <TabsList>
              <TabsTrigger value="cost" className="gap-1.5">
                <TrendingUp className="h-4 w-4" />
                Cost Over Time
              </TabsTrigger>
              <TabsTrigger value="tokens" className="gap-1.5">
                <Zap className="h-4 w-4" />
                Tokens Over Time
              </TabsTrigger>
            </TabsList>
            <TabsContent value="cost" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Daily Cost
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <UsageCostChart data={dailyUsage} />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tokens" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Daily Token Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <UsageTokenChart data={dailyUsage} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Budget Controls */}
          <div className="mb-8">
            <BudgetCard currentMonthSpend={currentMonthSpend} />
          </div>

          {/* Model Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Model Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ModelBreakdownTable data={modelBreakdown} />
            </CardContent>
          </Card>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-base">Recent Provider Calls</CardTitle>
            </CardHeader>
            <CardContent>
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
                        <TableCell className="whitespace-nowrap text-xs">{call.created_at ? format(new Date(call.created_at), "MMM d HH:mm") : "—"}</TableCell>
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
            </CardContent>
          </Card>

          {/* Image Generation Costs */}
          <div className="mt-8">
            <ImageCostsSection logs={logs} days={days} />
          </div>
        </>
      )}
    </div>
  );
}

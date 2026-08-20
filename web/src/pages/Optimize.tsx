import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SearchConsoleIntegration, SearchConsoleProperty, useSearchConsole, useSearchConsoleToolkit } from "@/hooks/useSearchConsole";
import {
  ContentSnapshot,
  OptimizeAnalysis,
  OptimizeOpportunity,
  OptimizePage,
  OptimizePageDetail,
  OptimizePageInsight,
  OptimizeStatus,
  useOptimize,
  useOptimizeInsights,
} from "@/hooks/useOptimize";
import { useIndexing } from "@/hooks/useIndexing";
import { useSites } from "@/hooks/useSites";
import { connectionReady, displayConnectionStatus } from "@/lib/credential-status";
import { cn } from "@/lib/utils";
import { toggleInspectionSelection } from "@/lib/search-console";

const statuses: Array<{ value: OptimizeStatus; label: string }> = [
  { value: "needs_attention", label: "Needs Attention" },
  { value: "tracking", label: "Tracking" },
  { value: "improved", label: "Improved" },
];

const opportunityFilters: Array<{ value: OptimizeOpportunity; label: string }> = [
  { value: "all", label: "All opportunities" },
  { value: "growing", label: "Growing" },
  { value: "low_ctr", label: "Low CTR" },
  { value: "almost_ranking", label: "Almost ranking" },
  { value: "page_two", label: "Page two" },
  { value: "zero_clicks", label: "Zero clicks" },
  { value: "weak_focus", label: "Weak focus" },
];

const opportunityMeta: Record<string, { label: string; action: string; tone: string; dot: string; rail: string; row: string }> = {
  needs_attention: {
    label: "Needs attention",
    action: "Review decline",
    tone: "border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.10)] text-[hsl(var(--status-error))]",
    dot: "bg-[hsl(var(--status-error))]",
    rail: "bg-[hsl(var(--status-error))]",
    row: "bg-[hsl(var(--status-error)/0.04)]",
  },
  wrong_page_risk: {
    label: "Wrong page risk",
    action: "Check intent",
    tone: "border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.10)] text-[hsl(var(--status-error))]",
    dot: "bg-[hsl(var(--status-error))]",
    rail: "bg-[hsl(var(--status-error))]",
    row: "bg-[hsl(var(--status-error)/0.04)]",
  },
  low_ctr: {
    label: "Low CTR",
    action: "Rewrite snippet",
    tone: "border-[hsl(var(--status-warning)/0.4)] bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
    dot: "bg-[hsl(var(--status-warning))]",
    rail: "bg-[hsl(var(--status-warning))]",
    row: "bg-[hsl(var(--status-warning)/0.04)]",
  },
  zero_clicks: {
    label: "Zero clicks",
    action: "Improve snippet",
    tone: "border-[hsl(var(--status-warning)/0.4)] bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]",
    dot: "bg-[hsl(var(--status-warning))]",
    rail: "bg-[hsl(var(--status-warning))]",
    row: "bg-[hsl(var(--status-warning)/0.04)]",
  },
  almost_ranking: {
    label: "Almost ranking",
    action: "Build links",
    tone: "border-byword-blue/30 bg-byword-blue-soft text-byword-blue",
    dot: "bg-byword-blue",
    rail: "bg-byword-blue",
    row: "bg-byword-blue-soft/45",
  },
  page_two: {
    label: "Page two",
    action: "Expand section",
    tone: "border-byword-blue/30 bg-byword-blue-soft text-byword-blue",
    dot: "bg-byword-blue",
    rail: "bg-byword-blue",
    row: "bg-byword-blue-soft/45",
  },
  weak_focus: {
    label: "Weak focus",
    action: "Tighten intent",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
    dot: "bg-slate-500",
    rail: "bg-slate-500",
    row: "bg-slate-50",
  },
  growing: {
    label: "Growing",
    action: "Reinforce win",
    tone: "border-[hsl(var(--status-success)/0.35)] bg-[hsl(var(--status-success)/0.10)] text-[hsl(var(--status-success))]",
    dot: "bg-[hsl(var(--status-success))]",
    rail: "bg-[hsl(var(--status-success))]",
    row: "bg-[hsl(var(--status-success)/0.04)]",
  },
  tracking: {
    label: "Tracking",
    action: "Track",
    tone: "border-byword-border bg-muted/40 text-muted-foreground",
    dot: "bg-muted-foreground",
    rail: "bg-border",
    row: "",
  },
};

const searchConsoleOAuthSteps = [
  "Use the Google account that owns or can read this Search Console property.",
  "Click Continue with Google and approve read-only Search Console access.",
  "If access fails, open Search Console Settings > Users and permissions and add that Google account.",
];

const searchConsoleServiceAccountSteps = [
  "Use this only when you cannot connect a personal Google account.",
  "In Google Cloud, create a service account key and download it as JSON.",
  "In Search Console, add the service account client_email as a user for this property, then paste the whole JSON file here.",
];

export function OptimizePanel() {
  const [params, setParams] = useSearchParams();
  const { activeSite } = useSites();
  const { integration, stats, isLoading, saveIntegration, testIntegration, deleteIntegration, sync, startOAuth, properties, selectProperty } = useSearchConsole();
  const { inspectBatch } = useSearchConsoleToolkit();
  const { pages, isLoading: isLoadingPages, analyze, loadAnalyses, markOptimized } = useOptimize("all");
  const { integrations: indexingIntegrations, submitUrls } = useIndexing();
  const initialStatus = (params.get("status") as OptimizeStatus | null) || "needs_attention";
  const initialOpportunity = (params.get("opportunity") as OptimizeOpportunity | null) || "all";
  const [status, setStatus] = useState<OptimizeStatus>(statuses.some((item) => item.value === initialStatus) ? initialStatus : "needs_attention");
  const [showOpportunities, setShowOpportunities] = useState(Boolean(params.get("opportunity")));
  const [opportunity, setOpportunity] = useState<OptimizeOpportunity>(opportunityFilters.some((item) => item.value === initialOpportunity) ? initialOpportunity : "all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [analysis, setAnalysis] = useState<OptimizeAnalysis | null>(null);
  const [pageDetail, setPageDetail] = useState<OptimizePageDetail | null>(null);
  const [analysisDefaults, setAnalysisDefaults] = useState({ pageUrl: "", targetQuery: "" });
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const { summary, pageInsights, isLoadingPageInsights, loadPageDetail, invalidateInsights } = useOptimizeInsights(
    showOpportunities ? "all" : status,
    showOpportunities ? opportunity : "all",
  );

  const statusCounts = useMemo(() => ({
    needs_attention: pages.filter((page) => page.status === "needs_attention").length,
    tracking: pages.filter((page) => page.status === "tracking").length,
    improved: pages.filter((page) => page.status === "improved").length,
  }), [pages]);

  const visiblePages = useMemo(() => pages.filter((page) => page.status === status), [pages, status]);
  const hasNoSearchConsole = !isLoading && !integration;
  const insightCounts = summary?.opportunityCounts || summary?.opportunity_counts || {};
  const insightStatusCounts = summary?.statusCounts || summary?.status_counts || statusCounts;
  const connectedIndexing = indexingIntegrations.some(connectionReady);
  const totalOpportunityCount = Object.values(insightCounts).reduce((sum, value) => sum + value, 0);
  const currentViewLabel = showOpportunities
    ? opportunityFilters.find((item) => item.value === opportunity)?.label || "Opportunities"
    : statuses.find((item) => item.value === status)?.label || "Pages";

  useEffect(() => {
    if (status === "needs_attention" && !insightStatusCounts.needs_attention && insightStatusCounts.tracking > 0 && !params.get("status") && !params.get("opportunity")) {
      setStatus("tracking");
    }
  }, [insightStatusCounts.needs_attention, insightStatusCounts.tracking, params, status]);

  useEffect(() => {
    if (integration?.status === "property_selection_required") setConnectOpen(true);
  }, [integration?.status]);

  const toggleInspectionUrl = (url: string, checked: boolean) => {
    setSelectedUrls((current) => {
      const next = toggleInspectionSelection(current, url, checked);
      if (next.limited) {
        toast.error("Select at most 10 URLs");
      }
      return next.urls;
    });
  };

  const handleBatchInspection = async () => {
    try {
      const result = await inspectBatch.mutateAsync({ urls: selectedUrls });
      toast.success(`${result.inspected} URLs inspected${result.failed ? `, ${result.failed} failed` : ""}`);
      setSelectedUrls([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "URL inspection failed");
    }
  };

  const openAnalyze = (page?: OptimizePage) => {
    setAnalysisDefaults({ pageUrl: page?.pageUrl || "", targetQuery: page?.targetQuery || "" });
    setAddOpen(true);
  };

  const handleTest = async () => {
    if (!integration) return;
    try {
      const result = await testIntegration.mutateAsync(integration.id);
      toast.success(result.message || "Connection test passed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    }
  };

  const handleSync = async () => {
    try {
      const result = await sync.mutateAsync();
      invalidateInsights();
      toast.success(`${result.synced} GSC rows synced, ${result.optimizePages} pages refreshed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    }
  };

  const handleDelete = async () => {
    if (!integration) return;
    try {
      await deleteIntegration.mutateAsync(integration.id);
      toast.success("Search Console disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
    }
  };

  const handleViewSavedAnalysis = async (page: OptimizePage) => {
    try {
      const result = await loadAnalyses.mutateAsync({ pageUrl: page.pageUrl, targetQuery: page.targetQuery });
      const latest = result.analyses[0];
      if (!latest) {
        toast.info("No saved analysis for this page yet");
        return;
      }
      setAnalysis(latest);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load analysis");
    }
  };

  const handleViewPageDetail = async (page: OptimizePageInsight) => {
    try {
      setPageDetail(await loadPageDetail.mutateAsync(page.pageUrl));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load page detail");
    }
  };

  const handleSubmitAfterEdit = async (pageUrl: string) => {
    try {
      const result = await submitUrls.mutateAsync([pageUrl]);
      toast.success(`${result.submitted} indexing submission created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Indexing submission failed");
    }
  };

  const setOptimizeFilter = (next: { status?: OptimizeStatus; opportunity?: OptimizeOpportunity }) => {
    const search = new URLSearchParams(params);
    if (next.opportunity) {
      setShowOpportunities(true);
      setOpportunity(next.opportunity);
      search.set("opportunity", next.opportunity);
      search.delete("status");
    } else if (next.status) {
      setShowOpportunities(false);
      setStatus(next.status);
      search.set("status", next.status);
      search.delete("opportunity");
    }
    setParams(search, { replace: true });
  };

  return (
    <>
      <div className="space-y-8">
        <div className="grid overflow-hidden rounded-md border border-byword-border bg-card md:grid-cols-4">
          {[
            ["Site", activeSite?.domain || "No site selected"],
            ["Needs attention", String(summary?.needsAttentionCount ?? summary?.needs_attention_count ?? insightStatusCounts.needs_attention ?? 0)],
            ["Tracked pages", String(summary?.pageCount ?? summary?.page_count ?? stats.pageCount ?? pages.length)],
            ["GSC clicks", String(summary?.clicks ?? stats.clicks)],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-byword-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="font-mono text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
              <p className="mt-2 truncate text-2xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <BywordCard>
          <SectionHeader
            icon={SearchCheck}
            title="Search Console"
            description="Connect per site to sync page and query performance."
            action={integration && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleTest} disabled={testIntegration.isPending}>
                  <RefreshCw className={cn("mr-1.5 h-4 w-4", testIntegration.isPending && "animate-spin")} />
                  Test
                </Button>
                <Button size="sm" onClick={handleSync} disabled={sync.isPending}>
                  {sync.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                  Sync
                </Button>
              </div>
            )}
          />
          <div className="p-6">
            {isLoading ? (
              <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading connection</div>
            ) : integration ? (
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <IconTile icon={KeyRound} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{integration.propertyUrl}</h3>
                      <Badge variant={connectionReady(integration) ? "default" : "destructive"}>{displayConnectionStatus(integration)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Credential: {integration.credentialHint || "saved"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last sync: {formatDateTime(summary?.lastSyncAt || summary?.last_sync_at || integration.lastSyncAt)}
                      {integration.lastTestResult ? ` · ${integration.lastTestResult}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setConnectOpen(true)}>Manage</Button>
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete}>
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <IconTile icon={KeyRound} />
                  <div>
                    <h3 className="font-semibold text-foreground">No Search Console connection</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Optimize needs GSC data to detect ranking and click declines.</p>
                  </div>
                </div>
                <Button onClick={() => setConnectOpen(true)}>
                  Connect <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </BywordCard>

        <BywordCard>
          <SectionHeader
            icon={Gauge}
            title="Pages"
            description="Review synced pages or analyze a URL manually."
            action={<Button size="sm" onClick={() => openAnalyze()}><Plus className="mr-1.5 h-4 w-4" />Add Page</Button>}
          />
          <div>
            <div className="sticky top-0 z-20 space-y-4 border-b border-byword-border bg-background/95 p-4 shadow-[0_12px_24px_hsl(210_5%_20%/0.06)] backdrop-blur sm:p-5 lg:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <Tabs value={showOpportunities ? "opportunities" : status} onValueChange={(value) => {
                  if (value === "opportunities") setOptimizeFilter({ opportunity });
                  else setOptimizeFilter({ status: value as OptimizeStatus });
                }}>
                  <TabsList className="h-auto flex-wrap justify-start">
                    {statuses.map((item) => (
                      <TabsTrigger key={item.value} value={item.value}>
                        {item.label} ({insightStatusCounts[item.value] || 0})
                      </TabsTrigger>
                    ))}
                    <TabsTrigger value="opportunities">
                      Opportunities ({totalOpportunityCount})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedUrls.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleBatchInspection} disabled={inspectBatch.isPending}>
                      {inspectBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                      Inspect {selectedUrls.length}
                    </Button>
                  )}
                  {showOpportunities && (
                    <select
                      value={opportunity}
                      onChange={(event) => setOptimizeFilter({ opportunity: event.target.value as OptimizeOpportunity })}
                      className="h-10 rounded-md border border-byword-border bg-background px-3 text-sm"
                    >
                      {opportunityFilters.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  )}
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={sync.isPending || !integration}>
                    {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Sync
                  </Button>
                  <Button size="sm" onClick={() => openAnalyze()}>
                    <Plus className="h-4 w-4" />
                    Analyze URL
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <WorkbenchStat label="Current view" value={currentViewLabel} detail={`${pageInsights.length} rows loaded`} />
                <WorkbenchStat label="Attention" value={`${insightStatusCounts.needs_attention || 0}`} detail="pages need review" tone="risk" />
                <WorkbenchStat label="Opportunities" value={`${totalOpportunityCount}`} detail="ranked signals" tone="info" />
              </div>
              <OpportunityStrip counts={insightCounts} active={showOpportunities ? opportunity : "all"} onSelect={(value) => setOptimizeFilter({ opportunity: value })} />
            </div>

            <div className="p-4 sm:p-5 lg:p-6">

            {hasNoSearchConsole ? (
              <div className="p-12 text-center text-muted-foreground">
                Connect Search Console to sync tracked pages, or add a page manually.
              </div>
            ) : isLoadingPages || isLoadingPageInsights ? (
              <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading pages
              </div>
            ) : pageInsights.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                {!insightStatusCounts.needs_attention && insightStatusCounts.tracking > 0 && !showOpportunities
                  ? "No declining pages. Showing tracked pages instead."
                  : `No pages in ${showOpportunities ? "this opportunity" : statuses.find((item) => item.value === status)?.label.toLowerCase()}.`}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-byword-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><span className="sr-only">Select for inspection</span></TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead>Search signal</TableHead>
                    <TableHead>Metrics</TableHead>
                    <TableHead>Suggested action</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageInsights.map((page) => {
                    const tracked = visiblePages.find((oldPage) => oldPage.pageUrl === page.pageUrl && oldPage.targetQuery === page.topQuery);
                    const primary = primaryOpportunity(page);
                    const meta = opportunityMeta[primary] || opportunityMeta.tracking;
                    return (
                      <TableRow key={page.pageUrl} className={cn("align-top", meta.row)}>
                        <TableCell><Checkbox aria-label={`Select ${page.pageUrl} for inspection`} checked={selectedUrls.includes(page.pageUrl)} disabled={!connectionReady(integration)} onCheckedChange={(checked) => toggleInspectionUrl(page.pageUrl, checked === true)} /></TableCell>
                        <TableCell className="max-w-[360px]">
                          <div className="flex min-w-0 gap-3">
                            <span className={cn("mt-1 h-11 w-1 shrink-0 rounded-full", meta.rail)} />
                            <button type="button" className="block min-w-0 max-w-full text-left" onClick={() => handleViewPageDetail(page)} disabled={loadPageDetail.isPending}>
                              <span className="block truncate font-semibold text-foreground">{compactUrl(page.pageUrl)}</span>
                              <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">{page.pageUrl}</span>
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <OptimizeStatusBadge status={page.status} />
                            <DeltaBadge page={page} />
                          </div>
                          <p className="mt-2 truncate text-sm font-medium text-foreground">{page.topQuery}</p>
                          <OpportunityBadges opportunities={page.opportunities} />
                        </TableCell>
                        <TableCell>
                          <div className="grid min-w-[300px] grid-cols-4 gap-2">
                            <MiniMetric label="Clk" value={String(page.clicks)} />
                            <MiniMetric label="Impr" value={String(page.impressions)} />
                            <MiniMetric label="CTR" value={formatPercent(page.ctr)} />
                            <MiniMetric label="Pos" value={page.position.toFixed(1)} />
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <div className="space-y-2">
                            <Badge variant="outline" className={cn("border font-mono text-[10px] uppercase", meta.tone)}>{meta.action}</Badge>
                            <p className="text-sm leading-6 text-foreground">{page.suggestedAction}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="outline" size="sm" className="border-byword-blue/35 text-byword-blue hover:bg-byword-blue-soft" onClick={() => handleViewPageDetail(page)} disabled={loadPageDetail.isPending}>Brief</Button>
                            <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => openAnalyze({ pageUrl: page.pageUrl, targetQuery: page.topQuery } as OptimizePage)}>Analyze</Button>
                            {tracked && (
                              <Button variant="ghost" size="sm" onClick={() => markOptimized.mutate(tracked.id)} disabled={markOptimized.isPending}>
                                Done
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
            </div>
          </div>
        </BywordCard>
      </div>

      <SearchConsoleDialog
        open={connectOpen}
        integration={integration}
        activeSiteDomain={activeSite?.domain || ""}
        onClose={() => setConnectOpen(false)}
        onOAuth={async (propertyUrl) => {
          try {
            const result = await startOAuth.mutateAsync(propertyUrl);
            window.location.assign(result.authUrl);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to start Google connection");
          }
        }}
        onSave={async (input) => {
          try {
            await saveIntegration.mutateAsync(input);
            toast.success("Search Console saved");
            setConnectOpen(false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save Search Console");
          }
        }}
        isSaving={saveIntegration.isPending}
        isOAuthStarting={startOAuth.isPending}
        properties={properties}
        onSelectProperty={async (propertyUrl) => {
          try {
            await selectProperty.mutateAsync(propertyUrl);
            toast.success("Search Console property selected");
            setConnectOpen(false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to select property");
          }
        }}
        isSelectingProperty={selectProperty.isPending}
      />

      <AnalyzeDialog
        open={addOpen}
        defaults={analysisDefaults}
        onClose={() => setAddOpen(false)}
        onAnalyze={async (input) => {
          try {
            const result = await analyze.mutateAsync(input);
            setAnalysis(result.analysis);
            setAddOpen(false);
            toast.success("Analysis complete");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Analysis failed");
          }
        }}
        isAnalyzing={analyze.isPending}
      />

      <AnalysisSheet analysis={analysis} onOpenChange={(open) => !open && setAnalysis(null)} />
      <PageDetailSheet
        detail={pageDetail}
        indexingConnected={connectedIndexing}
        isSubmitting={submitUrls.isPending}
        onSubmitAfterEdit={handleSubmitAfterEdit}
        onOpenChange={(open) => !open && setPageDetail(null)}
      />
    </>
  );
}

export default function Optimize() {
  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader title="Optimize" description="Find pages that slipped in search and analyze what to improve." />
      <OptimizePanel />
    </BywordPageShell>
  );
}

function SearchConsoleDialog({
  open,
  integration,
  activeSiteDomain,
  onClose,
  onOAuth,
  onSave,
  isSaving,
  isOAuthStarting,
  properties,
  onSelectProperty,
  isSelectingProperty,
}: {
  open: boolean;
  integration: SearchConsoleIntegration | null;
  activeSiteDomain: string;
  onClose: () => void;
  onOAuth: (propertyUrl?: string) => Promise<void>;
  onSave: (input: { id?: string; propertyUrl: string; credentials?: Record<string, string> }) => Promise<void>;
  isSaving: boolean;
  isOAuthStarting: boolean;
  properties: SearchConsoleProperty[];
  onSelectProperty: (propertyUrl: string) => Promise<void>;
  isSelectingProperty: boolean;
}) {
  const [propertyUrl, setPropertyUrl] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");

  useEffect(() => {
    if (open) {
      setPropertyUrl(integration?.propertyUrl || defaultSearchConsoleProperty(activeSiteDomain));
      setServiceAccountJson("");
    }
  }, [activeSiteDomain, integration, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose();
  };

  const handleOAuth = async () => {
    const property = propertyUrl.trim();
    await onOAuth(property || undefined);
  };

  const handleManualSubmit = async () => {
    let credentials: Record<string, string> | undefined;
    if (serviceAccountJson.trim()) {
      try {
        credentials = JSON.parse(serviceAccountJson);
      } catch {
        toast.error("Service account JSON must be valid JSON");
        return;
      }
    }
    if (!integration && !credentials) {
      toast.error("Paste service account JSON first");
      return;
    }
    await onSave({ id: integration?.id, propertyUrl: propertyUrl || integration?.propertyUrl || "", credentials });
    setServiceAccountJson("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration ? "Manage" : "Connect"} Search Console</DialogTitle>
          <DialogDescription>Connect the Google account that has access to this Search Console property.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Property URL</Label>
            <Input value={propertyUrl} onChange={(event) => setPropertyUrl(event.target.value)} placeholder="Optional — choose after Google sign-in" />
          </div>
          {properties.length > 0 && (
            <div className="space-y-2 rounded-lg border border-byword-border p-4">
              <Label>Accessible Google properties</Label>
              <div className="flex gap-2">
                <Select value={propertyUrl} onValueChange={setPropertyUrl}>
                  <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Choose a property" /></SelectTrigger>
                  <SelectContent>{properties.map((property) => <SelectItem key={property.siteUrl} value={property.siteUrl}>{property.siteUrl} · {property.permissionLevel}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" onClick={() => onSelectProperty(propertyUrl)} disabled={!propertyUrl || isSelectingProperty}>
                  {isSelectingProperty && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Use
                </Button>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-byword-border p-4">
            <h3 className="font-semibold text-foreground">Google OAuth</h3>
            <p className="mt-1 text-sm text-muted-foreground">Approve read-only Search Console access. BlogFactory stores the refresh token encrypted.</p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
              {searchConsoleOAuthSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Button className="mt-4 w-full" onClick={handleOAuth} disabled={isOAuthStarting}>
              {isOAuthStarting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
              Continue with Google
            </Button>
          </div>
          <details className="rounded-lg border border-byword-border p-4">
            <summary className="cursor-pointer font-semibold text-foreground">Advanced: service account JSON</summary>
            <div className="mt-4 space-y-3">
              <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                {searchConsoleServiceAccountSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {integration && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Leave JSON blank to keep the saved credential.</p>}
              <div className="space-y-2">
                <Label>Service account JSON</Label>
                <Textarea value={serviceAccountJson} onChange={(event) => setServiceAccountJson(event.target.value)} className="min-h-[160px] font-mono text-xs" placeholder="{ ... }" />
              </div>
              <Button variant="outline" onClick={handleManualSubmit} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save service account
              </Button>
            </div>
          </details>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultSearchConsoleProperty(domain: string) {
  const value = domain.trim();
  if (!value) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return `sc-domain:${parsed.hostname.replace(/^www\./, "")}`;
  } catch {
    return `sc-domain:${value.replace(/^https?:\/\//i, "").replace(/^www\./, "").replace(/\/.*$/, "")}`;
  }
}

function AnalyzeDialog({
  open,
  defaults,
  onClose,
  onAnalyze,
  isAnalyzing,
}: {
  open: boolean;
  defaults: { pageUrl: string; targetQuery: string };
  onClose: () => void;
  onAnalyze: (input: { pageUrl: string; targetQuery: string; competitorUrls: string[] }) => Promise<void>;
  isAnalyzing: boolean;
}) {
  const [pageUrl, setPageUrl] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState("");

  useEffect(() => {
    if (open) {
      setPageUrl(defaults.pageUrl);
      setTargetQuery(defaults.targetQuery);
    }
  }, [defaults, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Analyze page</DialogTitle>
          <DialogDescription>Compare one page against manually supplied competitor URLs.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Page URL</Label>
            <Input value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="https://example.com/article" />
          </div>
          <div className="space-y-2">
            <Label>Target query</Label>
            <Input value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} placeholder="best crm for startups" />
          </div>
          <div className="space-y-2">
            <Label>Competitor URLs</Label>
            <Textarea value={competitorUrls} onChange={(event) => setCompetitorUrls(event.target.value)} className="min-h-[140px]" placeholder="https://competitor.com/page" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onAnalyze({ pageUrl, targetQuery, competitorUrls: competitorUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean) })}
            disabled={isAnalyzing || !pageUrl.trim() || !targetQuery.trim()}
          >
            {isAnalyzing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Analyze
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpportunityStrip({
  counts,
  active,
  onSelect,
}: {
  counts: Record<string, number>;
  active: OptimizeOpportunity;
  onSelect: (value: OptimizeOpportunity) => void;
}) {
  const items = opportunityFilters.filter((item) => item.value !== "all");
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => {
        const meta = opportunityMeta[item.value] || opportunityMeta.tracking;
        const isActive = active === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={cn(
              "rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:border-byword-blue",
              isActive ? meta.tone : "border-byword-border"
            )}
          >
            <span className="flex items-center gap-2 font-semibold text-foreground">
              <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
              {item.label}
            </span>
            <span className="mt-2 block text-muted-foreground">{counts[item.value] || 0} pages</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkbenchStat({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "risk" | "info";
}) {
  return (
    <div className={cn(
      "rounded-md border px-3 py-2",
      tone === "neutral" && "border-byword-border bg-card",
      tone === "risk" && "border-[hsl(var(--status-error)/0.25)] bg-[hsl(var(--status-error)/0.06)]",
      tone === "info" && "border-byword-blue/25 bg-byword-blue-soft",
    )}>
      <p className="font-mono text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-foreground">{value}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[64px] rounded-md border border-byword-border bg-card px-2.5 py-2">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="whitespace-nowrap text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DeltaBadge({ page }: { page: OptimizePageInsight }) {
  const isBad = page.delta.clicks < 0 || page.delta.position > 1.5;
  const isGood = page.delta.clicks > 0 || page.delta.position < -1.5;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-mono text-[10px] uppercase",
        isBad && "border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.08)] text-[hsl(var(--status-error))]",
        isGood && "border-[hsl(var(--status-success)/0.35)] bg-[hsl(var(--status-success)/0.08)] text-[hsl(var(--status-success))]",
        !isBad && !isGood && "border-byword-border bg-muted/30 text-muted-foreground",
      )}
    >
      {formatDelta(page)}
    </Badge>
  );
}

function OpportunityBadges({ opportunities }: { opportunities: string[] }) {
  const visible = opportunities.length ? opportunities.slice(0, 3) : ["tracking"];
  const overflow = Math.max(0, opportunities.length - visible.length);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((item) => {
        const meta = opportunityMeta[item] || opportunityMeta.tracking;
        return (
          <Badge key={item} variant="outline" className={cn("border px-1.5 py-0 font-mono text-[10px] uppercase", meta.tone)}>
            {meta.label}
          </Badge>
        );
      })}
      {overflow > 0 && <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">+{overflow}</Badge>}
    </div>
  );
}

function PageDetailSheet({
  detail,
  indexingConnected,
  isSubmitting,
  onSubmitAfterEdit,
  onOpenChange,
}: {
  detail: OptimizePageDetail | null;
  indexingConnected: boolean;
  isSubmitting: boolean;
  onSubmitAfterEdit: (pageUrl: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const { inspect } = useSearchConsoleToolkit();
  const [inspection, setInspection] = useState<Awaited<ReturnType<typeof inspect.mutateAsync>> | null>(null);
  const insight = detail?.insight;
  const daily = detail?.dailyHistory || detail?.daily_history || [];
  const actions = detail?.actionPlan || detail?.action_plan || [];
  const targets = detail?.internalLinkTargets || detail?.internal_link_targets || [];
  const analyses = detail?.analyses || [];

  return (
    <Sheet open={Boolean(detail)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>{insight?.topQuery || "Page performance"}</SheetTitle>
          <SheetDescription>{insight?.pageUrl}</SheetDescription>
        </SheetHeader>
        {insight && (
          <div className="mt-6 space-y-6">
            <div className="rounded-md border border-byword-border bg-muted/20 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <OptimizeStatusBadge status={insight.status} />
                    <DeltaBadge page={insight} />
                  </div>
                  <h3 className="mt-3 truncate text-lg font-semibold text-foreground">{insight.topQuery}</h3>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{compactUrl(insight.pageUrl)}</p>
                  <OpportunityBadges opportunities={insight.opportunities} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[420px]">
                  <Metric label="Clicks" value={insight.clicks} />
                  <Metric label="Impr." value={insight.impressions} />
                  <Metric label="CTR" value={formatPercent(insight.ctr)} />
                  <Metric label="Position" value={insight.position.toFixed(1)} />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-byword-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="text-sm font-semibold text-foreground">Google index status</h3><p className="mt-1 text-sm text-muted-foreground">Checks Google's indexed version, not a live crawl.</p></div>
                <div className="flex gap-2">
                  {inspection?.result.inspectionResultLink && <Button variant="outline" asChild><a href={inspection.result.inspectionResultLink} target="_blank" rel="noreferrer">Open GSC</a></Button>}
                  <Button variant="outline" onClick={async () => {
                    try { setInspection(await inspect.mutateAsync({ url: insight.pageUrl, force: Boolean(inspection) })); }
                    catch (error) { toast.error(error instanceof Error ? error.message : "URL inspection failed"); }
                  }} disabled={inspect.isPending}>{inspect.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-1.5 h-4 w-4" />}{inspection ? "Refresh" : "Inspect URL"}</Button>
                </div>
              </div>
              {inspection && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MiniMetric label="Verdict" value={inspection.result.verdict} /><MiniMetric label="Coverage" value={inspection.result.coverageState || "Unknown"} /><MiniMetric label="Indexing" value={inspection.result.indexingState || "Unknown"} /><MiniMetric label="Robots.txt" value={inspection.result.robotsTxtState || "Unknown"} /><MiniMetric label="Page fetch" value={inspection.result.pageFetchState || "Unknown"} /><MiniMetric label="Last crawl" value={inspection.result.lastCrawlTime ? formatDateTime(inspection.result.lastCrawlTime) : "Unknown"} /><MiniMetric label="Google canonical" value={inspection.result.googleCanonical || "Unknown"} /><MiniMetric label="Declared canonical" value={inspection.result.userCanonical || "Unknown"} /><MiniMetric label="Rich results" value={inspection.result.richResultsVerdict || "Unknown"} />{inspection.stale && <p className="col-span-full text-xs text-amber-700">Showing stale cached data: {inspection.warning}</p>}</div>}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">Action plan</h3>
              <div className="mt-3 space-y-3">
                {actions.map((item, index) => (
                  <div key={`${item.opportunity}-${index}`} className="rounded-lg border border-byword-border p-4">
                    <Badge variant={item.opportunity === "needs_attention" ? "destructive" : "secondary"}>{humanOpportunity(item.opportunity)}</Badge>
                    <h4 className="mt-2 font-medium text-foreground">{item.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">Top queries</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead>Impr.</TableHead>
                    <TableHead>CTR</TableHead>
                    <TableHead>Pos.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detail?.queries || []).slice(0, 10).map((query) => (
                    <TableRow key={query.query}>
                      <TableCell className="max-w-[280px] truncate">{query.query}</TableCell>
                      <TableCell>{query.clicks}</TableCell>
                      <TableCell>{query.impressions}</TableCell>
                      <TableCell>{formatPercent(query.ctr)}</TableCell>
                      <TableCell>{query.position.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border border-byword-border p-4">
              <h3 className="text-sm font-semibold text-foreground">Query intent</h3>
              <p className="mt-2 text-sm text-muted-foreground">{detail?.queryIntentSummary || detail?.query_intent_summary}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">Daily history</h3>
              <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-byword-border">
                {daily.slice(-14).map((day) => (
                  <div key={day.date} className="grid grid-cols-4 gap-3 border-b border-byword-border px-4 py-2 text-sm last:border-b-0">
                    <span>{day.date}</span>
                    <span>{day.clicks} clicks</span>
                    <span>{day.impressions} impr.</span>
                    <span>{day.position.toFixed(1)} pos.</span>
                  </div>
                ))}
              </div>
            </div>

            {targets.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground">Internal link targets</h3>
                <div className="mt-3 space-y-2">
                  {targets.map((target) => (
                    <a key={target.url || target.path} href={target.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-byword-border p-3 text-sm hover:border-byword-blue">
                      <span className="font-medium text-foreground">{target.title || target.path || target.url}</span>
                      <span className="mt-1 block truncate text-muted-foreground">{target.url || target.path}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {analyses[0] && <AnalysisInline analysis={analyses[0]} />}

            {indexingConnected && (
              <Button onClick={() => onSubmitAfterEdit(insight.pageUrl)} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Submit to indexing after edit
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AnalysisInline({ analysis }: { analysis: OptimizeAnalysis }) {
  const suggestions = analysis.suggestions || [];
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Saved analysis suggestions</h3>
      <div className="mt-3 space-y-3">
        {suggestions.slice(0, 4).map((suggestion, index) => (
          <div key={`${suggestion.title}-${index}`} className="rounded-lg border border-byword-border p-4">
            <Badge variant={suggestion.impact === "high" ? "destructive" : suggestion.impact === "medium" ? "default" : "secondary"}>{suggestion.impact}</Badge>
            <h4 className="mt-2 font-medium text-foreground">{suggestion.title}</h4>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{suggestion.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisSheet({ analysis, onOpenChange }: { analysis: OptimizeAnalysis | null; onOpenChange: (open: boolean) => void }) {
  const own = analysis?.ownContentSnapshot || analysis?.own_content_snapshot;
  const competitors = analysis?.competitorSnapshots || analysis?.competitor_snapshots || [];
  const suggestions = analysis?.suggestions || [];

  return (
    <Sheet open={Boolean(analysis)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{analysis?.targetQuery || analysis?.target_query || "Analysis"}</SheetTitle>
          <SheetDescription>{analysis?.pageUrl || analysis?.page_url}</SheetDescription>
        </SheetHeader>
        {own && (
          <div className="mt-6 space-y-6">
            <SnapshotSummary title="Your page" snapshot={own} />
            {competitors.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground">Competitors</h3>
                <div className="mt-3 space-y-3">
                  {competitors.map((snapshot) => <SnapshotSummary key={snapshot.url} title={snapshot.url} snapshot={snapshot} compact />)}
                </div>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-foreground">Suggestions</h3>
              <div className="mt-3 space-y-3">
                {suggestions.map((suggestion, index) => (
                  <div key={`${suggestion.title}-${index}`} className="rounded-lg border border-byword-border p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={suggestion.impact === "high" ? "destructive" : suggestion.impact === "medium" ? "default" : "secondary"}>{suggestion.impact}</Badge>
                      <h4 className="font-medium text-foreground">{suggestion.title}</h4>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{suggestion.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SnapshotSummary({ title, snapshot, compact }: { title: string; snapshot: ContentSnapshot; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-byword-border p-4">
      <h3 className={cn("truncate font-semibold text-foreground", compact && "text-sm")} title={title}>{title}</h3>
      {snapshot.error ? (
        <p className="mt-2 text-sm text-destructive">{snapshot.error}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Metric label="Words" value={snapshot.wordCount} />
          <Metric label="Sections" value={snapshot.sectionCount} />
          <Metric label="Images" value={snapshot.features.images} />
          <Metric label="FAQ" value={snapshot.features.faq ? "Yes" : "No"} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function OptimizeStatusBadge({ status }: { status: string }) {
  if (status === "needs_attention") return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Needs attention</Badge>;
  if (status === "improved") return <Badge className="bg-[hsl(var(--status-success))] text-white"><CheckCircle2 className="mr-1 h-3 w-3" />Improved</Badge>;
  return <Badge variant="secondary" className="border border-byword-border">Tracking</Badge>;
}

function primaryOpportunity(page: OptimizePageInsight) {
  const priority = ["needs_attention", "wrong_page_risk", "low_ctr", "zero_clicks", "almost_ranking", "page_two", "weak_focus", "growing"];
  return priority.find((item) => page.opportunities.includes(item)) || page.status || "tracking";
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatDelta(page: OptimizePageInsight) {
  const clickDelta = page.delta.clicks;
  const posDelta = page.delta.position;
  return `${clickDelta > 0 ? "+" : ""}${clickDelta} clicks · ${posDelta > 0 ? "+" : ""}${posDelta.toFixed(1)} pos.`;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "None yet";
}

function compactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

function humanOpportunity(value: string) {
  return value.replace(/_/g, " ");
}

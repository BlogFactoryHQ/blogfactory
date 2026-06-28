import { useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SearchConsoleIntegration, useSearchConsole } from "@/hooks/useSearchConsole";
import { ContentSnapshot, OptimizeAnalysis, OptimizePage, OptimizeStatus, useOptimize } from "@/hooks/useOptimize";
import { useSites } from "@/hooks/useSites";
import { cn } from "@/lib/utils";

const statuses: Array<{ value: OptimizeStatus; label: string }> = [
  { value: "needs_attention", label: "Needs Attention" },
  { value: "tracking", label: "Tracking" },
  { value: "improved", label: "Improved" },
];

export default function Optimize() {
  const { activeSite } = useSites();
  const { integration, stats, isLoading, saveIntegration, testIntegration, deleteIntegration, sync } = useSearchConsole();
  const { pages, isLoading: isLoadingPages, analyze, loadAnalyses, markOptimized } = useOptimize("all");
  const [status, setStatus] = useState<OptimizeStatus>("needs_attention");
  const [connectOpen, setConnectOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [analysis, setAnalysis] = useState<OptimizeAnalysis | null>(null);
  const [analysisDefaults, setAnalysisDefaults] = useState({ pageUrl: "", targetQuery: "" });

  const statusCounts = useMemo(() => ({
    needs_attention: pages.filter((page) => page.status === "needs_attention").length,
    tracking: pages.filter((page) => page.status === "tracking").length,
    improved: pages.filter((page) => page.status === "improved").length,
  }), [pages]);

  const visiblePages = useMemo(() => pages.filter((page) => page.status === status), [pages, status]);

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

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader title="Optimize" description="Find pages that slipped in search and analyze what to improve." />

      <div className="space-y-8">
        <div className="grid overflow-hidden rounded-lg border border-byword-border bg-card md:grid-cols-4">
          {[
            ["Site", activeSite?.domain || "No site selected"],
            ["Needs attention", String(statusCounts.needs_attention)],
            ["Tracked pages", String(stats.pageCount || pages.length)],
            ["GSC clicks", String(stats.clicks)],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-byword-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
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
                      <Badge variant={integration.status === "connected" ? "default" : "destructive"}>{integration.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Credential: {integration.credentialHint || "saved"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last sync: {integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : "None yet"}
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
          <div className="space-y-4 p-6">
            <Tabs value={status} onValueChange={(value) => setStatus(value as OptimizeStatus)}>
              <TabsList>
                {statuses.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label} ({statusCounts[item.value as keyof typeof statusCounts]})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {isLoadingPages ? (
              <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading pages
              </div>
            ) : visiblePages.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No pages in {statuses.find((item) => item.value === status)?.label.toLowerCase()}.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead>Query</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePages.map((page) => (
                    <TableRow key={page.id}>
                      <TableCell className="max-w-[360px] truncate font-medium">{page.pageUrl}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{page.targetQuery}</TableCell>
                      <TableCell><OptimizeStatusBadge status={page.status} /></TableCell>
                      <TableCell>{metricPosition(page)}</TableCell>
                      <TableCell>{metricClicks(page)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openAnalyze(page)}>Analyze</Button>
                          <Button variant="outline" size="sm" onClick={() => handleViewSavedAnalysis(page)} disabled={loadAnalyses.isPending}>
                            View saved
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => markOptimized.mutate(page.id)} disabled={markOptimized.isPending}>
                            Mark optimized
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </BywordCard>
      </div>

      <SearchConsoleDialog
        open={connectOpen}
        integration={integration}
        onClose={() => setConnectOpen(false)}
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
    </BywordPageShell>
  );
}

function SearchConsoleDialog({
  open,
  integration,
  onClose,
  onSave,
  isSaving,
}: {
  open: boolean;
  integration: SearchConsoleIntegration | null;
  onClose: () => void;
  onSave: (input: { id?: string; propertyUrl: string; credentials?: Record<string, string> }) => Promise<void>;
  isSaving: boolean;
}) {
  const [propertyUrl, setPropertyUrl] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");

  useEffect(() => {
    if (open) setPropertyUrl(integration?.propertyUrl || "");
  }, [integration, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose();
  };

  const handleSubmit = async () => {
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
      toast.error("Service account JSON is required");
      return;
    }
    await onSave({ id: integration?.id, propertyUrl: propertyUrl || integration?.propertyUrl || "", credentials });
    setServiceAccountJson("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration ? "Manage" : "Connect"} Search Console</DialogTitle>
          <DialogDescription>Use a service account that has access to this GSC property.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Property URL</Label>
            <Input value={propertyUrl} onChange={(event) => setPropertyUrl(event.target.value)} placeholder="sc-domain:example.com or https://example.com/" />
          </div>
          {integration && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Leave credentials blank to keep the saved service account.</p>}
          <div className="space-y-2">
            <Label>Service account JSON</Label>
            <Textarea value={serviceAccountJson} onChange={(event) => setServiceAccountJson(event.target.value)} className="min-h-[180px] font-mono text-xs" placeholder="{ ... }" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  if (status === "improved") return <Badge><CheckCircle2 className="mr-1 h-3 w-3" />Improved</Badge>;
  return <Badge variant="secondary">Tracking</Badge>;
}

function metricPosition(page: OptimizePage) {
  const latest = page.latestMetrics || page.latest_metrics;
  const baseline = page.baselineMetrics || page.baseline_metrics;
  if (!latest?.position) return "No data";
  if (!baseline?.position) return latest.position.toFixed(1);
  const delta = latest.position - baseline.position;
  return `${latest.position.toFixed(1)} (${delta > 0 ? "+" : ""}${delta.toFixed(1)})`;
}

function metricClicks(page: OptimizePage) {
  const latest = page.latestMetrics || page.latest_metrics;
  const baseline = page.baselineMetrics || page.baseline_metrics;
  if (!latest) return "No data";
  const delta = baseline ? latest.clicks - baseline.clicks : 0;
  return baseline ? `${latest.clicks} (${delta > 0 ? "+" : ""}${delta})` : String(latest.clicks);
}

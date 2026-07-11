import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Filter, Grid2X2, History, Megaphone, Play, Plus, RotateCcw, Search, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { asArray } from "@/lib/api-shape";
import { connectionReady } from "@/lib/credential-status";
import { safeFormatDistanceToNow } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { useIntegrations } from "@/hooks/useIntegrations";

type CampaignMode = "keyword" | "title" | "title_outline" | "programmatic";
type CampaignStatus = "draft" | "queued" | "running" | "completed" | "failed" | "stopped";
type BadgeStatus = "success" | "warning" | "error" | "pending" | "running" | "draft";

interface Campaign {
  id: string;
  name: string;
  mode: CampaignMode;
  outlineMode: string;
  status: CampaignStatus;
  modelId: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  totalCost: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface CampaignItem {
  id: string;
  position: number;
  input: string;
  keyword: string | null;
  title: string | null;
  status: CampaignStatus;
  jobId: string | null;
  jobStatus: string | null;
  currentStep: string | null;
  jobErrorMessage: string | null;
  jobTotalCost: number | null;
  postId: string | null;
  errorMessage: string | null;
  variables?: Record<string, string> | null;
}

interface CampaignHistory {
  id: string;
  status: string;
  currentStep: string | null;
  errorMessage: string | null;
  totalCost: number | null;
  resultPostIds: string[] | null;
  createdAt: string;
  completedAt: string | null;
}

const modeLabels: Record<CampaignMode, string> = {
  keyword: "Keyword",
  title: "Title",
  title_outline: "Title + Outline",
  programmatic: "Programmatic",
};

const campaignStatuses: CampaignStatus[] = ["draft", "queued", "running", "completed", "failed", "stopped"];
const campaignModes: CampaignMode[] = ["keyword", "title", "title_outline", "programmatic"];

function statusType(status: string): BadgeStatus {
  if (status === "completed") return "success";
  if (status === "running") return "running";
  if (status === "failed") return "error";
  if (status === "stopped") return "warning";
  if (status === "draft") return "draft";
  return "pending";
}

function progress(campaign: Campaign) {
  if (!campaign.totalItems) return 0;
  return Math.round((campaign.completedItems / campaign.totalItems) * 100);
}

function formatStep(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "";
}

function formatMoney(value: number | null | undefined) {
  return typeof value === "number" ? `$${value.toFixed(4)}` : "-";
}

function formatStatusLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default function Campaigns() {
  const params = useParams();
  if (params.id) return <CampaignDetail id={params.id} />;
  return <CampaignList />;
}

function CampaignList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");
  const [modeFilter, setModeFilter] = useState<CampaignMode | "all">("all");
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.getArray<Campaign>("/campaigns"),
    refetchInterval: 5000,
  });

  const filteredCampaigns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const matchesSearch = !needle || [
        campaign.name,
        campaign.mode,
        campaign.status,
        campaign.modelId,
      ].join(" ").toLowerCase().includes(needle);
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const matchesMode = modeFilter === "all" || campaign.mode === modeFilter;
      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [campaigns, modeFilter, search, statusFilter]);

  const activeCount = campaigns.filter((campaign) => campaign.status === "running" || campaign.status === "queued").length;
  const generatedCount = campaigns.reduce((sum, campaign) => sum + campaign.completedItems, 0);
  const failedCount = campaigns.reduce((sum, campaign) => sum + campaign.failedItems, 0);

  return (
    <BywordPageShell className="max-w-7xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="mt-2 text-muted-foreground">All campaign and programmatic SEO runs with progress, drafts, and item status.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            More than a flat keyword list? <Link to="/content-creator?mode=programmatic" className="font-medium text-byword-blue hover:underline">Use Programmatic</Link>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/content-creator?mode=programmatic"><Grid2X2 className="mr-2 h-4 w-4" />New Programmatic Run</Link>
          </Button>
          <Button asChild>
            <Link to="/content-creator?mode=campaign"><Plus className="mr-2 h-4 w-4" />New Campaign</Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <BywordCard className="p-4">
          <p className="type-meta">Runs</p>
          <p className="mt-2 text-2xl font-semibold">{campaigns.length}</p>
        </BywordCard>
        <BywordCard className="p-4">
          <p className="type-meta">Active</p>
          <p className="mt-2 text-2xl font-semibold text-byword-blue">{activeCount}</p>
        </BywordCard>
        <BywordCard className="p-4">
          <p className="type-meta">Drafts made</p>
          <p className="mt-2 text-2xl font-semibold">{generatedCount}</p>
        </BywordCard>
        <BywordCard className="p-4">
          <p className="type-meta">Failed items</p>
          <p className="mt-2 text-2xl font-semibold text-destructive">{failedCount}</p>
        </BywordCard>
      </div>

      <BywordCard>
        <SectionHeader
          icon={Megaphone}
          title="Campaign Control"
          description="Find a run, inspect output, retry failures, or push completed drafts."
          action={<span className="type-meta rounded-sm border border-byword-border bg-muted px-2 py-1">{filteredCampaigns.length} shown</span>}
        />
        <div className="grid gap-3 border-b border-byword-border p-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaigns, modes, models..." />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CampaignStatus | "all")}>
            <SelectTrigger>
              <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {campaignStatuses.map((status) => (
                <SelectItem key={status} value={status}>{formatStatusLabel(status)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={(value) => setModeFilter(value as CampaignMode | "all")}>
            <SelectTrigger>
              <Grid2X2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              {campaignModes.map((mode) => (
                <SelectItem key={mode} value={mode}>{modeLabels[mode]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!isLoading && campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <p className="font-semibold">No campaigns yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Start with a keyword batch or import an SEO content brief spreadsheet.</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button variant="outline" asChild><Link to="/content-creator?mode=programmatic">Import Briefs</Link></Button>
                    <Button asChild><Link to="/content-creator?mode=campaign">New Campaign</Link></Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && campaigns.length > 0 && filteredCampaigns.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No campaigns match these filters.</TableCell></TableRow>
            )}
            {filteredCampaigns.map((campaign) => (
              <TableRow
                key={campaign.id}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => navigate(`/campaigns/${campaign.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") navigate(`/campaigns/${campaign.id}`);
                }}
              >
                <TableCell className="font-medium">{campaign.name}</TableCell>
                <TableCell>{modeLabels[campaign.mode] || campaign.mode}</TableCell>
                <TableCell><StatusBadge status={statusType(campaign.status)} label={formatStatusLabel(campaign.status)} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{campaign.totalItems}</TableCell>
                <TableCell>
                  <div className="flex min-w-40 items-center gap-3">
                    <Progress value={progress(campaign)} className="h-2" />
                    <span className="w-16 text-xs text-muted-foreground">{campaign.completedItems}/{campaign.totalItems}</span>
                  </div>
                </TableCell>
                <TableCell>{formatMoney(campaign.totalCost)}</TableCell>
                <TableCell>{safeFormatDistanceToNow(campaign.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BywordCard>
    </BywordPageShell>
  );
}

function CampaignDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [integrationId, setIntegrationId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemStatusFilter, setItemStatusFilter] = useState<CampaignStatus | "all">("all");
  const [autoRunBatches, setAutoRunBatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(`campaign:auto-run:${id}`) === "true";
  });
  const autoRunRequestKey = useRef("");
  const { integrations } = useIntegrations();
  const connectedIntegrations = useMemo(() => integrations.filter(connectionReady), [integrations]);
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const response = await api.get<{ campaign: Campaign; items?: CampaignItem[]; history?: CampaignHistory[] }>(`/campaigns/${id}`);
      return {
        ...response,
        items: asArray<CampaignItem>(response?.items),
        history: asArray<CampaignHistory>(response?.history),
      };
    },
    refetchInterval: 5000,
  });

  const action = useMutation({
    mutationFn: (path: string) => api.post(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  const bulkPublish = useMutation({
    mutationFn: (postIds: string[]) => api.post("/posts/bulk-publish", { ids: postIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Campaign posts marked published");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Publish failed"),
  });

  const bulkPush = useMutation({
    mutationFn: async (postIds: string[]) => {
      const targetIntegrationId = integrationId || connectedIntegrations[0]?.id;
      if (!targetIntegrationId) throw new Error("Connect an integration first");
      let failed = 0;
      for (const postId of postIds) {
        const result = await api.post<{ success: boolean; error?: string }>(`/posts/${postId}/publish`, {
          integrationId: targetIntegrationId,
          mode: "draft",
          postType: "post",
        });
        if (!result.success) failed += 1;
      }
      return { total: postIds.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(failed ? `${total - failed}/${total} posts pushed` : `${total} campaign posts pushed`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Push failed"),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`campaign:auto-run:${id}`, String(autoRunBatches));
  }, [autoRunBatches, id]);

  const campaignForAutoRun = data?.campaign;
  const itemsForAutoRun = data?.items ?? [];
  const autoQueuedCount = itemsForAutoRun.filter((item) => item.status === "queued").length;
  const autoRunningCount = itemsForAutoRun.filter((item) => item.status === "running" || item.jobStatus === "running").length;

  useEffect(() => {
    if (!campaignForAutoRun || !autoRunBatches || action.isPending) return;
    if (campaignForAutoRun.status !== "running" || autoQueuedCount === 0 || autoRunningCount > 0) {
      autoRunRequestKey.current = "";
      return;
    }

    const requestKey = `${campaignForAutoRun.id}:${campaignForAutoRun.completedItems}:${autoQueuedCount}`;
    if (autoRunRequestKey.current === requestKey) return;
    autoRunRequestKey.current = requestKey;
    action.mutate(`/campaigns/${campaignForAutoRun.id}/run-next`);
  }, [action, autoQueuedCount, autoRunBatches, autoRunningCount, campaignForAutoRun]);

  if (isLoading || !data) {
    return (
      <BywordPageShell>
        <p className="text-muted-foreground">Loading...</p>
      </BywordPageShell>
    );
  }

  const { campaign, items, history = [] } = data;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const queuedCount = items.filter((item) => item.status === "queued").length;
  const runningCount = items.filter((item) => item.status === "running" || item.jobStatus === "running").length;
  const completedPostIds = items.map((item) => item.postId).filter((id): id is string => Boolean(id));
  const resumableCount = items.filter((item) => item.status === "stopped").length;
  const filteredItems = items.filter((item) => {
    const needle = itemSearch.trim().toLowerCase();
    const matchesSearch = !needle || [
      item.input,
      item.keyword,
      item.title,
      item.currentStep,
      item.jobStatus,
      item.errorMessage,
      item.jobErrorMessage,
      ...(item.variables ? Object.entries(item.variables).flatMap(([key, value]) => [key, value]) : []),
    ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    const matchesStatus = itemStatusFilter === "all" || item.status === itemStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <BywordPageShell className="max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={statusType(campaign.status)} label={formatStatusLabel(campaign.status)} />
            <span>{modeLabels[campaign.mode] || campaign.mode}</span>
            <span>{campaign.completedItems}/{campaign.totalItems} completed</span>
            <span>{safeFormatDistanceToNow(campaign.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/campaigns">Back</Link></Button>
          {(campaign.status === "draft" || (campaign.status === "stopped" && resumableCount > 0)) && (
            <Button onClick={() => action.mutate(`/campaigns/${campaign.id}/start`)} disabled={action.isPending}>
              <Play className="mr-2 h-4 w-4" />{campaign.status === "stopped" ? "Resume" : "Start"}
            </Button>
          )}
          {campaign.status === "running" && (
            <>
              {queuedCount > 0 && (
                <Button onClick={() => action.mutate(`/campaigns/${campaign.id}/run-next`)} disabled={action.isPending}>
                  <Play className="mr-2 h-4 w-4" />Run Next Batch
                </Button>
              )}
              <Button variant="outline" onClick={() => action.mutate(`/campaigns/${campaign.id}/stop`)} disabled={action.isPending}>
                <StopCircle className="mr-2 h-4 w-4" />Stop
              </Button>
            </>
          )}
          {failedCount > 0 && (
            <Button variant="outline" onClick={() => action.mutate(`/campaigns/${campaign.id}/retry-failed`)} disabled={action.isPending}>
              <RotateCcw className="mr-2 h-4 w-4" />Retry Failed
            </Button>
          )}
          {completedPostIds.length > 0 && (
            <Button variant="outline" onClick={() => bulkPublish.mutate(completedPostIds)} disabled={bulkPublish.isPending}>
              Mark Published
            </Button>
          )}
        </div>
      </div>

      <BywordCard className="mb-6">
        <SectionHeader
          icon={FileText}
          title="Run Console"
          description={campaign.mode === "programmatic" ? "Programmatic rows are converted into draft articles one batch at a time." : "Campaign items move from queued to generated drafts as batches finish."}
          action={<StatusBadge status={statusType(campaign.status)} label={formatStatusLabel(campaign.status)} />}
        />
        <div className="grid gap-0 divide-y divide-byword-border md:grid-cols-5 md:divide-x md:divide-y-0">
          <div className="p-4">
            <p className="type-meta">Progress</p>
            <div className="mt-3 flex items-center gap-3">
              <Progress value={progress(campaign)} className="h-2" />
              <span className="text-sm font-semibold">{progress(campaign)}%</span>
            </div>
          </div>
          <div className="p-4">
            <p className="type-meta">Queued</p>
            <p className="mt-2 text-2xl font-semibold">{queuedCount}</p>
          </div>
          <div className="p-4">
            <p className="type-meta">Running</p>
            <p className="mt-2 text-2xl font-semibold text-byword-blue">{runningCount}</p>
          </div>
          <div className="p-4">
            <p className="type-meta">Failed</p>
            <p className="mt-2 text-2xl font-semibold text-destructive">{campaign.failedItems}</p>
          </div>
          <div className="p-4">
            <p className="type-meta">Cost</p>
            <p className="mt-2 text-2xl font-semibold">{formatMoney(campaign.totalCost)}</p>
          </div>
        </div>
      </BywordCard>

      {campaign.status === "running" && queuedCount > 0 && (
        <BywordCard className="mb-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Label htmlFor="auto-run-batches" className="text-sm font-semibold">Auto-run batches</Label>
              <p className="mt-1 text-sm text-muted-foreground">Start the next 3 items when the current batch finishes.</p>
            </div>
            <Switch id="auto-run-batches" checked={autoRunBatches} onCheckedChange={setAutoRunBatches} />
          </div>
        </BywordCard>
      )}

      {completedPostIds.length > 0 && connectedIntegrations.length > 0 && (
        <BywordCard className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 space-y-2">
              <Label>CMS destination</Label>
              <Select value={integrationId || connectedIntegrations[0]?.id || ""} onValueChange={setIntegrationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {connectedIntegrations.map((integration) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      {integration.displayName || integration.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => bulkPush.mutate(completedPostIds)} disabled={bulkPush.isPending}>
              Push {completedPostIds.length} Draft{completedPostIds.length === 1 ? "" : "s"}
            </Button>
          </div>
        </BywordCard>
      )}

      <BywordCard className="mb-6">
        <SectionHeader icon={History} title="History" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No job history yet.</TableCell></TableRow>
            )}
            {history.map((job) => (
              <TableRow key={job.id}>
                <TableCell><StatusBadge status={statusType(job.status)} label={formatStatusLabel(job.status)} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{job.currentStep || "-"}</TableCell>
                <TableCell>{job.resultPostIds?.length || 0}</TableCell>
                <TableCell>{formatMoney(job.totalCost)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{safeFormatDistanceToNow(job.createdAt)}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{job.errorMessage || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BywordCard>

      <BywordCard>
        <SectionHeader
          icon={Megaphone}
          title="Items"
          description="Inspect each keyword, title, or programmatic row and retry failed outputs in place."
          action={<span className="type-meta rounded-sm border border-byword-border bg-muted px-2 py-1">{filteredItems.length} shown</span>}
        />
        <div className="grid gap-3 border-b border-byword-border p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Search item inputs, variables, steps, errors..." />
          </div>
          <Select value={itemStatusFilter} onValueChange={(value) => setItemStatusFilter(value as CampaignStatus | "all")}>
            <SelectTrigger>
              <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All item statuses</SelectItem>
              {campaignStatuses.map((status) => (
                <SelectItem key={status} value={status}>{formatStatusLabel(status)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No items match these filters.</TableCell></TableRow>
            )}
            {filteredItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.position}</TableCell>
                <TableCell className="max-w-xl">
                  <p className="truncate font-medium">{item.title || item.keyword || item.input}</p>
                  {item.variables ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(item.variables).slice(0, 4).map(([key, value]) => (
                        <span key={key} className="max-w-[220px] truncate rounded-sm border border-byword-border bg-muted px-2 py-1 text-[11px] text-muted-foreground" title={`${key}: ${value}`}>
                          <span className="font-mono uppercase">{key}</span>: {value}
                        </span>
                      ))}
                      {Object.keys(item.variables).length > 4 && (
                        <span className="rounded-sm border border-byword-border bg-muted px-2 py-1 text-[11px] text-muted-foreground">+{Object.keys(item.variables).length - 4}</span>
                      )}
                    </div>
                  ) : (
                    <p className="truncate text-xs text-muted-foreground">{item.input}</p>
                  )}
                </TableCell>
                <TableCell><StatusBadge status={statusType(item.status)} label={formatStatusLabel(item.status)} /></TableCell>
                <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                  {formatStep(item.currentStep) || item.jobStatus || "-"}
                </TableCell>
                <TableCell>
                  {item.postId ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/posts/${item.postId}/edit`}><ExternalLink className="mr-2 h-3.5 w-3.5" />Open</Link>
                    </Button>
                  ) : item.status === "failed" ? (
                    <Button variant="outline" size="sm" onClick={() => action.mutate(`/campaigns/${campaign.id}/items/${item.id}/retry`)} disabled={action.isPending}>
                      <RotateCcw className="mr-2 h-3.5 w-3.5" />Retry
                    </Button>
                  ) : "-"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={item.errorMessage || item.jobErrorMessage || ""}>
                  {item.errorMessage || item.jobErrorMessage || "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BywordCard>
    </BywordPageShell>
  );
}

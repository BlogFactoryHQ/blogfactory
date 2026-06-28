import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, History, Megaphone, Play, Plus, RotateCcw, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
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

export default function Campaigns() {
  const params = useParams();
  if (params.id) return <CampaignDetail id={params.id} />;
  return <CampaignList />;
}

function CampaignList() {
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<Campaign[]>("/campaigns"),
    refetchInterval: 5000,
  });

  return (
    <BywordPageShell className="max-w-7xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="mt-2 text-muted-foreground">Batch article generation with shared voice and settings.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            More than a flat keyword list? <Link to="/programmatic" className="font-medium text-byword-blue hover:underline">Use Programmatic</Link>.
          </p>
        </div>
        <Button asChild>
          <Link to="/content-creator?mode=campaign"><Plus className="mr-2 h-4 w-4" />New Campaign</Link>
        </Button>
      </div>

      <BywordCard>
        <SectionHeader icon={Megaphone} title="Campaigns" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!isLoading && campaigns.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No campaigns yet.</TableCell></TableRow>
            )}
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id} className="cursor-pointer" onClick={() => navigate(`/campaigns/${campaign.id}`)}>
                <TableCell className="font-medium">{campaign.name}</TableCell>
                <TableCell>{modeLabels[campaign.mode] || campaign.mode}</TableCell>
                <TableCell><StatusBadge status={statusType(campaign.status)} label={campaign.status} /></TableCell>
                <TableCell>
                  <div className="flex min-w-40 items-center gap-3">
                    <Progress value={progress(campaign)} className="h-2" />
                    <span className="w-16 text-xs text-muted-foreground">{campaign.completedItems}/{campaign.totalItems}</span>
                  </div>
                </TableCell>
                <TableCell>{campaign.totalCost ? `$${campaign.totalCost.toFixed(4)}` : "-"}</TableCell>
                <TableCell>{formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}</TableCell>
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
  const { integrations } = useIntegrations();
  const connectedIntegrations = useMemo(() => integrations.filter((integration) => integration.status === "connected"), [integrations]);
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => api.get<{ campaign: Campaign; items: CampaignItem[]; history: CampaignHistory[] }>(`/campaigns/${id}`),
    refetchInterval: 5000,
  });

  const action = useMutation({
    mutationFn: (path: string) => api.post(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
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

  if (isLoading || !data) {
    return (
      <BywordPageShell>
        <p className="text-muted-foreground">Loading...</p>
      </BywordPageShell>
    );
  }

  const { campaign, items, history = [] } = data;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const completedPostIds = items.map((item) => item.postId).filter((id): id is string => Boolean(id));
  const resumableCount = items.filter((item) => item.status === "stopped").length;

  return (
    <BywordPageShell className="max-w-7xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
          <p className="mt-2 text-muted-foreground">{campaign.completedItems}/{campaign.totalItems} completed</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/campaigns">Back</Link></Button>
          {(campaign.status === "draft" || (campaign.status === "stopped" && resumableCount > 0)) && (
            <Button onClick={() => action.mutate(`/campaigns/${campaign.id}/start`)} disabled={action.isPending}>
              <Play className="mr-2 h-4 w-4" />{campaign.status === "stopped" ? "Resume" : "Start"}
            </Button>
          )}
          {campaign.status === "running" && (
            <Button variant="outline" onClick={() => action.mutate(`/campaigns/${campaign.id}/stop`)} disabled={action.isPending}>
              <StopCircle className="mr-2 h-4 w-4" />Stop
            </Button>
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

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <BywordCard className="p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-2"><StatusBadge status={statusType(campaign.status)} label={campaign.status} /></div>
        </BywordCard>
        <BywordCard className="p-4">
          <p className="text-xs text-muted-foreground">Progress</p>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={progress(campaign)} className="h-2" />
            <span className="text-sm font-medium">{progress(campaign)}%</span>
          </div>
        </BywordCard>
        <BywordCard className="p-4">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="mt-2 text-2xl font-semibold">{campaign.failedItems}</p>
        </BywordCard>
        <BywordCard className="p-4">
          <p className="text-xs text-muted-foreground">Cost</p>
          <p className="mt-2 text-2xl font-semibold">{campaign.totalCost ? `$${campaign.totalCost.toFixed(4)}` : "-"}</p>
        </BywordCard>
      </div>

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
                <TableCell><StatusBadge status={statusType(job.status)} label={job.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{job.currentStep || "-"}</TableCell>
                <TableCell>{job.resultPostIds?.length || 0}</TableCell>
                <TableCell>{job.totalCost ? `$${job.totalCost.toFixed(4)}` : "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{job.errorMessage || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BywordCard>

      <BywordCard>
        <SectionHeader icon={Megaphone} title="Items" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.position}</TableCell>
                <TableCell className="max-w-xl">
                  <p className="truncate font-medium">{item.title || item.keyword || item.input}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.variables ? Object.entries(item.variables).map(([key, value]) => `${key}: ${value}`).join(" · ") : item.input}
                  </p>
                </TableCell>
                <TableCell><StatusBadge status={statusType(item.status)} label={item.status} /></TableCell>
                <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                  {formatStep(item.currentStep) || item.jobStatus || "-"}
                </TableCell>
                <TableCell>
                  {item.postId ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/posts/${item.postId}/edit`}><ExternalLink className="mr-2 h-3.5 w-3.5" />Open</Link>
                    </Button>
                  ) : "-"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{item.errorMessage || item.jobErrorMessage || "-"}</TableCell>
                <TableCell>
                  {item.status === "failed" && (
                    <Button variant="outline" size="sm" onClick={() => action.mutate(`/campaigns/${campaign.id}/items/${item.id}/retry`)} disabled={action.isPending}>
                      Retry
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BywordCard>
    </BywordPageShell>
  );
}

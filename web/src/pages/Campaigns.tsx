import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, History, Megaphone, Play, Plus, RotateCcw, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { LiveTextModelSelect } from "@/components/content/LiveTextModelSelect";
import {
  DEFAULT_SPLIT_CONFIG,
  SplitImageGenerationSettings,
  type AspectRatio,
  type Resolution,
  type SplitImageConfig,
  type SplitImageDefaults,
} from "@/components/content/ImageGenerationSettings";
import { useIntegrations } from "@/hooks/useIntegrations";

type CampaignMode = "keyword" | "title" | "title_outline";
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
  postId: string | null;
  errorMessage: string | null;
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

interface PersonaOption {
  id: string;
  name: string;
  status: string;
  base_model: string;
}

interface ContentUserSettings {
  cover_enabled?: boolean | null;
  cover_resolution?: string | null;
  cover_aspect_ratio?: string | null;
  inline_enabled?: boolean | null;
  inline_count?: number | null;
  inline_resolution?: string | null;
  inline_aspect_ratio?: string | null;
}

const modeLabels: Record<CampaignMode, string> = {
  keyword: "Keyword",
  title: "Title",
  title_outline: "Title + Outline",
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

function parseSharedOutline(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^h3\s*:/i.test(line)) return { level: 3, text: line.replace(/^h3\s*:/i, "").trim() };
      if (/^h2\s*:/i.test(line)) return { level: 2, text: line.replace(/^h2\s*:/i, "").trim() };
      return { level: 2, text: line };
    })
    .filter((heading) => heading.text);
}

function linesCount(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

export default function Campaigns() {
  const params = useParams();
  const location = useLocation();
  if (location.pathname.endsWith("/new")) return <NewCampaign />;
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
        </div>
        <Button asChild>
          <Link to="/campaigns/new"><Plus className="mr-2 h-4 w-4" />New Campaign</Link>
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

function NewCampaign() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<CampaignMode>("keyword");
  const [outlineMode, setOutlineMode] = useState("none");
  const [lines, setLines] = useState("");
  const [sharedOutline, setSharedOutline] = useState("");
  const [personaId, setPersonaId] = useState("none");
  const [modelId, setModelId] = useState("openai/gpt-4o");
  const [customInstructions, setCustomInstructions] = useState("");
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);
  const [startNow, setStartNow] = useState(true);

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: () => api.get<PersonaOption[]>("/personas"),
  });

  const activePersonas = useMemo(() => personas.filter((persona) => persona.status === "active"), [personas]);

  const { data: userSettings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.get<ContentUserSettings>("/settings"),
  });

  useEffect(() => {
    if (!userSettings) return;
    setImageConfig({
      cover: {
        enabled: userSettings.cover_enabled ?? true,
        resolution: (userSettings.cover_resolution as Resolution) || "1K",
        aspectRatio: (userSettings.cover_aspect_ratio as AspectRatio) || "16:9",
      },
      inline: {
        enabled: userSettings.inline_enabled ?? true,
        count: userSettings.inline_count || 2,
        resolution: (userSettings.inline_resolution as Resolution) || "Web",
        aspectRatio: (userSettings.inline_aspect_ratio as AspectRatio) || "3:2",
      },
    });
  }, [userSettings]);

  const imageDefaults: SplitImageDefaults | undefined = userSettings
    ? {
        cover: {
          enabled: userSettings.cover_enabled ?? true,
          resolution: (userSettings.cover_resolution as Resolution) || "1K",
          aspectRatio: (userSettings.cover_aspect_ratio as AspectRatio) || "16:9",
        },
        inline: {
          enabled: userSettings.inline_enabled ?? true,
          count: userSettings.inline_count || 2,
          resolution: (userSettings.inline_resolution as Resolution) || "Web",
          aspectRatio: (userSettings.inline_aspect_ratio as AspectRatio) || "3:2",
        },
      }
    : undefined;

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await api.post<{ campaign: Campaign; items: CampaignItem[] }>("/campaigns", {
        name,
        mode,
        outlineMode: mode === "title_outline" ? outlineMode : "none",
        lines,
        sharedOutline: parseSharedOutline(sharedOutline),
        personaId: personaId === "none" ? null : personaId,
        modelId,
        customInstructions,
        generateImages: imageConfig.cover.enabled || imageConfig.inline.enabled,
        imageConfig,
      });
      if (startNow) await api.post(`/campaigns/${result.campaign.id}/start`);
      return result;
    },
    onSuccess: ({ campaign }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(startNow ? "Campaign started" : "Campaign created");
      navigate(`/campaigns/${campaign.id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create campaign"),
  });

  return (
    <BywordPageShell className="max-w-5xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Campaign</h1>
          <p className="mt-2 text-muted-foreground">{linesCount(lines)} item{linesCount(lines) === 1 ? "" : "s"} ready</p>
        </div>
        <Button variant="outline" asChild><Link to="/campaigns">Back</Link></Button>
      </div>

      <BywordCard>
        <SectionHeader icon={Megaphone} title="Campaign setup" />
        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Q1 product guides" />
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as CampaignMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Keyword</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="title_outline">Title + Outline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "title_outline" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Outline Mode</Label>
                <Select value={outlineMode} onValueChange={setOutlineMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Per line</SelectItem>
                    <SelectItem value="shared">Shared outline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {outlineMode === "shared" && (
                <div className="space-y-2">
                  <Label>Shared Outline</Label>
                  <Textarea value={sharedOutline} onChange={(event) => setSharedOutline(event.target.value)} placeholder={"Introduction\nH3:Key details\nConclusion"} className="min-h-24" />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Items</Label>
            <Textarea
              value={lines}
              onChange={(event) => setLines(event.target.value)}
              placeholder={mode === "keyword" ? "best crm for startups" : mode === "title" ? "Best CRM for Startups" : "Best CRM for Startups; Introduction; H3:Pricing; Conclusion"}
              className="min-h-56 font-mono text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Brand Voice</Label>
              <Select
                value={personaId}
                onValueChange={(value) => {
                  setPersonaId(value);
                  const persona = activePersonas.find((item) => item.id === value);
                  if (persona?.base_model) setModelId(persona.base_model);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  {activePersonas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <LiveTextModelSelect value={modelId} onValueChange={setModelId} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Custom Instructions</Label>
            <Textarea value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} className="min-h-24" />
          </div>

          <SplitImageGenerationSettings
            config={imageConfig}
            onConfigChange={setImageConfig}
            defaults={imageDefaults}
            compact
          />

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={startNow} onCheckedChange={(checked) => setStartNow(Boolean(checked))} />
              Start after create
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-byword-border pt-6">
            <Button variant="outline" asChild><Link to="/campaigns">Cancel</Link></Button>
            <Button disabled={createMutation.isPending || !name.trim() || !linesCount(lines)} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </div>
        </div>
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

  return (
    <BywordPageShell className="max-w-7xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
          <p className="mt-2 text-muted-foreground">{campaign.completedItems}/{campaign.totalItems} completed</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/campaigns">Back</Link></Button>
          {campaign.status !== "running" && campaign.status !== "completed" && (
            <Button onClick={() => action.mutate(`/campaigns/${campaign.id}/start`)} disabled={action.isPending}>
              <Play className="mr-2 h-4 w-4" />Start
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
                  <p className="truncate text-xs text-muted-foreground">{item.input}</p>
                </TableCell>
                <TableCell><StatusBadge status={statusType(item.status)} label={item.status} /></TableCell>
                <TableCell>
                  {item.postId ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/posts/${item.postId}/edit`}><ExternalLink className="mr-2 h-3.5 w-3.5" />Open</Link>
                    </Button>
                  ) : "-"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{item.errorMessage || "-"}</TableCell>
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

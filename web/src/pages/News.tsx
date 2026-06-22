import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Database, FileText, FileUp, Loader2, ListTodo, Newspaper, PlayCircle, Rss, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { FREQUENCIES } from "@/lib/mock-data";
import { parseSportsMatrixFile, sportsMatrixStats, type SportsMatrixRow } from "@/lib/sports-news";
import { useAuth } from "@/hooks/useAuth";
import { useTextModels } from "@/hooks/useTextModels";
import { LiveTextModelSelect, isUnavailableModel } from "@/components/content/LiveTextModelSelect";

interface UserSettings {
  content_rules?: {
    news?: { matrixRows?: SportsMatrixRow[]; fileName?: string; importedAt?: string };
    sportsNews?: { matrixRows?: SportsMatrixRow[]; fileName?: string; importedAt?: string };
    [key: string]: unknown;
  } | null;
}

interface Persona {
  id: string;
  name: string;
  status: string;
  base_model: string;
}

interface Feed {
  id: string;
  name: string;
  source_url: string;
  is_active: boolean;
  persona_id?: string | null;
  model_id?: string | null;
  posts_per_run?: number | null;
  extract_full_content?: boolean | null;
  filter_old_posts_days?: number | null;
  platform_config?: Record<string, unknown> | null;
}

const isNewsFeed = (feed: Feed) => {
  const mode = feed.platform_config?.editorialMode;
  return mode === "news" || mode === "sports_news";
};

const isActiveMatrixRow = (row: SportsMatrixRow) => (row.status || "").toLocaleLowerCase("tr").includes("aktif");

export default function News() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: textModels = [] } = useTextModels();
  const [matrixRows, setMatrixRows] = useState<SportsMatrixRow[]>([]);
  const [matrixFileName, setMatrixFileName] = useState("");
  const [matrixImportedAt, setMatrixImportedAt] = useState("");
  const [isImportingMatrix, setIsImportingMatrix] = useState(false);
  const [feedName, setFeedName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [modelId, setModelId] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [postsPerRun, setPostsPerRun] = useState("5");
  const [manualMode, setManualMode] = useState<"url" | "raw_text">("url");
  const [manualUrl, setManualUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [manualResult, setManualResult] = useState<{ jobId?: string | null; postIds?: string[] } | null>(null);
  const [runningFeedId, setRunningFeedId] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.get<UserSettings>("/settings"),
    enabled: !!user,
  });

  const { data: feeds = [] } = useQuery({
    queryKey: ["feeds"],
    queryFn: () => api.get<Feed[]>("/feeds"),
    enabled: !!user,
  });

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => (await api.get<Persona[]>("/personas")).filter((persona) => persona.status === "active"),
    enabled: !!user,
  });

  const activePersonas = useMemo(() => personas, [personas]);
  const newsFeeds = useMemo(() => feeds.filter(isNewsFeed), [feeds]);
  const activePreviewRows = useMemo(() => matrixRows.filter(isActiveMatrixRow).slice(0, 5), [matrixRows]);
  const stats = sportsMatrixStats(matrixRows);
  const matrixReady = stats.active > 0;
  const selectedModelUnavailable = isUnavailableModel(modelId, textModels);

  useEffect(() => {
    if (!settings) return;
    const news = settings.content_rules?.news || settings.content_rules?.sportsNews;
    setMatrixRows(news?.matrixRows || []);
    setMatrixFileName(news?.fileName || "");
    setMatrixImportedAt(news?.importedAt || "");
  }, [settings]);

  useEffect(() => {
    if (!modelId && textModels[0]?.id) setModelId(textModels[0].id);
  }, [modelId, textModels]);

  useEffect(() => {
    if (!personaId && activePersonas[0]) {
      setPersonaId(activePersonas[0].id);
      setModelId(activePersonas[0].base_model || textModels[0]?.id || "");
    }
  }, [activePersonas, personaId, textModels]);

  const saveMatrixMutation = useMutation({
    mutationFn: async ({ rows, fileName }: { rows: SportsMatrixRow[]; fileName: string }) => {
      const nextRules = {
        ...(settings?.content_rules || {}),
        news: { ...(settings?.content_rules?.news || {}), matrixRows: rows, fileName, importedAt: new Date().toISOString() },
      };
      return api.put<UserSettings>("/settings", { content_rules: nextRules });
    },
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["user-settings"], nextSettings);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("News source matrix imported");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to import news source matrix"),
  });

  const createFeedMutation = useMutation({
    mutationFn: () => api.post("/feeds", {
      name: feedName.trim(),
      source_url: feedUrl.trim(),
      platform: "rss",
      platform_config: { url: feedUrl.trim(), editorialMode: "news" },
      persona_id: personaId,
      model_id: modelId,
      frequency,
      is_active: true,
      posts_per_run: Number(postsPerRun),
      include_content: false,
      include_summary: false,
      include_comments: 0,
    }),
    onSuccess: () => {
      setFeedName("");
      setFeedUrl("");
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      toast.success("News RSS source saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save news source"),
  });

  const generateManualMutation = useMutation({
    onMutate: () => setManualResult(null),
    mutationFn: () => api.post<{ jobId?: string; postIds?: string[] }>("/content/generate", {
      sourceType: manualMode,
      sourceValue: manualMode === "url" ? manualUrl.trim() : rawText.trim(),
      personaId,
      modelId,
      variations: 1,
      platformConfig: { editorialMode: "news" },
    }),
    onSuccess: (result) => {
      setManualResult(result);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["recent-posts"] });
      toast.success("News draft queued");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to generate news draft"),
  });

  const runFeedMutation = useMutation({
    mutationFn: async (feed: Feed) => {
      setRunningFeedId(feed.id);
      return api.post("/content/generate", {
        sourceType: "rss_feed",
        sourceValue: feed.source_url,
        personaId: feed.persona_id,
        modelId: feed.model_id,
        variations: feed.posts_per_run ?? 5,
        feedId: feed.id,
        extractFullContent: feed.extract_full_content ?? false,
        filterOldPostsDays: feed.filter_old_posts_days || undefined,
        platformConfig: feed.platform_config || { url: feed.source_url, editorialMode: "news" },
        generateImages: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("News source run queued");
      setRunningFeedId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to run news source");
      setRunningFeedId(null);
    },
  });

  const handleMatrixChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImportingMatrix(true);
    try {
      const rows = await parseSportsMatrixFile(file);
      if (!rows.length) throw new Error("No source rows found in Haber Matrisi");
      setMatrixRows(rows);
      setMatrixFileName(file.name);
      setMatrixImportedAt(new Date().toISOString());
      saveMatrixMutation.mutate({ rows, fileName: file.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import news source matrix");
    } finally {
      setIsImportingMatrix(false);
    }
  };

  const selectPersona = (nextPersonaId: string) => {
    setPersonaId(nextPersonaId);
    const persona = activePersonas.find((item) => item.id === nextPersonaId);
    if (persona?.base_model) setModelId(persona.base_model);
  };

  const canCreateFeed = Boolean(feedName.trim() && feedUrl.trim() && personaId && modelId && !selectedModelUnavailable);
  const manualValue = manualMode === "url" ? manualUrl : rawText;
  const canGenerateManual = Boolean(manualValue.trim() && personaId && modelId && !selectedModelUnavailable);
  const defaultBlocker = !matrixReady
    ? "Import a matrix with active sources first."
    : !personaId
      ? "Select an active persona."
      : selectedModelUnavailable
        ? "Pick a live OpenRouter model."
        : "";
  const feedBlocker = defaultBlocker || (!feedName.trim() ? "Add a feed name." : !feedUrl.trim() ? "Paste an RSS URL." : "");
  const manualBlocker = defaultBlocker || (!manualValue.trim() ? (manualMode === "url" ? "Paste a news URL." : "Paste source text.") : "");
  const importedLabel = matrixImportedAt ? new Date(matrixImportedAt).toLocaleString() : "";

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Newsroom"
        description="Import source rules, choose newsroom defaults, then create RSS or manual news drafts."
      >
        <Button variant="outline" asChild>
          <Link to="/posts"><FileText className="mr-2 h-4 w-4" />Review Drafts</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/jobs"><ListTodo className="mr-2 h-4 w-4" />Jobs</Link>
        </Button>
      </PageHeader>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          { label: "1. Import matrix", done: matrixReady, text: matrixReady ? `${stats.active} active sources ready` : "Required before drafting" },
          { label: "2. Set defaults", done: Boolean(personaId && modelId && !selectedModelUnavailable), text: personaId ? "Persona and model selected" : "Choose a writer persona" },
          { label: "3. Review drafts", done: false, text: "Approved posts still live in Posts" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 rounded-lg border border-byword-border bg-card px-4 py-3">
            {item.done ? <CheckCircle2 className="h-4 w-4 text-status-success" /> : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="truncate text-xs text-muted-foreground">{item.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <BywordCard>
            <SectionHeader
              icon={Database}
              title="News Source Matrix"
              description="News drafts are created only when the source matches an active, non-data matrix row."
              action={
                <Button type="button" variant="outline" disabled={isImportingMatrix || saveMatrixMutation.isPending} asChild>
                  <label>
                    {isImportingMatrix || saveMatrixMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="mr-2 h-4 w-4" />
                    )}
                    Import Matrix
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={handleMatrixChange}
                    />
                  </label>
                </Button>
              }
            />
            <div className="space-y-5 p-6">
              <div className="grid overflow-hidden rounded-lg border border-byword-border text-sm md:grid-cols-3">
                <div className="p-4"><p className="text-2xl font-semibold">{stats.total}</p><p className="text-sm text-muted-foreground">Sources</p></div>
                <div className="border-t border-byword-border p-4 md:border-l md:border-t-0"><p className="text-2xl font-semibold">{stats.active}</p><p className="text-sm text-muted-foreground">Active</p></div>
                <div className="border-t border-byword-border p-4 md:border-l md:border-t-0"><p className="text-2xl font-semibold">{stats.passive}</p><p className="text-sm text-muted-foreground">Passive</p></div>
              </div>
              <div className="rounded-lg border border-byword-border p-5">
                <div className="flex items-start gap-3">
                  <IconTile icon={Database} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{matrixFileName || "No matrix imported"}</p>
                      <Badge variant={matrixReady ? "secondary" : "outline"}>{matrixReady ? "Ready" : "Required"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Unknown, passive, and data-only sources are skipped before AI drafting.</p>
                    {importedLabel && <p className="mt-2 text-xs text-muted-foreground">Last imported: {importedLabel}</p>}
                  </div>
                </div>
              </div>
              {activePreviewRows.length > 0 && (
                <div className="rounded-lg border border-byword-border">
                  <div className="border-b border-byword-border px-4 py-3">
                    <p className="text-sm font-semibold">Active source preview</p>
                    <p className="text-xs text-muted-foreground">First 5 active rows parsed from the matrix.</p>
                  </div>
                  <div className="divide-y divide-byword-border">
                    {activePreviewRows.map((row) => (
                      <div key={`${row.sourceName}-${row.siteLink || row.xLink || row.otherLink || row.sourceType}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.sourceName}</p>
                          <p className="truncate text-xs text-muted-foreground">{row.sourceType || row.publishRule || "Source rule"}</p>
                        </div>
                        {row.tags && <Badge variant="outline" className="shrink-0">{row.tags.split(",")[0].trim()}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader icon={Rss} title="News RSS Source" description="Saved here, the feed always runs through News rules." />
            <div className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="news-feed-name">Feed Name</Label>
                  <Input id="news-feed-name" value={feedName} onChange={(event) => setFeedName(event.target.value)} placeholder="Reuters World News" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="news-feed-url">RSS URL</Label>
                  <Input id="news-feed-url" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://example.com/feed.xml" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Posts Per Run</Label>
                  <Select value={postsPerRun} onValueChange={setPostsPerRun}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["1", "3", "5", "10"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {feedBlocker && <p className="text-sm text-muted-foreground">{feedBlocker}</p>}
              <Button onClick={() => createFeedMutation.mutate()} disabled={!matrixReady || !canCreateFeed || createFeedMutation.isPending}>
                {createFeedMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rss className="mr-2 h-4 w-4" />}
                {feedBlocker || "Save News Source"}
              </Button>
            </div>
          </BywordCard>
        </div>

        <div className="space-y-6">
          <BywordCard>
            <SectionHeader icon={Settings2} title="News Defaults" description="Used by both RSS sources and manual drafts." />
            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <Label>Persona</Label>
                <Select value={personaId} onValueChange={selectPersona}>
                  <SelectTrigger><SelectValue placeholder="Select persona" /></SelectTrigger>
                  <SelectContent>
                    {activePersonas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!activePersonas.length && <p className="text-xs text-muted-foreground">Create an active persona before generating news.</p>}
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <LiveTextModelSelect value={modelId} onValueChange={setModelId} />
                {selectedModelUnavailable && <p className="text-xs text-destructive">Pick a live OpenRouter model.</p>}
              </div>
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader icon={Send} title="Manual Draft" description="Use for one-off news URLs or pasted source text." />
            <div className="space-y-4 p-6">
              <Select value={manualMode} onValueChange={(value) => setManualMode(value as "url" | "raw_text")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="raw_text">Raw Text</SelectItem>
                </SelectContent>
              </Select>
              {manualMode === "url" ? (
                <Input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="https://example.com/news/story" />
              ) : (
                <Textarea value={rawText} onChange={(event) => setRawText(event.target.value)} className="min-h-[180px]" placeholder="Paste source text..." />
              )}
              {manualBlocker && <p className="text-sm text-muted-foreground">{manualBlocker}</p>}
              <Button className="w-full" onClick={() => generateManualMutation.mutate()} disabled={!matrixReady || !canGenerateManual || generateManualMutation.isPending}>
                {generateManualMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Newspaper className="mr-2 h-4 w-4" />}
                {manualBlocker || "Create News Draft"}
              </Button>
              {manualResult && (
                <div className="rounded-lg border border-byword-border bg-byword-blue-soft/40 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Draft request sent</p>
                      <p className="mt-1 text-xs text-muted-foreground">Track generation in Jobs, then approve the draft in Posts.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" asChild><Link to="/jobs">View Jobs</Link></Button>
                        <Button size="sm" variant="outline" asChild><Link to="/posts">Review Drafts</Link></Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader icon={Newspaper} title="News Sources" description={`${newsFeeds.length} configured`} />
            <div className="divide-y divide-byword-border">
              {newsFeeds.length ? newsFeeds.slice(0, 6).map((feed) => {
                const runBlocker = !matrixReady
                  ? "Import matrix first"
                  : !feed.persona_id
                    ? "No persona"
                    : !feed.model_id
                      ? "No model"
                      : "";
                return (
                <div key={feed.id} className="flex items-center justify-between gap-3 px-6 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{feed.name}</p>
                      <Badge variant="outline">News</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{feed.source_url}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={feed.is_active ? "secondary" : "outline"}>{feed.is_active ? "Active" : "Paused"}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(runBlocker) || runningFeedId === feed.id}
                      title={runBlocker || "Run this News source now"}
                      onClick={() => runFeedMutation.mutate(feed)}
                    >
                      {runningFeedId === feed.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-2 h-3.5 w-3.5" />}
                      {runBlocker || "Run"}
                    </Button>
                  </div>
                </div>
              );
              }) : (
                <div className="px-6 py-8">
                  <div className="flex items-start gap-3">
                    <IconTile icon={Rss} />
                    <div>
                      <p className="text-sm font-semibold">No News RSS sources yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Import the matrix, set defaults, then save a trusted RSS source on this page.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-byword-border p-4">
              <Button variant="outline" className="w-full" asChild><Link to="/rss-feeds">Manage all sources</Link></Button>
            </div>
          </BywordCard>
        </div>
      </div>
    </BywordPageShell>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Database, FileText, FileUp, Loader2, ListTodo, Newspaper, Pencil, PlayCircle, Plus, Rss, Save, Send, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { feedDraftQueueLabel, queueFeedDraftJobs } from "@/lib/feed-generation";
import { FREQUENCIES } from "@/lib/source-options";
import { matchSportsMatrixRow, newsRuleLabel, parseSportsMatrixFile, sportsMatrixStats, type SportsMatrixRow } from "@/lib/sports-news";
import { useAuth } from "@/hooks/useAuth";
import { useTextModels } from "@/hooks/useTextModels";
import { LiveTextModelSelect, isUnavailableModel, preferredTextModelId } from "@/components/content/LiveTextModelSelect";

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
  keywords?: string[] | null;
  filter_type?: string | null;
  filter_value?: number | null;
  extract_full_content?: boolean | null;
  filter_old_posts_days?: number | null;
  platform_config?: Record<string, unknown> | null;
}

const isNewsFeed = (feed: Feed) => {
  const mode = feed.platform_config?.editorialMode;
  return mode === "news" || mode === "sports_news";
};

const isActiveMatrixRow = (row: SportsMatrixRow) => (row.status || "").toLocaleLowerCase("tr").includes("aktif");

const isMonitorableMatrixRow = (row: SportsMatrixRow) => {
  const sourceType = (row.sourceType || "").toLocaleLowerCase("tr");
  const rule = (row.publishRule || "").toLocaleLowerCase("tr");
  return isActiveMatrixRow(row) && !/veri|data|scout/.test(sourceType) && !/^(veri|data)/.test(rule);
};

const normalizeUrl = (value?: string | null) => {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
};

const firstUsableFeedUrl = (row: SportsMatrixRow) => {
  for (const value of [row.siteLink, row.otherLink]) {
    const url = normalizeUrl(value);
    if (!url) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (["x.com", "twitter.com"].includes(host)) continue;
    return url;
  }
  return "";
};

const SOURCE_TYPE_OPTIONS = [
  { value: "Publisher/Media", label: "Publisher / media", hint: "Verified news label" },
  { value: "Official", label: "Official source", hint: "Official label" },
  { value: "Reporter/Insider", label: "Reporter / insider", hint: "Attribution label" },
  { value: "Standard News", label: "Standard news", hint: "Normal rewrite" },
  { value: "Data/Scout Only", label: "Data / scout only", hint: "Skip article generation" },
];

const PUBLISH_RULE_OPTIONS = [
  { value: "Standard rewrite", label: "Standard rewrite", hint: "Rewrite with neutral news tone" },
  { value: "Attribute claims", label: "Attribute claims", hint: "Keep claims tied to the source" },
  { value: "Require second source", label: "Require second source", hint: "Use cautious wording" },
  { value: "Official statement only", label: "Official statement only", hint: "Use official/confirmed language only for official sources" },
  { value: "Data only: do not generate", label: "Data only: do not generate", hint: "Skip as article source" },
];

const RELIABILITY_OPTIONS = ["5", "4", "3", "2", "1"];

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
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [ruleDraft, setRuleDraft] = useState<SportsMatrixRow | null>(null);
  const [selectedMatrixFeedKeys, setSelectedMatrixFeedKeys] = useState<string[]>([]);

  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.get<UserSettings>("/settings"),
    enabled: !!user,
  });

  const { data: feeds = [] } = useQuery({
    queryKey: ["feeds"],
    queryFn: () => api.getArray<Feed>("/feeds"),
    enabled: !!user,
  });

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => (await api.getArray<Persona>("/personas")).filter((persona) => persona.status === "active"),
    enabled: !!user,
  });

  const activePersonas = useMemo(() => personas, [personas]);
  const newsFeeds = useMemo(() => feeds.filter(isNewsFeed), [feeds]);
  const activePreviewRows = useMemo(() => matrixRows.filter(isActiveMatrixRow).slice(0, 5), [matrixRows]);
  const monitoredUrls = useMemo(() => new Set(newsFeeds.map((feed) => normalizeUrl(feed.source_url)).filter(Boolean)), [newsFeeds]);
  const matrixFeedCandidates = useMemo(() => {
    const seen = new Set<string>();
    return matrixRows
      .filter(isMonitorableMatrixRow)
      .map((row, index) => ({ row, index, url: firstUsableFeedUrl(row) }))
      .filter((item): item is { row: SportsMatrixRow; index: number; url: string } => Boolean(item.url))
      .filter((item) => {
        const normalized = normalizeUrl(item.url);
        if (!normalized || monitoredUrls.has(normalized) || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .map((item) => ({ ...item, key: `${item.index}:${normalizeUrl(item.url)}` }));
  }, [matrixRows, monitoredUrls]);
  const stats = sportsMatrixStats(matrixRows);
  const matrixReady = stats.active > 0;
  const feedRuleMatch = feedUrl.trim() ? matchSportsMatrixRow(feedUrl.trim(), matrixRows) : null;
  const selectedModelUnavailable = isUnavailableModel(modelId, textModels);

  useEffect(() => {
    if (!settings) return;
    const news = settings.content_rules?.news || settings.content_rules?.sportsNews;
    setMatrixRows(news?.matrixRows || []);
    setMatrixFileName(news?.fileName || "");
    setMatrixImportedAt(news?.importedAt || "");
  }, [settings]);

  useEffect(() => {
    setSelectedMatrixFeedKeys([]);
  }, [matrixRows]);

  useEffect(() => {
    const fallback = preferredTextModelId(textModels);
    if (!modelId && fallback) setModelId(fallback);
  }, [modelId, textModels]);

  useEffect(() => {
    if (!personaId && activePersonas[0]) {
      setPersonaId(activePersonas[0].id);
      setModelId(preferredTextModelId(textModels, activePersonas[0].base_model));
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

  const saveRulesMutation = useMutation({
    mutationFn: async (rows: SportsMatrixRow[]) => {
      const nextRules = {
        ...(settings?.content_rules || {}),
        news: { ...(settings?.content_rules?.news || {}), matrixRows: rows, fileName: matrixFileName, importedAt: matrixImportedAt || new Date().toISOString() },
      };
      return api.put<UserSettings>("/settings", { content_rules: nextRules });
    },
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["user-settings"], nextSettings);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("News rules saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save news rules"),
  });

  const createFeedMutation = useMutation({
    mutationFn: () => api.post("/feeds", {
      name: feedName.trim(),
      source_url: feedUrl.trim(),
      platform: "rss",
      platform_config: {
        url: feedUrl.trim(),
        editorialMode: "news",
        matchedSourceName: feedRuleMatch?.sourceName,
        matchedLabel: feedRuleMatch ? newsRuleLabel(feedRuleMatch) : undefined,
      },
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

  const createMatrixFeedsMutation = useMutation({
    mutationFn: async () => {
      const selected = matrixFeedCandidates.filter((candidate) => selectedMatrixFeedKeys.includes(candidate.key));
      await Promise.all(selected.map((candidate) => api.post("/feeds", {
        name: candidate.row.sourceName,
        source_url: candidate.url,
        platform: "rss",
        platform_config: {
          url: candidate.url,
          editorialMode: "news",
          matchedSourceName: candidate.row.sourceName,
          matchedLabel: newsRuleLabel(candidate.row),
        },
        persona_id: personaId,
        model_id: modelId,
        frequency,
        is_active: true,
        posts_per_run: Number(postsPerRun),
        include_content: false,
        include_summary: false,
        include_comments: 0,
      })));
      return selected.length;
    },
    onSuccess: (count) => {
      setSelectedMatrixFeedKeys([]);
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      toast.success(`${count} News RSS feed${count === 1 ? "" : "s"} created`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create feeds from matrix"),
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
      const postsPerRun = feed.posts_per_run ?? 5;
      const buildGenerationPayload = (feedItemOffset: number) => ({
        sourceType: "rss_feed",
        sourceValue: feed.source_url,
        personaId: feed.persona_id,
        modelId: feed.model_id,
        variations: 1,
        postsPerRun: 1,
        feedItemOffset,
        feedId: feed.id,
        filterType: feed.filter_type || undefined,
        filterValue: feed.filter_value ?? undefined,
        keywords: feed.keywords || undefined,
        extractFullContent: feed.extract_full_content ?? false,
        filterOldPostsDays: feed.filter_old_posts_days || undefined,
        platformConfig: feed.platform_config || { url: feed.source_url, editorialMode: "news" },
        generateImages: false,
      });
      return queueFeedDraftJobs(postsPerRun, (index, run) => api.post("/content/generate", {
        ...buildGenerationPayload(index),
        feedRunToken: run.token,
        feedRunSize: run.remaining,
      }));
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`News source run queued: ${feedDraftQueueLabel(result.queued)}.`);
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

  const startRule = (row?: SportsMatrixRow, index: number | null = null) => {
    setEditingRuleIndex(index);
    setRuleDraft(row ? { ...row } : {
      sourceName: feedName.trim() || feedUrl.trim() || "",
      sourceType: "Publisher/Media",
      reliability: 4,
      status: "AKTİF",
      tags: "",
      siteLink: feedUrl.trim(),
      publishRule: "Attribute claims",
    });
  };

  const cancelRule = () => {
    setEditingRuleIndex(null);
    setRuleDraft(null);
  };

  const saveRule = () => {
    const sourceName = ruleDraft?.sourceName.trim();
    if (!ruleDraft || !sourceName) {
      toast.error("Add a source name for the rule");
      return;
    }
    const nextRule = { ...ruleDraft, sourceName };
    const nextRows = editingRuleIndex === null
      ? [nextRule, ...matrixRows]
      : matrixRows.map((row, index) => index === editingRuleIndex ? nextRule : row);
    setMatrixRows(nextRows);
    saveRulesMutation.mutate(nextRows);
    cancelRule();
  };

  const canCreateFeed = Boolean(feedName.trim() && feedUrl.trim() && personaId && modelId && !selectedModelUnavailable);
  const manualValue = manualMode === "url" ? manualUrl : rawText;
  const canGenerateManual = Boolean(manualValue.trim() && personaId && modelId && !selectedModelUnavailable);
  const defaultBlocker = !personaId
      ? "Select an active persona."
      : selectedModelUnavailable
        ? "Pick a live OpenRouter model."
        : "";
  const feedBlocker = defaultBlocker || (!feedName.trim() ? "Add a feed name." : !feedUrl.trim() ? "Paste an RSS URL." : "");
  const matrixFeedBlocker = defaultBlocker || (!matrixReady ? "Import or add rules first." : !matrixFeedCandidates.length ? "No unused RSS/site links found in the matrix." : !selectedMatrixFeedKeys.length ? "Select rows to monitor." : "");
  const manualBlocker = defaultBlocker || (!manualValue.trim() ? (manualMode === "url" ? "Paste a news URL." : "Paste source text.") : "");
  const importedLabel = matrixImportedAt ? new Date(matrixImportedAt).toLocaleString() : "";

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Newsroom"
        description="Add news sources, draft articles, and optionally use source rules for labels, tags, and attribution."
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
          { label: "1. Rules", done: matrixReady, text: matrixReady ? `${stats.active} active rules imported` : "Optional source rules" },
          { label: "2. Set defaults", done: Boolean(personaId && modelId && !selectedModelUnavailable), text: personaId ? "Persona and model selected" : "Choose a writer persona" },
          { label: "3. Add feeds", done: newsFeeds.length > 0, text: newsFeeds.length ? `${newsFeeds.length} monitored RSS feeds` : "Add RSS feeds one by one" },
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
              title="Editorial Rules Matrix"
              description="Rules decide source trust, labels, tags, and attribution. They are not monitored feeds."
              action={
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => startRule()} disabled={saveRulesMutation.isPending}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Rule
                  </Button>
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
                </div>
              }
            />
            <div className="space-y-5 p-6">
              <div className="grid overflow-hidden rounded-lg border border-byword-border text-sm md:grid-cols-3">
                <div className="p-4"><p className="text-2xl font-semibold">{stats.total}</p><p className="text-sm text-muted-foreground">Rules</p></div>
                <div className="border-t border-byword-border p-4 md:border-l md:border-t-0"><p className="text-2xl font-semibold">{stats.active}</p><p className="text-sm text-muted-foreground">Active rules</p></div>
                <div className="border-t border-byword-border p-4 md:border-l md:border-t-0"><p className="text-2xl font-semibold">{newsFeeds.length}</p><p className="text-sm text-muted-foreground">Monitored feeds</p></div>
              </div>
              {ruleDraft && (
                <div className="rounded-lg border border-byword-border p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{editingRuleIndex === null ? "Add source rule" : "Edit source rule"}</p>
                      <p className="text-xs text-muted-foreground">This changes the rulebook, not the RSS feed list.</p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={cancelRule} aria-label="Cancel rule edit"><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Source Name</Label>
                      <Input value={ruleDraft.sourceName} onChange={(event) => setRuleDraft({ ...ruleDraft, sourceName: event.target.value })} placeholder="Reuters Soccer" />
                    </div>
                    <div className="space-y-2">
                      <Label>Source Type</Label>
                      <Select value={ruleDraft.sourceType || "Standard News"} onValueChange={(sourceType) => setRuleDraft({ ...ruleDraft, sourceType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SOURCE_TYPE_OPTIONS.map((item) => (
                            <SelectItem key={item.value} value={item.value}>{item.label} - {item.hint}</SelectItem>
                          ))}
                          {ruleDraft.sourceType && !SOURCE_TYPE_OPTIONS.some((item) => item.value === ruleDraft.sourceType) && (
                            <SelectItem value={ruleDraft.sourceType}>Current: {ruleDraft.sourceType}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Site / RSS URL</Label>
                      <Input value={ruleDraft.siteLink || ""} onChange={(event) => setRuleDraft({ ...ruleDraft, siteLink: event.target.value })} placeholder="https://example.com/feed.xml" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Reliability</Label>
                        <Select value={String(ruleDraft.reliability || 4)} onValueChange={(reliability) => setRuleDraft({ ...ruleDraft, reliability: Number(reliability) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RELIABILITY_OPTIONS.map((value) => (
                              <SelectItem key={value} value={value}>{value} / 5</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={ruleDraft.status || "AKTİF"} onValueChange={(status) => setRuleDraft({ ...ruleDraft, status })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AKTİF">AKTİF</SelectItem>
                            <SelectItem value="PASİF">PASİF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <Input value={ruleDraft.tags || ""} onChange={(event) => setRuleDraft({ ...ruleDraft, tags: event.target.value })} placeholder="#Gündem, #Transfer" />
                    </div>
                    <div className="space-y-2">
                      <Label>Publish Rule</Label>
                      <Select value={ruleDraft.publishRule || "Standard rewrite"} onValueChange={(publishRule) => setRuleDraft({ ...ruleDraft, publishRule })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PUBLISH_RULE_OPTIONS.map((item) => (
                            <SelectItem key={item.value} value={item.value}>{item.label} - {item.hint}</SelectItem>
                          ))}
                          {ruleDraft.publishRule && !PUBLISH_RULE_OPTIONS.some((item) => item.value === ruleDraft.publishRule) && (
                            <SelectItem value={ruleDraft.publishRule}>Current: {ruleDraft.publishRule}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={cancelRule}>Cancel</Button>
                    <Button type="button" onClick={saveRule} disabled={saveRulesMutation.isPending}>
                      {saveRulesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Rule
                    </Button>
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-byword-border p-5">
                <div className="flex items-start gap-3">
                  <IconTile icon={Database} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{matrixFileName || "No matrix imported"}</p>
                      <Badge variant={matrixReady ? "secondary" : "outline"}>{matrixReady ? "Ready" : "Optional"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Rules add labels, tags, and attribution. Unmatched sources still run with standard news rules.</p>
                    {importedLabel && <p className="mt-2 text-xs text-muted-foreground">Last imported: {importedLabel}</p>}
                  </div>
                </div>
              </div>
              {activePreviewRows.length > 0 && (
                <div className="rounded-lg border border-byword-border">
                  <div className="border-b border-byword-border px-4 py-3">
                    <p className="text-sm font-semibold">Editable rule preview</p>
                    <p className="text-xs text-muted-foreground">Edit existing rules or add one from the RSS form below.</p>
                  </div>
                  <div className="divide-y divide-byword-border">
                    {activePreviewRows.map((row) => (
                      <div key={`${row.sourceName}-${row.siteLink || row.xLink || row.otherLink || row.sourceType}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.sourceName}</p>
                          <p className="truncate text-xs text-muted-foreground">{newsRuleLabel(row)} · {row.sourceType || row.publishRule || "Source rule"}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {row.tags && <Badge variant="outline">{row.tags.split(",")[0].trim()}</Badge>}
                          <Button size="icon" variant="ghost" onClick={() => startRule(row, matrixRows.indexOf(row))} aria-label={`Edit ${row.sourceName}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader icon={Rss} title="Add Monitored RSS Feed" description="Feeds run normally. A matching rule only adds labels, tags, and attribution." />
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
              {feedUrl.trim() && (
                <div className={`rounded-md border p-4 ${feedRuleMatch ? "border-status-success/30 bg-[hsl(var(--status-success)/0.08)]" : "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.12)]"}`}>
                  <div className="flex items-start gap-3">
                    {feedRuleMatch ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-status-success" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-[hsl(var(--status-warning))]" />}
                    <div className="min-w-0 flex-1">
                      {feedRuleMatch ? (
                        <>
                          <p className="text-sm font-semibold">Matched: {feedRuleMatch.sourceName} / {newsRuleLabel(feedRuleMatch)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">This feed will use the matched rule for attribution, labels, and tags.</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold">No matching rule found.</p>
                          <p className="mt-1 text-xs text-muted-foreground">This feed will still run with standard news rewrite rules. Add a rule only if you want custom labels, tags, or source handling.</p>
                          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => startRule(undefined, null)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add rule from this source
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
              <Button onClick={() => createFeedMutation.mutate()} disabled={!canCreateFeed || createFeedMutation.isPending}>
                {createFeedMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rss className="mr-2 h-4 w-4" />}
                {feedBlocker || "Save News Source"}
              </Button>
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader
              icon={Database}
              title="Create RSS Feeds From Matrix"
              description="Only rows with usable RSS/site links are shown. Nothing is selected by default."
              action={<Badge variant="outline">{selectedMatrixFeedKeys.length} selected</Badge>}
            />
            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-byword-border bg-muted/20 p-4">
                <p className="text-sm font-medium">This does not run all matrix sources.</p>
                <p className="mt-1 text-sm text-muted-foreground">Select only the sources you want to monitor. The app creates saved News RSS feeds, but it does not start generation jobs.</p>
              </div>
              {matrixFeedCandidates.length ? (
                <div className="max-h-[360px] overflow-y-auto rounded-lg border border-byword-border">
                  {matrixFeedCandidates.map((candidate) => {
                    const checked = selectedMatrixFeedKeys.includes(candidate.key);
                    return (
                      <label key={candidate.key} className="flex cursor-pointer items-start gap-3 border-b border-byword-border px-4 py-3 last:border-b-0">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            setSelectedMatrixFeedKeys((current) =>
                              next
                                ? [...current, candidate.key]
                                : current.filter((key) => key !== candidate.key)
                            );
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{candidate.row.sourceName}</p>
                            <Badge variant="outline">{newsRuleLabel(candidate.row)}</Badge>
                            {candidate.row.tags && <Badge variant="secondary">{candidate.row.tags.split(",")[0].trim()}</Badge>}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{candidate.url}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-byword-border p-6 text-sm text-muted-foreground">
                  No unused matrix rows with usable RSS/site links. Add a site link to a rule, or create a feed manually above.
                </div>
              )}
              {matrixFeedBlocker && <p className="text-sm text-muted-foreground">{matrixFeedBlocker}</p>}
              <Button
                onClick={() => createMatrixFeedsMutation.mutate()}
                disabled={Boolean(matrixFeedBlocker) || createMatrixFeedsMutation.isPending}
              >
                {createMatrixFeedsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rss className="mr-2 h-4 w-4" />}
                {matrixFeedBlocker || `Create ${selectedMatrixFeedKeys.length} RSS feed${selectedMatrixFeedKeys.length === 1 ? "" : "s"}`}
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
              <Button className="w-full" onClick={() => generateManualMutation.mutate()} disabled={!canGenerateManual || generateManualMutation.isPending}>
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
                const runBlocker = !feed.persona_id
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
                      <p className="mt-1 text-sm text-muted-foreground">Set defaults, then save a news RSS source on this page. Rules are optional.</p>
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

import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type LucideIcon,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Filter,
  Globe2,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { BywordCard, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { SearchGrowthDependencyBand } from "@/components/search-growth/SearchGrowthDependencyBand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useIndexing } from "@/hooks/useIndexing";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import { useSites } from "@/hooks/useSites";

interface ApiKeyMetadata {
  hasOpenaiKey: boolean;
}

interface InternalLinkRule {
  id: string;
  triggers: string;
  url: string;
}

interface InternalLinkIndex {
  siteHost?: string;
  sitemapUrl?: string;
  pageCount?: number;
  vectorCount?: number;
  pages?: Array<{ title?: string; url?: string; path?: string }>;
}

interface InternalLinkIndexingState {
  step?: string;
  totalPages?: number;
  crawledPages?: number;
  embeddedPages?: number;
  errorMessage?: string;
}

interface UserSettings {
  enable_internal_links?: boolean | null;
  internal_link_sitemap_url?: string | null;
  internal_link_status?: string | null;
  internal_link_mode?: string | null;
  internal_link_density?: string | null;
  internal_link_include_patterns?: string[] | null;
  internal_link_exclude_patterns?: string[] | null;
  internal_link_rules?: InternalLinkRule[] | null;
  internal_link_index?: InternalLinkIndex | null;
  internal_link_indexing_state?: InternalLinkIndexingState | null;
  internal_link_last_synced_at?: string | null;
}

const linkDensityOptions = [
  { value: "minimal", label: "Minimal", count: "Up to 1-2", description: "Only strong matches" },
  { value: "light", label: "Light", count: "Up to 3-4", description: "Subtle linking" },
  { value: "balanced", label: "Balanced", count: "Up to 5-7", description: "Relevant matches", badge: "Best" },
  { value: "rich", label: "Rich", count: "Up to 8-12", description: "When the article supports it" },
];

const indexingSteps = [
  { key: "queued", label: "Queued" },
  { key: "crawl_pages", label: "Crawl" },
  { key: "create_embeddings", label: "Embed" },
  { key: "build_index", label: "Ready" },
];

export function InternalLinksPanel() {
  const queryClient = useQueryClient();
  const { activeSite } = useSites();
  const { integration: searchConsoleIntegration } = useSearchConsole();
  const { integrations: indexingIntegrations } = useIndexing();
  const previousStatus = useRef<string | null>(null);
  const [enableInternalLinks, setEnableInternalLinks] = useState(false);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [mode, setMode] = useState("all");
  const [density, setDensity] = useState("balanced");
  const [includePatterns, setIncludePatterns] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [rules, setRules] = useState<InternalLinkRule[]>([]);
  const [ruleTriggers, setRuleTriggers] = useState("");
  const [ruleUrl, setRuleUrl] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.get<UserSettings>("/settings"),
    refetchInterval: (query) =>
      (query.state.data as UserSettings | undefined)?.internal_link_status === "indexing" ? 3000 : false,
  });

  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKeyMetadata>("/settings/api-keys"),
  });

  useEffect(() => {
    if (!settings) return;
    setEnableInternalLinks(settings.enable_internal_links ?? false);
    setSitemapUrl(settings.internal_link_sitemap_url || "");
    setMode(settings.internal_link_mode || "all");
    setDensity(settings.internal_link_density || "balanced");
    setIncludePatterns((settings.internal_link_include_patterns || []).join(", "));
    setExcludePatterns((settings.internal_link_exclude_patterns || []).join(", "));
    setRules(settings.internal_link_rules || []);
  }, [settings]);

  useEffect(() => {
    const status = settings?.internal_link_status;
    if (!status) return;
    const previous = previousStatus.current;
    if (previous === "indexing" && status === "connected") toast.success("Internal link index is ready");
    if (previous === "indexing" && status === "failed") toast.error(settings.internal_link_indexing_state?.errorMessage || "Internal link indexing failed");
    previousStatus.current = status;
  }, [settings?.internal_link_status, settings?.internal_link_indexing_state]);

  const splitPatterns = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const index = settings?.internal_link_index || null;
  const state = settings?.internal_link_indexing_state || null;
  const status = settings?.internal_link_status || (index ? "connected" : "disconnected");
  const hasOpenAiKey = Boolean(apiKeys?.hasOpenaiKey);
  const isIndexing = status === "indexing";
  const lastSyncLabel = formatRelativeLabel(settings?.internal_link_last_synced_at || null);
  const indexedPagePreview = index?.pages?.slice(0, 5) || [];

  const refreshAvailableAt = settings?.internal_link_last_synced_at
    ? new Date(new Date(settings.internal_link_last_synced_at).getTime() + 14 * 24 * 60 * 60 * 1000)
    : null;
  const refreshBlocked = status === "connected" && refreshAvailableAt ? refreshAvailableAt.getTime() > Date.now() : false;
  const sitemapChanged = Boolean(sitemapUrl.trim() && comparableSitemapUrl(sitemapUrl) !== comparableSitemapUrl(index?.sitemapUrl || settings?.internal_link_sitemap_url));
  const cooldownBlocksIndexing = refreshBlocked && !sitemapChanged;
  const canManageIndex = status !== "disconnected" || Boolean(index);
  const indexingStep = state?.step || (isIndexing ? "queued" : status);
  const indexingStepIndex = Math.max(0, indexingSteps.findIndex((step) => step.key === indexingStep));
  const progress = useMemo(() => {
    if (status === "connected") return 100;
    if (!isIndexing) return 0;
    const total = state?.totalPages || 0;
    if (indexingStep === "crawl_pages" && total) return Math.min(50, 20 + ((state?.crawledPages || 0) / total) * 30);
    if (indexingStep === "create_embeddings" && total) return Math.min(85, 55 + ((state?.embeddedPages || 0) / total) * 30);
    if (indexingStep === "build_index") return 92;
    return Math.max(8, (indexingStepIndex + 1) * 18);
  }, [indexingStep, indexingStepIndex, isIndexing, state, status]);

  const saveMutation = useMutation({
    mutationFn: () => api.put<UserSettings>("/settings", {
      enable_internal_links: enableInternalLinks,
      internal_link_mode: mode,
      internal_link_density: density,
      internal_link_include_patterns: splitPatterns(includePatterns),
      internal_link_exclude_patterns: splitPatterns(excludePatterns),
      internal_link_rules: rules,
    }),
    onSuccess: (next) => {
      queryClient.setQueryData(["user-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Internal linking settings saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save internal linking settings"),
  });

  const indexMutation = useMutation({
    mutationFn: () => api.post<UserSettings>("/settings/internal-linking/index", {
      sitemap_url: sitemapUrl,
      mode,
      density,
      include_patterns: splitPatterns(includePatterns),
      exclude_patterns: splitPatterns(excludePatterns),
    }),
    onSuccess: (next) => {
      queryClient.setQueryData(["user-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.info("Internal link indexing started");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to index sitemap"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete<UserSettings>("/settings/internal-linking"),
    onSuccess: (next) => {
      queryClient.setQueryData(["user-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Internal linking disconnected");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to disconnect internal linking"),
  });

  const addRule = () => {
    const triggers = ruleTriggers.trim();
    const url = ruleUrl.trim();
    if (!triggers || !url) {
      toast.error("Add trigger phrases and a target URL");
      return;
    }
    setRules((current) => [...current, { id: crypto.randomUUID(), triggers, url }]);
    setRuleTriggers("");
    setRuleUrl("");
  };

  return (
    <>
      <SearchGrowthDependencyBand
        title="Internal links role in search growth"
        description="Use this tab to turn optimization targets into contextual links inside generated articles."
        items={[
          {
            label: "Active site",
            value: activeSite?.domain || "No site selected",
            detail: activeSite ? "Sitemap and link targets should match this domain." : "Select a site before building a link index.",
            state: activeSite ? "ready" : "blocked",
          },
          {
            label: "Search Console",
            value: searchConsoleIntegration?.status === "connected" ? "Connected" : "Not connected",
            detail: searchConsoleIntegration ? "Query data can identify pages that need internal-link support." : "Connect GSC from Optimize to prioritize link targets.",
            state: searchConsoleIntegration?.status === "connected" ? "ready" : "idle",
          },
          {
            label: "Indexing",
            value: indexingIntegrations.some((item) => item.status === "connected") ? "Provider ready" : "Not connected",
            detail: indexingIntegrations.length ? "Edited pages can be submitted after link updates." : "Connect IndexNow to close the edit-submit loop.",
            state: indexingIntegrations.some((item) => item.status === "connected") ? "ready" : "idle",
          },
        ]}
      />

      <BywordCard>
        <SectionHeader
          icon={LinkIcon}
          title="Internal Links"
          description="Build a sitemap index for semantic links in generated articles."
          action={
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isIndexing}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          }
        />
        <div className="divide-y divide-byword-border">
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-byword-border p-5">
            <div className="flex items-start gap-4">
              <IconTile
                icon={status === "connected" ? CheckCircle2 : status === "failed" ? AlertCircle : status === "indexing" ? Loader2 : LinkIcon}
                className={cn(
                  status === "connected" && "bg-[hsl(var(--status-success)/0.12)] text-status-success",
                  status === "failed" && "bg-destructive/10 text-destructive",
                  status === "indexing" && "bg-byword-blue-soft text-byword-blue"
                )}
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{statusLabel(status)}</h3>
                  <Badge variant={status === "failed" ? "destructive" : "secondary"}>{status === "connected" ? "Ready" : status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {index?.siteHost || sitemapUrl || "Connect a sitemap to start semantic link matching."}
                </p>
              </div>
            </div>
            {status === "indexing" && <Loader2 className="h-5 w-5 animate-spin text-byword-blue" />}
          </div>

          {!hasOpenAiKey && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <p className="text-sm text-muted-foreground">Add an OpenAI API key before creating semantic link embeddings.</p>
              </div>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/settings?section=api-keys">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Access Keys
                </Link>
              </Button>
            </div>
          )}

          {status === "failed" && state?.errorMessage && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              {state.errorMessage}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sitemap-url" className="text-base font-semibold">Sitemap URL</Label>
            <div className="grid gap-3 md:grid-cols-[1fr_190px]">
              <div className="relative">
                <Globe2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="sitemap-url"
                  value={sitemapUrl}
                  onChange={(event) => setSitemapUrl(event.target.value)}
                  placeholder="yoursite.com/sitemap.xml"
                  className="h-12 pl-11"
                  disabled={isIndexing}
                />
              </div>
              <Button
                type="button"
                className="h-12"
                onClick={() => indexMutation.mutate()}
                disabled={!sitemapUrl.trim() || isIndexing || !hasOpenAiKey || cooldownBlocksIndexing}
              >
                {isIndexing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {status === "failed" ? "Retry" : status === "connected" ? "Re-index" : "Connect"}
              </Button>
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-byword-border p-5">
            <span>
              <span className="block font-semibold">Use internal links in generated articles</span>
              <span className="mt-1 block text-sm text-muted-foreground">Turn this off to stop adding internal-link suggestions during generation.</span>
            </span>
            <Switch checked={enableInternalLinks} onCheckedChange={setEnableInternalLinks} />
          </label>

          {isIndexing && (
            <div className="space-y-4 rounded-lg border border-byword-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Indexing progress</h3>
                  <p className="text-sm text-muted-foreground">
                    {state?.totalPages ? `${state.crawledPages || 0}/${state.totalPages} crawled, ${state.embeddedPages || 0} embedded` : "Preparing sitemap crawl"}
                  </p>
                </div>
                <span className="font-mono text-sm text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="grid gap-2 md:grid-cols-4">
                {indexingSteps.map((step, index) => {
                  const done = indexingStepIndex > index || status === "connected";
                  const active = indexingStepIndex === index && isIndexing;
                  return (
                    <div
                      key={step.key}
                      className={cn(
                        "flex items-center gap-2 rounded-md border border-byword-border px-3 py-2 text-sm",
                        done && "border-byword-blue/30 bg-byword-blue-soft text-byword-blue",
                        active && "font-medium text-foreground"
                      )}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-4 w-4 rounded-full border" />}
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {(index || isIndexing) && (
          <div className="space-y-5 p-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Stat icon={FileText} value={index?.pageCount || state?.totalPages || 0} label="Pages" />
              <Stat icon={Database} value={index?.vectorCount || state?.embeddedPages || 0} label="Vectors" />
              <Stat icon={Clock} value={lastSyncLabel} label="Last sync" />
              <Stat icon={RefreshCw} value={refreshBlocked && refreshAvailableAt ? formatRelativeLabel(refreshAvailableAt.toISOString()) : "Ready"} label="Refresh" />
            </div>
          </div>
        )}

        <div className="space-y-5 p-6">
          <div className="flex items-start gap-4">
            <IconTile icon={Filter} />
            <div>
              <h3 className="text-lg font-semibold">URL Filters</h3>
              <p className="mt-1 text-sm text-muted-foreground">Control which pages get indexed for linking.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["all", "Index all pages"],
              ["filtered", "Filter pages"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                disabled={isIndexing}
                className={cn(
                  "rounded-lg border p-4 text-center font-semibold transition-calm",
                  mode === value ? "border-byword-blue bg-byword-blue-soft text-byword-blue" : "border-byword-border hover:border-byword-blue/40"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "filtered" && (
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={includePatterns} onChange={(event) => setIncludePatterns(event.target.value)} placeholder="/blog, /guides" disabled={isIndexing} />
              <Input value={excludePatterns} onChange={(event) => setExcludePatterns(event.target.value)} placeholder="/tag, /author, /page" disabled={isIndexing} />
            </div>
          )}
        </div>

        <div className="space-y-5 p-6">
          <div>
            <h3 className="text-lg font-semibold">Links per article</h3>
            <p className="mt-1 text-sm text-muted-foreground">Maximum relevant internal links to add.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {linkDensityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDensity(option.value)}
                className={cn(
                  "relative rounded-lg border p-5 text-center transition-calm",
                  density === option.value ? "border-byword-blue bg-byword-blue-soft text-byword-blue" : "border-byword-border hover:border-byword-blue/40"
                )}
              >
                {option.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-byword-blue px-3 py-1 text-[10px] font-bold uppercase text-white">{option.badge}</span>}
                <p className="font-semibold">{option.label}</p>
                <p className="mt-2 text-xl font-bold">{option.count}</p>
                <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-6">
          <div className="flex items-start gap-4">
            <IconTile icon={LinkIcon} />
            <div>
              <h3 className="text-lg font-semibold">Custom Link Rules</h3>
              <p className="mt-1 text-sm text-muted-foreground">Override AI linking for specific keywords.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto]">
            <Input value={ruleTriggers} onChange={(event) => setRuleTriggers(event.target.value)} placeholder="demo, free trial, book a call" />
            <ArrowRight className="hidden h-10 w-5 text-muted-foreground md:block" />
            <Input value={ruleUrl} onChange={(event) => setRuleUrl(event.target.value)} placeholder="https://example.com/book-demo" />
            <Button type="button" onClick={addRule}>Add</Button>
          </div>
          {rules.length > 0 && (
            <div className="grid gap-3">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 rounded-lg border border-byword-border p-3">
                  <LinkIcon className="h-4 w-4 text-byword-blue" />
                  <span className="min-w-0 flex-1 truncate text-sm">{rule.triggers}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{rule.url}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {indexedPagePreview.length > 0 && (
          <div className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-semibold">Indexed Pages</h3>
              <p className="mt-1 text-sm text-muted-foreground">Recent pages available for semantic matching.</p>
            </div>
            <div className="grid gap-3">
              {indexedPagePreview.map((page) => (
                <div key={page.url || page.path} className="rounded-lg border border-byword-border p-4">
                  <p className="truncate font-medium">{page.title || page.path}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{page.path || page.url}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManageIndex && (
          <div className="flex flex-wrap justify-between gap-3 p-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => indexMutation.mutate()}
              disabled={!sitemapUrl.trim() || isIndexing || cooldownBlocksIndexing || !hasOpenAiKey}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {cooldownBlocksIndexing && refreshAvailableAt ? `Refresh ${formatRelativeLabel(refreshAvailableAt.toISOString())}` : "Refresh Index"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending || isIndexing}
            >
              <X className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        )}
      </div>
    </BywordCard>
    </>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-byword-border p-5">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="text-lg font-semibold">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "connected") return "Connected";
  if (status === "indexing") return "Indexing";
  if (status === "failed") return "Failed";
  return "Disconnected";
}

function formatRelativeLabel(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ${suffix}`;
  return `${Math.round(hours / 24)}d ${suffix}`;
}

function comparableSitemapUrl(value?: string | null) {
  if (!value) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

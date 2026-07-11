import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Link as LinkIcon,
  Play,
  Loader2,
  Trash2,
  Settings2,
  Rss,
  Zap,
  Clock,
  FileText,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { FREQUENCIES, GITHUB_PERIODS, HN_TYPES, filterTypesForPlatform, platformLabel, type SourcePlatform } from "@/lib/source-options";
import { useTextModels } from "@/hooks/useTextModels";
import { LiveTextModelSelect, isUnavailableModel } from "@/components/content/LiveTextModelSelect";
import { safeFormatDate } from "@/lib/date-format";
import { normalizeHttpUrl, stripHttpProtocol } from "@/lib/url-validation";
import {
  SplitImageGenerationSettings,
  SplitImageConfig,
  DEFAULT_SPLIT_CONFIG,
  type InlineImageSource,
  type ImageDeliveryMode,
  type ManualImageProvider,
} from "@/components/content/ImageGenerationSettings";
import { FeedRoutingFields } from "./FeedRoutingFields";
import { EMPTY_FEED_DEFAULTS, normalizeFeedEditorialDefaults, routeReady, type FeedEditorialDefaults } from "@/lib/feed-routing";
import { useIntegrations } from "@/hooks/useIntegrations";

interface Feed {
  id: string;
  name: string;
  source_url: string;
  keywords: string[] | null;
  persona_id: string | null;
  model_id: string;
  frequency: string;
  is_active: boolean;
  created_at: string;
  last_run_at: string | null;
  total_articles: number | null;
  platform?: string;
  filter_type?: string;
  filter_value?: number;
  platform_config?: Record<string, string | number | boolean | null | undefined>;
  extract_full_content?: boolean;
  posts_per_run?: number | null;
  filter_old_posts_days?: number | null;
  site_id?: string | null;
  integration_id?: string | null;
  editorial_defaults?: FeedEditorialDefaults | null;
  routing_version?: number;
}

interface Persona {
  id: string;
  name: string;
  status: string;
  base_model: string;
}

interface FeedEditorDialogProps {
  feed: Feed | null;
  personas: Persona[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (feed: Feed) => void;
  onRunNow: (feed: Feed, imageConfig?: SplitImageConfig, imageDeliveryMode?: ImageDeliveryMode) => void;
  onDelete: (feed: Feed) => void;
  isSaving: boolean;
  isRunning: boolean;
  isDeleting: boolean;
  defaultImageConfig?: SplitImageConfig;
  inlineImageSource?: InlineImageSource;
  imageDeliveryMode?: ImageDeliveryMode;
  manualImageProvider?: ManualImageProvider;
}

const POSTS_PER_RUN_OPTIONS = [1, 3, 5, 10, 15, 20];
const REDDIT_DOMAINS = ["www.reddit.com", "old.reddit.com", "new.reddit.com"];

function normalizePlatform(platform?: string): SourcePlatform {
  return platform === "youtube" || platform === "reddit" || platform === "hackernews" || platform === "github"
    ? platform
    : "rss";
}

function extractChannelId(sourceUrl?: string) {
  if (!sourceUrl) return "";
  try {
    const parsed = new URL(sourceUrl);
    return parsed.searchParams.get("channel_id") || "";
  } catch {
    return "";
  }
}

function extractSubreddit(sourceUrl?: string) {
  return sourceUrl?.match(/\/r\/([^/?#]+)/)?.[1] || "";
}

function extractHost(sourceUrl?: string) {
  if (!sourceUrl) return "";
  try {
    return new URL(sourceUrl).host;
  } catch {
    return "";
  }
}

function normalizedConfigFor(platform: SourcePlatform, feed: Feed): Record<string, string | number | boolean> {
  const config = feed.platform_config || {};
  switch (platform) {
    case "youtube":
      return {
        channelId: String(config.channelId || extractChannelId(feed.source_url) || ""),
        channelUrl: config.channelUrl ? stripHttpProtocol(String(config.channelUrl)) : "",
      };
    case "reddit":
      return {
        subreddit: String(config.subreddit || extractSubreddit(feed.source_url) || ""),
        redditDomain: String(config.redditDomain || extractHost(feed.source_url) || "www.reddit.com"),
      };
    case "hackernews":
      return { type: String(config.type || "front_page") };
    case "github":
      return {
        language: String(config.language || ""),
        topic: String(config.topic || ""),
        since: String(config.since || config.period || "daily"),
      };
    case "rss":
    default:
      return { url: normalizeHttpUrl(feed.source_url) };
  }
}

function feedSourceUrlFor(platform: SourcePlatform, sourceUrl: string, config: Record<string, string | number | boolean | null | undefined>) {
  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${String(config.channelId || "").trim()}`;
    case "reddit": {
      const requestedDomain = String(config.redditDomain || "");
      const domain = REDDIT_DOMAINS.includes(requestedDomain) ? requestedDomain : "www.reddit.com";
      return `https://${domain}/r/${String(config.subreddit || "").replace(/^r\//, "").trim()}/`;
    }
    case "hackernews":
      return "https://news.ycombinator.com/";
    case "github":
      return "https://github.com/trending";
    case "rss":
    default:
      return normalizeHttpUrl(sourceUrl);
  }
}

export function FeedEditorDialog({
  feed,
  personas,
  isOpen,
  onClose,
  onSave,
  onRunNow,
  onDelete,
  isSaving,
  isRunning,
  isDeleting,
  defaultImageConfig,
  inlineImageSource = "ai",
  imageDeliveryMode = "generate",
  manualImageProvider = "midjourney",
}: FeedEditorDialogProps) {
  const { data: textModels = [] } = useTextModels();
  const [editedFeed, setEditedFeed] = useState<Feed | null>(null);
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);
  const [activeImageDeliveryMode, setActiveImageDeliveryMode] = useState<ImageDeliveryMode>(imageDeliveryMode);
  const [keywordInput, setKeywordInput] = useState("");
  const { integrations: routingIntegrations } = useIntegrations(editedFeed?.site_id);

  // Sync local state when dialog opens with a feed
  useEffect(() => {
    if (isOpen && feed) {
      const platform = normalizePlatform(feed.platform);
      setEditedFeed({
        ...feed,
        platform,
        editorial_defaults: normalizeFeedEditorialDefaults(feed.editorial_defaults),
        source_url: platform === "rss" ? stripHttpProtocol(feed.source_url) : feed.source_url,
        filter_type: feed.filter_type || "none",
        platform_config: normalizedConfigFor(platform, feed),
      });
      setImageConfig(defaultImageConfig ?? DEFAULT_SPLIT_CONFIG);
      setActiveImageDeliveryMode(imageDeliveryMode);
      setKeywordInput("");
    } else if (!isOpen) {
      setEditedFeed(null);
      setKeywordInput("");
    }
  }, [isOpen, feed, defaultImageConfig, imageDeliveryMode]);

  if (!editedFeed) return null;
  const selectedModelUnavailable = isUnavailableModel(editedFeed.model_id, textModels);
  const platform = normalizePlatform(editedFeed.platform);
  const platformConfig = editedFeed.platform_config || {};
  const availableFilterTypes = filterTypesForPlatform(platform, editedFeed.filter_type);
  const imageSectionTitle = activeImageDeliveryMode === "manual_prompt" ? "Manual Image Prompts" : "Image Generation";
  const routingIsReady = routeReady({
    siteId: editedFeed.site_id || "",
    integrationId: editedFeed.integration_id || "",
    editorialDefaults: editedFeed.editorial_defaults || { ...EMPTY_FEED_DEFAULTS },
  }, routingIntegrations.find((integration) => integration.id === editedFeed.integration_id));
  const canRunDraft = routingIsReady || editedFeed.routing_version === 0;

  const setPlatformConfig = (updates: Record<string, string | number | boolean>) => {
    setEditedFeed({
      ...editedFeed,
      platform_config: { ...platformConfig, ...updates },
    });
  };

  const addKeyword = () => {
    const keyword = keywordInput.trim();
    if (!keyword || editedFeed.keywords?.includes(keyword)) return;
    setEditedFeed({ ...editedFeed, keywords: [...(editedFeed.keywords || []), keyword] });
    setKeywordInput("");
  };

  const removeKeyword = (keyword: string) => {
    const nextKeywords = (editedFeed.keywords || []).filter((item) => item !== keyword);
    setEditedFeed({ ...editedFeed, keywords: nextKeywords.length ? nextKeywords : null });
  };

  const validationError = (() => {
    if (!editedFeed.name.trim()) return "Feed name is required.";
    if (platform === "rss" && !editedFeed.source_url.trim()) return "RSS source URL is required.";
    if (platform === "youtube" && !/^UC[\w-]{22}$/.test(String(platformConfig.channelId || ""))) {
      return "YouTube channel ID must start with UC and be 24 characters.";
    }
    if (platform === "reddit" && !/^[A-Za-z0-9_]{2,21}$/.test(String(platformConfig.subreddit || ""))) {
      return "Subreddit name must be 2-21 letters, numbers, or underscores.";
    }
    return null;
  })();

  const buildPersistedFeed = () => {
    const sourceUrl = feedSourceUrlFor(platform, editedFeed.source_url, platformConfig);
    return {
      ...editedFeed,
      platform,
      source_url: sourceUrl,
      filter_type: editedFeed.filter_type || "none",
      filter_value: editedFeed.filter_type === "none" ? undefined : editedFeed.filter_value,
      platform_config: normalizedConfigFor(platform, {
        ...editedFeed,
        source_url: sourceUrl,
        platform_config: platformConfig,
      }),
    };
  };

  const handleSave = () => {
    if (selectedModelUnavailable || validationError) return;
    onSave(buildPersistedFeed());
  };

  const handleRunNow = () => {
    if (selectedModelUnavailable || validationError) return;
    onRunNow(buildPersistedFeed(), imageConfig, activeImageDeliveryMode);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rss className="h-5 w-5 text-primary" />
            Edit Feed Details
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="px-6 py-6 space-y-6">
            {/* Basic Info Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Rss className="h-4 w-4" />
                Feed Information
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="feedName">Feed Name</Label>
                  <Input
                    id="feedName"
                    value={editedFeed.name}
                    onChange={(e) =>
                      setEditedFeed({ ...editedFeed, name: e.target.value })
                    }
                    placeholder="My RSS Feed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Internal display name for the dashboard.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Source Type</Label>
                  <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium">
                    {platformLabel(platform)}
                  </div>
                  <p className="text-xs text-muted-foreground">Source type is set when the feed is created.</p>
                </div>
              </div>

              {platform === "rss" && (
                <div className="space-y-2">
                  <Label htmlFor="sourceUrl">RSS Source URL</Label>
                  <InputAffordance
                    id="sourceUrl"
                    type="text"
                    inputMode="url"
                    prefix="https://"
                    icon={LinkIcon}
                    value={editedFeed.source_url}
                    onChange={(e) =>
                      setEditedFeed({ ...editedFeed, source_url: stripHttpProtocol(e.target.value) })
                    }
                    placeholder="example.com/feed.xml"
                    help="Paste the feed URL. BlogFactory adds HTTPS when you omit it."
                    onClear={() => setEditedFeed({ ...editedFeed, source_url: "" })}
                    clearLabel="Clear RSS source URL"
                  />
                </div>
              )}

              {platform === "youtube" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="youtubeChannelId">Channel ID</Label>
                    <Input
                      id="youtubeChannelId"
                      value={String(platformConfig.channelId || "")}
                      onChange={(event) => setPlatformConfig({ channelId: event.target.value.trim() })}
                      placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <p className="text-xs text-muted-foreground">Used to build the YouTube RSS feed URL.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="youtubeChannelUrl">Channel URL</Label>
                    <InputAffordance
                      id="youtubeChannelUrl"
                      type="text"
                      inputMode="url"
                      prefix="https://"
                      value={String(platformConfig.channelUrl || "")}
                      onChange={(event) => setPlatformConfig({ channelUrl: stripHttpProtocol(event.target.value) })}
                      placeholder="youtube.com/@channelname"
                      help="Reference only. The channel ID controls fetching."
                      onClear={() => setPlatformConfig({ channelUrl: "" })}
                      clearLabel="Clear YouTube channel URL"
                    />
                  </div>
                </div>
              )}

              {platform === "reddit" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="subreddit">Subreddit</Label>
                    <Input
                      id="subreddit"
                      value={String(platformConfig.subreddit || "")}
                      onChange={(event) => setPlatformConfig({ subreddit: event.target.value.replace(/^r\//, "") })}
                      placeholder="technology"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reddit Domain</Label>
                    <Select
                      value={String(platformConfig.redditDomain || "www.reddit.com")}
                      onValueChange={(value) => setPlatformConfig({ redditDomain: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REDDIT_DOMAINS.map((domain) => (
                          <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {platform === "hackernews" && (
                <div className="space-y-2">
                  <Label>Story Type</Label>
                  <Select
                    value={String(platformConfig.type || "front_page")}
                    onValueChange={(value) => setPlatformConfig({ type: value })}
                  >
                    <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HN_TYPES.map((type) => (
                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {platform === "github" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="githubLanguage">Language</Label>
                    <Input
                      id="githubLanguage"
                      value={String(platformConfig.language || "")}
                      onChange={(event) => setPlatformConfig({ language: event.target.value })}
                      placeholder="typescript"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="githubTopic">Topic</Label>
                    <Input
                      id="githubTopic"
                      value={String(platformConfig.topic || "")}
                      onChange={(event) => setPlatformConfig({ topic: event.target.value })}
                      placeholder="machine-learning"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time Period</Label>
                    <Select
                      value={String(platformConfig.since || platformConfig.period || "daily")}
                      onValueChange={(value) => setPlatformConfig({ since: value, period: undefined })}
                    >
                      <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GITHUB_PERIODS.map((period) => (
                          <SelectItem key={period.id} value={period.id}>{period.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      GitHub returns repositories created in this period, sorted by total stars.
                    </p>
                  </div>
                </div>
              )}

              {validationError && <p className="text-xs text-destructive">{validationError}</p>}
            </section>

            <Separator />

            <FeedRoutingFields
              value={{
                siteId: editedFeed.site_id || "",
                integrationId: editedFeed.integration_id || "",
                editorialDefaults: editedFeed.editorial_defaults || { ...EMPTY_FEED_DEFAULTS },
              }}
              onChange={(routing) => setEditedFeed({
                ...editedFeed,
                site_id: routing.siteId,
                integration_id: routing.integrationId,
                editorial_defaults: routing.editorialDefaults,
                routing_version: 1,
              })}
            />

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Filtering & Scope
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Filter Type</Label>
                  <Select
                    value={editedFeed.filter_type || "none"}
                    onValueChange={(value) => setEditedFeed({
                      ...editedFeed,
                      filter_type: value,
                      filter_value: value === "none" ? undefined : editedFeed.filter_value,
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableFilterTypes.map((filter) => (
                        <SelectItem key={filter.id} value={filter.id}>{filter.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {editedFeed.filter_type && editedFeed.filter_type !== "none" && (
                  <div className="space-y-2">
                    <Label htmlFor="filterValue">
                      {editedFeed.filter_type === "score" && "Minimum Score"}
                      {editedFeed.filter_type === "threshold" && "Threshold %"}
                      {editedFeed.filter_type === "posts_per_day" && "Posts Per Run"}
                    </Label>
                    <Input
                      id="filterValue"
                      type="number"
                      value={editedFeed.filter_value ?? ""}
                      onChange={(event) => setEditedFeed({
                        ...editedFeed,
                        filter_value: event.target.value ? Number(event.target.value) : undefined,
                      })}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywordInput">Target Keywords / Categories</Label>
                <div className="flex flex-wrap gap-2">
                  {(editedFeed.keywords || []).map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-1.5 rounded-md border border-byword-blue/30 bg-byword-blue-soft px-2.5 py-1 text-xs text-byword-blue"
                    >
                      {keyword}
                      <button type="button" onClick={() => removeKeyword(keyword)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  id="keywordInput"
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="Type and press Enter..."
                />
              </div>
            </section>

            <Separator />

            {/* AI Configuration Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Zap className="h-4 w-4" />
                AI Configuration
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Writer Persona</Label>
                  <Select
                    value={editedFeed.persona_id || "none"}
                    onValueChange={(v) => {
                      const personaId = v === "none" ? null : v;
                      const selectedPersona = personas.find((p) => p.id === personaId);
                      
                      // Auto-apply persona's base model when persona is selected
                      const newModelId = selectedPersona?.base_model || editedFeed.model_id;
                      
                      setEditedFeed({ 
                        ...editedFeed, 
                        persona_id: personaId,
                        model_id: newModelId,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select persona..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Persona</SelectItem>
                      {personas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determines the tone and style of generated drafts.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>OpenRouter Text Model</Label>
                  <LiveTextModelSelect
                    value={editedFeed.model_id}
                    onValueChange={(v) => setEditedFeed({ ...editedFeed, model_id: v })}
                  />
                  {selectedModelUnavailable && (
                    <p className="text-xs text-destructive">Unavailable: {editedFeed.model_id}. Pick a live OpenRouter model.</p>
                  )}
                  {(() => {
                    const selectedPersona = personas.find((p) => p.id === editedFeed.persona_id);
                    if (selectedPersona && editedFeed.model_id !== selectedPersona.base_model) {
                      return (
                        <p className="text-xs text-amber-600">
                          Custom model selected (overrides persona default)
                        </p>
                      );
                    }
                    if (selectedPersona && editedFeed.model_id === selectedPersona.base_model) {
                      return (
                        <p className="text-xs text-muted-foreground">
                          Defaulted from selected persona
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </section>

            <Separator />

            {/* Scheduling Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Scheduling & Limits
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fetch Frequency</Label>
                  <Select
                    value={editedFeed.frequency}
                    onValueChange={(v) =>
                      setEditedFeed({ ...editedFeed, frequency: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((freq) => (
                        <SelectItem key={freq.id} value={freq.id}>
                          {freq.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Posts per Run</Label>
                  <Select
                    value={String(editedFeed.posts_per_run ?? 5)}
                    onValueChange={(v) =>
                      setEditedFeed({ ...editedFeed, posts_per_run: parseInt(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSTS_PER_RUN_OPTIONS.map((num) => (
                        <SelectItem key={num} value={String(num)}>
                          {num} {num === 1 ? "post" : "posts"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Limits how many new posts are generated per fetch.
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            {/* Image Generation Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                {imageSectionTitle}
              </h3>
              <SplitImageGenerationSettings
                config={imageConfig}
                onConfigChange={setImageConfig}
                compact
                inlineImageSource={inlineImageSource}
                imageDeliveryMode={activeImageDeliveryMode}
                manualImageProvider={manualImageProvider}
                onImageDeliveryModeChange={setActiveImageDeliveryMode}
              />
            </section>

            <Separator />

            {/* Advanced Options Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Advanced Options
              </h3>

              <div className="space-y-4">
                {/* Freshness Filter - Context-specific label */}
                <div className="rounded-md border border-border bg-muted/50 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {editedFeed.platform === "youtube" ? "Filter Old Videos" : "Filter Old Posts"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {editedFeed.platform === "youtube" 
                          ? "Only process videos published in the last N days"
                          : "Exclude posts older than N days"}
                      </p>
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g., 7 (leave empty for no filter)"
                    value={editedFeed.filter_old_posts_days ?? ""}
                    onChange={(e) =>
                      setEditedFeed({ 
                        ...editedFeed, 
                        filter_old_posts_days: e.target.value ? parseInt(e.target.value) : null 
                      })
                    }
                    className="max-w-[200px]"
                  />
                </div>

                {editedFeed.platform === "rss" && (
                  <>
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Full-Text Extraction</p>
                          <p className="text-sm text-muted-foreground">
                            Fetch complete article content from URLs
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={editedFeed.extract_full_content ?? false}
                        onCheckedChange={(checked) =>
                          setEditedFeed({ ...editedFeed, extract_full_content: checked })
                        }
                      />
                    </div>

                  </>
                )}

                <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-status-success/10">
                      <Zap className="h-4 w-4 text-status-success" />
                    </div>
                    <div>
                      <p className="font-medium">Active Status</p>
                      <p className="text-sm text-muted-foreground">
                        {editedFeed.is_active ? "Feed is actively collecting data" : "Data collection is paused"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={editedFeed.is_active}
                    onCheckedChange={(checked) =>
                      setEditedFeed({ ...editedFeed, is_active: checked })
                    }
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Statistics Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Statistics
              </h3>

              {(() => {
                const freqMs: Record<string, number> = {
                  hourly: 3600000,
                  every_4_hours: 14400000,
                  every_12_hours: 43200000,
                  daily: 86400000,
                  weekly: 604800000,
                };
                const interval = freqMs[editedFeed.frequency] ?? 86400000;
                const nextRun = editedFeed.last_run_at && editedFeed.is_active
                  ? new Date(new Date(editedFeed.last_run_at).getTime() + interval)
                  : null;
                const isPast = nextRun && nextRun <= new Date();

                return (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium mt-1">
                        {safeFormatDate(editedFeed.created_at, "MMM d, yyyy")}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Last Run</p>
                      <p className="font-medium mt-1">
                        {editedFeed.last_run_at
                          ? safeFormatDate(editedFeed.last_run_at, "MMM d, h:mm a")
                          : "Never"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Next Run</p>
                      <p className={`font-medium mt-1 ${isPast ? "text-amber-600" : ""}`}>
                        {!editedFeed.is_active
                          ? "Paused"
                          : nextRun
                            ? isPast
                              ? "Due now"
                              : safeFormatDate(nextRun, "MMM d, h:mm a")
                            : "On next cycle"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Total Articles</p>
                      <p className="font-medium mt-1">
                        {editedFeed.total_articles?.toLocaleString() ?? 0}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between w-full gap-3">
            <Button
              variant="destructive"
              size="icon"
              onClick={() => onDelete(editedFeed)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleRunNow}
                disabled={isRunning || !editedFeed.persona_id || selectedModelUnavailable || Boolean(validationError) || !canRunDraft}
                className="gap-2"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {activeImageDeliveryMode === "manual_prompt" ? "Run + Prompts" : "Run Now"}
              </Button>

              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>

              <Button onClick={handleSave} disabled={isSaving || selectedModelUnavailable || Boolean(validationError)}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

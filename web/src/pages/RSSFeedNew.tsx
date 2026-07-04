import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link as LinkIcon, X, Play, Save, Loader2, ChevronDown, Rss, Globe, FileText } from "lucide-react";
import { FREQUENCIES, PLATFORMS, HN_TYPES, GITHUB_PERIODS, filterTypesForPlatform, sourceTypeForPlatform, type SourcePlatform } from "@/lib/source-options";
import { useTextModels } from "@/hooks/useTextModels";
import { LiveTextModelSelect, isUnavailableModel } from "@/components/content/LiveTextModelSelect";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { FeedPreview } from "@/components/feeds/FeedPreview";
import { normalizeHttpUrl, stripHttpProtocol, validateSourceUrl, validatePlatformInput } from "@/lib/url-validation";
import {
  SplitImageGenerationSettings,
  SplitImageConfig,
  DEFAULT_SPLIT_CONFIG,
  type InlineImageSource,
  type ImageDeliveryMode,
  type ImageResolution,
  type ManualImageProvider,
} from "@/components/content/ImageGenerationSettings";

type Platform = SourcePlatform;

interface PersonaOption {
  id: string;
  name: string;
  status: string;
  base_model: string;
}

interface RssUserSettings {
  cover_enabled?: boolean | null;
  inline_enabled?: boolean | null;
  inline_count?: number | null;
  cover_image_resolution?: ImageResolution | null;
  inline_image_resolution?: ImageResolution | null;
  inline_image_source?: InlineImageSource | null;
  image_delivery_mode?: ImageDeliveryMode | null;
  manual_image_provider?: ManualImageProvider | null;
}

function normalizeImageResolution(value?: string | null): ImageResolution {
  return value === "512" ? "512" : "1K";
}

function normalizeInlineImageSource(value?: string | null): InlineImageSource {
  return value === "stock" ? "stock" : "ai";
}

function normalizeImageDeliveryMode(value?: string | null): ImageDeliveryMode {
  return value === "manual_prompt" ? "manual_prompt" : "generate";
}

function normalizeManualImageProvider(value?: string | null): ManualImageProvider {
  return value === "midjourney" ? "midjourney" : "midjourney";
}

export default function RSSFeedNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Basic feed info
  const [feedName, setFeedName] = useState("");
  const [platform, setPlatform] = useState<Platform>("rss");

  // Platform-specific config
  const [sourceUrl, setSourceUrl] = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [redditDomain, setRedditDomain] = useState("www.reddit.com");
  const [hnType, setHnType] = useState("front_page");
  const [githubLanguage, setGithubLanguage] = useState("");
  const [githubTopic, setGithubTopic] = useState("");
  const [githubPeriod, setGithubPeriod] = useState("daily");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState("");

  // Filtering
  const [filterType, setFilterType] = useState("none");
  const [filterValue, setFilterValue] = useState<number | undefined>();

  const [filterOldPostsDays, setFilterOldPostsDays] = useState<number | undefined>();
  const [extractFullContent, setExtractFullContent] = useState(false);
  const [postsPerRun, setPostsPerRun] = useState(5);

  // Keywords & scheduling
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [modelId, setModelId] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [isActive, setIsActive] = useState(true);

  // UI state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);
  const [inlineImageSource, setInlineImageSource] = useState<InlineImageSource>("ai");
  const [imageDeliveryMode, setImageDeliveryMode] = useState<ImageDeliveryMode>("generate");
  const [manualImageProvider, setManualImageProvider] = useState<ManualImageProvider>("midjourney");
  const { data: textModels = [] } = useTextModels();
  const selectedModelUnavailable = isUnavailableModel(modelId, textModels);
  const fallbackTextModelId = textModels[0]?.id;
  const availableFilterTypes = filterTypesForPlatform(platform, filterType);

  // Fetch personas
  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const all = await api.get<PersonaOption[]>("/personas");
      return all.filter((p) => p.status === "active");
    },
    enabled: !!user,
  });

  // Fetch user settings for default image config
  const { data: userSettings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      return api.get<RssUserSettings>("/settings");
    },
    enabled: !!user,
  });

  // Apply user defaults when settings load
  useEffect(() => {
    if (userSettings) {
      setImageConfig({
        cover: {
          enabled: userSettings.cover_enabled ?? true,
          resolution: normalizeImageResolution(userSettings.cover_image_resolution),
        },
        inline: {
          enabled: userSettings.inline_enabled ?? true,
          count: userSettings.inline_count ?? 2,
          resolution: normalizeImageResolution(userSettings.inline_image_resolution),
        },
      });
      setInlineImageSource(normalizeInlineImageSource(userSettings.inline_image_source));
      setImageDeliveryMode(normalizeImageDeliveryMode(userSettings.image_delivery_mode));
      setManualImageProvider(normalizeManualImageProvider(userSettings.manual_image_provider));
    }
  }, [userSettings]);

  const resolveLiveModelId = useCallback((preferredModelId?: string | null) => {
    if (preferredModelId && (!textModels.length || textModels.some((model) => model.id === preferredModelId))) {
      return preferredModelId;
    }
    return fallbackTextModelId || preferredModelId || modelId;
  }, [fallbackTextModelId, modelId, textModels]);

  const handlePersonaChange = (nextPersonaId: string) => {
    setPersonaId(nextPersonaId);
    const selectedPersona = personas.find((persona) => persona.id === nextPersonaId);
    setModelId(resolveLiveModelId(selectedPersona?.base_model));
  };

  useEffect(() => {
    if (!modelId && fallbackTextModelId) setModelId(fallbackTextModelId);
  }, [fallbackTextModelId, modelId]);

  useEffect(() => {
    if (!selectedModelUnavailable || !fallbackTextModelId) return;
    const selectedPersona = personas.find((persona) => persona.id === personaId);
    if (!personaId || selectedPersona?.base_model === modelId) setModelId(fallbackTextModelId);
  }, [fallbackTextModelId, modelId, personaId, personas, selectedModelUnavailable]);

  useEffect(() => {
    const nextFilterTypes = filterTypesForPlatform(platform, filterType);
    if (!nextFilterTypes.some((item) => item.id === filterType)) {
      setFilterType("none");
      setFilterValue(undefined);
    }
  }, [filterType, platform]);

  // Build platform config object
  const buildPlatformConfig = () => {
    switch (platform) {
      case "reddit":
        return { subreddit, redditDomain };
      case "hackernews":
        return { type: hnType };
      case "github":
        return { language: githubLanguage, topic: githubTopic, since: githubPeriod };
      case "youtube":
        return { channelId: youtubeChannelId, channelUrl: youtubeChannelUrl ? normalizeHttpUrl(youtubeChannelUrl) : "" };
      case "rss":
      default:
        return { url: normalizeHttpUrl(sourceUrl) };
    }
  };

  // Build the actual feed source URL
  const buildFeedSourceUrl = () => {
    switch (platform) {
      case "youtube":
        // YouTube's built-in RSS feed for channels
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`;
      case "reddit":
        return `https://${redditDomain}/r/${subreddit}/`;
      case "hackernews":
        return "https://news.ycombinator.com/";
      case "github":
        return "https://github.com/trending";
      case "rss":
        return normalizeHttpUrl(sourceUrl);
      default:
        return normalizeHttpUrl(sourceUrl);
    }
  };

  // Create feed mutation
  const createFeedMutation = useMutation({
    mutationFn: async (runNow: boolean) => {
      if (!user) throw new Error("Not authenticated");

      const platformConfig = buildPlatformConfig();
      const feedSourceUrl = buildFeedSourceUrl();

      const feed = await api.post<any>("/feeds", {
        name: feedName,
        source_url: feedSourceUrl,
        keywords: keywords.length > 0 ? keywords : null,
        persona_id: personaId || null,
        model_id: modelId || undefined,
        frequency,
        is_active: isActive,
        platform,
        filter_type: filterType,
        filter_value: filterValue || null,
        platform_config: platformConfig,
        filter_old_posts_days: filterOldPostsDays || null,
        extract_full_content: extractFullContent,
        posts_per_run: postsPerRun,
      });

      if (runNow && personaId) {
        // Trigger content generation immediately
        try {
          const inlineEnabled = imageConfig.inline.enabled && imageConfig.inline.count > 0;
          const imagesEnabled = imageConfig.cover.enabled || inlineEnabled;
          const buildGenerationPayload = (feedItemOffset: number) => ({
            sourceType: sourceTypeForPlatform(platform),
            sourceValue: feedSourceUrl,
            personaId,
            modelId,
            variations: 1,
            postsPerRun: 1,
            feedItemOffset,
            feedId: feed.id,
            platformConfig,
            filterType,
            filterValue,
            keywords: keywords.length > 0 ? keywords : undefined,
            extractFullContent,
            filterOldPostsDays: filterOldPostsDays || undefined,
            generateImages: imagesEnabled,
            imageDeliveryMode,
            manualImageProvider,
            imageConfig: imagesEnabled ? {
              cover: imageConfig.cover.enabled ? { resolution: imageConfig.cover.resolution || "1K" } : null,
              inline: inlineEnabled ? {
                count: imageConfig.inline.count,
                resolution: imageConfig.inline.resolution || "1K",
              } : null,
            } : undefined,
          });
          const results = await Promise.allSettled(
            Array.from({ length: postsPerRun }, (_, index) => api.post("/content/generate", buildGenerationPayload(index)))
          );
          const failed = results.filter((result) => result.status === "rejected").length;
          if (failed) throw new Error(`${failed}/${postsPerRun} feed draft jobs failed to start`);
          return { feed, ranNow: true };
        } catch (genErr) {
          console.error("Generation error:", genErr);
          toast.warning("Feed saved, but failed to start generation: " + (genErr instanceof Error ? genErr.message : "Unknown error"));
          return { feed, ranNow: false };
        }
      }

      return { feed, ranNow: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });

      if (result.ranNow) {
        toast.success("Feed saved and job queued. Check the Job Queue for progress.");
        navigate("/jobs");
      } else {
        toast.success("Feed saved. Scheduler will run this feed on the next cycle.");
        navigate("/rss-feeds");
      }
    },
    onError: (error) => {
      toast.error("Failed to create feed: " + error.message);
    },
  });

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeyword();
    }
  };

  const isFormValid = () => {
    if (!feedName) return false;

    switch (platform) {
      case "rss": {
        if (!sourceUrl) return false;
        const urlValidation = validateSourceUrl(sourceUrl);
        return urlValidation.valid;
      }
      case "youtube":
        if (!youtubeChannelId) return false;
        // Channel ID should be 24 characters starting with UC
        return /^UC[\w-]{22}$/.test(youtubeChannelId);
      case "reddit": {
        if (!subreddit) return false;
        const redditValidation = validatePlatformInput("reddit", subreddit);
        return redditValidation.valid;
      }
      case "hackernews":
      case "github":
        return true;
      default:
        return false;
    }
  };

  const validateAndGetError = (): string | null => {
    if (!feedName) return "Please enter a feed name.";

    switch (platform) {
      case "rss": {
        if (!sourceUrl) return "Please enter an RSS URL.";
        const urlValidation = validateSourceUrl(sourceUrl);
        if (!urlValidation.valid) return urlValidation.error || "Invalid URL";
        break;
      }
      case "youtube":
        if (!youtubeChannelId) return "Please enter a YouTube channel ID.";
        if (!/^UC[\w-]{22}$/.test(youtubeChannelId)) {
          return "Invalid channel ID format. It should start with 'UC' and be 24 characters.";
        }
        break;
      case "reddit": {
        if (!subreddit) return "Please enter a subreddit name.";
        const redditValidation = validatePlatformInput("reddit", subreddit);
        if (!redditValidation.valid) return redditValidation.error || "Invalid subreddit";
        break;
      }
    }
    return null;
  };

  const handleSave = () => {
    const error = validateAndGetError();
    if (error) {
      toast.error(error);
      return;
    }
    if (selectedModelUnavailable) {
      toast.error("Selected model is no longer available on OpenRouter.");
      return;
    }
    createFeedMutation.mutate(false);
  };

  const handleSaveAndRun = () => {
    const error = validateAndGetError();
    if (error) {
      toast.error(error);
      return;
    }
    if (!personaId) {
      toast.error("Please select a persona to run the feed.");
      return;
    }
    if (!modelId) {
      toast.error("Please select an OpenRouter text model.");
      return;
    }
    if (selectedModelUnavailable) {
      toast.error("Selected model is no longer available on OpenRouter.");
      return;
    }
    createFeedMutation.mutate(true);
  };

  const isSubmitting = createFeedMutation.isPending;

  const getPlatformIcon = () => {
    switch (platform) {
      case "rss":
        return <Rss className="h-4 w-4" />;
      default:
        return <Globe className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/rss-feeds">Content Sources</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Add New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="Add Content Source"
        description="Configure a new content source from RSS feeds, YouTube channels, Reddit, Hacker News, or GitHub. Set up filtering and AI generation preferences."
      />

      <div className="max-w-3xl">
        <div className="calm-card p-6 space-y-8">
          {/* Platform Selection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-lg font-semibold">Platform</h2>
            </div>

            <div className="grid grid-cols-3 gap-3 pl-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id as Platform)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    platform === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{p.description}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Feed Information */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-lg font-semibold">Source Configuration</h2>
            </div>

            <div className="space-y-4 pl-3">
              <div className="space-y-2">
                <Label htmlFor="feedName">Feed Name</Label>
                <Input
                  id="feedName"
                  placeholder={platform === "reddit" ? "e.g., r/technology Hot Posts" : "e.g., TechCrunch AI"}
                  value={feedName}
                  onChange={(e) => setFeedName(e.target.value)}
                />
              </div>

              {/* Platform-specific fields */}
              {platform === "rss" && (
                <div className="space-y-2">
                  <Label htmlFor="sourceUrl">RSS Source URL</Label>
                  <InputAffordance
                    id="sourceUrl"
                    type="text"
                    inputMode="url"
                    prefix="https://"
                    icon={LinkIcon}
                    placeholder="example.com/feed.xml"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(stripHttpProtocol(e.target.value))}
                    help="Paste the feed URL. BlogFactory adds HTTPS when you omit it."
                    onClear={() => setSourceUrl("")}
                    clearLabel="Clear RSS source URL"
                  />
                </div>
              )}

              {platform === "youtube" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="youtubeChannelId">Channel ID</Label>
                    <Input
                      id="youtubeChannelId"
                      placeholder="UCxxxxxxxxxxxxxxxxxx"
                      value={youtubeChannelId}
                      onChange={(e) => setYoutubeChannelId(e.target.value.trim())}
                    />
                    <p className="text-xs text-muted-foreground">
                      The channel ID starts with "UC" (24 characters). Find it in the channel URL or page source.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="youtubeChannelUrl">Channel URL (optional)</Label>
                    <InputAffordance
                      id="youtubeChannelUrl"
                      type="text"
                      inputMode="url"
                      prefix="https://"
                      placeholder="youtube.com/@channelname"
                      value={youtubeChannelUrl}
                      onChange={(e) => setYoutubeChannelUrl(stripHttpProtocol(e.target.value))}
                      help="Reference only. The actual feed still uses the Channel ID."
                      onClear={() => setYoutubeChannelUrl("")}
                      clearLabel="Clear YouTube channel URL"
                    />
                    <p className="text-xs text-muted-foreground">
                      For reference only. The actual feed uses the Channel ID above.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Need the ID? Use a channel ID finder or search the channel page source for "channelId".
                  </p>
                </div>
              )}

              {platform === "reddit" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="subreddit">Subreddit</Label>
                    <Input
                      id="subreddit"
                      placeholder="technology (without r/)"
                      value={subreddit}
                      onChange={(e) => setSubreddit(e.target.value.replace(/^r\//, ""))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="redditDomain">Reddit Domain</Label>
                    <Select value={redditDomain} onValueChange={setRedditDomain}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="www.reddit.com">www.reddit.com</SelectItem>
                        <SelectItem value="old.reddit.com">old.reddit.com</SelectItem>
                        <SelectItem value="new.reddit.com">new.reddit.com</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {platform === "hackernews" && (
                <div className="space-y-2">
                  <Label>Story Type</Label>
                  <Select value={hnType} onValueChange={setHnType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HN_TYPES.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {platform === "github" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="githubLanguage">Language (optional)</Label>
                      <Input
                        id="githubLanguage"
                        placeholder="e.g., typescript, python"
                        value={githubLanguage}
                        onChange={(e) => setGithubLanguage(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="githubTopic">Topic (optional)</Label>
                      <Input
                        id="githubTopic"
                        placeholder="e.g., machine-learning"
                        value={githubTopic}
                        onChange={(e) => setGithubTopic(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Time Period</Label>
                    <Select value={githubPeriod} onValueChange={setGithubPeriod}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GITHUB_PERIODS.map((period) => (
                          <SelectItem key={period.id} value={period.id}>
                            {period.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      GitHub returns repositories created in this period, sorted by total stars.
                    </p>
                  </div>
                </>
              )}

            </div>
          </section>

          {/* Filtering */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-lg font-semibold">Filtering</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 pl-3">
              <div className="space-y-2">
                <Label>Filter Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFilterTypes.map((ft) => (
                      <SelectItem key={ft.id} value={ft.id}>
                        <div>
                          <div>{ft.name}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filterType !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="filterValue">
                    {filterType === "score" && "Minimum Score"}
                    {filterType === "threshold" && "Threshold %"}
                    {filterType === "posts_per_day" && "Posts Per Run"}
                  </Label>
                  <Input
                    id="filterValue"
                    type="number"
                    placeholder={filterType === "threshold" ? "e.g., 50" : "e.g., 10"}
                    value={filterValue ?? ""}
                    onChange={(e) => setFilterValue(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Content Scope */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-lg font-semibold">Content Scope</h2>
            </div>

            <div className="space-y-4 pl-3">
              <div className="space-y-2">
                <Label>Target Keywords / Categories</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-byword-blue/30 bg-byword-blue-soft px-3 py-1.5 text-sm text-byword-blue"
                    >
                      {keyword}
                      <button
                        onClick={() => removeKeyword(keyword)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  placeholder="Type and press Enter..."
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <p className="text-xs text-muted-foreground">
                  Only articles matching these keywords will be processed. Leave empty to process all.
                </p>
              </div>
            </div>
          </section>

          {/* AI Configuration */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-lg font-semibold">AI Configuration</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 pl-3">
              <div className="space-y-2">
                <Label>Writer Persona</Label>
                <Select value={personaId} onValueChange={handlePersonaChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((persona) => (
                      <SelectItem key={persona.id} value={persona.id}>
                        {persona.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {personas.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active personas. <a href="/brand-voice" className="text-primary underline">Create one first</a>.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>OpenRouter Text Model</Label>
                <LiveTextModelSelect value={modelId} onValueChange={setModelId} />
                {selectedModelUnavailable && (
                  <p className="text-xs text-destructive">Unavailable: {modelId}. Pick a live OpenRouter model.</p>
                )}
                {personaId && !selectedModelUnavailable && personas.find((persona) => persona.id === personaId)?.base_model === modelId && (
                  <p className="text-xs text-muted-foreground">Defaulted from selected persona.</p>
                )}
                {personaId && !selectedModelUnavailable && personas.find((persona) => persona.id === personaId)?.base_model !== modelId && (
                  <p className="text-xs text-amber-600">Custom model selected; this overrides the persona default for this feed.</p>
                )}
              </div>
            </div>
          </section>

          {/* Image Generation */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-lg font-semibold">Image Generation</h2>
            </div>
            <div className="pl-3">
              <SplitImageGenerationSettings
                config={imageConfig}
                onConfigChange={setImageConfig}
                compact
                inlineImageSource={inlineImageSource}
                imageDeliveryMode={imageDeliveryMode}
                manualImageProvider={manualImageProvider}
                onImageDeliveryModeChange={setImageDeliveryMode}
              />
            </div>
          </section>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                Advanced Options
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4 pl-3">
                {/* Platform-specific content options */}
                {platform === "rss" && (
                  <div className="flex items-center justify-between py-3 px-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Full-Text Extraction</p>
                        <p className="text-xs text-muted-foreground">Fetch complete article content from URLs</p>
                      </div>
                    </div>
                    <Switch checked={extractFullContent} onCheckedChange={setExtractFullContent} />
                  </div>
                )}

                {/* Freshness filter - context-specific label */}
                <div className="space-y-2">
                  <Label htmlFor="filterOldPosts">
                    {platform === "youtube" ? "Filter Old Videos (days)" : "Filter Old Posts (days)"}
                  </Label>
                  <Input
                    id="filterOldPosts"
                    type="number"
                    min="1"
                    placeholder="e.g., 7"
                    value={filterOldPostsDays ?? ""}
                    onChange={(e) => setFilterOldPostsDays(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {platform === "youtube"
                      ? "Only process videos published in the last N days"
                      : "Exclude posts older than N days"}
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Scheduling */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="text-lg font-semibold">Scheduling</h2>
            </div>

            <div className="space-y-4 pl-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fetch Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
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
                  <Select value={String(postsPerRun)} onValueChange={(v) => setPostsPerRun(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 3, 5, 10, 15, 20].map((num) => (
                        <SelectItem key={num} value={String(num)}>
                          {num} {num === 1 ? "post" : "posts"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Limits how many new posts are generated per fetch.</p>
                </div>
              </div>

              <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-border">
                <div>
                  <p className="font-medium">Active</p>
                  <p className="text-sm text-muted-foreground">
                    Start collecting data immediately after saving
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </section>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-6">
          <FeedPreview
            platform={platform}
            platformConfig={buildPlatformConfig()}
            filterType={filterType}
            filterValue={filterValue}
            keywords={keywords}
          />
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/rss-feeds")} disabled={isSubmitting}>
              Cancel
            </Button>
          <Button variant="outline" onClick={handleSaveAndRun} disabled={isSubmitting || !modelId || selectedModelUnavailable}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Save & Run Now
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting || selectedModelUnavailable}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
              Save Feed
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

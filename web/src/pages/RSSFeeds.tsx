import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addHours, addDays, addWeeks, isPast } from "date-fns";
import { safeFormatDistanceToNow, safeLocaleString } from "@/lib/date-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Rss,
  Loader2,
  Github,
  MessageSquare,
  FileText,
  PlayCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Pause,
  Play,
  Trash2,
  BarChart3,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { platformLabel, sourceTypeForPlatform } from "@/lib/source-options";
import { feedDraftQueueLabel, queueFeedDraftJobs } from "@/lib/feed-generation";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FeedEditorDialog } from "@/components/feeds/FeedEditorDialog";
import {
  SplitImageConfig,
  DEFAULT_SPLIT_CONFIG,
  type InlineImageSource,
  type ImageDeliveryMode,
  type ImageResolution,
  type ManualImageProvider,
} from "@/components/content/ImageGenerationSettings";
import { cn } from "@/lib/utils";
import type { FeedEditorialDefaults } from "@/lib/feed-routing";
import { useSites } from "@/hooks/useSites";
import {
  formatCompactNumber,
  safePercent,
  semanticToneClass,
  topBuckets,
  type SemanticTone,
} from "@/lib/search-insights";

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
  routing_status?: "ready" | "needs_routing";
  site_name?: string | null;
  integration_name?: string | null;
  integration_provider?: string | null;
  integration_config?: Record<string, unknown>;
}

interface Persona {
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
}

interface SchedulerRun {
  feeds_triggered: number;
  feeds_errored: number;
  triggered_at: string;
}

function normalizeImageResolution(value?: string | null): ImageResolution {
  return value === "512" ? "512" : "1K";
}

export default function RSSFeeds() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "news" | "active" | "paused" | "routing">("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const { sites } = useSites();
  const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [feedToDelete, setFeedToDelete] = useState<Feed | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [runningFeedId, setRunningFeedId] = useState<string | null>(null);
  const feedsPerPage = 5;

  // Fetch feeds
  const { data: feeds = [], isLoading: feedsLoading } = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => {
      return api.getArray<Feed>("/feeds");
    },
    enabled: !!user,
  });

  // Fetch personas for the select dropdown (include base_model for auto-selection)
  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const all = await api.getArray<Persona>("/personas");
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

  const defaultImageConfig: SplitImageConfig = useMemo(() => {
    if (!userSettings) return DEFAULT_SPLIT_CONFIG;
    return {
      cover: {
        enabled: userSettings.cover_enabled ?? true,
        resolution: normalizeImageResolution(userSettings.cover_image_resolution),
      },
      inline: {
        enabled: userSettings.inline_enabled ?? true,
        count: userSettings.inline_count ?? 2,
        resolution: normalizeImageResolution(userSettings.inline_image_resolution),
      },
    };
  }, [userSettings]);
  const defaultInlineImageSource: InlineImageSource = userSettings?.inline_image_source === "stock" ? "stock" : "ai";
  const defaultImageDeliveryMode: ImageDeliveryMode = userSettings?.image_delivery_mode === "manual_prompt" ? "manual_prompt" : "generate";
  const defaultManualImageProvider: ManualImageProvider = "midjourney";

  // Fetch latest scheduler log
  const { data: lastSchedulerRun } = useQuery({
    queryKey: ["last-scheduler-run"],
    queryFn: async () => {
      const logs = await api.getArray<SchedulerRun>("/scheduler/logs?limit=1");
      return logs?.[0] || null;
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const updateFeedMutation = useMutation({
    mutationFn: async (feed: Partial<Feed> & { id: string }) => {
      return api.put<Feed>(`/feeds/${feed.id}`, {
        name: feed.name,
        source_url: feed.source_url,
        keywords: feed.keywords,
        persona_id: feed.persona_id,
        model_id: feed.model_id,
        frequency: feed.frequency,
        is_active: feed.is_active,
        filter_type: feed.filter_type,
        filter_value: feed.filter_value,
        extract_full_content: feed.extract_full_content,
        posts_per_run: feed.posts_per_run,
        filter_old_posts_days: feed.filter_old_posts_days,
        platform_config: feed.platform_config,
        site_id: feed.site_id,
        integration_id: feed.integration_id,
        editorial_defaults: feed.editorial_defaults,
        routing_version: feed.routing_version,
      });
    },
    onSuccess: (updated, variables) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      // Only close dialog and show detailed toast if saving from the editor
      if (selectedFeed && variables.id === selectedFeed.id && variables.name !== undefined) {
        if (updated.routing_status === "needs_routing" && updated.routing_version !== 0) toast.warning("Feed saved and paused. Complete destination routing before running it.");
        else toast.success("Feed saved. Scheduler will run this feed on the next cycle.");
        setSelectedFeed(null);
      } else {
        toast.success("Feed status updated.");
      }
    },
    onError: (error) => {
      toast.error("Failed to update feed: " + error.message);
    },
  });

  const batchUpdateFeedsMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const selected = feeds.filter((feed) => selectedFeedIds.includes(feed.id));
      const updated = await Promise.all(selected.map((feed) => api.put<Feed>(`/feeds/${feed.id}`, {
        name: feed.name,
        source_url: feed.source_url,
        keywords: feed.keywords,
        persona_id: feed.persona_id,
        model_id: feed.model_id,
        frequency: feed.frequency,
        is_active: isActive,
        filter_type: feed.filter_type,
        filter_value: feed.filter_value,
        extract_full_content: feed.extract_full_content,
        posts_per_run: feed.posts_per_run,
        filter_old_posts_days: feed.filter_old_posts_days,
        platform_config: feed.platform_config,
        site_id: feed.site_id,
        integration_id: feed.integration_id,
        editorial_defaults: feed.editorial_defaults,
        routing_version: feed.routing_version,
      })));
      return { count: selected.length, needsRouting: updated.filter((feed) => feed.routing_status === "needs_routing" && feed.routing_version !== 0).length };
    },
    onSuccess: ({ count, needsRouting }, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      if (isActive && needsRouting) toast.warning(`${needsRouting} feed${needsRouting === 1 ? " remains" : "s remain"} paused until routing is complete.`);
      else toast.success(`${count} feed${count === 1 ? "" : "s"} ${isActive ? "resumed" : "paused"}.`);
      setSelectedFeedIds([]);
    },
    onError: (error) => {
      toast.error("Failed to update feeds: " + error.message);
    },
  });

  // Delete feed mutation
  const deleteFeedMutation = useMutation({
    mutationFn: async (feedId: string) => {
      await api.delete(`/feeds/${feedId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      toast.success("Feed deleted successfully.");
      setFeedToDelete(null);
      setSelectedFeed(null);
    },
    onError: (error) => {
      toast.error("Failed to delete feed: " + error.message);
    },
  });

  const batchDeleteFeedsMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(selectedFeedIds.map((feedId) => api.delete(`/feeds/${feedId}`)));
      return selectedFeedIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      toast.success(`${count} feed${count === 1 ? "" : "s"} deleted.`);
      setSelectedFeedIds([]);
      setBatchDeleteOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to delete feeds: " + error.message);
    },
  });

  // Run feed now mutation
  const runFeedMutation = useMutation({
    mutationFn: async ({ feed, imgConfig, imageMode }: { feed: Feed; imgConfig?: SplitImageConfig; imageMode?: ImageDeliveryMode }) => {
      setRunningFeedId(feed.id);

      const savedFeed = await api.put<Feed>(`/feeds/${feed.id}`, {
        ...feed,
        site_id: feed.site_id,
        integration_id: feed.integration_id,
        editorial_defaults: feed.editorial_defaults,
        routing_version: feed.routing_version ?? 1,
      });
      if (savedFeed.routing_status === "needs_routing" && savedFeed.routing_version !== 0) throw new Error("Complete destination routing before running this feed");

      const ic = imgConfig ?? defaultImageConfig;
      const inlineEnabled = ic.inline.enabled && ic.inline.count > 0;
      const imagesEnabled = ic.cover.enabled || inlineEnabled;
      const postsPerRun = feed.posts_per_run ?? 5;

      const buildGenerationPayload = (feedItemOffset: number) => ({
        sourceType: sourceTypeForPlatform(feed.platform),
        sourceValue: feed.source_url,
        personaId: feed.persona_id,
        modelId: feed.model_id,
        variations: 1,
        postsPerRun: 1,
        feedItemOffset,
        feedId: feed.id,
        siteId: feed.site_id,
        preferredIntegrationId: feed.integration_id,
        filterType: feed.filter_type,
        filterValue: feed.filter_value,
        keywords: feed.keywords || undefined,
        extractFullContent: feed.extract_full_content ?? false,
        filterOldPostsDays: feed.filter_old_posts_days || undefined,
        platformConfig: feed.platform_config || {},
        generateImages: imagesEnabled,
        imageDeliveryMode: imageMode ?? defaultImageDeliveryMode,
        manualImageProvider: defaultManualImageProvider,
        imageConfig: imagesEnabled ? {
          cover: ic.cover.enabled ? { resolution: ic.cover.resolution || "1K" } : null,
          inline: inlineEnabled ? {
            count: ic.inline.count,
            resolution: ic.inline.resolution || "1K",
          } : null,
        } : undefined,
      });
      return queueFeedDraftJobs(postsPerRun, (index, run) => api.post<unknown>("/content/generate", {
        ...buildGenerationPayload(index),
        feedRunToken: run.token,
        feedRunSize: run.remaining,
      }));
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`${feedDraftQueueLabel(result.queued)} queued. Check the Job Queue for progress.`);
      setRunningFeedId(null);
    },
    onError: (error) => {
      toast.error("Failed to run feed: " + error.message);
      setRunningFeedId(null);
    },
  });

  const isNewsFeed = (feed: Feed) => {
    if (feed.editorial_defaults?.profile === "ortak_alan_news") return feed.editorial_defaults.contentType === "Haber";
    const mode = feed.platform_config?.editorialMode;
    return mode === "news" || mode === "sports_news";
  };

  const newsFeedCount = feeds.filter(isNewsFeed).length;

  const filteredFeeds = feeds.filter((feed) => {
    const matchesSearch = feed.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "news" && isNewsFeed(feed)) ||
      (filter === "routing" && feed.routing_status === "needs_routing") ||
      (filter === "active" && feed.is_active) ||
      (filter === "paused" && !feed.is_active);
    const matchesSite = siteFilter === "all" || feed.site_id === siteFilter;
    return matchesSearch && matchesFilter && matchesSite;
  });

  const totalPages = Math.ceil(filteredFeeds.length / feedsPerPage);
  const paginatedFeeds = filteredFeeds.slice(
    (currentPage - 1) * feedsPerPage,
    currentPage * feedsPerPage
  );
  const selectedFeeds = useMemo(
    () => feeds.filter((feed) => selectedFeedIds.includes(feed.id)),
    [feeds, selectedFeedIds]
  );
  const pageFeedIds = paginatedFeeds.map((feed) => feed.id);
  const pageSelectedCount = pageFeedIds.filter((id) => selectedFeedIds.includes(id)).length;
  const pageSelectionState = pageSelectedCount === 0 ? false : pageSelectedCount === pageFeedIds.length ? true : "indeterminate";
  const batchBusy = batchUpdateFeedsMutation.isPending || batchDeleteFeedsMutation.isPending;

  useEffect(() => {
    setSelectedFeedIds((current) => current.filter((id) => feeds.some((feed) => feed.id === id)));
  }, [feeds]);

  const toggleFeedSelection = (feedId: string, checked: boolean) => {
    setSelectedFeedIds((current) =>
      checked ? Array.from(new Set([...current, feedId])) : current.filter((id) => id !== feedId)
    );
  };

  const togglePageSelection = (checked: boolean) => {
    setSelectedFeedIds((current) => {
      if (!checked) return current.filter((id) => !pageFeedIds.includes(id));
      return Array.from(new Set([...current, ...pageFeedIds]));
    });
  };

  const handleSelectFeed = (feed: Feed) => {
    setSelectedFeed(feed);
  };

  const handleSave = (feed: Feed) => {
    updateFeedMutation.mutate(feed);
  };

  const handleRunNow = (feed: Feed, imgConfig?: SplitImageConfig, imageDeliveryMode?: ImageDeliveryMode) => {
    runFeedMutation.mutate({ feed, imgConfig, imageMode: imageDeliveryMode });
  };

  const handleDelete = (feed: Feed) => {
    setFeedToDelete(feed);
  };

  const getPersonaName = (personaId: string | null) => {
    if (!personaId) return "No Persona";
    const persona = personas.find((p) => p.id === personaId);
    return persona?.name || "Unknown";
  };

  const getPlatformIcon = (platform?: string) => {
    switch (platform) {
      case "youtube":
        return <PlayCircle className="h-4 w-4 text-red-500" />;
      case "reddit":
        return <MessageSquare className="h-4 w-4 text-orange-500" />;
      case "hackernews":
        return <span className="text-orange-500 font-bold text-xs">Y</span>;
      case "github":
        return <Github className="h-4 w-4" />;
      case "rss":
      default:
        return <Rss className="h-4 w-4 text-primary" />;
    }
  };

  const getPlatformLabel = (platform?: string) => {
    return platformLabel(platform);
  };

  const getNextRun = (feed: Feed) => {
    if (!feed.is_active) return null;
    if (!feed.last_run_at) return new Date(); // Due now

    const lastRun = new Date(feed.last_run_at);
    switch (feed.frequency) {
      case "every_4_hours":
        return addHours(lastRun, 4);
      case "every_12_hours":
        return addHours(lastRun, 12);
      case "daily":
        return addDays(lastRun, 1);
      case "weekly":
        return addWeeks(lastRun, 1);
      default:
      return addDays(lastRun, 1);
    }
  };

  const dueNowFeeds = feeds.filter((feed) => {
    const nextRun = getNextRun(feed);
    return Boolean(nextRun && isPast(nextRun));
  });
  const sourceHealth = {
    active: feeds.filter((feed) => feed.is_active).length,
    paused: feeds.filter((feed) => !feed.is_active).length,
    dueNow: dueNowFeeds,
    schedulerErrors: Number(lastSchedulerRun?.feeds_errored || 0),
    totalGenerated: feeds.reduce((sum, feed) => sum + (Number(feed.total_articles) || 0), 0),
    platformBuckets: topBuckets(feeds, (feed) => getPlatformLabel(feed.platform), {
      limit: 5,
      getValue: (feed) => Number(feed.total_articles) || 1,
    }),
  };

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Content Sources"
        description="Monitor, pause, run, and delete all saved content sources."
      >
        <Button onClick={() => navigate("/sources/rss/new")}>
          <Plus className="h-4 w-4" />
          Add Source
        </Button>
      </PageHeader>

      {/* Scheduler Status */}
      {lastSchedulerRun && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-byword-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%)]">
          <Clock className="h-4 w-4" />
          <span>Last scheduler check:</span>
          <span className="font-medium text-foreground">
            {safeFormatDistanceToNow(lastSchedulerRun.triggered_at)}
          </span>
          {lastSchedulerRun.feeds_triggered > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <CheckCircle className="h-3 w-3" />
              {lastSchedulerRun.feeds_triggered} triggered
            </Badge>
          )}
          {lastSchedulerRun.feeds_errored > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertCircle className="h-3 w-3" />
              {lastSchedulerRun.feeds_errored} errors
            </Badge>
          )}
        </div>
      )}

      <SourceHealthInsights
        totalSources={feeds.length}
        activeCount={sourceHealth.active}
        pausedCount={sourceHealth.paused}
        dueNowCount={sourceHealth.dueNow.length}
        schedulerErrors={sourceHealth.schedulerErrors}
        postsGenerated={sourceHealth.totalGenerated}
        platformBuckets={sourceHealth.platformBuckets}
        onRunDueNow={() => sourceHealth.dueNow[0] && handleRunNow(sourceHealth.dueNow[0])}
        onShowPaused={() => setFilter("paused")}
        onShowActive={() => setFilter("active")}
        running={Boolean(runningFeedId)}
      />

      <div className="sticky top-0 z-20 mb-6 rounded-md border border-byword-border bg-background/92 p-2 shadow-[0_10px_24px_hsl(210_5%_20%/0.06)] backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="all" className="gap-2">
                All Feeds
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {feeds.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="news" className="gap-2">
                News
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {newsFeedCount}
                </span>
              </TabsTrigger>
              <TabsTrigger value="active" className="gap-2">
                <span className="h-2 w-2 rounded-full bg-status-success" />
                Active
              </TabsTrigger>
              <TabsTrigger value="paused" className="gap-2">
                <span className="h-2 w-2 rounded-full bg-status-warning" />
                Paused
              </TabsTrigger>
              <TabsTrigger value="routing" className="gap-2">
                <AlertCircle className="h-3.5 w-3.5" /> Needs routing
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex w-full gap-2 lg:w-auto">
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All sites</SelectItem>{sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
            </Select>
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search feeds..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          </div>
        </div>

        {selectedFeeds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-byword-blue/25 bg-byword-blue-soft/35 px-4 py-3 shadow-[inset_0_1px_0_hsl(0_0%_100%)]">
            <p className="font-mono text-[12px] font-semibold uppercase text-foreground">
              {selectedFeeds.length} feed{selectedFeeds.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={batchBusy} onClick={() => batchUpdateFeedsMutation.mutate(false)}>
                <Pause className="h-4 w-4" />
                Pause
              </Button>
              <Button size="sm" variant="outline" disabled={batchBusy} onClick={() => batchUpdateFeedsMutation.mutate(true)}>
                <Play className="h-4 w-4" />
                Resume
              </Button>
              <Button size="sm" variant="outline" disabled={batchBusy} onClick={() => setSelectedFeedIds([])}>
                Clear
              </Button>
              <Button size="sm" variant="destructive" disabled={batchBusy} onClick={() => setBatchDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <BywordCard>
        <SectionHeader
          icon={Rss}
          title="Source queue"
          description={`${formatCompactNumber(filteredFeeds.length)} visible source${filteredFeeds.length === 1 ? "" : "s"} after filters.`}
          action={<Badge variant="outline">{formatCompactNumber(sourceHealth.totalGenerated)} posts generated</Badge>}
        />
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={pageSelectionState}
                  disabled={!paginatedFeeds.length}
                  onCheckedChange={(checked) => togglePageSelection(Boolean(checked))}
                  aria-label="Select visible feeds"
                />
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Assigned Persona</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Next Run</TableHead>
              <TableHead className="text-center">Posts</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {feedsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-9 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : paginatedFeeds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  No sources configured yet. Add your first content source to get started.
                </TableCell>
              </TableRow>
            ) : (
              paginatedFeeds.map((feed) => {
                const nextRun = getNextRun(feed);
                const isDue = nextRun && isPast(nextRun);
                const feedIsNews = isNewsFeed(feed);
                const matchedLabel = feed.platform_config?.matchedLabel as string | undefined;

                return (
                <TableRow
                  key={feed.id}
                  className="table-row-calm cursor-pointer"
                  onClick={() => handleSelectFeed(feed)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedFeedIds.includes(feed.id)}
                      onCheckedChange={(checked) => toggleFeedSelection(feed.id, Boolean(checked))}
                      aria-label={`Select ${feed.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        {getPlatformIcon(feed.platform)}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-primary">{feed.name}</span>
                          {feedIsNews && <Badge variant="outline" className="text-xs">News</Badge>}
                          {matchedLabel && <Badge variant="secondary" className="text-xs">{matchedLabel}</Badge>}
                          {feed.extract_full_content && (
                            <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
                              <FileText className="h-3 w-3" />
                              Full Text
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {feedIsNews ? "News RSS Feed" : getPlatformLabel(feed.platform)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{feed.site_name || "Unassigned site"}</p>
                      <p className="text-xs text-muted-foreground">{feed.integration_name || "No publishing target"}</p>
                      <div className="flex flex-wrap gap-1">{feed.editorial_defaults?.contentType && <Badge variant="outline" className="text-[10px]">{feed.editorial_defaults.contentType}</Badge>}{(feed.editorial_defaults?.defaultTopicTags || feed.editorial_defaults?.defaultTags || []).slice(0, 2).map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border text-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded border border-byword-blue/30 bg-byword-blue-soft text-xs text-byword-blue">
                        {getPersonaName(feed.persona_id)?.[0] || "?"}
                      </span>
                      {getPersonaName(feed.persona_id)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {feed.last_run_at ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-muted-foreground cursor-help">
                            {safeFormatDistanceToNow(feed.last_run_at)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {safeLocaleString(feed.last_run_at)}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground/50">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!feed.is_active ? (
                      <span className="text-sm text-muted-foreground/50">Paused</span>
                    ) : isDue ? (
                      <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                        Due now
                      </Badge>
                    ) : nextRun ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-muted-foreground cursor-help">
                            {safeFormatDistanceToNow(nextRun)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {safeLocaleString(nextRun)}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium">
                      {feed.total_articles ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    {feed.routing_status === "needs_routing" ? <Badge variant="outline" className="border-amber-300 text-amber-800">Needs routing</Badge> : <StatusBadge status={feed.is_active ? "active" : "paused"} showIcon={false} />}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={updateFeedMutation.isPending || (!feed.is_active && feed.routing_status === "needs_routing" && feed.routing_version !== 0)}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateFeedMutation.mutate({
                              ...feed,
                              is_active: !feed.is_active,
                            });
                          }}
                        >
                          {feed.is_active ? (
                            <Pause className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Play className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {feed.is_active ? "Pause feed" : "Resume feed"}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {paginatedFeeds.length} of {filteredFeeds.length} feeds
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Next
            </Button>
          </div>
        </div>
      </BywordCard>

      {/* Feed Editor Dialog */}
      <FeedEditorDialog
        feed={selectedFeed}
        personas={personas}
        isOpen={!!selectedFeed}
        onClose={() => setSelectedFeed(null)}
        onSave={handleSave}
        onRunNow={handleRunNow}
        onDelete={handleDelete}
        isSaving={updateFeedMutation.isPending}
        isRunning={runningFeedId === selectedFeed?.id}
        isDeleting={deleteFeedMutation.isPending}
        defaultImageConfig={defaultImageConfig}
        inlineImageSource={defaultInlineImageSource}
        imageDeliveryMode={defaultImageDeliveryMode}
        manualImageProvider={defaultManualImageProvider}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!feedToDelete} onOpenChange={(open) => !open && setFeedToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feed</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{feedToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => feedToDelete && deleteFeedMutation.mutate(feedToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFeedMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Feeds</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {selectedFeeds.length} selected feed{selectedFeeds.length === 1 ? "" : "s"}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleteFeedsMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchDeleteFeedsMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchDeleteFeedsMutation.isPending}
            >
              {batchDeleteFeedsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BywordPageShell>
  );
}

function SourceHealthInsights({
  totalSources,
  activeCount,
  pausedCount,
  dueNowCount,
  schedulerErrors,
  postsGenerated,
  platformBuckets,
  onRunDueNow,
  onShowPaused,
  onShowActive,
  running,
}: {
  totalSources: number;
  activeCount: number;
  pausedCount: number;
  dueNowCount: number;
  schedulerErrors: number;
  postsGenerated: number;
  platformBuckets: Array<{ label: string; value: number }>;
  onRunDueNow: () => void;
  onShowPaused: () => void;
  onShowActive: () => void;
  running: boolean;
}) {
  const metrics = [
    { label: "Active", value: activeCount, tone: activeCount ? "success" as SemanticTone : "opportunity" as SemanticTone, icon: CheckCircle },
    { label: "Paused", value: pausedCount, tone: pausedCount ? "opportunity" as SemanticTone : "success" as SemanticTone, icon: Pause },
    { label: "Due now", value: dueNowCount, tone: dueNowCount ? "performance" as SemanticTone : "neutral" as SemanticTone, icon: CalendarClock },
    { label: "Scheduler errors", value: schedulerErrors, tone: schedulerErrors ? "risk" as SemanticTone : "success" as SemanticTone, icon: AlertCircle },
    { label: "Posts generated", value: postsGenerated, tone: "performance" as SemanticTone, icon: FileText },
  ];

  return (
    <BywordCard className="mb-6">
      <SectionHeader
        icon={BarChart3}
        title="Source health"
        description="Which sources are alive, due, and contributing posts."
        action={<Badge variant="outline">{formatCompactNumber(totalSources)} total sources</Badge>}
      />
      <div className="p-4 sm:p-5 lg:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className={cn("rounded-md border p-4", semanticToneClass(metric.tone))}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase opacity-75">{metric.label}</p>
                <metric.icon className="h-4 w-4 opacity-70" />
              </div>
              <p className="text-2xl font-semibold text-foreground">{formatCompactNumber(metric.value)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-md border border-byword-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-byword-blue" />
              <p className="text-sm font-semibold">Contribution by platform</p>
            </div>
            <div className="space-y-2">
              {platformBuckets.length ? platformBuckets.map((bucket) => (
                <div key={bucket.label}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-muted-foreground">{bucket.label}</span>
                    <span className="font-medium">{formatCompactNumber(bucket.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-byword-blue" style={{ width: `${Math.max(8, safePercent(bucket.value, Math.max(postsGenerated, totalSources)))}%` }} />
                  </div>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground">No source contribution yet.</p>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <SourceLane
              title="Due now"
              value={formatCompactNumber(dueNowCount)}
              detail={dueNowCount ? "Run the next due source now or let the scheduler pick it up." : "No active source is due."}
              tone={dueNowCount ? "performance" : "success"}
              action={running ? "Running..." : "Run first due"}
              disabled={!dueNowCount || running}
              icon={Play}
              onClick={onRunDueNow}
            />
            <SourceLane
              title="Paused sources"
              value={formatCompactNumber(pausedCount)}
              detail={pausedCount ? "Paused sources are no longer feeding the content pipeline." : "All sources are active."}
              tone={pausedCount ? "opportunity" : "success"}
              action="Show paused"
              disabled={!pausedCount}
              icon={Pause}
              onClick={onShowPaused}
            />
            <SourceLane
              title="Scheduler errors"
              value={formatCompactNumber(schedulerErrors)}
              detail={schedulerErrors ? "Open active sources and check credentials or feed URLs." : "Latest scheduler run is clean."}
              tone={schedulerErrors ? "risk" : "success"}
              action={schedulerErrors ? "Show active" : "View sources"}
              disabled={false}
              icon={schedulerErrors ? AlertCircle : ArrowRight}
              onClick={onShowActive}
            />
          </div>
        </div>
      </div>
    </BywordCard>
  );
}

function SourceLane({
  title,
  value,
  detail,
  tone,
  action,
  disabled,
  icon: Icon,
  onClick,
}: {
  title: string;
  value: string;
  detail: string;
  tone: SemanticTone;
  action: string;
  disabled?: boolean;
  icon: typeof Rss;
  onClick: () => void;
}) {
  return (
    <div className={cn("rounded-md border p-3", semanticToneClass(tone))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] opacity-75">{title}</p>
          <p className="mt-1 text-xs opacity-75">{detail}</p>
        </div>
        <p className="text-xl font-semibold text-foreground">{value}</p>
      </div>
      <Button size="sm" variant="outline" className="mt-3 h-8 w-full bg-card" onClick={onClick} disabled={disabled}>
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {action}
      </Button>
    </div>
  );
}

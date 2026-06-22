import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow, addHours, addDays, addWeeks, isPast } from "date-fns";
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
  Globe,
  Github,
  MessageSquare,
  FileText,
  PlayCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Pause,
  Play,
} from "lucide-react";
import { PLATFORMS } from "@/lib/mock-data";
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
  type Resolution,
  type AspectRatio,
} from "@/components/content/ImageGenerationSettings";

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
  platform_config?: Record<string, any>;
  extract_full_content?: boolean;
  posts_per_run?: number | null;
  filter_old_posts_days?: number | null;
}

interface Persona {
  id: string;
  name: string;
  status: string;
  base_model: string;
}

export default function RSSFeeds() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [feedToDelete, setFeedToDelete] = useState<Feed | null>(null);
  const [runningFeedId, setRunningFeedId] = useState<string | null>(null);
  const feedsPerPage = 5;

  // Fetch feeds
  const { data: feeds = [], isLoading: feedsLoading } = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => {
      return api.get<Feed[]>("/feeds");
    },
    enabled: !!user,
  });

  // Fetch personas for the select dropdown (include base_model for auto-selection)
  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const all = await api.get<Persona[]>("/personas");
      return all.filter((p) => p.status === "active");
    },
    enabled: !!user,
  });

  // Fetch user settings for default image config
  const { data: userSettings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      return api.get<any>("/settings");
    },
    enabled: !!user,
  });

  const defaultImageConfig: SplitImageConfig = useMemo(() => {
    if (!userSettings) return DEFAULT_SPLIT_CONFIG;
    return {
      cover: {
        enabled: userSettings.cover_enabled ?? true,
        resolution: (userSettings.cover_resolution as Resolution) || "2K",
        aspectRatio: (userSettings.cover_aspect_ratio as AspectRatio) || "16:9",
      },
      inline: {
        enabled: userSettings.inline_enabled ?? true,
        count: userSettings.inline_count || 2,
        resolution: (userSettings.inline_resolution as Resolution) || "2K",
        aspectRatio: (userSettings.inline_aspect_ratio as AspectRatio) || "3:2",
      },
    };
  }, [userSettings]);

  // Fetch latest scheduler log
  const { data: lastSchedulerRun } = useQuery({
    queryKey: ["last-scheduler-run"],
    queryFn: async () => {
      const logs = await api.get<any[]>("/scheduler/logs?limit=1");
      return logs?.[0] || null;
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const updateFeedMutation = useMutation({
    mutationFn: async (feed: Partial<Feed> & { id: string }) => {
      await api.put(`/feeds/${feed.id}`, {
        name: feed.name,
        source_url: feed.source_url,
        persona_id: feed.persona_id,
        model_id: feed.model_id,
        frequency: feed.frequency,
        is_active: feed.is_active,
        extract_full_content: feed.extract_full_content,
        posts_per_run: feed.posts_per_run,
        filter_old_posts_days: feed.filter_old_posts_days,
        platform_config: feed.platform_config,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      // Only close dialog and show detailed toast if saving from the editor
      if (selectedFeed && variables.id === selectedFeed.id && variables.name !== undefined) {
        toast.success("Feed saved. Scheduler will run this feed on the next cycle.");
        setSelectedFeed(null);
      } else {
        toast.success("Feed status updated.");
      }
    },
    onError: (error) => {
      toast.error("Failed to update feed: " + error.message);
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

  // Run feed now mutation
  const runFeedMutation = useMutation({
    mutationFn: async ({ feed, imgConfig }: { feed: Feed; imgConfig?: SplitImageConfig }) => {
      setRunningFeedId(feed.id);

      const ic = imgConfig ?? defaultImageConfig;
      const imagesEnabled = ic.cover.enabled || ic.inline.enabled;

      const data = await api.post<any>("/content/generate", {
        sourceType: "rss_feed",
        sourceValue: feed.source_url,
        personaId: feed.persona_id,
        modelId: feed.model_id,
        variations: feed.posts_per_run ?? 5,
        feedId: feed.id,
        extractFullContent: feed.extract_full_content ?? false,
        filterOldPostsDays: feed.filter_old_posts_days || undefined,
        platformConfig: feed.platform_config || {},
        generateImages: imagesEnabled,
        imageConfig: imagesEnabled ? {
          cover: ic.cover.enabled ? {
            resolution: ic.cover.resolution,
            aspectRatio: ic.cover.aspectRatio,
          } : null,
          inline: ic.inline.enabled ? {
            count: ic.inline.count,
            resolution: ic.inline.resolution,
            aspectRatio: ic.inline.aspectRatio,
          } : null,
        } : undefined,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job queued. Check the Job Queue for progress.");
      setRunningFeedId(null);
    },
    onError: (error) => {
      toast.error("Failed to run feed: " + error.message);
      setRunningFeedId(null);
    },
  });

  const filteredFeeds = feeds.filter((feed) => {
    const matchesSearch = feed.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && feed.is_active) ||
      (filter === "paused" && !feed.is_active);
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredFeeds.length / feedsPerPage);
  const paginatedFeeds = filteredFeeds.slice(
    (currentPage - 1) * feedsPerPage,
    currentPage * feedsPerPage
  );

  const handleSelectFeed = (feed: Feed) => {
    setSelectedFeed(feed);
  };

  const handleSave = (feed: Feed) => {
    updateFeedMutation.mutate(feed);
  };

  const handleRunNow = (feed: Feed, imgConfig?: SplitImageConfig) => {
    runFeedMutation.mutate({ feed, imgConfig });
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
      case "lemmy":
      case "lobsters":
        return <Globe className="h-4 w-4 text-blue-500" />;
      case "rss":
      default:
        return <Rss className="h-4 w-4 text-primary" />;
    }
  };

  const getPlatformLabel = (platform?: string) => {
    const p = PLATFORMS.find((pl) => pl.id === platform);
    return p?.name || "RSS Feed";
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

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Content Sources"
        description="Monitor and configure content ingestion from RSS feeds, Reddit, Hacker News, GitHub, and more."
      >
        <Button onClick={() => navigate("/rss-feeds/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Add Source
        </Button>
      </PageHeader>

      {/* Scheduler Status */}
      {lastSchedulerRun && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground mb-4">
          <Clock className="h-4 w-4" />
          <span>Last scheduler check:</span>
          <span className="font-medium text-foreground">
            {formatDistanceToNow(new Date(lastSchedulerRun.triggered_at), { addSuffix: true })}
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

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              All Feeds
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {feeds.length}
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
          </TabsList>
        </Tabs>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search feeds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="calm-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Source</TableHead>
              <TableHead>Assigned Persona</TableHead>
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
                  <TableCell><Skeleton className="h-9 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                </TableRow>
              ))
            ) : paginatedFeeds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No sources configured yet. Add your first content source to get started.
                </TableCell>
              </TableRow>
            ) : (
              paginatedFeeds.map((feed) => {
                const nextRun = getNextRun(feed);
                const isDue = nextRun && isPast(nextRun);

                return (
                <TableRow
                  key={feed.id}
                  className="table-row-calm cursor-pointer"
                  onClick={() => handleSelectFeed(feed)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        {getPlatformIcon(feed.platform)}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-primary">{feed.name}</span>
                          {feed.extract_full_content && (
                            <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
                              <FileText className="h-3 w-3" />
                              Full Text
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {getPlatformLabel(feed.platform)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border text-sm">
                      <span className="h-5 w-5 rounded bg-accent flex items-center justify-center text-xs">
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
                            {formatDistanceToNow(new Date(feed.last_run_at), { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Date(feed.last_run_at).toLocaleString()}
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
                            {formatDistanceToNow(nextRun, { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {nextRun.toLocaleString()}
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
                    <StatusBadge status={feed.is_active ? "active" : "paused"} showIcon={false} />
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={updateFeedMutation.isPending}
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
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
      </div>

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
    </div>
  );
}

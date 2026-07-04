import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { stripHtml, wordCount } from "@/lib/html-utils";
import { FeedPreviewItem, type PreviewFeedItem, type ItemStatus } from "./FeedPreviewItem";
import { FeedHealthSummary } from "./FeedHealthSummary";
import { useAuth } from "@/hooks/useAuth";

interface FeedPreviewProps {
  platform: string;
  platformConfig: Record<string, unknown>;
  filterType: string;
  filterValue?: number;
  feedSourceUrl?: string;
  keywords?: string[];
}

type SortMode = "newest" | "oldest";

export function FeedPreview({ platform, platformConfig, filterType, filterValue, feedSourceUrl, keywords = [] }: FeedPreviewProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<PreviewFeedItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  // Controls
  const [itemLimit, setItemLimit] = useState("10");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showEligibleOnly, setShowEligibleOnly] = useState(false);

  const fetchPreview = useCallback(async () => {
    setIsLoading(true);
    setItems([]);

    try {
      let apiPlatform = platform;
      let apiConfig = { ...platformConfig };

      if (platform === "youtube" || (platform === "rss" && platformConfig?.channelId)) {
        apiPlatform = "youtube";
        apiConfig = { channelId: platformConfig?.channelId };
      }

      const data = await api.post<any>("/content/fetch-social", {
        platform: apiPlatform,
        config: apiConfig,
        filterType,
        filterValue,
        keywords,
        limit: parseInt(itemLimit),
      });

      let rawItems: PreviewFeedItem[] = [];
      if (data?.items) {
        rawItems = data.items.map((item: any) => ({
          title: item.title,
          link: item.url || item.link || item.permalink,
          score: item.score,
          comments: item.comments,
          author: item.author,
          pubDate: item.createdAt || item.pubDate,
          summary: item.content || item.summary,
          thumbnail: item.thumbnail,
          content: item.content,
          contentLength: (item.content || "").length,
        }));
      } else if (data?.error) {
        throw new Error(data.error);
      }

      // Check for duplicates if we have a user and feed source
      if (user && rawItems.length > 0) {
        try {
          const existingPosts = await api.get<any[]>("/posts");

          const existingHashes = new Set((existingPosts || []).filter((p) => p.source_content_hash).map((p) => p.source_content_hash));
          const existingTitles = new Set((existingPosts || []).map((p) => p.title?.toLowerCase().trim()));

          rawItems = rawItems.map((item) => {
            // Simple hash simulation: check title match as proxy
            const titleNorm = item.title?.toLowerCase().trim();
            if (existingTitles.has(titleNorm)) {
              return { ...item, status: "duplicate" as ItemStatus, statusReason: "A post with this title already exists" };
            }
            return { ...item, status: "new" as ItemStatus, statusReason: "Not yet processed — will be generated" };
          });
        } catch (e) {
          // If dedup check fails, just show items without status
          console.warn("Dedup check failed:", e);
        }
      }

      setFetchedAt(new Date());
      setItems(rawItems);
    } catch (error) {
      console.error("Preview fetch error:", error);
      toast.error("Failed to fetch preview: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [platform, platformConfig, filterType, filterValue, keywords, itemLimit, user, feedSourceUrl]);

  const handleOpen = () => {
    setIsOpen(true);
    fetchPreview();
  };

  // Apply client-side sort + filter
  const displayItems = (() => {
    let result = [...items];

    // Sort
    if (sortMode === "oldest") {
      result.sort((a, b) => {
        if (!a.pubDate || !b.pubDate) return 0;
        return new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime();
      });
    } else {
      result.sort((a, b) => {
        if (!a.pubDate || !b.pubDate) return 0;
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      });
    }

    // Filter eligible only
    if (showEligibleOnly) {
      result = result.filter((i) => i.status === "new" || !i.status);
    }

    return result;
  })();

  const showFullTextColumn = platform === "rss";

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={handleOpen}>
        <Eye className="h-4 w-4 mr-1.5" />
        Preview
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Feed Preview
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-3 space-y-3 border-b border-border">
            {/* Health summary */}
            {!isLoading && items.length > 0 && (
              <FeedHealthSummary items={items} fetchedAt={fetchedAt} platform={platform} />
            )}

            {/* Controls row */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Show</Label>
                <Select value={itemLimit} onValueChange={(v) => setItemLimit(v)}>
                  <SelectTrigger className="h-8 w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Sort</Label>
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="eligible-only"
                  checked={showEligibleOnly}
                  onCheckedChange={setShowEligibleOnly}
                  className="scale-75"
                />
                <Label htmlFor="eligible-only" className="text-xs text-muted-foreground cursor-pointer">
                  Eligible only
                </Label>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-8 text-xs"
                onClick={fetchPreview}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="px-6 py-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Fetching content...</p>
                </div>
              ) : displayItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <p className="font-medium">No items found</p>
                  <p className="text-xs mt-1">
                    {showEligibleOnly
                      ? "No eligible items — try toggling off the filter"
                      : "Try adjusting your filters or configuration"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayItems.map((item, index) => (
                    <FeedPreviewItem
                      key={index}
                      item={item}
                      index={index}
                      showFullTextColumn={showFullTextColumn}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

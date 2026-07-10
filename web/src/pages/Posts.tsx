import { Fragment, useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { safeFormatDate } from "@/lib/date-format";
import { deletePostsWithCleanup } from "@/lib/post-cleanup";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, ArrowRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Layers, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { BulkActionsBar } from "@/components/posts/BulkActionsBar";
import { PostFilters, SortField, SortDirection, StatusFilter } from "@/components/posts/PostFilters";
import { PostTableRow } from "@/components/posts/PostTableRow";
import { useBulkPostActions } from "@/hooks/useBulkPostActions";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useCreateManualImagePrompts } from "@/hooks/useImageAssets";
import { StatusBadge } from "@/components/ui/status-badge";
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
import {
  formatCompactNumber,
  safePercent,
  semanticToneClass,
  topBuckets,
  type SemanticTone,
} from "@/lib/search-insights";
import { cn } from "@/lib/utils";

interface FailedDraft {
  index: number;
  error: string;
}

interface GenerationPlan {
  totalDrafts?: number;
  failedDrafts?: FailedDraft[];
  batchId?: string | null;
  variationCount?: number | null;
  imagesEnabled?: boolean | null;
  imageDeliveryMode?: "generate" | "manual_prompt" | string | null;
}

interface Post {
  id: string;
  title: string;
  content: string;
  status: string;
  source_type: string;
  source_ref_id: string | null;
  campaign_id: string | null;
  campaign_item_id: string | null;
  persona_id: string | null;
  model_id: string;
  job_id: string | null;
  created_at: string;
  cover_image_url: string | null;
  inline_images: string[] | null;
  image_asset_count?: number | null;
  image_prompt_count?: number | null;
  generation_plan?: GenerationPlan | null;
  personas?: { name: string } | null;
  feeds?: { name: string } | null;
  campaigns?: { name: string } | null;
}

type DisplayRow =
  | { type: "post"; key: string; post: Post }
  | { type: "draftGroup"; key: string; jobId: string | null; post: Post; posts: Post[]; totalDrafts: number; failedDrafts: FailedDraft[] };

const formatModelName = (modelId: string) => {
  const modelMap: Record<string, string> = {
    "google/gemini-3-flash-preview": "Gemini 3 Flash",
    "google/gemini-2.5-pro": "Gemini 2.5 Pro",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
    "openai/gpt-5": "GPT-5",
    "openai/gpt-5-mini": "GPT-5 Mini",
  };
  return modelMap[modelId] || modelId;
};

const cleanDraftTitle = (title: string) => title.replace(/\s+\(Draft\s+\d+\)$/i, "");
const FEED_SOURCE_TYPES = new Set(["rss_feed", "reddit", "hackernews", "github"]);

const draftIndex = (post: Post) => {
  const match = post.title.match(/\(Draft\s+(\d+)\)$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const sortDraftPosts = (a: Post, b: Post) => {
  const byDraft = draftIndex(a) - draftIndex(b);
  if (byDraft !== 0) return byDraft;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
};

const statusFromParam = (value: string | null): StatusFilter =>
  value === "draft" || value === "published" || value === "all" ? value : "all";

const hasPostImageWork = (post: Pick<Post, "cover_image_url" | "inline_images" | "image_asset_count" | "image_prompt_count">) => Boolean(
  post.cover_image_url
  || (Array.isArray(post.inline_images) && post.inline_images.length > 0)
  || (Number(post.image_asset_count) || 0) > 0
  || (Number(post.image_prompt_count) || 0) > 0
);

const hasSettlingImageWork = (post: Post) => {
  if (!post.generation_plan?.imagesEnabled || hasPostImageWork(post)) return false;
  const ageMs = Date.now() - new Date(post.created_at).getTime();
  return Number.isFinite(ageMs) && ageMs < 15 * 60 * 1000;
};

export const draftGroupKey = (post: Pick<Post, "generation_plan" | "job_id" | "source_type" | "source_ref_id" | "persona_id" | "model_id" | "created_at">) => {
  if (post.generation_plan?.batchId) return `batch-${post.generation_plan.batchId}`;
  if (FEED_SOURCE_TYPES.has(post.source_type)) return "";
  const total = draftTotalForPlan(post.generation_plan);
  if (total <= 1) return "";
  if (!post.job_id) return "";
  const day = post.created_at.slice(0, 10);
  return [
    "split",
    post.source_type,
    post.source_ref_id || "",
    post.persona_id || "",
    post.model_id || "",
    total,
    day,
  ].join("|");
};

export const draftTotalForPlan = (plan: GenerationPlan | null | undefined, created = 0) => Math.max(
  Number(plan?.totalDrafts) || 0,
  Number(plan?.variationCount) || 0,
  created
);

export default function Posts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllAcrossPages, setSelectAllAcrossPages] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => statusFromParam(searchParams.get("status")));
  const [sourceFilter, setSourceFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [personaFilter, setPersonaFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");

  // Sort state
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [quickDeletePost, setQuickDeletePost] = useState<Post | null>(null);
  const [postsPerPage, setPostsPerPage] = useState(25);
  const [bulkIntegrationId, setBulkIntegrationId] = useState("");
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());
  const [creatingImagePromptPostId, setCreatingImagePromptPostId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { bulkDelete, bulkPublish, bulkDraft, isDeleting, isPublishing, isDrafting, isLoading } = useBulkPostActions();
  const { integrations } = useIntegrations();
  const createManualImagePrompts = useCreateManualImagePrompts();
  const connectedIntegrations = useMemo(() => integrations.filter((integration) => integration.status === "connected"), [integrations]);

  const { data: posts = [], isLoading: isLoadingPosts } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      return api.get<any[]>("/posts");
    },
    refetchInterval: (query) => {
      const data = query.state.data as Post[] | undefined;
      return data?.some(hasSettlingImageWork) ? 5000 : false;
    },
  });

  // Fetch feeds to map source_ref_id to feed names
  const { data: feeds = [] } = useQuery({
    queryKey: ["feeds-lookup"],
    queryFn: async () => {
      return api.get<any[]>("/feeds");
    },
  });

  // Create a lookup map for feed names
  const feedNameMap = useMemo(() => {
    const map = new Map<string, string>();
    feeds.forEach((feed) => map.set(feed.id, feed.name));
    return map;
  }, [feeds]);

  // Enrich posts with feed names
  const enrichedPosts: Post[] = useMemo(() => {
    return posts.map((post) => ({
      ...post,
      feeds: post.source_ref_id && feedNameMap.has(post.source_ref_id)
        ? { name: feedNameMap.get(post.source_ref_id)! }
        : null,
    }));
  }, [posts, feedNameMap]);

  // Quick delete mutation
  const quickDeleteMutation = useMutation({
    mutationFn: async (postId: string) => {
      await deletePostsWithCleanup([postId]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post deleted");
      setQuickDeletePost(null);
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  // Quick publish mutation
  const quickPublishMutation = useMutation({
    mutationFn: async (postId: string) => {
      await api.put(`/posts/${postId}`, { status: "published" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post published");
    },
    onError: (error) => {
      toast.error("Failed to publish: " + error.message);
    },
  });

  const bulkPushIntegrationMutation = useMutation({
    mutationFn: async (postIds: string[]) => {
      const integrationId = bulkIntegrationId || connectedIntegrations[0]?.id;
      if (!integrationId) throw new Error("Connect an integration first");
      const postTitleById = new Map(enrichedPosts.map((post) => [post.id, post.title]));
      const failures: Array<{ id: string; title: string; error: string }> = [];
      for (const id of postIds) {
        try {
          const result = await api.post<{ success: boolean; error?: string }>(`/posts/${id}/publish`, {
            integrationId,
            mode: "draft",
            postType: "post",
          });
          if (!result.success) {
            failures.push({
              id,
              title: postTitleById.get(id) || id,
              error: result.error || "CMS draft creation failed",
            });
          }
        } catch (error) {
          failures.push({
            id,
            title: postTitleById.get(id) || id,
            error: error instanceof Error ? error.message : "CMS draft creation failed",
          });
        }
      }
      return { total: postIds.length, failures };
    },
    onSuccess: ({ total, failures }) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      const pushed = total - failures.length;
      if (failures.length) {
        toast.error(`${pushed}/${total} posts pushed. First failure: ${failures[0].title} - ${failures[0].error}`);
      } else {
        toast.success(`${total} post${total > 1 ? "s" : ""} pushed`);
      }
      clearSelection();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to push posts");
    },
  });

  // Derive unique filter options from data
  const { sourceTypes, models, personas, campaigns } = useMemo(() => {
    const sourceSet = new Set<string>();
    const modelSet = new Set<string>();
    const personaMap = new Map<string, string>();
    const campaignMap = new Map<string, string>();

    enrichedPosts.forEach((post) => {
      if (post.source_type) sourceSet.add(post.source_type);
      if (post.model_id) modelSet.add(post.model_id);
      if (post.persona_id && post.personas?.name) {
        personaMap.set(post.persona_id, post.personas.name);
      }
      if (post.campaign_id && post.campaigns?.name) {
        campaignMap.set(post.campaign_id, post.campaigns.name);
      }
    });

    return {
      sourceTypes: Array.from(sourceSet).sort(),
      models: Array.from(modelSet).sort(),
      personas: Array.from(personaMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      campaigns: Array.from(campaignMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [enrichedPosts]);

  // Filter and sort posts
  const filteredPosts = useMemo(() => {
    let result = enrichedPosts.filter((post) => {
      const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || post.status === statusFilter;
      const matchesSource = sourceFilter === "all" || post.source_type === sourceFilter;
      const matchesModel = modelFilter === "all" || post.model_id === modelFilter;
      const matchesPersona =
        personaFilter === "all" ||
        (personaFilter === "none" && !post.persona_id) ||
        post.persona_id === personaFilter;
      const matchesCampaign =
        campaignFilter === "all" ||
        (campaignFilter === "none" && !post.campaign_id) ||
        post.campaign_id === campaignFilter;

      return matchesSearch && matchesStatus && matchesSource && matchesModel && matchesPersona && matchesCampaign;
    });

    // Sort
    result.sort((a, b) => {
      if (sortField === "created_at") {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortDirection === "desc" ? dateB - dateA : dateA - dateB;
      } else {
        const comparison = a.title.localeCompare(b.title);
        return sortDirection === "asc" ? comparison : -comparison;
      }
    });

    return result;
  }, [enrichedPosts, searchQuery, statusFilter, sourceFilter, modelFilter, personaFilter, campaignFilter, sortField, sortDirection]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    const postsByGroup = new Map<string, Post[]>();
    filteredPosts.forEach((post) => {
      const groupKey = draftGroupKey(post);
      if (!groupKey) return;
      postsByGroup.set(groupKey, [...(postsByGroup.get(groupKey) || []), post]);
    });

    const seenGroups = new Set<string>();
    return filteredPosts.flatMap((post): DisplayRow[] => {
      const groupKey = draftGroupKey(post);
      if (!groupKey) return [{ type: "post", key: post.id, post }];
      if (seenGroups.has(groupKey)) return [];

      seenGroups.add(groupKey);
      const groupedPosts = [...(postsByGroup.get(groupKey) || [post])].sort(sortDraftPosts);
      const plan = groupedPosts.find((item) => item.generation_plan)?.generation_plan || post.generation_plan;
      return [{
        type: "draftGroup",
        key: groupKey,
        jobId: post.job_id,
        post: groupedPosts[0],
        posts: groupedPosts,
        totalDrafts: draftTotalForPlan(plan, groupedPosts.length),
        failedDrafts: plan?.failedDrafts || [],
      }];
    });
  }, [filteredPosts]);

  const statusCounts = useMemo(() => ({
    draft: enrichedPosts.filter((post) => post.status === "draft").length,
    published: enrichedPosts.filter((post) => post.status === "published").length,
  }), [enrichedPosts]);

  const inventoryInsights = useMemo(() => {
    const newestTime = enrichedPosts.reduce((max, post) => Math.max(max, new Date(post.created_at).getTime()), 0);
    const ageDays = newestTime ? Math.max(0, Math.floor((Date.now() - newestTime) / 86_400_000)) : null;
    const staleDrafts = enrichedPosts.filter((post) => post.status === "draft" && (Date.now() - new Date(post.created_at).getTime()) / 86_400_000 > 14);
    return {
      newestAgeDays: ageDays,
      staleDrafts: staleDrafts.length,
      sourceBuckets: topBuckets(enrichedPosts, (post) => post.feeds?.name || post.source_type?.replace(/_/g, " "), { limit: 4 }),
      modelBuckets: topBuckets(enrichedPosts, (post) => formatModelName(post.model_id), { limit: 4 }),
      personaBuckets: topBuckets(enrichedPosts, (post) => post.personas?.name || "No persona", { limit: 4 }),
    };
  }, [enrichedPosts]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / postsPerPage));
  const paginatedRows = displayRows.slice(
    (currentPage - 1) * postsPerPage,
    currentPage * postsPerPage
  );
  const paginatedSelectablePosts = paginatedRows.flatMap((row) => row.type === "draftGroup" ? row.posts : [row.post]);

  // Selection helpers
  const allPageSelected = paginatedSelectablePosts.length > 0 && paginatedSelectablePosts.every((p) => selectedIds.has(p.id));
  const somePageSelected = paginatedSelectablePosts.some((p) => selectedIds.has(p.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelected = new Set(selectedIds);
      paginatedSelectablePosts.forEach((p) => newSelected.add(p.id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      paginatedSelectablePosts.forEach((p) => newSelected.delete(p.id));
      setSelectedIds(newSelected);
      setSelectAllAcrossPages(false);
    }
  };

  const handleSelectAllAcrossPages = () => {
    setSelectedIds(new Set(filteredPosts.map((p) => p.id)));
    setSelectAllAcrossPages(true);
  };

  const handleRowSelect = (postId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(postId);
    } else {
      newSelected.delete(postId);
      setSelectAllAcrossPages(false);
    }
    setSelectedIds(newSelected);
  };

  const handleGroupSelect = (posts: Post[], checked: boolean) => {
    const newSelected = new Set(selectedIds);
    posts.forEach((post) => {
      if (checked) newSelected.add(post.id);
      else newSelected.delete(post.id);
    });
    if (!checked) setSelectAllAcrossPages(false);
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllAcrossPages(false);
  };

  useEffect(() => {
    const nextStatus = statusFromParam(searchParams.get("status"));
    setStatusFilter((current) => current === nextStatus ? current : nextStatus);
    setCurrentPage(1);
    clearSelection();
  }, [searchParams]);

  // Bulk action handlers
  const handleBulkDelete = () => {
    const ids = selectAllAcrossPages ? filteredPosts.map((p) => p.id) : Array.from(selectedIds);
    bulkDelete(ids, { onSuccess: clearSelection });
  };

  const handleBulkPublish = () => {
    const ids = selectAllAcrossPages ? filteredPosts.map((p) => p.id) : Array.from(selectedIds);
    bulkPublish(ids, { onSuccess: clearSelection });
  };

  const handleBulkDraft = () => {
    const ids = selectAllAcrossPages ? filteredPosts.map((p) => p.id) : Array.from(selectedIds);
    bulkDraft(ids, { onSuccess: clearSelection });
  };

  const handleBulkPushIntegration = () => {
    const ids = selectAllAcrossPages ? filteredPosts.map((p) => p.id) : Array.from(selectedIds);
    bulkPushIntegrationMutation.mutate(ids);
  };

  const activeFiltersCount = [
    sourceFilter !== "all",
    modelFilter !== "all",
    personaFilter !== "all",
    campaignFilter !== "all",
  ].filter(Boolean).length;

  const handleClearFilters = () => {
    setSourceFilter("all");
    setModelFilter("all");
    setPersonaFilter("all");
    setCampaignFilter("all");
  };

  const handleSortChange = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  // Reset page when filters change
  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("status");
    else next.set("status", value);
    setSearchParams(next, { replace: true });
    setCurrentPage(1);
    clearSelection();
  };

  const selectedCount = selectAllAcrossPages ? filteredPosts.length : selectedIds.size;

  const toggleJobExpanded = (jobId: string) => {
    setExpandedJobIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const handleImagePromptAction = (post: Post, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!hasPostImageWork(post)) {
      if (createManualImagePrompts.isPending) return;
      setCreatingImagePromptPostId(post.id);
      createManualImagePrompts.mutate(post.id, {
        onSettled: () => setCreatingImagePromptPostId(null),
      });
      return;
    }

    const params = new URLSearchParams({
      postId: post.id,
      requestSearch: cleanDraftTitle(post.title),
    });
    navigate(`/gallery?${params.toString()}`);
  };

  const openPostInNewTab = (postId: string) => {
    window.open(`/posts/${postId}/edit`, "_blank", "noopener,noreferrer");
  };

  const renderDraftGroup = (row: Extract<DisplayRow, { type: "draftGroup" }>) => {
    const isExpanded = expandedJobIds.has(row.jobId);
    const selectedCount = row.posts.filter((post) => selectedIds.has(post.id)).length;
    const allSelected = selectedCount === row.posts.length;
    const failedIndexes = new Set(row.failedDrafts.map((draft) => draft.index));
    const completedIndexes = new Set(
      row.posts.map((post, index) => {
        const value = draftIndex(post);
        return value === Number.MAX_SAFE_INTEGER ? index : value - 1;
      })
    );
    const missingDraftIndexes = Array.from({ length: Math.max(0, row.totalDrafts) }, (_, index) => index)
      .filter((index) => !failedIndexes.has(index) && !completedIndexes.has(index));
    const status = row.failedDrafts.length || missingDraftIndexes.length
      ? { type: "warning" as const, label: "Partial" }
      : row.posts.every((post) => post.status === "published")
        ? { type: "success" as const, label: "Published" }
        : { type: "draft" as const, label: "Draft" };
    const failedDrafts = row.failedDrafts
      .filter((draft) => draft.index >= 0)
      .sort((a, b) => a.index - b.index);

    return (
      <Fragment key={row.key}>
        <TableRow
          key={row.key}
          className="table-row-calm cursor-pointer"
          onClick={() => toggleJobExpanded(row.jobId)}
          title={isExpanded ? "Collapse drafts" : "Show drafts"}
        >
          <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
              onCheckedChange={(checked) => handleGroupSelect(row.posts, checked === true)}
              aria-label={`Select drafts for ${cleanDraftTitle(row.post.title)}`}
            />
          </TableCell>
          <TableCell className="font-medium">
            <div className="flex items-start gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 mt-1 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 mt-1 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="truncate">{cleanDraftTitle(row.post.title)}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {row.posts.length}/{row.totalDrafts} drafts created
                  {(row.failedDrafts.length + missingDraftIndexes.length) > 0 && ` • ${row.failedDrafts.length + missingDraftIndexes.length} failed`}
                </div>
              </div>
            </div>
          </TableCell>
          <TableCell className="capitalize text-sm text-muted-foreground">
            {row.post.source_type?.replace("_", " ")}
          </TableCell>
          <TableCell>{row.post.personas?.name || "—"}</TableCell>
          <TableCell>
            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {formatModelName(row.post.model_id)}
            </span>
          </TableCell>
          <TableCell>
            <StatusBadge status={status.type} label={status.label} showIcon={false} />
          </TableCell>
          <TableCell className="text-muted-foreground">
            {safeFormatDate(row.post.created_at, "MMM d, yyyy")}
          </TableCell>
          <TableCell className="w-24" />
        </TableRow>

        {isExpanded && row.posts.map((post, index) => (
          <PostTableRow
            key={post.id}
            post={post}
            isSelected={selectedIds.has(post.id)}
            onSelect={(checked) => handleRowSelect(post.id, checked)}
            onClick={() => openPostInNewTab(post.id)}
            onQuickPublish={(e) => {
              e.stopPropagation();
              quickPublishMutation.mutate(post.id);
            }}
            onQuickDelete={(e) => {
              e.stopPropagation();
              setQuickDeletePost(post);
            }}
            onOpenImagePrompts={(e) => handleImagePromptAction(post, e)}
            isImagePromptActionPending={creatingImagePromptPostId === post.id}
            formatModelName={formatModelName}
            className="bg-muted/20"
            displayTitle={cleanDraftTitle(post.title)}
            titlePrefix={`Draft ${draftIndex(post) === Number.MAX_SAFE_INTEGER ? index + 1 : draftIndex(post)}`}
          />
        ))}

        {isExpanded && failedDrafts.map((draft) => (
          <TableRow key={`${row.key}-failed-${draft.index}`} className="bg-destructive/5">
            <TableCell />
            <TableCell className="font-medium">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-1 text-destructive" />
                <div>
                  <div className="text-destructive">Draft {draft.index + 1} failed</div>
                  <div className="text-xs font-normal text-muted-foreground line-clamp-2">
                    {draft.error || "Not enough information returned for this draft."}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell>
              <StatusBadge status="error" label="Failed" showIcon={false} />
            </TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        ))}

        {isExpanded && missingDraftIndexes.map((draftIndex) => (
          <TableRow key={`${row.key}-missing-${draftIndex}`} className="bg-destructive/5">
            <TableCell />
            <TableCell className="font-medium">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-1 text-destructive" />
                <div>
                  <div className="text-destructive">Draft {draftIndex + 1} failed to finish</div>
                  <div className="text-xs font-normal text-muted-foreground line-clamp-2">
                    No failure detail was recorded for this draft. The job may have timed out before writing the reason.
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell>
              <StatusBadge status="error" label="Failed" showIcon={false} />
            </TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        ))}
      </Fragment>
    );
  };

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Posts"
        description="Manage drafts, published inventory, batches, and CMS handoff from one workspace."
      >
        <Button onClick={() => navigate("/content-creator")}>
          <Send className="h-4 w-4" />
          Create drafts
        </Button>
      </PageHeader>

      <InventoryInsights
        totalPosts={enrichedPosts.length}
        draftCount={statusCounts.draft}
        publishedCount={statusCounts.published}
        selectedCount={selectedCount}
        sourceBuckets={inventoryInsights.sourceBuckets}
        modelBuckets={inventoryInsights.modelBuckets}
        personaBuckets={inventoryInsights.personaBuckets}
        newestAgeDays={inventoryInsights.newestAgeDays}
        staleDrafts={inventoryInsights.staleDrafts}
        hasCmsConnection={connectedIntegrations.length > 0}
        onOpenDrafts={() => handleStatusFilterChange("draft")}
        onPushSelected={handleBulkPushIntegration}
        pushing={bulkPushIntegrationMutation.isPending}
      />

      <div className="sticky top-0 z-20 -mx-2 rounded-md border border-byword-border bg-background/92 p-2 shadow-[0_10px_24px_hsl(210_5%_20%/0.06)] backdrop-blur sm:mx-0">
        <PostFilters
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          modelFilter={modelFilter}
          onModelFilterChange={setModelFilter}
          personaFilter={personaFilter}
          onPersonaFilterChange={setPersonaFilter}
          campaignFilter={campaignFilter}
          onCampaignFilterChange={setCampaignFilter}
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          sourceTypes={sourceTypes}
          models={models}
          personas={personas}
          campaigns={campaigns}
          activeFiltersCount={activeFiltersCount}
          onClearFilters={handleClearFilters}
        />

        {selectedIds.size > 0 && (
          <div>
            <BulkActionsBar
              selectedCount={selectAllAcrossPages ? filteredPosts.length : selectedIds.size}
              onDelete={handleBulkDelete}
              onPublish={handleBulkPublish}
              onPushIntegration={handleBulkPushIntegration}
              onDraft={handleBulkDraft}
              onClear={clearSelection}
              integrations={connectedIntegrations}
              integrationId={bulkIntegrationId || connectedIntegrations[0]?.id || ""}
              onIntegrationChange={setBulkIntegrationId}
              isDeleting={isDeleting}
              isPublishing={isPublishing}
              isPushingIntegration={bulkPushIntegrationMutation.isPending}
              isDrafting={isDrafting}
            />
            {allPageSelected && !selectAllAcrossPages && filteredPosts.length > postsPerPage && (
              <div className="mb-2 text-center text-sm text-muted-foreground">
                All {paginatedSelectablePosts.length} posts on this page are selected.{" "}
                <Button
                  variant="link"
                  className="h-auto p-0 text-primary"
                  onClick={handleSelectAllAcrossPages}
                >
                  Select all {filteredPosts.length} posts
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <BywordCard className="mt-6">
        <SectionHeader
          icon={FileText}
          title="Inventory table"
          description={`${formatCompactNumber(displayRows.length)} visible row${displayRows.length === 1 ? "" : "s"} after filters.`}
          action={<Badge variant="outline">{postsPerPage} / page</Badge>}
        />
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) {
                      (el as any).indeterminate = somePageSelected && !allPageSelected;
                    }
                  }}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all on this page"
                />
              </TableHead>
              <TableHead className="w-[35%]">Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Persona</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingPosts ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No posts yet. Generate one from Content Creator or add an RSS feed.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row) => row.type === "draftGroup" ? renderDraftGroup(row) : (
                <PostTableRow
                  key={row.post.id}
                  post={row.post}
                  isSelected={selectedIds.has(row.post.id)}
                  onSelect={(checked) => handleRowSelect(row.post.id, checked)}
                  onClick={() => openPostInNewTab(row.post.id)}
                  onQuickPublish={(e) => {
                    e.stopPropagation();
                    quickPublishMutation.mutate(row.post.id);
                  }}
                  onQuickDelete={(e) => {
                    e.stopPropagation();
                    setQuickDeletePost(row.post);
                  }}
                  onOpenImagePrompts={(e) => handleImagePromptAction(row.post, e)}
                  isImagePromptActionPending={creatingImagePromptPostId === row.post.id}
                  formatModelName={formatModelName}
                />
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {displayRows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * postsPerPage + 1} to{" "}
              {Math.min(currentPage * postsPerPage, displayRows.length)} of{" "}
              {displayRows.length} rows
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={String(postsPerPage)}
                onValueChange={(value) => {
                  setPostsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </BywordCard>

      {/* Quick Delete Confirmation */}
      <AlertDialog open={!!quickDeletePost} onOpenChange={(open) => !open && setQuickDeletePost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. "{quickDeletePost?.title}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => quickDeletePost && quickDeleteMutation.mutate(quickDeletePost.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </BywordPageShell>
  );
}

function InventoryInsights({
  totalPosts,
  draftCount,
  publishedCount,
  selectedCount,
  sourceBuckets,
  modelBuckets,
  personaBuckets,
  newestAgeDays,
  staleDrafts,
  hasCmsConnection,
  onOpenDrafts,
  onPushSelected,
  pushing,
}: {
  totalPosts: number;
  draftCount: number;
  publishedCount: number;
  selectedCount: number;
  sourceBuckets: Array<{ label: string; value: number }>;
  modelBuckets: Array<{ label: string; value: number }>;
  personaBuckets: Array<{ label: string; value: number }>;
  newestAgeDays: number | null;
  staleDrafts: number;
  hasCmsConnection: boolean;
  onOpenDrafts: () => void;
  onPushSelected: () => void;
  pushing: boolean;
}) {
  const metrics = [
    { label: "Draft backlog", value: formatCompactNumber(draftCount), detail: "Waiting to publish", tone: draftCount ? "opportunity" as SemanticTone : "success" as SemanticTone },
    { label: "Published", value: formatCompactNumber(publishedCount), detail: "Live inventory", tone: "success" as SemanticTone },
    { label: "Selected batch", value: formatCompactNumber(selectedCount), detail: selectedCount ? "Ready for bulk action" : "Nothing selected", tone: selectedCount ? "performance" as SemanticTone : "neutral" as SemanticTone },
    { label: "Newest content", value: newestAgeDays === null ? "—" : newestAgeDays === 0 ? "Today" : `${newestAgeDays}d`, detail: "Age of newest post", tone: newestAgeDays !== null && newestAgeDays > 7 ? "opportunity" as SemanticTone : "neutral" as SemanticTone },
  ];
  const lanes = [
    {
      title: "Publish drafts",
      value: formatCompactNumber(draftCount),
      detail: draftCount ? "Draft backlog is the fastest path to more live content." : "No drafts are waiting.",
      tone: draftCount ? "opportunity" as SemanticTone : "success" as SemanticTone,
      action: "Open drafts",
      onClick: onOpenDrafts,
      disabled: draftCount === 0,
      icon: ArrowRight,
    },
    {
      title: "Push to CMS",
      value: formatCompactNumber(selectedCount),
      detail: hasCmsConnection ? "Select rows, then push drafts to the connected CMS." : "Connect a CMS before pushing.",
      tone: selectedCount && hasCmsConnection ? "performance" as SemanticTone : "neutral" as SemanticTone,
      action: pushing ? "Pushing..." : "Push selected",
      onClick: onPushSelected,
      disabled: !selectedCount || !hasCmsConnection || pushing,
      icon: Send,
    },
    {
      title: "Review stale drafts",
      value: formatCompactNumber(staleDrafts),
      detail: staleDrafts ? "Older drafts may need a quick refresh before publishing." : "No stale draft risk found.",
      tone: staleDrafts ? "risk" as SemanticTone : "success" as SemanticTone,
      action: "Review drafts",
      onClick: onOpenDrafts,
      disabled: staleDrafts === 0,
      icon: Clock,
    },
  ];

  return (
    <div className="mb-6 rounded-md border border-byword-border bg-card p-4 factory-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Content inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">Draft pressure, publishing inventory, and what is driving the library.</p>
        </div>
        <Badge variant="outline">{formatCompactNumber(totalPosts)} total posts</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className={cn("rounded-md border p-4", semanticToneClass(metric.tone))}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-75">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs opacity-75">{metric.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-md border border-byword-border bg-muted/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-byword-blue" />
            <p className="text-sm font-semibold">Contribution bars</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <MiniBucketBars title="Sources" buckets={sourceBuckets} total={totalPosts} tone="performance" />
            <MiniBucketBars title="Models" buckets={modelBuckets} total={totalPosts} tone="opportunity" />
            <MiniBucketBars title="Personas" buckets={personaBuckets} total={totalPosts} tone="success" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
          {lanes.map((lane) => (
            <div key={lane.title} className={cn("rounded-md border p-3", semanticToneClass(lane.tone))}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] opacity-75">{lane.title}</p>
                  <p className="mt-1 text-xs opacity-75">{lane.detail}</p>
                </div>
                <p className="text-xl font-semibold text-foreground">{lane.value}</p>
              </div>
              <Button size="sm" variant="outline" className="mt-3 h-8 w-full bg-card" onClick={lane.onClick} disabled={lane.disabled}>
                <lane.icon className="mr-1.5 h-3.5 w-3.5" />
                {lane.action}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniBucketBars({
  title,
  buckets,
  total,
  tone,
}: {
  title: string;
  buckets: Array<{ label: string; value: number }>;
  total: number;
  tone: SemanticTone;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <div className="space-y-2">
        {buckets.length ? buckets.map((bucket) => (
          <div key={bucket.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{bucket.label}</span>
              <span className="font-medium">{formatCompactNumber(bucket.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  tone === "performance" && "bg-byword-blue",
                  tone === "opportunity" && "bg-amber-500",
                  tone === "success" && "bg-green-500",
                  tone === "risk" && "bg-red-500",
                  tone === "neutral" && "bg-muted-foreground/40"
                )}
                style={{ width: `${Math.max(8, safePercent(bucket.value, total))}%` }}
              />
            </div>
          </div>
        )) : (
          <p className="text-xs text-muted-foreground">No data yet.</p>
        )}
      </div>
    </div>
  );
}

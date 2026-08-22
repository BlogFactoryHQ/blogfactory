import { Fragment, useDeferredValue, useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, prepareImagePrompts, pushCmsDrafts, type CmsDraftProgress } from "@/lib/api";
import { safeFormatDate } from "@/lib/date-format";
import { deletePostsWithCleanup } from "@/lib/post-cleanup";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, FileText, Loader2, Send } from "lucide-react";
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
import { formatCompactNumber } from "@/lib/search-insights";
import { connectionReady, credentialUsable } from "@/lib/credential-status";
import { postListPath, type ListPagination } from "@/lib/list-query";

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
  site_id?: string | null;
  feed_id?: string | null;
  site_name?: string | null;
  feed_name?: string | null;
  seo_status?: "missing" | "pending" | "ready" | "needs_review" | "failed";
}

interface PostListResponse {
  items: Post[];
  pagination: ListPagination;
  facets: {
    statusCounts: { total: number; draft: number; published: number };
    sourceTypes: string[];
    models: string[];
    personas: Array<{ id: string; name: string }>;
    campaigns: Array<{ id: string; name: string }>;
  };
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

const positiveListNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

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

  // Filter state
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => statusFromParam(searchParams.get("status")));
  const [sourceFilter, setSourceFilter] = useState(() => searchParams.get("source") || "all");
  const [modelFilter, setModelFilter] = useState(() => searchParams.get("model") || "all");
  const [personaFilter, setPersonaFilter] = useState(() => searchParams.get("persona") || "all");
  const [campaignFilter, setCampaignFilter] = useState(() => searchParams.get("campaign") || "all");

  // Sort state
  const [sortField, setSortField] = useState<SortField>(() => searchParams.get("sort") === "title" ? "title" : "created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => searchParams.get("direction") === "asc" ? "asc" : "desc");

  const [currentPage, setCurrentPage] = useState(() => positiveListNumber(searchParams.get("page"), 1));
  const [quickDeletePost, setQuickDeletePost] = useState<Post | null>(null);
  const [postsPerPage, setPostsPerPage] = useState(() => Math.min(100, positiveListNumber(searchParams.get("limit"), 25)));
  const [bulkIntegrationId, setBulkIntegrationId] = useState("");
  const [cmsPushProgress, setCmsPushProgress] = useState<CmsDraftProgress | null>(null);
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());
  const [creatingImagePromptPostId, setCreatingImagePromptPostId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { bulkDelete, bulkPublish, isDeleting, isPublishing } = useBulkPostActions();
  const { integrations } = useIntegrations();
  const createManualImagePrompts = useCreateManualImagePrompts();
  const connectedIntegrations = useMemo(() => integrations.filter(connectionReady), [integrations]);
  const brokenIntegrations = useMemo(
    () => integrations.filter((integration) => integration.status === "connected" && !credentialUsable(integration)),
    [integrations],
  );

  const { data: postList, isLoading: isLoadingPosts, error: postsError } = useQuery({
    queryKey: ["posts", currentPage, postsPerPage, deferredSearchQuery, statusFilter, sourceFilter, modelFilter, personaFilter, campaignFilter, sortField, sortDirection],
    queryFn: async () => {
      return api.get<PostListResponse>(postListPath({
        page: currentPage,
        limit: postsPerPage,
        search: deferredSearchQuery,
        status: statusFilter,
        sourceType: sourceFilter,
        modelId: modelFilter,
        personaId: personaFilter,
        campaignId: campaignFilter,
        sort: sortField,
        direction: sortDirection,
      }));
    },
    refetchInterval: (query) => {
      const data = query.state.data as PostListResponse | undefined;
      return data?.items.some((post) => hasSettlingImageWork(post) || post.seo_status === "pending") ? 5000 : false;
    },
  });
  const posts = useMemo(() => postList?.items || [], [postList?.items]);
  const postPagination = postList?.pagination;
  const facets = postList?.facets;

  // Enrich posts with feed names
  const enrichedPosts: Post[] = useMemo(() => {
    return posts.map((post) => ({
      ...post,
      feeds: post.feed_name ? { name: post.feed_name } : null,
    }));
  }, [posts]);

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

  const bulkPushIntegrationMutation = useMutation({
    mutationFn: async (targets: Array<Pick<Post, "id" | "title">>) => {
      const integrationId = bulkIntegrationId || connectedIntegrations[0]?.id;
      if (!integrationId) throw new Error("Connect an integration first");
      return pushCmsDrafts(targets, integrationId, setCmsPushProgress);
    },
    onSuccess: ({ total, failures }) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      const pushed = total - failures.length;
      if (failures.length) {
        setSelectedIds(new Set(failures.map((failure) => failure.id)));
        toast.error(`${pushed}/${total} posts pushed. ${failures.length} failed; details are shown below.`);
      } else {
        toast.success(`${total} post${total > 1 ? "s" : ""} pushed`);
        clearSelection();
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to push posts");
    },
  });

  const prepareSeoMutation = useMutation({
    mutationFn: (input: { ids?: string[]; scope?: "all_drafts" }) => api.post<{ queued: number; skipped: number }>("/posts/seo/regenerate", input),
    onSuccess: ({ queued, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(`${queued} SEO job queued${skipped ? `, ${skipped} already ready or queued` : ""}`);
      clearSelection();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "SEO preparation failed"),
  });

  const prepareImagePromptsMutation = useMutation({
    mutationFn: (targets: Array<Pick<Post, "id" | "title">>) => prepareImagePrompts(targets),
    onSuccess: ({ total, created, existing, failures }) => {
      queryClient.invalidateQueries({ queryKey: ["image-generation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      const prepared = total - failures.length;
      if (failures.length) {
        setSelectedIds(new Set(failures.map((failure) => failure.id)));
        toast.error(`${prepared}/${total} posts prepared. ${failures.length} failed and remain selected.`);
      } else {
        toast.success(`${total} post${total === 1 ? "" : "s"} prepared`, {
          description: `${created} prompt${created === 1 ? "" : "s"} created${existing ? `; ${existing} already existed` : ""}.`,
        });
        clearSelection();
      }
    },
  });

  const sourceTypes = facets?.sourceTypes || [];
  const models = facets?.models || [];
  const personas = facets?.personas || [];
  const campaigns = facets?.campaigns || [];
  const filteredPosts = enrichedPosts;

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

  const totalPages = postPagination?.pages || 1;
  const paginatedRows = displayRows;
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
    }
  };

  const handleRowSelect = (postId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(postId);
    } else {
      newSelected.delete(postId);
    }
    setSelectedIds(newSelected);
  };

  const handleGroupSelect = (posts: Post[], checked: boolean) => {
    const newSelected = new Set(selectedIds);
    posts.forEach((post) => {
      if (checked) newSelected.add(post.id);
      else newSelected.delete(post.id);
    });
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  useEffect(() => {
    const next = new URLSearchParams();
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (searchQuery.trim()) next.set("search", searchQuery.trim());
    if (sourceFilter !== "all") next.set("source", sourceFilter);
    if (modelFilter !== "all") next.set("model", modelFilter);
    if (personaFilter !== "all") next.set("persona", personaFilter);
    if (campaignFilter !== "all") next.set("campaign", campaignFilter);
    if (sortField !== "created_at") next.set("sort", sortField);
    if (sortDirection !== "desc") next.set("direction", sortDirection);
    if (currentPage !== 1) next.set("page", String(currentPage));
    if (postsPerPage !== 25) next.set("limit", String(postsPerPage));
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [campaignFilter, currentPage, modelFilter, personaFilter, postsPerPage, searchParams, searchQuery, setSearchParams, sortDirection, sortField, sourceFilter, statusFilter]);

  // Bulk action handlers
  const handleBulkDelete = () => {
    bulkDelete(Array.from(selectedIds), { onSuccess: clearSelection });
  };

  const handleBulkPublish = () => {
    bulkPublish(Array.from(selectedIds), { onSuccess: clearSelection });
  };

  const handleBulkPushIntegration = () => {
    setCmsPushProgress(null);
    bulkPushIntegrationMutation.mutate(enrichedPosts.filter((post) => selectedIds.has(post.id)));
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
    setCurrentPage(1);
    clearSelection();
  };

  const handleSortChange = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
    setCurrentPage(1);
    clearSelection();
  };

  // Reset page when filters change
  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
    clearSelection();
  };

  useEffect(() => {
    if (postPagination && currentPage > postPagination.pages) setCurrentPage(postPagination.pages);
  }, [currentPage, postPagination]);

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
    navigate(`/library/images?${params.toString()}`);
  };

  const openPostInNewTab = (postId: string) => {
    window.open(`/library/posts/${postId}/edit`, "_blank", "noopener,noreferrer");
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
        title="Content"
        description="Manage drafts, published inventory, batches, and CMS handoff from one workspace."
      >
        <Button onClick={() => navigate("/create")}>
          <Send className="h-4 w-4" />
          Create drafts
        </Button>
      </PageHeader>

      {brokenIntegrations.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">CMS credentials need to be re-saved</p>
              <p className="text-sm text-muted-foreground">
                {brokenIntegrations.map((integration) => integration.provider === "ghost" ? "Ghost" : integration.provider === "wordpress" ? "WordPress" : integration.provider === "wix" ? "Wix" : "Framer").join(", ")} credentials cannot be decrypted, so drafts cannot be sent to the CMS.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/control/integrations")} className="shrink-0">Fix credentials</Button>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-2 rounded-md border border-byword-border bg-background/92 p-2 shadow-[0_10px_24px_hsl(210_5%_20%/0.06)] backdrop-blur sm:mx-0">
        <PostFilters
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          searchQuery={searchQuery}
          onSearchChange={(value) => { setSearchQuery(value); setCurrentPage(1); clearSelection(); }}
          sourceFilter={sourceFilter}
          onSourceFilterChange={(value) => { setSourceFilter(value); setCurrentPage(1); clearSelection(); }}
          modelFilter={modelFilter}
          onModelFilterChange={(value) => { setModelFilter(value); setCurrentPage(1); clearSelection(); }}
          personaFilter={personaFilter}
          onPersonaFilterChange={(value) => { setPersonaFilter(value); setCurrentPage(1); clearSelection(); }}
          campaignFilter={campaignFilter}
          onCampaignFilterChange={(value) => { setCampaignFilter(value); setCurrentPage(1); clearSelection(); }}
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
              selectedCount={selectedIds.size}
              onDelete={handleBulkDelete}
              onPublish={handleBulkPublish}
              onPushIntegration={handleBulkPushIntegration}
              onPrepareSeo={() => prepareSeoMutation.mutate({ ids: Array.from(selectedIds) })}
              onPrepareImagePrompts={() => prepareImagePromptsMutation.mutate(enrichedPosts.filter((post) => selectedIds.has(post.id)))}
              onClear={clearSelection}
              integrations={connectedIntegrations}
              integrationId={bulkIntegrationId || connectedIntegrations[0]?.id || ""}
              onIntegrationChange={setBulkIntegrationId}
              isDeleting={isDeleting}
              isPublishing={isPublishing}
              isPushingIntegration={bulkPushIntegrationMutation.isPending}
              isPreparingSeo={prepareSeoMutation.isPending}
              isPreparingImagePrompts={prepareImagePromptsMutation.isPending}
            />
            {allPageSelected && <p className="mb-2 text-center text-sm text-muted-foreground">All {paginatedSelectablePosts.length} posts on this page are selected.</p>}
          </div>
        )}
        {cmsPushProgress && (
          <div className="mb-2 rounded-md border border-byword-border bg-background px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">
                {bulkPushIntegrationMutation.isPending ? "Pushing drafts to CMS…" : "CMS draft push complete"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{cmsPushProgress.completed}/{cmsPushProgress.total}</span>
            </div>
            <Progress value={cmsPushProgress.total ? (cmsPushProgress.completed / cmsPushProgress.total) * 100 : 0} className="h-2" />
            {cmsPushProgress.failures.length > 0 && (
              <div className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold text-destructive">{cmsPushProgress.failures.length} failed</p>
                <ul className="mt-2 space-y-1">
                  {cmsPushProgress.failures.map((failure) => (
                    <li key={failure.id} className="break-words"><span className="font-medium">{failure.title}:</span> {failure.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <BywordCard className="mt-6">
        <SectionHeader
          icon={FileText}
          title="Inventory table"
          description={`${formatCompactNumber(postPagination?.total || 0)} matching post${postPagination?.total === 1 ? "" : "s"}. Bulk selection is page-scoped.`}
          action={<Badge variant="outline">{postsPerPage} / page</Badge>}
        />
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox
                  checked={somePageSelected && !allPageSelected ? "indeterminate" : allPageSelected}
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
            ) : postsError ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-destructive">
                  {postsError instanceof Error ? postsError.message : "Posts could not be loaded."}
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
        {(postPagination?.total || 0) > 0 && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * postsPerPage + 1} to{" "}
              {(currentPage - 1) * postsPerPage + enrichedPosts.length} of{" "}
              {postPagination?.total || 0} posts
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

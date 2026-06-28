import { Fragment, useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { deletePostsWithCleanup } from "@/lib/post-cleanup";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BulkActionsBar } from "@/components/posts/BulkActionsBar";
import { PostFilters, SortField, SortDirection, StatusFilter } from "@/components/posts/PostFilters";
import { PostTableRow } from "@/components/posts/PostTableRow";
import { useBulkPostActions } from "@/hooks/useBulkPostActions";
import { useIntegrations } from "@/hooks/useIntegrations";
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

interface FailedDraft {
  index: number;
  error: string;
}

interface GenerationPlan {
  totalDrafts?: number;
  failedDrafts?: FailedDraft[];
  batchId?: string | null;
  variationCount?: number | null;
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

export const draftGroupKey = (post: Pick<Post, "generation_plan" | "job_id" | "source_type" | "source_ref_id" | "persona_id" | "model_id" | "created_at">) => {
  if (post.generation_plan?.batchId) return `batch-${post.generation_plan.batchId}`;
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

  const queryClient = useQueryClient();
  const { bulkDelete, bulkPublish, bulkDraft, isDeleting, isPublishing, isDrafting, isLoading } = useBulkPostActions();
  const { integrations } = useIntegrations();
  const connectedIntegrations = useMemo(() => integrations.filter((integration) => integration.status === "connected"), [integrations]);

  const { data: posts = [], isLoading: isLoadingPosts } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      return api.get<any[]>("/posts");
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
      let failed = 0;
      for (const id of postIds) {
        const result = await api.post<{ success: boolean; error?: string }>(`/posts/${id}/publish`, {
          integrationId,
          mode: "draft",
          postType: "post",
        });
        if (!result.success) failed += 1;
      }
      return { total: postIds.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(failed ? `${total - failed}/${total} posts pushed` : `${total} post${total > 1 ? "s" : ""} pushed`);
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

  const toggleJobExpanded = (jobId: string) => {
    setExpandedJobIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
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
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
              {formatModelName(row.post.model_id)}
            </span>
          </TableCell>
          <TableCell>
            <StatusBadge status={status.type} label={status.label} showIcon={false} />
          </TableCell>
          <TableCell className="text-muted-foreground">
            {format(new Date(row.post.created_at), "MMM d, yyyy")}
          </TableCell>
          <TableCell className="w-24" />
        </TableRow>

        {isExpanded && row.posts.map((post, index) => (
          <PostTableRow
            key={post.id}
            post={post}
            isSelected={selectedIds.has(post.id)}
            onSelect={(checked) => handleRowSelect(post.id, checked)}
            onClick={() => navigate(`/posts/${post.id}/edit`)}
            onQuickPublish={(e) => {
              e.stopPropagation();
              quickPublishMutation.mutate(post.id);
            }}
            onQuickDelete={(e) => {
              e.stopPropagation();
              setQuickDeletePost(post);
            }}
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
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Posts"
        description="All generated content in one place."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-byword-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Publish drafts first, then edit articles that prove demand.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusCounts.draft} draft{statusCounts.draft === 1 ? "" : "s"} waiting · {statusCounts.published} published
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => handleStatusFilterChange("draft")}>
          Drafts
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
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

      {/* Bulk Actions Bar */}
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
            <div className="text-center text-sm text-muted-foreground mb-4">
              All {paginatedSelectablePosts.length} posts on this page are selected.{" "}
              <Button
                variant="link"
                className="p-0 h-auto text-primary"
                onClick={handleSelectAllAcrossPages}
              >
                Select all {filteredPosts.length} posts
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="calm-card overflow-hidden mt-6">
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
                  onClick={() => navigate(`/posts/${row.post.id}/edit`)}
                  onQuickPublish={(e) => {
                    e.stopPropagation();
                    quickPublishMutation.mutate(row.post.id);
                  }}
                  onQuickDelete={(e) => {
                    e.stopPropagation();
                    setQuickDeletePost(row.post);
                  }}
                  formatModelName={formatModelName}
                />
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {displayRows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * postsPerPage + 1} to{" "}
              {Math.min(currentPage * postsPerPage, displayRows.length)} of{" "}
              {displayRows.length} rows
            </p>
            <div className="flex items-center gap-2">
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
      </div>

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

    </div>
  );
}

import { useState, useMemo } from "react";
import { useSignedUrl, useSignedUrls } from "@/hooks/useSignedUrl";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2, Edit3, Copy } from "lucide-react";
import { format } from "date-fns";
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

interface Post {
  id: string;
  title: string;
  content: string;
  status: string;
  source_type: string;
  source_ref_id: string | null;
  persona_id: string | null;
  model_id: string;
  job_id: string | null;
  created_at: string;
  cover_image_url: string | null;
  inline_images: string[] | null;
  personas?: { name: string } | null;
  feeds?: { name: string } | null;
}

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

export default function Posts() {
  const navigate = useNavigate();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllAcrossPages, setSelectAllAcrossPages] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [personaFilter, setPersonaFilter] = useState("all");

  // Sort state
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // UI state
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [quickDeletePost, setQuickDeletePost] = useState<Post | null>(null);
  const [postsPerPage, setPostsPerPage] = useState(25);
  const [bulkIntegrationId, setBulkIntegrationId] = useState("");

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
  const { sourceTypes, models, personas } = useMemo(() => {
    const sourceSet = new Set<string>();
    const modelSet = new Set<string>();
    const personaMap = new Map<string, string>();

    enrichedPosts.forEach((post) => {
      if (post.source_type) sourceSet.add(post.source_type);
      if (post.model_id) modelSet.add(post.model_id);
      if (post.persona_id && post.personas?.name) {
        personaMap.set(post.persona_id, post.personas.name);
      }
    });

    return {
      sourceTypes: Array.from(sourceSet).sort(),
      models: Array.from(modelSet).sort(),
      personas: Array.from(personaMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
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

      return matchesSearch && matchesStatus && matchesSource && matchesModel && matchesPersona;
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
  }, [enrichedPosts, searchQuery, statusFilter, sourceFilter, modelFilter, personaFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * postsPerPage,
    currentPage * postsPerPage
  );

  // Selection helpers
  const allPageSelected = paginatedPosts.length > 0 && paginatedPosts.every((p) => selectedIds.has(p.id));
  const somePageSelected = paginatedPosts.some((p) => selectedIds.has(p.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelected = new Set(selectedIds);
      paginatedPosts.forEach((p) => newSelected.add(p.id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      paginatedPosts.forEach((p) => newSelected.delete(p.id));
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

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllAcrossPages(false);
  };

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

  const copyContent = () => {
    if (selectedPost) {
      navigator.clipboard.writeText(selectedPost.content);
      toast.success("Content copied to clipboard");
    }
  };

  const activeFiltersCount = [
    sourceFilter !== "all",
    modelFilter !== "all",
    personaFilter !== "all",
  ].filter(Boolean).length;

  const handleClearFilters = () => {
    setSourceFilter("all");
    setModelFilter("all");
    setPersonaFilter("all");
  };

  const handleSortChange = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  // Reset page when filters change
  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
    clearSelection();
  };

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Posts"
        description="All generated content in one place."
      />

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
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        sourceTypes={sourceTypes}
        models={models}
        personas={personas}
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
              All {paginatedPosts.length} posts on this page are selected.{" "}
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
            ) : paginatedPosts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No posts yet. Generate one from Content Creator or add an RSS feed.
                </TableCell>
              </TableRow>
            ) : (
              paginatedPosts.map((post) => (
                <PostTableRow
                  key={post.id}
                  post={post}
                  isSelected={selectedIds.has(post.id)}
                  onSelect={(checked) => handleRowSelect(post.id, checked)}
                  onClick={() => setSelectedPost(post)}
                  onQuickPublish={(e) => {
                    e.stopPropagation();
                    quickPublishMutation.mutate(post.id);
                  }}
                  onQuickDelete={(e) => {
                    e.stopPropagation();
                    setQuickDeletePost(post);
                  }}
                  formatModelName={formatModelName}
                />
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {filteredPosts.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * postsPerPage + 1} to{" "}
              {Math.min(currentPage * postsPerPage, filteredPosts.length)} of{" "}
              {filteredPosts.length} posts
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

      {/* Post Detail Sheet */}
      <Sheet open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          {selectedPost && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <SheetTitle className="text-xl font-semibold leading-tight mb-2">
                      {selectedPost.title}
                    </SheetTitle>
                    <StatusBadge
                      status={selectedPost.status === "published" ? "success" : "draft"}
                      label={selectedPost.status === "published" ? "Published" : "Draft"}
                    />
                  </div>
                </div>
              </SheetHeader>

              {/* Cover Image */}
              {selectedPost.cover_image_url && (
                <PostPreviewCoverImage url={selectedPost.cover_image_url} />
              )}

              {/* Inline Images */}
              {selectedPost.inline_images && selectedPost.inline_images.length > 0 && (
                <PostPreviewInlineImages urls={selectedPost.inline_images} />
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mb-6">
                <Button onClick={() => {
                  setSelectedPost(null);
                  navigate(`/posts/${selectedPost.id}/edit`);
                }}>
                  <Edit3 className="h-4 w-4 mr-1.5" />
                  Edit Post
                </Button>
                <Button variant="outline" onClick={copyContent}>
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copy
                </Button>
              </div>

              {/* Metadata */}
              <div className="space-y-4 mb-6">
                <p className="section-label">Metadata</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Source</p>
                    <p className="text-sm font-medium capitalize">
                      {selectedPost.source_type?.replace("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Persona</p>
                    <p className="text-sm font-medium">
                      {selectedPost.personas?.name || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Model</p>
                    <p className="text-sm font-medium">
                      {formatModelName(selectedPost.model_id)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Created</p>
                    <p className="text-sm font-medium">
                      {format(new Date(selectedPost.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  {selectedPost.job_id && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Job ID</p>
                      <p className="text-sm font-medium font-mono">#{selectedPost.job_id.slice(0, 8)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Content Preview */}
              <div className="space-y-3">
                <p className="section-label">Content Preview</p>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed line-clamp-[20]">
                    {selectedPost.content}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PostPreviewCoverImage({ url }: { url: string }) {
  const signedUrl = useSignedUrl(url);
  return (
    <div className="mb-6">
      <p className="section-label mb-2">Cover Image</p>
      {signedUrl ? (
        <img
          src={signedUrl}
          alt="Cover"
          className="w-full h-48 object-cover rounded-lg border border-border"
        />
      ) : (
        <div className="w-full h-48 bg-muted animate-pulse rounded-lg" />
      )}
    </div>
  );
}

function PostPreviewInlineImages({ urls }: { urls: string[] }) {
  const signedUrls = useSignedUrls(urls);
  return (
    <div className="mb-6">
      <p className="section-label mb-2">Inline Images ({urls.length})</p>
      <div className="grid grid-cols-2 gap-2">
        {urls.map((_, idx) => {
          const signedUrl = signedUrls[idx];
          return signedUrl ? (
            <img
              key={idx}
              src={signedUrl}
              alt={`Inline ${idx + 1}`}
              className="w-full h-24 object-cover rounded-lg border border-border"
            />
          ) : (
            <div key={idx} className="w-full h-24 bg-muted animate-pulse rounded-lg" />
          );
        })}
      </div>
    </div>
  );
}

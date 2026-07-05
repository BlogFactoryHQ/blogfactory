import { useState, useMemo, useCallback, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { Copy, ExternalLink, ImageIcon, Loader2, Play, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  useImageAssets,
  useImageAssetStats,
  useCancelImageGenerationRequest,
  useDeleteImageAssets,
  useDetachImageAsset,
  useImageGenerationRequests,
  useImportImageGenerationRequest,
  useProcessImageQueue,
  useRetryImageGenerationRequest,
  defaultFilters,
  type GalleryFilters as GalleryFiltersType,
  type ImageAsset,
  type ImageGenerationRequest,
} from "@/hooks/useImageAssets";
import { useSignedUrls } from "@/hooks/useSignedUrl";
import { GalleryStatsBar } from "@/components/gallery/GalleryStatsBar";
import { GalleryFilters } from "@/components/gallery/GalleryFilters";
import { GalleryCard } from "@/components/gallery/GalleryCard";
import { GalleryBulkActions } from "@/components/gallery/GalleryBulkActions";
import { ImageDetailDrawer } from "@/components/gallery/ImageDetailDrawer";
import { imageProviderName, isStockProvider } from "@/lib/image-labels";
import { toast } from "sonner";

const REQUESTS_PER_PAGE = 6;
type RequestStatusFilter = "active" | "all" | "pending" | "processing" | "failed" | "done";
type RequestTypeFilter = "all" | "cover" | "inline";
type BulkImportState = Record<string, { total: number; completed: number; failed: number; uploading: boolean }>;
type ManualImportGroup = {
  id: string;
  title: string;
  postId: string | null;
  provider: string;
  requests: ImageGenerationRequest[];
  importableRequests: ImageGenerationRequest[];
  doneCount: number;
  totalCount: number;
};

function providerUrl(provider: string) {
  if (provider.includes("midjourney")) return "https://www.midjourney.com/imagine";
  if (provider.includes("higgsfield")) return "https://higgsfield.ai";
  if (provider.includes("chatgpt")) return "https://chatgpt.com";
  return null;
}

function requestLabel(request: ImageGenerationRequest) {
  if (request.provider === "ai-deferred") return `AI model: ${request.model_id || "not selected"}`;
  const sourceKind = isStockProvider(request.provider) ? "Stock" : "Provider";
  const license = request.license_label ? ` · ${request.license_label}` : "";
  const credit = request.credit && !request.license_label ? ` · ${request.credit}` : "";
  return `${sourceKind}: ${imageProviderName(request.provider)}${license}${credit}`;
}

function statusBadgeClass(status: string) {
  if (status === "done") return "border-transparent bg-[hsl(var(--status-success)/0.12)] text-status-success";
  if (status === "failed") return "border-transparent bg-destructive text-destructive-foreground";
  if (status === "processing") return "border-transparent bg-primary text-primary-foreground";
  if (status === "queued" || status === "pending") return "border-[hsl(var(--status-warning)/0.35)] text-[hsl(var(--status-warning))]";
  return "";
}

function galleryEmptyState(filters: GalleryFiltersType, counts: { queued: number; processing: number; failed: number }, stockUnavailable: boolean) {
  if (filters.status === "orphaned") return { title: "No images yet", detail: "No orphaned images. Your gallery is clean." };
  if (filters.status === "unused") return { title: "No images yet", detail: "No unused images found." };
  if (stockUnavailable) return { title: "Stock provider unavailable", detail: "Stock could not return an image. Check provider keys or switch inline images to AI." };
  if (counts.processing > 0 || counts.queued > 0) return { title: "Waiting for AI", detail: "Images are queued or processing. They will appear here when generation finishes." };
  if (counts.failed > 0) return { title: "No images yet", detail: "Image generation failed. Review the failed request above and retry or change model." };
  return { title: "No images yet", detail: "Generate content with images enabled to see them here." };
}

function requestMatchesStatus(request: ImageGenerationRequest, status: RequestStatusFilter) {
  if (status === "all") return true;
  if (status === "active") return request.status !== "done";
  if (status === "pending") return request.status === "pending" || request.status === "queued";
  return request.status === status;
}

function isManualImportRequest(request: ImageGenerationRequest) {
  return request.provider.toLowerCase().includes("midjourney");
}

function canImportRequest(request: ImageGenerationRequest) {
  return isManualImportRequest(request) && request.status !== "done" && request.status !== "cancelled";
}

function requestSlotRank(request: ImageGenerationRequest) {
  const position = request.position ?? 0;
  return request.type === "cover" ? position : 100 + position;
}

function sortSlotRequests(requests: ImageGenerationRequest[]) {
  return [...requests].sort((a, b) => requestSlotRank(a) - requestSlotRank(b));
}

function coverPromptRequest(requests: ImageGenerationRequest[]) {
  const sortedRequests = sortSlotRequests(requests);
  return sortedRequests.find((request) => request.type === "cover") || sortedRequests[0];
}

function slotLabel(request: ImageGenerationRequest) {
  const index = (request.position ?? 0) + 1;
  return `${request.type === "cover" ? "Cover" : "Inline"} ${index}`;
}

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function ImageRequestCard({
  request,
  onImport,
  onCancel,
  onProcess,
  onRetry,
  importing,
  cancelling,
  processing,
  retrying,
}: {
  request: ImageGenerationRequest;
  onImport: (request: ImageGenerationRequest, file: File) => void;
  onCancel: (id: string) => void;
  onProcess: () => void;
  onRetry: (id: string) => void;
  importing: boolean;
  cancelling: boolean;
  processing: boolean;
  retrying: boolean;
}) {
  const url = providerUrl(request.provider);
  const fileInputId = `image-request-${request.id}`;
  const title = request.post_title || "Untitled post";
  const isAiQueue = request.provider === "ai-deferred";
  const isDone = request.status === "done";
  const isFailed = request.status === "failed";
  const isProcessing = request.status === "processing";
  const nextRun = request.available_at ? new Date(request.available_at) : null;
  const waiting = nextRun && nextRun.getTime() > Date.now();
  const canProcess = isAiQueue && (request.status === "queued" || request.status === "pending") && !waiting;
  const canRestart = isAiQueue && (isFailed || isProcessing || Boolean(waiting));
  const restartLabel = isFailed ? "Retry" : "Restart";

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(request.prompt);
    toast.success("Prompt copied");
  };

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            <Badge variant="outline" className="text-[10px] capitalize">
              {request.type}{request.position != null ? ` ${request.position + 1}` : ""}
            </Badge>
            <Badge variant={request.status === "processing" ? "default" : "outline"} className={`text-[10px] capitalize ${statusBadgeClass(request.status)}`}>
              {request.status}
            </Badge>
            {request.completed_via && (
              <Badge variant="secondary" className="text-[10px]">
                via {request.completed_via}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {requestLabel(request)}
            {isAiQueue ? ` · retries: ${request.retry_count || 0}` : request.retry_count ? ` · retries: ${request.retry_count}` : ""}
          </p>
          {isFailed && (
            <p className="mt-1 line-clamp-2 text-xs text-destructive">
              Failure reason: {request.last_error || "Provider returned no image."} {isAiQueue ? "Retry this request or change the model in Settings." : "Check the stock provider and try again."}
            </p>
          )}
          {!isFailed && request.last_error && (
            <p className="mt-1 line-clamp-2 text-xs text-destructive">Last error: {request.last_error}</p>
          )}
          {request.prompt && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{request.prompt}</p>}
          {isAiQueue && request.model_id && (
            waiting && nextRun && <p className="mt-1 text-xs text-muted-foreground">Retry after {nextRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={copyPrompt}>
          <Copy className="h-4 w-4" />
          Copy
        </Button>
        {url && (
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          </Button>
        )}
        {canRestart && (
          <Button size="sm" variant={isFailed ? "default" : "outline"} onClick={() => onRetry(request.id)} disabled={retrying}>
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {restartLabel}
          </Button>
        )}
        {canProcess && (
          <Button size="sm" onClick={onProcess} disabled={processing}>
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Process
          </Button>
        )}
        {!isDone && (
          <Button variant="outline" size="sm" onClick={() => onCancel(request.id)} disabled={cancelling}>
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Cancel
          </Button>
        )}
        {!isAiQueue && !isDone && (
          <>
            <input
              id={fileInputId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(request, file);
                event.currentTarget.value = "";
              }}
            />
            <Button variant="default" size="sm" asChild disabled={importing}>
              <label htmlFor={fileInputId}>
                <Upload className="h-4 w-4" />
                Import
              </label>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ManualImportGroupCard({
  group,
  progress,
  dragging,
  onDragStateChange,
  onImportFiles,
}: {
  group: ManualImportGroup;
  progress?: BulkImportState[string];
  dragging: boolean;
  onDragStateChange: (dragging: boolean) => void;
  onImportFiles: (group: ManualImportGroup, files: FileList | File[]) => void;
}) {
  const fileInputId = `manual-import-${safeDomId(group.id)}`;
  const uploading = Boolean(progress?.uploading);
  const liveDone = Math.min(group.totalCount, group.doneCount + (progress?.completed || 0));
  const progressValue = group.totalCount ? Math.round((liveDone / group.totalCount) * 100) : 0;
  const importLabel = group.importableRequests.length === 1 ? "Import image" : `Import ${group.importableRequests.length} images`;
  const canonicalPromptRequest = coverPromptRequest(group.requests);
  const copyCoverPrompt = async () => {
    if (!canonicalPromptRequest?.prompt) {
      toast.error("No prompt to copy");
      return;
    }
    await navigator.clipboard.writeText(canonicalPromptRequest.prompt);
    toast.success(`${slotLabel(canonicalPromptRequest)} prompt copied`);
  };

  return (
    <div
      className={`rounded-lg border bg-background px-3 py-3 transition-calm ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!uploading) onDragStateChange(true);
      }}
      onDragLeave={() => onDragStateChange(false)}
      onDrop={(event) => {
        event.preventDefault();
        onDragStateChange(false);
        if (!uploading && event.dataTransfer.files.length) onImportFiles(group, event.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{group.title}</p>
            <Badge variant="outline" className="text-[10px]">
              {liveDone}/{group.totalCount} imported
            </Badge>
            {liveDone === group.totalCount && (
              <Badge variant="outline" className={`text-[10px] ${statusBadgeClass("done")}`}>
                Done
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manual set: {sortSlotRequests(group.requests).map(slotLabel).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sortSlotRequests(group.requests).map((request) => (
              <Badge
                key={request.id}
                variant="outline"
                className={`text-[10px] ${request.status === "done" ? statusBadgeClass("done") : statusBadgeClass("pending")}`}
              >
                {slotLabel(request)} · {request.status === "done" ? "Done" : "Pending"}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyCoverPrompt}>
            <Copy className="h-4 w-4" />
            Copy cover prompt
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={providerUrl(group.provider) || "#"} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          </Button>
          <input
            id={fileInputId}
            type="file"
            accept="image/*"
            multiple
            disabled={uploading || group.importableRequests.length === 0}
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) onImportFiles(group, event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <Button variant="default" size="sm" asChild disabled={uploading || group.importableRequests.length === 0}>
            <label htmlFor={fileInputId}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading" : importLabel}
            </label>
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{dragging ? `Drop up to ${group.importableRequests.length} image${group.importableRequests.length === 1 ? "" : "s"}` : "Drop images here or use Import"}</span>
          <span>{liveDone}/{group.totalCount}</span>
        </div>
        <Progress value={progressValue} className="h-2" />
        {progress?.failed ? (
          <p className="text-xs text-destructive">{progress.failed} upload{progress.failed === 1 ? "" : "s"} failed. Try those slots again.</p>
        ) : null}
      </div>
    </div>
  );
}

export default function ImageGallery() {
  const [filters, setFilters] = useState<GalleryFiltersType>(defaultFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailImage, setDetailImage] = useState<ImageAsset | null>(null);
  const [showOrphanCleanup, setShowOrphanCleanup] = useState(false);
  const [requestPage, setRequestPage] = useState(1);
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>("active");
  const [requestTypeFilter, setRequestTypeFilter] = useState<RequestTypeFilter>("all");
  const [bulkImportState, setBulkImportState] = useState<BulkImportState>({});
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);

  const { data: images, isLoading } = useImageAssets(filters);
  const { data: stats } = useImageAssetStats();
  const { data: imageRequests = [] } = useImageGenerationRequests("all");
  const deleteImages = useDeleteImageAssets();
  const detachImage = useDetachImageAsset();
  const cancelRequest = useCancelImageGenerationRequest();
  const importRequest = useImportImageGenerationRequest();
  const processQueue = useProcessImageQueue();
  const retryRequest = useRetryImageGenerationRequest();

  const storagePaths = useMemo(() => (images || []).map((i) => i.storage_path), [images]);
  const signedUrls = useSignedUrls(storagePaths);

  // Detail image signed URL
  const detailIdx = detailImage ? (images || []).findIndex((i) => i.id === detailImage.id) : -1;
  const detailSignedUrl = detailIdx >= 0 ? signedUrls[detailIdx] : null;

  const selectedImages = useMemo(
    () => (images || []).filter((i) => selectedIds.has(i.id)),
    [images, selectedIds]
  );
  const requestCounts = useMemo(() => {
    const counts = { queued: 0, processing: 0, failed: 0, done: 0, aiQueued: 0 };
    for (const request of imageRequests) {
      if (request.status === "pending" || request.status === "queued") counts.queued += 1;
      else if (request.status === "processing") counts.processing += 1;
      else if (request.status === "failed") counts.failed += 1;
      else if (request.status === "done") counts.done += 1;
      if (request.provider === "ai-deferred" && (request.status === "pending" || request.status === "queued")) counts.aiQueued += 1;
    }
    return counts;
  }, [imageRequests]);
  const activeRequests = useMemo(
    () => imageRequests.filter((request) => request.status !== "done"),
    [imageRequests]
  );
  const filteredRequests = useMemo(
    () => imageRequests.filter((request) =>
      requestMatchesStatus(request, requestStatusFilter)
      && (requestTypeFilter === "all" || request.type === requestTypeFilter)
    ),
    [imageRequests, requestStatusFilter, requestTypeFilter]
  );
  const manualImportGroups = useMemo(() => {
    const visibleIds = new Set(filteredRequests.map((request) => request.id));
    const groups = new Map<string, ManualImportGroup>();

    for (const request of imageRequests) {
      if (!isManualImportRequest(request)) continue;
      const groupId = request.post_id || request.job_id || request.post_title || request.id;
      const existing = groups.get(groupId);
      if (existing) {
        existing.requests.push(request);
      } else {
        groups.set(groupId, {
          id: groupId,
          title: request.post_title || "Untitled post",
          postId: request.post_id,
          provider: request.provider,
          requests: [request],
          importableRequests: [],
          doneCount: 0,
          totalCount: 0,
        });
      }
    }

    return Array.from(groups.values()).map((group) => {
      const activeRequestsForGroup = group.requests.filter((request) => request.status !== "cancelled");
      return {
        ...group,
        requests: sortSlotRequests(activeRequestsForGroup),
        importableRequests: sortSlotRequests(activeRequestsForGroup.filter(canImportRequest)),
        doneCount: activeRequestsForGroup.filter((request) => request.status === "done").length,
        totalCount: activeRequestsForGroup.length,
      };
    }).filter((group) =>
      group.totalCount > 0
      && group.importableRequests.length > 0
      && group.requests.some((request) => visibleIds.has(request.id))
    );
  }, [filteredRequests, imageRequests]);
  const groupedRequestIds = useMemo(
    () => new Set(manualImportGroups.flatMap((group) => group.requests.map((request) => request.id))),
    [manualImportGroups]
  );
  const individualRequests = useMemo(
    () => filteredRequests.filter((request) => !groupedRequestIds.has(request.id)),
    [filteredRequests, groupedRequestIds]
  );
  const requestPageCount = Math.max(1, Math.ceil(individualRequests.length / REQUESTS_PER_PAGE));
  const paginatedRequests = useMemo(() => {
    const start = (requestPage - 1) * REQUESTS_PER_PAGE;
    return individualRequests.slice(start, start + REQUESTS_PER_PAGE);
  }, [individualRequests, requestPage]);
  const requestRangeStart = individualRequests.length ? (requestPage - 1) * REQUESTS_PER_PAGE + 1 : 0;
  const requestRangeEnd = individualRequests.length ? Math.min(requestPage * REQUESTS_PER_PAGE, individualRequests.length) : 0;
  const stockProviderUnavailable = useMemo(
    () => activeRequests.some((request) => request.status === "failed" && request.provider !== "ai-deferred"),
    [activeRequests]
  );
  const emptyState = galleryEmptyState(filters, requestCounts, stockProviderUnavailable);

  useEffect(() => {
    setRequestPage((page) => Math.min(page, requestPageCount));
  }, [requestPageCount]);

  useEffect(() => {
    setRequestPage(1);
  }, [requestStatusFilter, requestTypeFilter]);

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!images) return;
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map((i) => i.id)));
    }
  }, [images, selectedIds.size]);

  const handleDeleteOrphaned = () => {
    const orphanedIds = (images || []).filter((i) => i.status === "orphaned").map((i) => i.id);
    if (orphanedIds.length > 0) deleteImages.mutate(orphanedIds);
    setShowOrphanCleanup(false);
  };

  const handleBulkManualImport = useCallback(async (group: ManualImportGroup, selectedFiles: FileList | File[]) => {
    const files = Array.from(selectedFiles).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      toast.error("No image files selected");
      return;
    }

    const slots = group.importableRequests;
    if (!slots.length) {
      toast.info("All slots are already imported");
      return;
    }

    const assignments = slots.slice(0, files.length).map((request, index) => ({ request, file: files[index] }));
    if (!assignments.length) return;
    if (files.length > slots.length) {
      toast.info(`Using first ${slots.length} image${slots.length === 1 ? "" : "s"} for the remaining slots`);
    }

    setBulkImportState((prev) => ({
      ...prev,
      [group.id]: { total: assignments.length, completed: 0, failed: 0, uploading: true },
    }));

    const results = await Promise.allSettled(assignments.map(async ({ request, file }) => {
      await importRequest.mutateAsync({ id: request.id, file, postId: request.post_id, quiet: true });
      setBulkImportState((prev) => {
        const current = prev[group.id] || { total: assignments.length, completed: 0, failed: 0, uploading: true };
        return {
          ...prev,
          [group.id]: { ...current, completed: current.completed + 1 },
        };
      });
    }));

    const failed = results.filter((result) => result.status === "rejected").length;
    setBulkImportState((prev) => {
      const current = prev[group.id] || { total: assignments.length, completed: assignments.length - failed, failed: 0, uploading: true };
      return {
        ...prev,
        [group.id]: { ...current, failed, uploading: false },
      };
    });

    const imported = assignments.length - failed;
    if (imported > 0) {
      const nextImported = Math.min(group.totalCount, group.doneCount + imported);
      toast.success(`${nextImported}/${group.totalCount} images imported`, {
        description: nextImported === group.totalCount ? "Manual image set complete." : `${group.totalCount - nextImported} slot${group.totalCount - nextImported === 1 ? "" : "s"} still pending.`,
      });
    }
    if (failed > 0) toast.error(`${failed} upload${failed === 1 ? "" : "s"} failed`);
  }, [importRequest]);

  const orphanedCount = stats?.orphaned || 0;

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Image Gallery"
        description={`${stats?.total || 0} images • AI queue, stock assets, and post attachments`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {orphanedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive"
              onClick={() => setShowOrphanCleanup(true)}
            >
              <Trash2 className="h-4 w-4" />
              Clean {orphanedCount} orphaned
            </Button>
          )}
          {(images?.length || 0) > 0 && (
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedIds.size === (images?.length || 0) ? "Deselect all" : "Select all"}
            </Button>
          )}
        </div>
      </PageHeader>

      {/* Stats */}
      <BywordCard className="mb-6 p-4">
        <GalleryStatsBar
          total={stats?.total || 0}
          cover={stats?.cover || 0}
          inline={stats?.inline || 0}
          orphaned={stats?.orphaned || 0}
          unused={stats?.unused || 0}
          totalCost={stats?.totalCost || 0}
        />
      </BywordCard>

      {/* Filters */}
      {imageRequests.length > 0 && (
        <BywordCard className="mb-6">
          <SectionHeader
            icon={RefreshCw}
            title="Image requests"
            description={`${activeRequests.length} active · ${imageRequests.length} total request${imageRequests.length === 1 ? "" : "s"}`}
            action={
              <Button size="sm" variant="outline" onClick={() => processQueue.mutate()} disabled={processQueue.isPending || requestCounts.aiQueued < 1}>
                {processQueue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Process
              </Button>
            }
          />
          <div className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(["queued", "processing", "failed", "done"] as const).map((status) => (
                    <button key={status} type="button" onClick={() => setRequestStatusFilter(status === "queued" ? "pending" : status)}>
                      <Badge variant="outline" className={`text-[10px] capitalize ${statusBadgeClass(status)}`}>
                        {status} {requestCounts[status]}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {activeRequests.length} active · {imageRequests.length} total
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Select value={requestStatusFilter} onValueChange={(value) => setRequestStatusFilter(value as RequestStatusFilter)}>
                <SelectTrigger className="h-8 w-[150px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
              <Select value={requestTypeFilter} onValueChange={(value) => setRequestTypeFilter(value as RequestTypeFilter)}>
                <SelectTrigger className="h-8 w-[130px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="inline">Inline</SelectItem>
                </SelectContent>
              </Select>
              {(requestStatusFilter !== "active" || requestTypeFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRequestStatusFilter("active");
                    setRequestTypeFilter("all");
                  }}
                >
                  Reset
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Showing {filteredRequests.length} of {imageRequests.length}
              </span>
            </div>
            {manualImportGroups.length > 0 && (
              <div className="mt-3 grid gap-2 border-t border-border pt-3">
                {manualImportGroups.map((group) => (
                  <ManualImportGroupCard
                    key={group.id}
                    group={group}
                    progress={bulkImportState[group.id]}
                    dragging={draggingGroupId === group.id}
                    onDragStateChange={(dragging) => setDraggingGroupId(dragging ? group.id : null)}
                    onImportFiles={handleBulkManualImport}
                  />
                ))}
              </div>
            )}
            <div className="mt-3 grid gap-2">
              {paginatedRequests.length ? paginatedRequests.map((request) => (
                <ImageRequestCard
                  key={request.id}
                  request={request}
                  onImport={(item, file) => importRequest.mutate({ id: item.id, file, postId: item.post_id })}
                  onCancel={(id) => cancelRequest.mutate(id)}
                  onProcess={() => processQueue.mutate()}
                  onRetry={(id) => retryRequest.mutate(id)}
                  importing={importRequest.isPending}
                  cancelling={cancelRequest.isPending}
                  processing={processQueue.isPending}
                  retrying={retryRequest.isPending}
                />
              )) : (
                <div className="rounded-lg border border-dashed border-border bg-background px-3 py-8 text-center text-sm text-muted-foreground">
                  {manualImportGroups.length ? "Individual manual slots are grouped above." : "No image requests match these filters."}
                </div>
              )}
            </div>
            {requestPageCount > 1 && individualRequests.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Showing {requestRangeStart}-{requestRangeEnd} of {individualRequests.length} individual requests
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRequestPage((page) => Math.max(1, page - 1))}
                    disabled={requestPage === 1}
                  >
                    Previous
                  </Button>
                  <Badge variant="outline" className="text-[10px]">
                    Page {requestPage} of {requestPageCount}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRequestPage((page) => Math.min(requestPageCount, page + 1))}
                    disabled={requestPage === requestPageCount}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </BywordCard>
      )}

      <GalleryFilters filters={filters} onChange={setFilters} />

      {/* Grid */}
      <BywordCard className="p-4">
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[3/2] rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : !images || images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">{emptyState.title}</p>
          <p className="text-sm">{emptyState.detail}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {images.map((img, idx) => (
            <GalleryCard
              key={img.id}
              image={img}
              signedUrl={signedUrls[idx]}
              selected={selectedIds.has(img.id)}
              onSelect={(c) => toggleSelect(img.id, c)}
              onClick={() => setDetailImage(img)}
            />
          ))}
        </div>
      )}
      </BywordCard>

      {/* Bulk actions */}
      <GalleryBulkActions
        selectedImages={selectedImages}
        onClear={() => setSelectedIds(new Set())}
        onDelete={(ids) => {
          deleteImages.mutate(ids);
          setSelectedIds(new Set());
        }}
        isDeleting={deleteImages.isPending}
      />

      {/* Detail drawer */}
      <ImageDetailDrawer
        image={detailImage}
        signedUrl={detailSignedUrl}
        onClose={() => setDetailImage(null)}
        onDetach={(id) => {
          detachImage.mutate(id);
          setDetailImage(null);
        }}
      />

      {/* Orphan cleanup dialog */}
      <AlertDialog open={showOrphanCleanup} onOpenChange={setShowOrphanCleanup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all orphaned images?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {orphanedCount} orphaned image{orphanedCount !== 1 ? "s" : ""} from storage.
              These images belong to posts that have been deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteOrphaned}
            >
              Delete orphaned images
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BywordPageShell>
  );
}

import { useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Copy, ExternalLink, ImageIcon, Loader2, Play, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  if (status === "queued" || status === "pending") return "border-amber-300 text-amber-700";
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

export default function ImageGallery() {
  const [filters, setFilters] = useState<GalleryFiltersType>(defaultFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailImage, setDetailImage] = useState<ImageAsset | null>(null);
  const [showOrphanCleanup, setShowOrphanCleanup] = useState(false);

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
    const counts = { queued: 0, processing: 0, failed: 0, done: 0 };
    for (const request of imageRequests) {
      if (request.status === "pending" || request.status === "queued") counts.queued += 1;
      else if (request.status === "processing") counts.processing += 1;
      else if (request.status === "failed") counts.failed += 1;
      else if (request.status === "done") counts.done += 1;
    }
    return counts;
  }, [imageRequests]);
  const visibleRequests = useMemo(
    () => imageRequests.filter((request) => request.status !== "done"),
    [imageRequests]
  );
  const stockProviderUnavailable = useMemo(
    () => visibleRequests.some((request) => request.status === "failed" && request.provider !== "ai-deferred"),
    [visibleRequests]
  );
  const emptyState = galleryEmptyState(filters, requestCounts, stockProviderUnavailable);

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

  const orphanedCount = stats?.orphaned || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Image Gallery"
        description={`${stats?.total || 0} images • AI queue, stock assets, and post attachments`}
      />

      {/* Stats */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <GalleryStatsBar
          total={stats?.total || 0}
          cover={stats?.cover || 0}
          inline={stats?.inline || 0}
          orphaned={stats?.orphaned || 0}
          unused={stats?.unused || 0}
          totalCost={stats?.totalCost || 0}
        />
        <div className="flex items-center gap-2">
          {orphanedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30"
              onClick={() => setShowOrphanCleanup(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clean {orphanedCount} orphaned
            </Button>
          )}
          {(images?.length || 0) > 0 && (
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedIds.size === (images?.length || 0) ? "Deselect all" : "Select all"}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      {visibleRequests.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Image Requests</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(["queued", "processing", "failed", "done"] as const).map((status) => (
                  <Badge key={status} variant="outline" className={`text-[10px] capitalize ${statusBadgeClass(status)}`}>
                    {status} {requestCounts[status]}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{visibleRequests.length} active request{visibleRequests.length === 1 ? "" : "s"}</span>
              <Button size="sm" variant="outline" onClick={() => processQueue.mutate()} disabled={processQueue.isPending || requestCounts.queued < 1}>
                {processQueue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Process
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {visibleRequests.map((request) => (
              <ImageRequestCard
                key={request.id}
                request={request}
                onImport={(item, file) => importRequest.mutate({ id: item.id, file })}
                onCancel={(id) => cancelRequest.mutate(id)}
                onProcess={() => processQueue.mutate()}
                onRetry={(id) => retryRequest.mutate(id)}
                importing={importRequest.isPending}
                cancelling={cancelRequest.isPending}
                processing={processQueue.isPending}
                retrying={retryRequest.isPending}
              />
            ))}
          </div>
        </div>
      )}

      <GalleryFilters filters={filters} onChange={setFilters} />

      {/* Grid */}
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
    </div>
  );
}

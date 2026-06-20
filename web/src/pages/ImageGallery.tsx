import { useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  useDeleteImageAssets,
  useDetachImageAsset,
  defaultFilters,
  type GalleryFilters as GalleryFiltersType,
  type ImageAsset,
} from "@/hooks/useImageAssets";
import { useSignedUrls } from "@/hooks/useSignedUrl";
import { GalleryStatsBar } from "@/components/gallery/GalleryStatsBar";
import { GalleryFilters } from "@/components/gallery/GalleryFilters";
import { GalleryCard } from "@/components/gallery/GalleryCard";
import { GalleryBulkActions } from "@/components/gallery/GalleryBulkActions";
import { ImageDetailDrawer } from "@/components/gallery/ImageDetailDrawer";

export default function ImageGallery() {
  const [filters, setFilters] = useState<GalleryFiltersType>(defaultFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailImage, setDetailImage] = useState<ImageAsset | null>(null);
  const [showOrphanCleanup, setShowOrphanCleanup] = useState(false);

  const { data: images, isLoading } = useImageAssets(filters);
  const { data: stats } = useImageAssetStats();
  const deleteImages = useDeleteImageAssets();
  const detachImage = useDetachImageAsset();

  const storagePaths = useMemo(() => (images || []).map((i) => i.storage_path), [images]);
  const signedUrls = useSignedUrls(storagePaths);

  // Detail image signed URL
  const detailIdx = detailImage ? (images || []).findIndex((i) => i.id === detailImage.id) : -1;
  const detailSignedUrl = detailIdx >= 0 ? signedUrls[detailIdx] : null;

  const selectedImages = useMemo(
    () => (images || []).filter((i) => selectedIds.has(i.id)),
    [images, selectedIds]
  );

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
        description={`${stats?.total || 0} generated images • Asset management & lifecycle tracking`}
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
          <p className="text-lg font-medium">No images found</p>
          <p className="text-sm">
            {filters.status === "orphaned"
              ? "No orphaned images — your gallery is clean!"
              : filters.status === "unused"
              ? "No unused images found."
              : "Generate content with images enabled to see them here."}
          </p>
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

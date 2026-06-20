import { useState } from "react";
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
import { Download, Trash2, X, Loader2 } from "lucide-react";
import type { ImageAsset } from "@/hooks/useImageAssets";
import { resolveSignedUrl } from "@/hooks/useSignedUrl";
import JSZip from "jszip";
import { toast } from "sonner";

interface GalleryBulkActionsProps {
  selectedImages: ImageAsset[];
  onClear: () => void;
  onDelete: (ids: string[]) => void;
  isDeleting: boolean;
}

export function GalleryBulkActions({ selectedImages, onClear, onDelete, isDeleting }: GalleryBulkActionsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (selectedImages.length === 0) return null;

  const publishedCount = selectedImages.filter((i) => i.post_status === "published").length;

  const handleBulkDownload = async () => {
    const count = selectedImages.length;

    // Single image: direct download
    if (count === 1) {
      try {
        const img = selectedImages[0];
        const url = await resolveSignedUrl(img.storage_path);
        const res = await fetch(url);
        const blob = await res.blob();
        const ext = img.storage_path.match(/\.(\w+)$/)?.[1] || "png";
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `${img.type}-${img.id.slice(0, 8)}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch {
        toast.error("Failed to download image");
      }
      return;
    }

    // Multiple images: zip download
    setIsDownloading(true);
    const toastId = toast.loading(`Preparing ${count} images for download...`);

    try {
      const zip = new JSZip();
      let completed = 0;
      let failed = 0;

      // Process in batches of 10 for performance
      const batchSize = 10;
      for (let i = 0; i < selectedImages.length; i += batchSize) {
        const batch = selectedImages.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (img, batchIdx) => {
            try {
              const url = await resolveSignedUrl(img.storage_path);
              const res = await fetch(url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const blob = await res.blob();
              const ext = img.storage_path.match(/\.(\w+)$/)?.[1] || "png";
              const filename = `${img.type}-${img.id.slice(0, 8)}.${ext}`;
              zip.file(filename, blob);
              completed++;
            } catch {
              failed++;
            }
          })
        );
        toast.loading(`Downloading ${Math.min(i + batchSize, count)}/${count} images...`, { id: toastId });
      }

      if (completed === 0) {
        toast.error("All downloads failed", { id: toastId });
        setIsDownloading(false);
        return;
      }

      toast.loading("Creating zip file...", { id: toastId });
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `images-${count}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      const msg = failed > 0 ? `Downloaded ${completed} images (${failed} failed)` : `Downloaded ${completed} images`;
      toast.success(msg, { id: toastId });
    } catch (error) {
      toast.error("Failed to create zip file", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg rounded-lg px-4 py-3 flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">
          {selectedImages.length} selected
        </span>
        <div className="h-5 w-px bg-border" />
        <Button variant="outline" size="sm" onClick={handleBulkDownload} disabled={isDownloading}>
          {isDownloading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
          {isDownloading ? "Zipping..." : "Download"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedImages.length} images?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected images from storage.
              {publishedCount > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ {publishedCount} image{publishedCount > 1 ? "s are" : " is"} used in published posts.
                  Deleting them will break those posts.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDelete(selectedImages.map((i) => i.id));
                setShowDeleteConfirm(false);
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

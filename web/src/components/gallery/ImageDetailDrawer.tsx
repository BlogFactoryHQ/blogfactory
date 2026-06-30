import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star,
  ImagePlus,
  Download,
  ExternalLink,
  Calendar,
  FileText,
  Cpu,
  DollarSign,
  Ratio,
  Monitor,
  Unlink,
  ImageIcon,
  AlertTriangle,
  ImageOff,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { resolveSignedUrl } from "@/hooks/useSignedUrl";
import type { ImageAsset } from "@/hooks/useImageAssets";
import { imageProviderName, imageSourceLabel, isStockProvider } from "@/lib/image-labels";

interface ImageDetailDrawerProps {
  image: ImageAsset | null;
  signedUrl: string | null;
  onClose: () => void;
  onDetach: (id: string) => void;
}

function positionLabel(position: number | null) {
  return position != null ? ` #${position + 1}` : "";
}

export function ImageDetailDrawer({ image, signedUrl, onClose, onDetach }: ImageDetailDrawerProps) {
  if (!image) return null;

  const handleDownload = async () => {
    try {
      const url = await resolveSignedUrl(image.storage_path);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${image.type}-${image.id.slice(0, 8)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch { /* ignore */ }
  };

  const statusBadge = image.status === "orphaned" ? (
    <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Orphaned</Badge>
  ) : image.status === "unused" ? (
    <Badge variant="secondary" className="gap-1"><ImageOff className="h-3 w-3" /> Unused</Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600">Used</Badge>
  );
  const sourceUrl = image.attribution_url || image.source_url;
  const sourceName = imageProviderName(image.provider);
  const isStock = image.source_kind === "stock" || isStockProvider(image.provider);
  const isAi = image.source_kind === "ai" || image.provider === "openrouter-image";
  const sourceKindLabel = imageSourceLabel(image);

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {image.type === "cover" ? (
              <Star className="h-4 w-4 text-amber-500" />
            ) : (
              <ImagePlus className="h-4 w-4 text-primary" />
            )}
            {image.type === "cover" ? "Cover Image" : `Inline Image${positionLabel(image.position)}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          {signedUrl ? (
            <img
              src={signedUrl}
              alt="Full size preview"
              style={{ objectFit: "contain" }}
              className="w-full rounded-lg object-contain max-h-[50vh] bg-muted"
            />
          ) : (
            <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground" />
            </div>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{image.post_title || "No post linked"}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{format(new Date(image.created_at), "MMM d, yyyy HH:mm")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Type:</span>
              <Badge variant="outline">{image.type}</Badge>
              {image.position != null && (
                <span className="text-muted-foreground text-xs ml-1">Position #{image.position + 1}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Status:</span>
              {statusBadge}
            </div>
            {image.model_id && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-4 w-4 shrink-0" />
                <Badge variant="secondary" className="text-xs">{image.model_id}</Badge>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              {isAi ? <Sparkles className="h-4 w-4 shrink-0" /> : <Cpu className="h-4 w-4 shrink-0" />}
              <Badge variant={isAi ? "default" : "secondary"} className="text-xs">{sourceKindLabel}</Badge>
            </div>
            {image.cost != null && image.cost > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4 shrink-0" />
                <span>${image.cost.toFixed(4)}</span>
              </div>
            )}
            {image.aspect_ratio && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Ratio className="h-4 w-4 shrink-0" />
                <span>{image.aspect_ratio}</span>
              </div>
            )}
            {image.resolution && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Monitor className="h-4 w-4 shrink-0" />
                <span>{image.resolution}</span>
              </div>
            )}
            {image.post_status && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Post:</span>
                <Badge variant={image.post_status === "published" ? "default" : "secondary"} className="text-xs">
                  {image.post_status}
                </Badge>
              </div>
            )}
            {sourceUrl && (
              <div className="col-span-2 flex items-center gap-2 text-muted-foreground">
                <ExternalLink className="h-4 w-4 shrink-0" />
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="truncate text-primary underline-offset-2 hover:underline">
                  {image.credit ? `${image.credit} on ${sourceName}` : sourceName}
                </a>
                {image.license_label && <Badge variant="outline" className="text-xs">{image.license_label}</Badge>}
              </div>
            )}
          </div>

          {/* Prompt */}
          {image.prompt && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Prompt
              </div>
              <p className="text-sm bg-muted rounded-md p-3 text-foreground">{image.prompt}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1.5" />
              Download
            </Button>
            {image.post_id && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/posts/${image.post_id}/edit`}>
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Open Post
                </Link>
              </Button>
            )}
            {image.post_id && image.status === "used" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDetach(image.id)}
                className="text-muted-foreground"
              >
                <Unlink className="h-4 w-4 mr-1.5" />
                Detach from Post
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

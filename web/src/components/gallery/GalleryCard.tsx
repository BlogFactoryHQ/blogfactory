import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ImageIcon,
  Download,
  Star,
  ImagePlus,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/date-format";
import type { ImageAsset } from "@/hooks/useImageAssets";
import { resolveSignedUrl } from "@/hooks/useSignedUrl";
import { imageSourceLabel } from "@/lib/image-labels";

interface GalleryCardProps {
  image: ImageAsset;
  signedUrl: string | null;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
}

function positionLabel(position: number | null) {
  return position != null ? ` #${position + 1}` : "";
}

export function GalleryCard({ image, signedUrl, selected, onSelect, onClick }: GalleryCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const sourceLabel = imageSourceLabel(image);

  return (
    <div
      className={cn(
        "group relative rounded-lg border overflow-hidden cursor-pointer aspect-[3/2] transition-all",
        selected ? "border-byword-blue ring-2 ring-byword-blue/30" : "border-border bg-background"
      )}
      onClick={onClick}
    >
      {/* Image */}
      {signedUrl && !error ? (
        <img
          src={signedUrl}
          alt={`${image.type} image`}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      {!loaded && !error && signedUrl && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {/* Checkbox */}
      <div
        className={cn(
          "absolute top-2 right-2 z-10 transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(c) => onSelect(!!c)}
          className="bg-background/80 border-border"
        />
      </div>

      {/* Type + status badges */}
      <div className="absolute top-2 left-2 flex items-center gap-1">
        {image.type === "cover" ? (
          <div className="flex items-center gap-1 rounded-sm border border-border bg-background/90 px-1.5 py-0.5 text-[10px] text-foreground">
            <Star className="h-2.5 w-2.5" /> Cover
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-sm border border-border bg-background/90 px-1.5 py-0.5 text-[10px] text-foreground">
            <ImagePlus className="h-2.5 w-2.5" /> Inline{positionLabel(image.position)}
          </div>
        )}
        {image.status === "orphaned" && (
          <StatusBadge status="warning" label="Orphaned" className="bg-background/90" />
        )}
        {image.status === "unused" && (
          <StatusBadge status="pending" label="Unused" className="bg-background/90" />
        )}
      </div>

      {/* Cost badge */}
      {image.cost != null && image.cost > 0 && (
        <div className="absolute bottom-2 right-2 z-10">
          <div className="bg-background/80 text-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <DollarSign className="h-2.5 w-2.5" />
            {image.cost.toFixed(3)}
          </div>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
        <p className="text-white text-xs font-medium truncate mb-0.5">{image.postTitle || "No post"}</p>
        {image.postStatus && (
          <Badge variant="outline" className="w-fit text-[10px] bg-background/20 border-white/20 text-white mb-1">
            {image.postStatus}
          </Badge>
        )}
        <p className="text-white/70 text-[10px]">{safeFormatDate(image.created_at, "MMM d, yyyy")}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Badge title={sourceLabel} variant="outline" className="max-w-[calc(100%-2rem)] truncate text-[10px] bg-background/80 border-white/20 text-white">
            {sourceLabel}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-6 w-6 ml-auto"
                onClick={handleDownload}
                aria-label="Download image"
              >
                <Download className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

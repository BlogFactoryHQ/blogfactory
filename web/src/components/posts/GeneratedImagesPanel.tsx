import { useState, useEffect } from "react";
import { useSignedUrl, useSignedUrls, resolveSignedUrl } from "@/hooks/useSignedUrl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Download,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  ImagePlus,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneratedImage {
  url: string;
  type: "cover" | "inline";
  resolution?: string;
  aspectRatio?: string;
  model?: string;
  provider?: string | null;
  sourceKind?: string | null;
  licenseLabel?: string | null;
}

interface ImageAssetMetadata {
  storage_path: string;
  provider?: string | null;
  model_id?: string | null;
  source_kind?: string | null;
  license_label?: string | null;
}

interface GeneratedImagesPanelProps {
  coverImageUrl?: string | null;
  inlineImages?: string[] | null;
  imageAssets?: ImageAssetMetadata[];
  onSetCoverImage?: (url: string) => void;
  onRemoveCoverImage?: () => void;
  onInsertInlineImage?: (url: string) => void;
  onRemoveInlineImage?: (index: number) => void;
  imageMetadata?: {
    coverResolution?: string;
    coverAspectRatio?: string;
    inlineResolution?: string;
    inlineAspectRatio?: string;
    model?: string;
  };
  className?: string;
}

export function GeneratedImagesPanel({
  coverImageUrl,
  inlineImages,
  imageAssets = [],
  onSetCoverImage,
  onRemoveCoverImage,
  onInsertInlineImage,
  onRemoveInlineImage,
  imageMetadata,
  className,
}: GeneratedImagesPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const visibleInlineImages = (inlineImages || []).filter((url, index, urls) =>
    url && url !== coverImageUrl && urls.indexOf(url) === index
  ).map((url) => ({ url, originalIndex: inlineImages?.indexOf(url) ?? 0 }));

  const signedCoverUrl = useSignedUrl(coverImageUrl);
  const signedInlineUrls = useSignedUrls(visibleInlineImages.map((image) => image.url));
  const assetByPath = new Map(imageAssets.map((asset) => [asset.storage_path, asset]));

  if (!coverImageUrl && visibleInlineImages.length === 0) {
    return null;
  }

  const coverCount = coverImageUrl ? 1 : 0;
  const inlineCount = visibleInlineImages.length;

  const handleDownload = async (urlOrPath: string, filename: string) => {
    try {
      const url = await resolveSignedUrl(urlOrPath);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <div className="border border-border rounded-lg bg-muted/30">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Generated Images</span>
              <Badge variant="secondary" className="text-xs">
                {coverCount > 0 && `${coverCount} cover`}
                {coverCount > 0 && inlineCount > 0 && " + "}
                {inlineCount > 0 && `${inlineCount} inline`}
              </Badge>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-2">
            {/* Cover Image Section */}
            {coverImageUrl && signedCoverUrl && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Cover Image
                  </span>
                </div>
                <ImageCard
                  image={{
                    url: signedCoverUrl,
                    type: "cover",
                    resolution: imageMetadata?.coverResolution || "2K",
                    aspectRatio: imageMetadata?.coverAspectRatio || "16:9",
                    model: assetByPath.get(coverImageUrl)?.model_id || imageMetadata?.model,
                    provider: assetByPath.get(coverImageUrl)?.provider,
                    sourceKind: assetByPath.get(coverImageUrl)?.source_kind,
                    licenseLabel: assetByPath.get(coverImageUrl)?.license_label,
                  }}
                  onDownload={() => handleDownload(coverImageUrl, "cover-image.png")}
                  onRemove={onRemoveCoverImage}
                  isCover
                />
              </div>
            )}

            {/* Inline Images Section */}
            {visibleInlineImages.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ImagePlus className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Inline Images
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {visibleInlineImages.map(({ url: originalUrl, originalIndex }, index) => {
                    const signedUrl = signedInlineUrls[index];
                    if (!signedUrl) return null;
                    return (
                      <ImageCard
                        key={`${originalUrl}-${index}`}
                        image={{
                          url: signedUrl,
                          type: "inline",
                          resolution: imageMetadata?.inlineResolution || "2K",
                          aspectRatio: imageMetadata?.inlineAspectRatio || "3:2",
                          model: assetByPath.get(originalUrl)?.model_id || imageMetadata?.model,
                          provider: assetByPath.get(originalUrl)?.provider,
                          sourceKind: assetByPath.get(originalUrl)?.source_kind,
                          licenseLabel: assetByPath.get(originalUrl)?.license_label,
                        }}
                        index={index + 1}
                        onDownload={() => handleDownload(originalUrl, `inline-image-${index + 1}.png`)}
                        onInsert={onInsertInlineImage ? () => onInsertInlineImage(originalUrl) : undefined}
                        onRemove={onRemoveInlineImage ? () => onRemoveInlineImage(originalIndex) : undefined}
                        onSetAsCover={onSetCoverImage && !coverImageUrl ? () => onSetCoverImage(originalUrl) : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface ImageCardProps {
  image: GeneratedImage;
  index?: number;
  isCover?: boolean;
  onDownload: () => void;
  onInsert?: () => void;
  onRemove?: () => void;
  onSetAsCover?: () => void;
}

function providerName(provider?: string | null) {
  if (!provider) return "";
  if (provider === "google-ai-studio") return "Google";
  if (provider === "openrouter-image") return "OpenRouter";
  if (provider === "openai-image") return "OpenAI";
  return provider.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sourceLabel(image: GeneratedImage) {
  const provider = image.provider || image.model || "";
  if (image.sourceKind === "stock" || ["pexels", "pixabay", "openverse"].includes(provider)) {
    return `Stock${provider ? ` · ${providerName(provider)}` : ""}`;
  }
  if (image.sourceKind === "source" || provider === "source-image") return "Source image";
  if (provider) return `AI · ${providerName(provider)}`;
  return "Image";
}

function ImageCard({
  image,
  index,
  isCover,
  onDownload,
  onInsert,
  onRemove,
  onSetAsCover,
}: ImageCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const label = sourceLabel(image);

  useEffect(() => {
    // Fetch file metadata from the image URL
    const fetchFileSize = async () => {
      try {
        const response = await fetch(image.url, { method: "HEAD" });
        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          const bytes = parseInt(contentLength, 10);
          const kb = bytes / 1024;
          setFileSize(kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`);
        }
      } catch {
        // Ignore errors fetching metadata
      }
    };
    fetchFileSize();
  }, [image.url]);

  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border bg-background overflow-hidden",
        isCover ? "aspect-video" : "aspect-[3/2]"
      )}
    >
      {/* Image */}
      {!imageError ? (
        <img
          src={image.url}
          alt={isCover ? "Cover image" : `Inline image ${index}`}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200",
            imageLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {/* Loading skeleton */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {/* Overlay with actions */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col">
        {/* Top actions */}
        <div className="flex items-center justify-end gap-1 p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7"
                onClick={onDownload}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download</TooltipContent>
          </Tooltip>

          {onRemove && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove image?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the image from the post. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Bottom actions & metadata */}
        <div className="mt-auto p-2">
          {/* Placement actions */}
          <div className="flex items-center gap-1 mb-2">
            {onInsert && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onInsert}
                  >
                    <ImagePlus className="h-3 w-3 mr-1" />
                    Insert
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Insert into content</TooltipContent>
              </Tooltip>
            )}
            {onSetAsCover && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onSetAsCover}
                  >
                    <Star className="h-3 w-3 mr-1" />
                    Set as cover
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Use as cover image</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] bg-background/80 border-white/20 text-white">
              {image.resolution}
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-background/80 border-white/20 text-white">
              {image.aspectRatio}
            </Badge>
            {fileSize && (
              <Badge variant="outline" className="text-[10px] bg-background/80 border-white/20 text-white">
                {fileSize}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Index badge for inline images */}
      {index !== undefined && (
        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
          #{index}
        </div>
      )}

      {/* Cover badge */}
      {isCover && (
        <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
          <Star className="h-2.5 w-2.5" />
          Cover
        </div>
      )}

      <div className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
        {label}
      </div>
    </div>
  );
}

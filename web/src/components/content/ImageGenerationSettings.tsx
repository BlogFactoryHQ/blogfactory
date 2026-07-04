import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InlineImageSource = "ai" | "stock";
export type ImageResolution = "512" | "1K";
export type ImageDeliveryMode = "generate" | "manual_prompt";
export type ManualImageProvider = "midjourney";

export interface CoverImageConfig {
  enabled: boolean;
  resolution?: ImageResolution;
}

export interface InlineImageConfig {
  enabled: boolean;
  count: number;
  resolution?: ImageResolution;
}

export interface SplitImageConfig {
  cover: CoverImageConfig;
  inline: InlineImageConfig;
}

export const DEFAULT_COVER_CONFIG: CoverImageConfig = {
  enabled: true,
  resolution: "1K",
};

export const DEFAULT_INLINE_CONFIG: InlineImageConfig = {
  enabled: true,
  count: 2,
  resolution: "1K",
};

export const DEFAULT_SPLIT_CONFIG: SplitImageConfig = {
  cover: DEFAULT_COVER_CONFIG,
  inline: DEFAULT_INLINE_CONFIG,
};

interface SplitImageGenerationSettingsProps {
  config: SplitImageConfig;
  onConfigChange: (config: SplitImageConfig) => void;
  compact?: boolean;
  className?: string;
  inlineImageSource?: InlineImageSource;
  imageDeliveryMode?: ImageDeliveryMode;
  manualImageProvider?: ManualImageProvider;
  onImageDeliveryModeChange?: (mode: ImageDeliveryMode) => void;
  coverResolutions?: ImageResolution[];
  inlineResolutions?: ImageResolution[];
}

export function SplitImageGenerationSettings({
  config,
  onConfigChange,
  compact = false,
  className,
  inlineImageSource = "ai",
  imageDeliveryMode = "generate",
  manualImageProvider = "midjourney",
  onImageDeliveryModeChange,
  coverResolutions = ["512", "1K"],
  inlineResolutions = ["512", "1K"],
}: SplitImageGenerationSettingsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const updateCover = (updates: Partial<CoverImageConfig>) => {
    onConfigChange({ ...config, cover: { ...config.cover, ...updates } });
  };

  const updateInline = (updates: Partial<InlineImageConfig>) => {
    onConfigChange({ ...config, inline: { ...config.inline, ...updates } });
  };
  useEffect(() => {
    const nextCover = coverResolutions.includes(config.cover.resolution || "1K") ? config.cover.resolution : coverResolutions.includes("1K") ? "1K" : coverResolutions[0];
    const nextInline = inlineResolutions.includes(config.inline.resolution || "1K") ? config.inline.resolution : inlineResolutions.includes("1K") ? "1K" : inlineResolutions[0];
    if (nextCover !== config.cover.resolution || nextInline !== config.inline.resolution) {
      onConfigChange({
        cover: { ...config.cover, resolution: nextCover },
        inline: { ...config.inline, resolution: nextInline },
      });
    }
  }, [config, coverResolutions, inlineResolutions, onConfigChange]);
  const resolutionButtons = (value: ImageResolution | undefined, available: ImageResolution[], onChange: (resolution: ImageResolution) => void) => (
    <div className="grid grid-cols-2 rounded-lg border border-border p-1">
      {(["512", "1K"] as const).map((resolution) => (
        <button
          key={resolution}
          type="button"
          disabled={!available.includes(resolution)}
          onClick={() => available.includes(resolution) && onChange(resolution)}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-calm",
            (value || "1K") === resolution ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            !available.includes(resolution) && "cursor-not-allowed opacity-40 hover:bg-transparent"
          )}
        >
          {resolution}
        </button>
      ))}
    </div>
  );

  const inlineCostLabel = !config.inline.enabled || config.inline.count === 0
    ? "Off"
    : imageDeliveryMode === "manual_prompt"
    ? "Manual prompt"
    : inlineImageSource === "stock"
    ? "Stock providers"
    : "AI";
  const imagesEnabled = config.cover.enabled || (config.inline.enabled && config.inline.count > 0);
  const inlineSummary = config.inline.enabled && config.inline.count > 0
    ? `${config.inline.count} inline ${inlineImageSource === "stock" ? "stock" : "AI"}`
    : "";
  const summary = imageDeliveryMode === "manual_prompt"
    ? imagesEnabled ? `1 ${manualImageProvider === "midjourney" ? "Midjourney" : "manual"} prompt` : "No images"
    : [
    config.cover.enabled ? "Cover AI" : "",
    inlineSummary,
  ].filter(Boolean).join(" · ") || "No images";

  const deliveryModeControl = onImageDeliveryModeChange ? (
    <div className="grid grid-cols-2 rounded-lg border border-border p-1">
      {([
        ["generate", "Generate Images"],
        ["manual_prompt", "Manual Prompt"],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onImageDeliveryModeChange(mode)}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-calm",
            imageDeliveryMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  const controls = (
    <div className="space-y-3">
      {deliveryModeControl}
      {imageDeliveryMode === "manual_prompt" ? (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <Label>Manual Image Prompt</Label>
            <p className="text-xs text-muted-foreground">
              {imagesEnabled ? "Creates one Midjourney prompt" : "Off"}
            </p>
          </div>
          <Switch
            checked={imagesEnabled}
            onCheckedChange={(enabled) => onConfigChange({
              cover: { ...config.cover, enabled },
              inline: { ...config.inline, enabled: false },
            })}
          />
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label>Cover Image</Label>
          <p className="text-xs text-muted-foreground">{config.cover.enabled ? `${config.cover.resolution || "1K"} AI` : "Off"}</p>
        </div>
        <Switch checked={config.cover.enabled} onCheckedChange={(enabled) => updateCover({ enabled })} />
      </div>
      {config.cover.enabled && resolutionButtons(config.cover.resolution, coverResolutions, (resolution) => updateCover({ resolution }))}

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Inline Images</Label>
            <p className="text-xs text-muted-foreground">{inlineCostLabel}</p>
          </div>
          <Switch checked={config.inline.enabled} onCheckedChange={(enabled) => updateInline({ enabled })} />
        </div>

        {config.inline.enabled && (
          <div className="space-y-2">
            {inlineImageSource === "ai" && resolutionButtons(config.inline.resolution, inlineResolutions, (resolution) => updateInline({ resolution }))}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Count</span>
              <span className="font-medium">{config.inline.count}</span>
            </div>
            <Slider
              value={[config.inline.count]}
              onValueChange={([count]) => updateInline({ count })}
              min={0}
              max={5}
              step={1}
            />
          </div>
        )}
      </div>
        </>
      )}

    </div>
  );

  if (!compact) return <div className={cn("space-y-4", className)}>{controls}</div>;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-byword-blue/30 bg-byword-blue-soft">
            <ImageIcon className="h-4 w-4 text-byword-blue" />
          </div>
          <div>
            <p className="text-sm font-medium">Images</p>
            <p className="text-xs text-muted-foreground">{summary}</p>
          </div>
        </div>
        {imagesEnabled && compact && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                  {imageDeliveryMode === "manual_prompt" ? "Manual prompt" : inlineImageSource === "stock" ? "Cover AI + inline stock" : "AI images"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  <p>Cover: {config.cover.enabled ? "AI" : "Off"}</p>
                  <p>Inline: {imageDeliveryMode === "manual_prompt" ? "Manual prompt mode" : inlineCostLabel}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between">
            <span className="text-sm">Image options</span>
            {settingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">{controls}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

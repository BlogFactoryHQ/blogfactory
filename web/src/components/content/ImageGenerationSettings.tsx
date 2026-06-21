import { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Info,
  RotateCcw,
  Save,
  DollarSign,
  ImagePlus,
  LayoutTemplate,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ImageModelConstraints } from "@/lib/types";
import { useImageModels } from "@/hooks/useImageModels";

export type Resolution = "Web" | "1K" | "2K" | "4K";
export type AspectRatio = "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "16:9" | "9:16" | "21:9";

export interface CoverImageConfig {
  enabled: boolean;
  resolution: Resolution;
  aspectRatio: AspectRatio;
}

export interface InlineImageConfig {
  enabled: boolean;
  count: number;
  resolution: Resolution;
  aspectRatio: AspectRatio;
}

export interface SplitImageConfig {
  cover: CoverImageConfig;
  inline: InlineImageConfig;
}

export interface SplitImageDefaults {
  cover: Omit<CoverImageConfig, "enabled"> & { enabled?: boolean };
  inline: Omit<InlineImageConfig, "enabled"> & { enabled?: boolean };
}

// Aspect ratio to pixel dimensions mapping
const ASPECT_RATIO_PIXELS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "3:2": { width: 1536, height: 1024 },
  "2:3": { width: 1024, height: 1536 },
  "4:3": { width: 1365, height: 1024 },
  "3:4": { width: 1024, height: 1365 },
  "5:4": { width: 1280, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "16:9": { width: 1820, height: 1024 },
  "9:16": { width: 576, height: 1024 },
  "21:9": { width: 2389, height: 1024 },
};

// Resolution multipliers and costs
const RESOLUTION_CONFIG: Record<string, { multiplier: number; cost: number; label: string }> = {
  "Web": { multiplier: 0.78, cost: 0.015, label: "~800px — Optimized for blogs" },
  "1K": { multiplier: 1, cost: 0.02, label: "~1024px — Standard" },
  "2K": { multiplier: 1.5, cost: 0.04, label: "~1536px — High quality" },
  "4K": { multiplier: 2, cost: 0.08, label: "~2048px — Maximum" },
};

// Default configurations
export const DEFAULT_COVER_CONFIG: CoverImageConfig = {
  enabled: true,
  resolution: "1K",
  aspectRatio: "16:9",
};

export const DEFAULT_INLINE_CONFIG: InlineImageConfig = {
  enabled: true,
  count: 2,
  resolution: "Web",
  aspectRatio: "3:2",
};

export const DEFAULT_SPLIT_CONFIG: SplitImageConfig = {
  cover: DEFAULT_COVER_CONFIG,
  inline: DEFAULT_INLINE_CONFIG,
};

interface SplitImageGenerationSettingsProps {
  config: SplitImageConfig;
  onConfigChange: (config: SplitImageConfig) => void;
  defaults?: SplitImageDefaults;
  onSaveDefaults?: (defaults: SplitImageDefaults) => void;
  onResetToDefaults?: () => void;
  showSaveOption?: boolean;
  compact?: boolean;
  className?: string;
  imageModelId?: string;
}

export function SplitImageGenerationSettings({
  config,
  onConfigChange,
  defaults,
  onSaveDefaults,
  onResetToDefaults,
  showSaveOption = false,
  compact = false,
  className,
  imageModelId,
}: SplitImageGenerationSettingsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: imageModels = [] } = useImageModels();

  // Get constraints from selected model
  const constraints = useMemo(() => {
    if (!imageModelId) return undefined;
    return imageModels.find((m) => m.id === imageModelId)?.constraints ?? undefined;
  }, [imageModelId, imageModels]);

  const updateCover = (updates: Partial<CoverImageConfig>) => {
    onConfigChange({
      ...config,
      cover: { ...config.cover, ...updates },
    });
  };

  const updateInline = (updates: Partial<InlineImageConfig>) => {
    onConfigChange({
      ...config,
      inline: { ...config.inline, ...updates },
    });
  };

  // Calculate costs
  const coverCost = config.cover.enabled ? RESOLUTION_CONFIG[config.cover.resolution].cost : 0;
  const inlineCost = config.inline.enabled 
    ? config.inline.count * RESOLUTION_CONFIG[config.inline.resolution].cost 
    : 0;
  const totalCost = coverCost + inlineCost;

  // Generate summary text
  const getSummary = () => {
    const parts: string[] = [];
    if (config.cover.enabled) {
      parts.push(`1 cover (${config.cover.aspectRatio}, ${config.cover.resolution})`);
    }
    if (config.inline.enabled && config.inline.count > 0) {
      parts.push(`${config.inline.count} inline (${config.inline.aspectRatio}, ${config.inline.resolution})`);
    }
    if (parts.length === 0) return "No images";
    return parts.join(" + ");
  };

  const imagesEnabled = config.cover.enabled || config.inline.enabled;

  const handleSaveDefaults = () => {
    if (onSaveDefaults) {
      onSaveDefaults({
        cover: {
          enabled: config.cover.enabled,
          resolution: config.cover.resolution,
          aspectRatio: config.cover.aspectRatio,
        },
        inline: {
          enabled: config.inline.enabled,
          count: config.inline.count,
          resolution: config.inline.resolution,
          aspectRatio: config.inline.aspectRatio,
        },
      });
    }
  };

  const getPixelDimensions = (aspectRatio: AspectRatio, resolution: Resolution) => {
    const base = ASPECT_RATIO_PIXELS[aspectRatio];
    const multiplier = RESOLUTION_CONFIG[resolution].multiplier;
    let width = Math.round(base.width * multiplier);
    let height = Math.round(base.height * multiplier);

    // Clamp to model's max supported dimension
    const maxPx = constraints?.maxDimensionPx;
    if (maxPx && (width > maxPx || height > maxPx)) {
      const scale = maxPx / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    return { width, height };
  };

  if (compact) {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Header with summary */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
              <ImageIcon className="h-4 w-4 text-accent-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Generate Images</p>
              <p className="text-xs text-muted-foreground">
                {getSummary()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {imagesEnabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs gap-1 cursor-help">
                      <DollarSign className="h-3 w-3" />
                      ~${totalCost.toFixed(3)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <p>Cover: ${coverCost.toFixed(3)}</p>
                      <p>Inline: ${inlineCost.toFixed(3)}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Expandable Settings */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="text-sm">Image Settings</span>
              {settingsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <ImageSettingsTabs
              config={config}
              updateCover={updateCover}
              updateInline={updateInline}
              getPixelDimensions={getPixelDimensions}
              coverCost={coverCost}
              inlineCost={inlineCost}
              totalCost={totalCost}
              showSaveOption={showSaveOption}
              onSaveDefaults={handleSaveDefaults}
              onResetToDefaults={onResetToDefaults}
              defaults={defaults}
              constraints={constraints}
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Using defaults indicator */}
        {defaults && imagesEnabled && (
          <p className="text-xs text-muted-foreground text-center">
            Using your saved image defaults
          </p>
        )}
      </div>
    );
  }

  // Full settings view (for Settings page)
  return (
    <div className={cn("space-y-6", className)}>
      <ImageSettingsTabs
        config={config}
        updateCover={updateCover}
        updateInline={updateInline}
        getPixelDimensions={getPixelDimensions}
        coverCost={coverCost}
        inlineCost={inlineCost}
        totalCost={totalCost}
        showSaveOption={showSaveOption}
        onSaveDefaults={handleSaveDefaults}
        onResetToDefaults={onResetToDefaults}
        defaults={defaults}
        showCostSummary
        constraints={constraints}
      />
    </div>
  );
}

interface ImageSettingsTabsProps {
  config: SplitImageConfig;
  updateCover: (updates: Partial<CoverImageConfig>) => void;
  updateInline: (updates: Partial<InlineImageConfig>) => void;
  getPixelDimensions: (ar: AspectRatio, res: Resolution) => { width: number; height: number };
  coverCost: number;
  inlineCost: number;
  totalCost: number;
  showSaveOption?: boolean;
  onSaveDefaults?: () => void;
  onResetToDefaults?: () => void;
  defaults?: SplitImageDefaults;
  showCostSummary?: boolean;
  constraints?: ImageModelConstraints;
}

const ALL_RESOLUTIONS: Resolution[] = ["Web", "1K", "2K", "4K"];
const ALL_ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "16:9", label: "16:9 (Landscape) — Blog headers" },
  { value: "21:9", label: "21:9 (Ultrawide) — Banners" },
  { value: "3:2", label: "3:2 (Photo) — Classic" },
  { value: "4:3", label: "4:3 (Standard)" },
  { value: "5:4", label: "5:4 (Photo print)" },
  { value: "1:1", label: "1:1 (Square) — Social" },
  { value: "4:5", label: "4:5 (Portrait photo)" },
  { value: "2:3", label: "2:3 (Tall portrait)" },
  { value: "3:4", label: "3:4 (Portrait)" },
  { value: "9:16", label: "9:16 (Portrait) — Stories" },
];

function ImageSettingsTabs({
  config,
  updateCover,
  updateInline,
  getPixelDimensions,
  coverCost,
  inlineCost,
  totalCost,
  showSaveOption,
  onSaveDefaults,
  onResetToDefaults,
  defaults,
  showCostSummary,
  constraints,
}: ImageSettingsTabsProps) {
  const coverDimensions = getPixelDimensions(config.cover.aspectRatio, config.cover.resolution);
  const inlineDimensions = getPixelDimensions(config.inline.aspectRatio, config.inline.resolution);

  const availableResolutions = constraints?.resolutions || ALL_RESOLUTIONS;
  const availableAspectRatios = constraints?.aspectRatios
    ? ALL_ASPECT_RATIOS.filter((ar) => constraints.aspectRatios.includes(ar.value))
    : ALL_ASPECT_RATIOS;
  
  const constraintNote = constraints
    ? `This model supports ${availableResolutions.join("/")} resolution and ${constraints.aspectRatios.length} aspect ratios`
    : null;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="cover" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cover" className="gap-1.5">
            <LayoutTemplate className="h-4 w-4" />
            Cover Image
          </TabsTrigger>
          <TabsTrigger value="inline" className="gap-1.5">
            <ImagePlus className="h-4 w-4" />
            Inline Images
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cover" className="mt-4 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Generate Cover Image</Label>
              <p className="text-xs text-muted-foreground">Hero image for blog header</p>
            </div>
            <Switch
              checked={config.cover.enabled}
              onCheckedChange={(enabled) => updateCover({ enabled })}
            />
          </div>

          {config.cover.enabled && (
            <>
              {/* Resolution */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Resolution</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Higher resolution = better quality but higher cost</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {availableResolutions.map((res) => (
                    <button
                      key={res}
                      onClick={() => updateCover({ resolution: res })}
                      className={cn(
                        "p-2 rounded-lg border-2 text-center transition-all text-sm",
                        config.cover.resolution === res
                          ? "border-primary bg-accent"
                          : "border-border hover:border-muted-foreground/30"
                      )}
                    >
                      <p className="font-medium">{res}</p>
                      <p className="text-xs text-muted-foreground">
                        ${RESOLUTION_CONFIG[res].cost.toFixed(3)}
                      </p>
                    </button>
                  ))}
                </div>
                {availableResolutions.length === 1 && (
                  <p className="text-xs text-amber-600">This model only supports {availableResolutions[0]} resolution (~1024px)</p>
                )}
              </div>

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <Label>Aspect Ratio</Label>
                <Select
                  value={config.cover.aspectRatio}
                  onValueChange={(value: AspectRatio) => updateCover({ aspectRatio: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAspectRatios.map((ar) => (
                      <SelectItem key={ar.value} value={ar.value}>{ar.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {coverDimensions.width} × {coverDimensions.height}px
                </p>
              </div>

              {/* Cover Cost */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                <span className="text-muted-foreground">Cover cost</span>
                <span className="font-medium">${coverCost.toFixed(3)}</span>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="inline" className="mt-4 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Generate Inline Images</Label>
              <p className="text-xs text-muted-foreground">Images placed within post content</p>
            </div>
            <Switch
              checked={config.inline.enabled}
              onCheckedChange={(enabled) => updateInline({ enabled })}
            />
          </div>

          {config.inline.enabled && (
            <>
              {/* Image Count */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Number of Images</Label>
                  <span className="text-sm font-medium">{config.inline.count}</span>
                </div>
                <Slider
                  value={[config.inline.count]}
                  onValueChange={([count]) => updateInline({ count })}
                  min={0}
                  max={5}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span>2</span>
                  <span>5</span>
                </div>
              </div>

              {config.inline.count > 0 && (
                <>
                  {/* Resolution */}
                  <div className="space-y-2">
                    <Label>Resolution</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {availableResolutions.map((res) => (
                        <button
                          key={res}
                          onClick={() => updateInline({ resolution: res })}
                          className={cn(
                            "p-2 rounded-lg border-2 text-center transition-all text-sm",
                            config.inline.resolution === res
                              ? "border-primary bg-accent"
                              : "border-border hover:border-muted-foreground/30"
                          )}
                        >
                          <p className="font-medium">{res}</p>
                          <p className="text-xs text-muted-foreground">
                            ${RESOLUTION_CONFIG[res].cost.toFixed(3)}
                          </p>
                        </button>
                      ))}
                    </div>
                    {availableResolutions.length === 1 && (
                      <p className="text-xs text-amber-600">This model only supports {availableResolutions[0]} resolution (~1024px)</p>
                    )}
                  </div>

                  {/* Aspect Ratio */}
                  <div className="space-y-2">
                    <Label>Aspect Ratio</Label>
                    <Select
                      value={config.inline.aspectRatio}
                      onValueChange={(value: AspectRatio) => updateInline({ aspectRatio: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAspectRatios.map((ar) => (
                          <SelectItem key={ar.value} value={ar.value}>{ar.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {inlineDimensions.width} × {inlineDimensions.height}px each
                    </p>
                  </div>
                </>
              )}

              {/* Inline Cost */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                <span className="text-muted-foreground">
                  Inline cost ({config.inline.count} × ${RESOLUTION_CONFIG[config.inline.resolution].cost.toFixed(2)})
                </span>
                <span className="font-medium">${inlineCost.toFixed(3)}</span>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Total Cost Summary */}
      {showCostSummary && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-accent/50 border border-border">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Total Estimated Cost</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-semibold cursor-help">${totalCost.toFixed(3)}</span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <p>Cover: ${coverCost.toFixed(3)}</p>
                  <p>Inline ({config.inline.count}): ${inlineCost.toFixed(3)}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {showSaveOption && onSaveDefaults && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSaveDefaults}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            Save as Defaults
          </Button>
        )}
        {defaults && onResetToDefaults && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetToDefaults}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </Button>
        )}
      </div>
    </div>
  );
}

// Legacy exports for backwards compatibility
export interface ImageConfig {
  enabled: boolean;
  count: number;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  advancedOptions?: {
    fontStyle?: string;
    superResRef?: string;
  };
}

export interface ImageDefaults {
  count: number;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  advancedOptions?: Record<string, unknown>;
}

// Helper to convert legacy config to new split config
export function legacyToSplitConfig(legacy: ImageConfig): SplitImageConfig {
  return {
    cover: {
      enabled: legacy.enabled,
      resolution: legacy.resolution,
      aspectRatio: legacy.aspectRatio,
    },
    inline: {
      enabled: legacy.enabled && legacy.count > 1,
      count: Math.max(0, legacy.count - 1),
      resolution: legacy.resolution,
      aspectRatio: "3:2",
    },
  };
}

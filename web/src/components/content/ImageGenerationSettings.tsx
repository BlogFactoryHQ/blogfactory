import { useState } from "react";
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

export interface CoverImageConfig {
  enabled: boolean;
}

export interface InlineImageConfig {
  enabled: boolean;
  count: number;
}

export interface SplitImageConfig {
  cover: CoverImageConfig;
  inline: InlineImageConfig;
}

export const DEFAULT_COVER_CONFIG: CoverImageConfig = {
  enabled: true,
};

export const DEFAULT_INLINE_CONFIG: InlineImageConfig = {
  enabled: true,
  count: 2,
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
}

export function SplitImageGenerationSettings({
  config,
  onConfigChange,
  compact = false,
  className,
  inlineImageSource = "ai",
}: SplitImageGenerationSettingsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const updateCover = (updates: Partial<CoverImageConfig>) => {
    onConfigChange({ ...config, cover: { ...config.cover, ...updates } });
  };

  const updateInline = (updates: Partial<InlineImageConfig>) => {
    onConfigChange({ ...config, inline: { ...config.inline, ...updates } });
  };

  const inlineCostLabel = !config.inline.enabled || config.inline.count === 0
    ? "Off"
    : inlineImageSource === "stock"
    ? "Stock providers"
    : "AI";
  const imagesEnabled = config.cover.enabled || (config.inline.enabled && config.inline.count > 0);
  const inlineSummary = config.inline.enabled && config.inline.count > 0
    ? `${config.inline.count} inline ${inlineImageSource === "stock" ? "stock" : "AI"}`
    : "";
  const summary = [
    config.cover.enabled ? "Cover AI" : "",
    inlineSummary,
  ].filter(Boolean).join(" · ") || "No images";

  const controls = (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label>Cover Image</Label>
          <p className="text-xs text-muted-foreground">{config.cover.enabled ? "AI" : "Off"}</p>
        </div>
        <Switch checked={config.cover.enabled} onCheckedChange={(enabled) => updateCover({ enabled })} />
      </div>

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

    </div>
  );

  if (!compact) return <div className={cn("space-y-4", className)}>{controls}</div>;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
            <ImageIcon className="h-4 w-4 text-accent-foreground" />
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
                  {inlineImageSource === "stock" ? "Cover AI + inline stock" : "AI images"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  <p>Cover: {config.cover.enabled ? "AI" : "Off"}</p>
                  <p>Inline: {inlineCostLabel}</p>
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

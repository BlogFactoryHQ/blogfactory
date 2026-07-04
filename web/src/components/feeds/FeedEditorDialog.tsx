import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Link as LinkIcon,
  Play,
  Loader2,
  Trash2,
  Settings2,
  Rss,
  Zap,
  Clock,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { FREQUENCIES } from "@/lib/mock-data";
import { useTextModels } from "@/hooks/useTextModels";
import { LiveTextModelSelect, isUnavailableModel } from "@/components/content/LiveTextModelSelect";
import { format } from "date-fns";
import { normalizeHttpUrl, stripHttpProtocol } from "@/lib/url-validation";
import {
  SplitImageGenerationSettings,
  SplitImageConfig,
  DEFAULT_SPLIT_CONFIG,
  type InlineImageSource,
} from "@/components/content/ImageGenerationSettings";

interface Feed {
  id: string;
  name: string;
  source_url: string;
  keywords: string[] | null;
  persona_id: string | null;
  model_id: string;
  frequency: string;
  is_active: boolean;
  created_at: string;
  last_run_at: string | null;
  total_articles: number | null;
  platform?: string;
  filter_type?: string;
  filter_value?: number;
  platform_config?: Record<string, any>;
  extract_full_content?: boolean;
  posts_per_run?: number | null;
  filter_old_posts_days?: number | null;
}

interface Persona {
  id: string;
  name: string;
  status: string;
  base_model: string;
}

interface FeedEditorDialogProps {
  feed: Feed | null;
  personas: Persona[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (feed: Feed) => void;
  onRunNow: (feed: Feed, imageConfig?: SplitImageConfig) => void;
  onDelete: (feed: Feed) => void;
  isSaving: boolean;
  isRunning: boolean;
  isDeleting: boolean;
  defaultImageConfig?: SplitImageConfig;
  inlineImageSource?: InlineImageSource;
}

const POSTS_PER_RUN_OPTIONS = [1, 3, 5, 10, 15, 20];

export function FeedEditorDialog({
  feed,
  personas,
  isOpen,
  onClose,
  onSave,
  onRunNow,
  onDelete,
  isSaving,
  isRunning,
  isDeleting,
  defaultImageConfig,
  inlineImageSource = "ai",
}: FeedEditorDialogProps) {
  const { data: textModels = [] } = useTextModels();
  const [editedFeed, setEditedFeed] = useState<Feed | null>(null);
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);

  // Sync local state when dialog opens with a feed
  useEffect(() => {
    if (isOpen && feed) {
      setEditedFeed({ ...feed, source_url: stripHttpProtocol(feed.source_url) });
      setImageConfig(defaultImageConfig ?? DEFAULT_SPLIT_CONFIG);
    } else if (!isOpen) {
      setEditedFeed(null);
    }
  }, [isOpen, feed?.id, defaultImageConfig]);

  if (!editedFeed) return null;
  const selectedModelUnavailable = isUnavailableModel(editedFeed.model_id, textModels);

  const handleSave = () => {
    if (selectedModelUnavailable) return;
    onSave({ ...editedFeed, source_url: normalizeHttpUrl(editedFeed.source_url) });
  };

  const handleRunNow = () => {
    if (selectedModelUnavailable) return;
    onRunNow({ ...editedFeed, source_url: normalizeHttpUrl(editedFeed.source_url) }, imageConfig);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rss className="h-5 w-5 text-primary" />
            Edit Feed Details
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="px-6 py-6 space-y-6">
            {/* Basic Info Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Rss className="h-4 w-4" />
                Feed Information
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="feedName">Feed Name</Label>
                  <Input
                    id="feedName"
                    value={editedFeed.name}
                    onChange={(e) =>
                      setEditedFeed({ ...editedFeed, name: e.target.value })
                    }
                    placeholder="My RSS Feed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Internal display name for the dashboard.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sourceUrl">Source URL</Label>
                  <InputAffordance
                    id="sourceUrl"
                    type="text"
                    inputMode="url"
                    prefix="https://"
                    icon={LinkIcon}
                    value={editedFeed.source_url}
                    onChange={(e) =>
                      setEditedFeed({ ...editedFeed, source_url: stripHttpProtocol(e.target.value) })
                    }
                    placeholder="example.com/feed.xml"
                    help="Paste the feed URL. BlogFactory adds HTTPS when you omit it."
                    onClear={() => setEditedFeed({ ...editedFeed, source_url: "" })}
                    clearLabel="Clear source URL"
                  />
                </div>
              </div>

            </section>

            <Separator />

            {/* AI Configuration Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Zap className="h-4 w-4" />
                AI Configuration
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Writer Persona</Label>
                  <Select
                    value={editedFeed.persona_id || "none"}
                    onValueChange={(v) => {
                      const personaId = v === "none" ? null : v;
                      const selectedPersona = personas.find((p) => p.id === personaId);
                      
                      // Auto-apply persona's base model when persona is selected
                      const newModelId = selectedPersona?.base_model || editedFeed.model_id;
                      
                      setEditedFeed({ 
                        ...editedFeed, 
                        persona_id: personaId,
                        model_id: newModelId,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select persona..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Persona</SelectItem>
                      {personas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determines the tone and style of generated drafts.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>OpenRouter Text Model</Label>
                  <LiveTextModelSelect
                    value={editedFeed.model_id}
                    onValueChange={(v) => setEditedFeed({ ...editedFeed, model_id: v })}
                  />
                  {selectedModelUnavailable && (
                    <p className="text-xs text-destructive">Unavailable: {editedFeed.model_id}. Pick a live OpenRouter model.</p>
                  )}
                  {(() => {
                    const selectedPersona = personas.find((p) => p.id === editedFeed.persona_id);
                    if (selectedPersona && editedFeed.model_id !== selectedPersona.base_model) {
                      return (
                        <p className="text-xs text-amber-600">
                          Custom model selected (overrides persona default)
                        </p>
                      );
                    }
                    if (selectedPersona && editedFeed.model_id === selectedPersona.base_model) {
                      return (
                        <p className="text-xs text-muted-foreground">
                          Defaulted from selected persona
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </section>

            <Separator />

            {/* Scheduling Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Scheduling & Limits
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fetch Frequency</Label>
                  <Select
                    value={editedFeed.frequency}
                    onValueChange={(v) =>
                      setEditedFeed({ ...editedFeed, frequency: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((freq) => (
                        <SelectItem key={freq.id} value={freq.id}>
                          {freq.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Posts per Run</Label>
                  <Select
                    value={String(editedFeed.posts_per_run ?? 5)}
                    onValueChange={(v) =>
                      setEditedFeed({ ...editedFeed, posts_per_run: parseInt(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSTS_PER_RUN_OPTIONS.map((num) => (
                        <SelectItem key={num} value={String(num)}>
                          {num} {num === 1 ? "post" : "posts"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Limits how many new posts are generated per fetch.
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            {/* Image Generation Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Image Generation
              </h3>
              <SplitImageGenerationSettings
                config={imageConfig}
                onConfigChange={setImageConfig}
                compact
                inlineImageSource={inlineImageSource}
              />
            </section>

            <Separator />

            {/* Advanced Options Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Advanced Options
              </h3>

              <div className="space-y-4">
                {/* Freshness Filter - Context-specific label */}
                <div className="rounded-md border border-border bg-muted/50 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {editedFeed.platform === "youtube" ? "Filter Old Videos" : "Filter Old Posts"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {editedFeed.platform === "youtube" 
                          ? "Only process videos published in the last N days"
                          : "Exclude posts older than N days"}
                      </p>
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g., 7 (leave empty for no filter)"
                    value={editedFeed.filter_old_posts_days ?? ""}
                    onChange={(e) =>
                      setEditedFeed({ 
                        ...editedFeed, 
                        filter_old_posts_days: e.target.value ? parseInt(e.target.value) : null 
                      })
                    }
                    className="max-w-[200px]"
                  />
                </div>

                {editedFeed.platform === "rss" && (
                  <>
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Full-Text Extraction</p>
                          <p className="text-sm text-muted-foreground">
                            Fetch complete article content from URLs
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={editedFeed.extract_full_content ?? false}
                        onCheckedChange={(checked) =>
                          setEditedFeed({ ...editedFeed, extract_full_content: checked })
                        }
                      />
                    </div>

                  </>
                )}

                <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-status-success/10">
                      <Zap className="h-4 w-4 text-status-success" />
                    </div>
                    <div>
                      <p className="font-medium">Active Status</p>
                      <p className="text-sm text-muted-foreground">
                        {editedFeed.is_active ? "Feed is actively collecting data" : "Data collection is paused"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={editedFeed.is_active}
                    onCheckedChange={(checked) =>
                      setEditedFeed({ ...editedFeed, is_active: checked })
                    }
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Statistics Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Statistics
              </h3>

              {(() => {
                const freqMs: Record<string, number> = {
                  hourly: 3600000,
                  every_4_hours: 14400000,
                  every_12_hours: 43200000,
                  daily: 86400000,
                  weekly: 604800000,
                };
                const interval = freqMs[editedFeed.frequency] ?? 86400000;
                const nextRun = editedFeed.last_run_at && editedFeed.is_active
                  ? new Date(new Date(editedFeed.last_run_at).getTime() + interval)
                  : null;
                const isPast = nextRun && nextRun <= new Date();

                return (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium mt-1">
                        {format(new Date(editedFeed.created_at), "MMM d, yyyy")}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Last Run</p>
                      <p className="font-medium mt-1">
                        {editedFeed.last_run_at
                          ? format(new Date(editedFeed.last_run_at), "MMM d, h:mm a")
                          : "Never"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Next Run</p>
                      <p className={`font-medium mt-1 ${isPast ? "text-amber-600" : ""}`}>
                        {!editedFeed.is_active
                          ? "Paused"
                          : nextRun
                            ? isPast
                              ? "Due now"
                              : format(nextRun, "MMM d, h:mm a")
                            : "On next cycle"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm text-muted-foreground">Total Articles</p>
                      <p className="font-medium mt-1">
                        {editedFeed.total_articles?.toLocaleString() ?? 0}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between w-full gap-3">
            <Button
              variant="destructive"
              size="icon"
              onClick={() => onDelete(editedFeed)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleRunNow}
                disabled={isRunning || !editedFeed.persona_id || selectedModelUnavailable}
                className="gap-2"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run Now
              </Button>

              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>

              <Button onClick={handleSave} disabled={isSaving || selectedModelUnavailable}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

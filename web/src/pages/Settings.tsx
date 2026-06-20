import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  Zap,
  Image as ImageIcon,
  Save,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import { useImageModels, type LiveImageModel } from "@/hooks/useImageModels";
import { useTextModels, type LiveTextModel } from "@/hooks/useTextModels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SplitImageGenerationSettings,
  SplitImageConfig,
  SplitImageDefaults,
  DEFAULT_SPLIT_CONFIG,
  Resolution,
  AspectRatio
} from "@/components/content/ImageGenerationSettings";

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [imageStylePrompt, setImageStylePrompt] = useState(
    "Professional, modern, clean style. High quality, suitable for a tech/business blog. No text overlays."
  );
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);
  const [selectedImageModel, setSelectedImageModel] = useState("google/gemini-2.5-flash-image");
  const { data: imageModels = [], isLoading: imageModelsLoading } = useImageModels();
  const { data: textModels = [], isLoading: textModelsLoading } = useTextModels();

  // Fetch user settings
  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      return api.get<any>("/settings");
    },
    enabled: !!user,
  });

  // Update local state when settings load
  useEffect(() => {
    if (userSettings) {
      if (userSettings.image_style_prompt) {
        setImageStylePrompt(userSettings.image_style_prompt);
      }
      setImageConfig({
        cover: {
          enabled: userSettings.cover_enabled ?? true,
          resolution: (userSettings.cover_resolution as Resolution) || "1K",
          aspectRatio: (userSettings.cover_aspect_ratio as AspectRatio) || "16:9",
        },
        inline: {
          enabled: userSettings.inline_enabled ?? true,
          count: userSettings.inline_count || 2,
          resolution: (userSettings.inline_resolution as Resolution) || "Web",
          aspectRatio: (userSettings.inline_aspect_ratio as AspectRatio) || "3:2",
        },
      });
      if (userSettings.image_model) {
        setSelectedImageModel(userSettings.image_model);
      }
    }
  }, [userSettings]);

  // Save image model mutation
  const saveImageModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      await api.put("/settings", { image_model: modelId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Image model saved!");
    },
    onError: () => toast.error("Failed to save image model"),
  });

  // Save style prompt mutation
  const saveStyleMutation = useMutation({
    mutationFn: async (newPrompt: string) => {
      await api.put("/settings", { image_style_prompt: newPrompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Style prompt saved!");
    },
    onError: (err) => {
      console.error("Save settings error:", err);
      toast.error("Failed to save settings");
    },
  });

  // Save image defaults mutation
  const saveDefaultsMutation = useMutation({
    mutationFn: async (defaults: SplitImageDefaults) => {
      await api.put("/settings", {
        cover_enabled: defaults.cover.enabled,
        cover_resolution: defaults.cover.resolution,
        cover_aspect_ratio: defaults.cover.aspectRatio,
        inline_enabled: defaults.inline.enabled,
        inline_count: defaults.inline.count,
        inline_resolution: defaults.inline.resolution,
        inline_aspect_ratio: defaults.inline.aspectRatio,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Image defaults saved!");
    },
    onError: (err) => {
      console.error("Save defaults error:", err);
      toast.error("Failed to save defaults");
    },
  });

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="Settings"
        description="Configure image generation models, defaults, and style preferences."
      />

      <Tabs defaultValue="openrouter" className="max-w-4xl">
        <TabsList>
          <TabsTrigger value="openrouter" className="gap-1.5">
            <Zap className="h-4 w-4" />
            OpenRouter
          </TabsTrigger>
        </TabsList>

        <TabsContent value="openrouter" className="mt-6 space-y-6">
          {/* Image Generation Model */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Image Generation Model
              </CardTitle>
              <CardDescription>
                Select which AI model to use for generating blog images
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Model</Label>
                <Select value={selectedImageModel} onValueChange={setSelectedImageModel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex items-center gap-2">
                          <span>{model.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            model.pricing === "free"
                              ? "bg-primary/10 text-primary"
                              : model.pricing === "low"
                              ? "bg-[hsl(var(--status-success)/0.12)] text-status-success"
                              : model.pricing === "medium"
                              ? "bg-accent text-accent-foreground"
                              : "bg-destructive/10 text-destructive"
                          }`}>
                            {model.pricing === "free" ? "FREE" : model.pricing === "low" ? "$" : model.pricing === "medium" ? "$$" : "$$$"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected model details */}
              {(() => {
                const model = imageModels.find(m => m.id === selectedImageModel);
                if (!model) return null;
                return (
                  <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{model.provider}</span>
                      <span className="text-xs font-mono text-muted-foreground">{model.costInfo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{model.description}</p>
                    {model.isFree && model.limits && (
                      <p className="text-xs text-primary font-medium">⚡ {model.limits}</p>
                    )}
                    {model.constraints && (
                      <p className="text-xs text-muted-foreground">
                        Resolutions: {model.constraints.resolutions.join(", ")} · Max {model.constraints.maxDimensionPx}px
                      </p>
                    )}
                  </div>
                );
              })()}

              <Button
                onClick={() => saveImageModelMutation.mutate(selectedImageModel)}
                disabled={saveImageModelMutation.isPending}
                size="sm"
              >
                {saveImageModelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Model
              </Button>
            </CardContent>
          </Card>

          {/* Image Generation Defaults */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Image Generation Defaults
              </CardTitle>
              <CardDescription>
                Set default image count, resolution, and aspect ratio for all generations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SplitImageGenerationSettings
                config={imageConfig}
                onConfigChange={setImageConfig}
                onSaveDefaults={(defaults) => saveDefaultsMutation.mutate(defaults)}
                showSaveOption
                imageModelId={selectedImageModel}
              />
              {saveDefaultsMutation.isPending && (
                <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Saving...</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image Style Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Image Style Prompt
              </CardTitle>
              <CardDescription>
                Customize the style description appended to all image generation prompts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="imageStyle">Style Prompt</Label>
                <Textarea
                  id="imageStyle"
                  placeholder="Describe the style for generated images..."
                  value={imageStylePrompt}
                  onChange={(e) => setImageStylePrompt(e.target.value)}
                  className="min-h-[100px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  This style will be appended to all image generation prompts.
                </p>
              </div>
              <Button
                onClick={() => saveStyleMutation.mutate(imageStylePrompt)}
                disabled={saveStyleMutation.isPending || settingsLoading}
              >
                {saveStyleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Style
              </Button>
            </CardContent>
          </Card>

          {/* OpenRouter Models Info */}
          <Card>
            <CardHeader>
              <CardTitle>Available Models & Pricing</CardTitle>
              <CardDescription>
                Text and image generation models with approximate costs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Image Generation Models */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Image Generation
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {imageModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-start justify-between p-3 rounded-lg border border-border"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{model.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                            model.pricing === "free"
                              ? "bg-primary/10 text-primary"
                              : model.pricing === "low"
                              ? "bg-[hsl(var(--status-success)/0.12)] text-status-success"
                              : model.pricing === "medium"
                              ? "bg-accent text-accent-foreground"
                              : "bg-destructive/10 text-destructive"
                          }`}>
                            {model.pricing === "free" ? "FREE" : model.pricing === "low" ? "$" : model.pricing === "medium" ? "$$" : "$$$"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{model.description}</p>
                        {model.constraints && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {model.constraints.resolutions.join("/")} · Max {model.constraints.maxDimensionPx}px
                          </p>
                        )}
                        {model.isFree && model.limits && (
                          <p className="text-xs text-primary mt-0.5">⚡ {model.limits}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        {model.costInfo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Text Generation Models */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Text Generation
                </h4>
                {textModelsLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Loading models...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {textModels.map((model) => (
                      <div
                        key={model.id}
                        className="flex flex-col gap-2 p-3 rounded-lg border border-border"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{model.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            model.pricing === "free"
                              ? "bg-primary/10 text-primary"
                              : model.pricing === "low"
                              ? "bg-[hsl(var(--status-success)/0.12)] text-status-success"
                              : model.pricing === "medium"
                              ? "bg-accent text-accent-foreground"
                              : "bg-destructive/10 text-destructive"
                          }`}>
                            {model.pricing === "free" ? "FREE" : model.pricing === "low" ? "$" : model.pricing === "medium" ? "$$" : "$$$"}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {model.costInfo}
                        </span>
                        {model.limits && (
                          <span className="text-xs text-muted-foreground italic">{model.limits}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Browse all models at{" "}
                <a
                  href="https://openrouter.ai/models"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  openrouter.ai/models
                </a>
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

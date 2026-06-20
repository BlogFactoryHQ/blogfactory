import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  Zap,
  Image as ImageIcon,
  KeyRound,
  Save,
  FileText,
  Trash2,
  RefreshCw,
  Search,
  Brain,
  SlidersHorizontal,
  Building2,
  MessageSquare,
  ShieldCheck,
  ImagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { fetchImageModels, useImageModels, type LiveImageModel } from "@/hooks/useImageModels";
import { fetchTextModels, useTextModels, type LiveTextModel } from "@/hooks/useTextModels";
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
import {
  BywordCard,
  BywordPageShell,
  IconTile,
  SectionHeader,
  SettingNavItem,
} from "@/components/layout/BywordSurface";

interface ApiKeyMetadata {
  hasOpenrouterKey: boolean;
  openrouterKeyLast4: string | null;
  hasGoogleAiKey: boolean;
  googleKeyLast4: string | null;
  updatedAt: string | null;
}

interface UserSettings {
  image_style_prompt?: string | null;
  image_model?: string | null;
  cover_enabled?: boolean | null;
  cover_resolution?: string | null;
  cover_aspect_ratio?: string | null;
  inline_enabled?: boolean | null;
  inline_count?: number | null;
  inline_resolution?: string | null;
  inline_aspect_ratio?: string | null;
}

type ModelPriceFilter = "all" | "free" | "low" | "medium" | "high";

const priceBadgeClass = (pricing: ModelPriceFilter) => {
  if (pricing === "free") return "bg-primary/10 text-primary";
  if (pricing === "low") return "bg-[hsl(var(--status-success)/0.12)] text-status-success";
  if (pricing === "medium") return "bg-accent text-accent-foreground";
  return "bg-destructive/10 text-destructive";
};

const priceBadgeText = (pricing: ModelPriceFilter) => {
  if (pricing === "free") return "FREE";
  if (pricing === "low") return "$";
  if (pricing === "medium") return "$$";
  return "$$$";
};

const formatContextLength = (contextLength: number | null) => {
  if (!contextLength) return "Context unknown";
  if (contextLength >= 1_000_000) return `${(contextLength / 1_000_000).toFixed(1).replace(".0", "")}M context`;
  if (contextLength >= 1_000) return `${Math.round(contextLength / 1_000)}K context`;
  return `${contextLength.toLocaleString()} context`;
};

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [imageStylePrompt, setImageStylePrompt] = useState(
    "Professional, modern, clean style. High quality, suitable for a tech/business blog. No text overlays."
  );
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);
  const [selectedImageModel, setSelectedImageModel] = useState("google/gemini-2.5-flash-image");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState<ModelPriceFilter>("all");
  const [activeSection, setActiveSection] = useState("api-keys");
  const { data: imageModels = [], isLoading: imageModelsLoading } = useImageModels();
  const { data: textModels = [], isLoading: textModelsLoading } = useTextModels();

  const modelProviders = useMemo(() => {
    const providers = new Set([...imageModels, ...textModels].map((model) => model.provider).filter(Boolean));
    return Array.from(providers).sort((a, b) => a.localeCompare(b));
  }, [imageModels, textModels]);

  const modelMatchesFilters = useCallback((model: LiveImageModel | LiveTextModel) => {
    const query = modelSearch.trim().toLowerCase();
    const matchesSearch = !query || [model.name, model.id, model.provider, model.description]
      .some((value) => value?.toLowerCase().includes(query));
    const matchesProvider = providerFilter === "all" || model.provider === providerFilter;
    const matchesPrice = priceFilter === "all" || model.pricing === priceFilter;
    return matchesSearch && matchesProvider && matchesPrice;
  }, [modelSearch, providerFilter, priceFilter]);

  const filteredImageModels = useMemo(
    () => imageModels.filter(modelMatchesFilters),
    [imageModels, modelMatchesFilters]
  );

  const filteredTextModels = useMemo(
    () => textModels.filter(modelMatchesFilters),
    [textModels, modelMatchesFilters]
  );

  // Fetch user settings
  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      return api.get<UserSettings>("/settings");
    },
    enabled: !!user,
  });

  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKeyMetadata>("/settings/api-keys"),
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

  const saveApiKeyMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: "openrouter" | "google"; apiKey: string }) =>
      api.put<ApiKeyMetadata>("/settings/api-keys", { provider, apiKey }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["image-models"] });
      queryClient.invalidateQueries({ queryKey: ["text-models"] });
      if (variables.provider === "openrouter") setOpenrouterKey("");
      if (variables.provider === "google") setGoogleKey("");
      toast.success("API key saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: (provider: "openrouter" | "google") => api.delete<ApiKeyMetadata>(`/settings/api-keys?provider=${provider}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["image-models"] });
      queryClient.invalidateQueries({ queryKey: ["text-models"] });
      toast.success("API key deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const refreshModelsMutation = useMutation({
    mutationFn: async () => {
      const [images, texts] = await Promise.all([
        fetchImageModels(true),
        fetchTextModels(true),
      ]);
      return { images, texts };
    },
    onSuccess: ({ images, texts }) => {
      queryClient.setQueryData(["image-models"], images);
      queryClient.setQueryData(["text-models"], texts);
      toast.success("OpenRouter model information refreshed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const settingsSections = [
    { id: "api-keys", title: "API Keys", description: "Provider access", icon: KeyRound },
    { id: "models", title: "Models", description: "Live pricing, filters", icon: Zap },
    { id: "images", title: "Images", description: "Defaults, style", icon: ImageIcon },
    { id: "brand", title: "Brand & Voice", description: "Identity scaffolding", icon: MessageSquare },
    { id: "advanced", title: "Advanced", description: "Controls, safety", icon: SlidersHorizontal },
  ];

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Article Settings"
        description="Default configuration for generated articles."
      />

      <div className="grid gap-8 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-lg border border-byword-border bg-card">
          {settingsSections.map((section) => (
            <SettingNavItem
              key={section.id}
              icon={section.icon}
              title={section.title}
              description={section.description}
              active={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
            />
          ))}
        </aside>

        <div className="min-w-0 space-y-6">
          {activeSection === "api-keys" && (
            <BywordCard>
              <SectionHeader
                icon={KeyRound}
                title="API Keys"
                description="Store your own provider keys for beta usage. Keys are encrypted and never shown again."
              />
              <div className="grid gap-6 p-6 md:grid-cols-2">
                <div className="space-y-3 rounded-lg border border-byword-border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="openrouter-key">OpenRouter</Label>
                    <Badge variant={apiKeys?.hasOpenrouterKey ? "default" : "secondary"}>
                      {apiKeys?.hasOpenrouterKey ? `Saved ****${apiKeys.openrouterKeyLast4}` : "Missing"}
                    </Badge>
                  </div>
                  <Input
                    id="openrouter-key"
                    type="password"
                    placeholder="sk-or-..."
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveApiKeyMutation.mutate({ provider: "openrouter", apiKey: openrouterKey })}
                      disabled={!openrouterKey || saveApiKeyMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKeyMutation.mutate("openrouter")}
                      disabled={!apiKeys?.hasOpenrouterKey || deleteApiKeyMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-byword-border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="google-key">Google Gemini Image</Label>
                    <Badge variant={apiKeys?.hasGoogleAiKey ? "default" : "secondary"}>
                      {apiKeys?.hasGoogleAiKey ? `Saved ****${apiKeys.googleKeyLast4}` : "Missing"}
                    </Badge>
                  </div>
                  <Input
                    id="google-key"
                    type="password"
                    placeholder="Google AI Studio API key"
                    value={googleKey}
                    onChange={(e) => setGoogleKey(e.target.value)}
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveApiKeyMutation.mutate({ provider: "google", apiKey: googleKey })}
                      disabled={!googleKey || saveApiKeyMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKeyMutation.mutate("google")}
                      disabled={!apiKeys?.hasGoogleAiKey || deleteApiKeyMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </BywordCard>
          )}

          {activeSection === "models" && (
            <BywordCard>
              <SectionHeader
                icon={Zap}
                title="Available Models & Pricing"
                description="Live OpenRouter metadata. The app caches this list and refreshes it only when you ask."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshModelsMutation.mutate()}
                    disabled={refreshModelsMutation.isPending || !apiKeys?.hasOpenrouterKey}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshModelsMutation.isPending ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                }
              />
              <div className="space-y-6 p-6">
                <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={modelSearch}
                      onChange={(event) => setModelSearch(event.target.value)}
                      placeholder="Search models, providers, or IDs"
                      className="pl-9"
                    />
                  </div>
                  <Select value={providerFilter} onValueChange={setProviderFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All providers</SelectItem>
                      {modelProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={priceFilter} onValueChange={(value) => setPriceFilter(value as ModelPriceFilter)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Price" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All prices</SelectItem>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="low">$ Low</SelectItem>
                      <SelectItem value="medium">$$ Medium</SelectItem>
                      <SelectItem value="high">$$$ High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                  Showing {filteredImageModels.length} image models and {filteredTextModels.length} text models.
                </p>

                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ImageIcon className="h-4 w-4" />
                    Image Generation
                  </h4>
                  {imageModelsLoading ? (
                    <div className="py-4 text-center text-muted-foreground">Loading models...</div>
                  ) : filteredImageModels.length === 0 ? (
                    <div className="py-4 text-center text-muted-foreground">No image models match these filters.</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {filteredImageModels.map((model) => (
                        <div key={model.id} className="flex items-start justify-between rounded-lg border border-byword-border p-3">
                          <div className="mr-3 min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{model.name}</span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${priceBadgeClass(model.pricing)}`}>
                                {priceBadgeText(model.pricing)}
                              </span>
                            </div>
                            <p className="mb-1 font-mono text-xs text-muted-foreground">{model.id}</p>
                            <p className="line-clamp-1 text-xs text-muted-foreground">{model.description}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {model.provider} · {formatContextLength(model.contextLength)}
                            </p>
                            {model.constraints && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {model.constraints.resolutions.join("/")} · Max {model.constraints.maxDimensionPx}px
                              </p>
                            )}
                            {model.isFree && model.limits && (
                              <p className="mt-0.5 text-xs text-primary">{model.limits}</p>
                            )}
                          </div>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {model.costInfo}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4" />
                    Text Generation
                  </h4>
                  {textModelsLoading ? (
                    <div className="py-4 text-center text-muted-foreground">Loading models...</div>
                  ) : filteredTextModels.length === 0 ? (
                    <div className="py-4 text-center text-muted-foreground">No text models match these filters.</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {filteredTextModels.map((model) => (
                        <div key={model.id} className="flex flex-col gap-2 rounded-lg border border-byword-border p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{model.name}</span>
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${priceBadgeClass(model.pricing)}`}>
                              {priceBadgeText(model.pricing)}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">{model.id}</span>
                          <span className="font-mono text-xs text-muted-foreground">{model.costInfo}</span>
                          <span className="text-xs text-muted-foreground">
                            {model.provider} · {formatContextLength(model.contextLength)}
                          </span>
                          {model.limits && (
                            <span className="text-xs italic text-muted-foreground">{model.limits}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </BywordCard>
          )}

          {activeSection === "images" && (
            <div className="space-y-6">
              <BywordCard>
                <SectionHeader
                  icon={ImageIcon}
                  title="Image Generation Model"
                  description="Select which AI model to use for generated blog images."
                />
                <div className="space-y-4 p-6">
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
                              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${priceBadgeClass(model.pricing)}`}>
                                {priceBadgeText(model.pricing)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(() => {
                    const model = imageModels.find(m => m.id === selectedImageModel);
                    if (!model) return null;
                    return (
                      <div className="space-y-1.5 rounded-lg border border-byword-border bg-muted/30 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium">{model.provider}</span>
                          <span className="font-mono text-xs text-muted-foreground">{model.costInfo}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
                        {model.isFree && model.limits && (
                          <p className="text-xs font-medium text-primary">{model.limits}</p>
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Model
                  </Button>
                </div>
              </BywordCard>

              <BywordCard>
                <SectionHeader
                  icon={ImagePlus}
                  title="Image Defaults"
                  description="Set default image count, resolution, and aspect ratio for all generations."
                />
                <div className="p-6">
                  <SplitImageGenerationSettings
                    config={imageConfig}
                    onConfigChange={setImageConfig}
                    onSaveDefaults={(defaults) => saveDefaultsMutation.mutate(defaults)}
                    showSaveOption
                    imageModelId={selectedImageModel}
                  />
                  {saveDefaultsMutation.isPending && (
                    <div className="mt-4 flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Saving...</span>
                    </div>
                  )}
                </div>
              </BywordCard>

              <BywordCard>
                <SectionHeader
                  icon={ImageIcon}
                  title="Image Style Prompt"
                  description="Customize the style description appended to all image generation prompts."
                />
                <div className="space-y-4 p-6">
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Style
                  </Button>
                </div>
              </BywordCard>
            </div>
          )}

          {activeSection === "brand" && (
            <BywordCard>
              <SectionHeader
                icon={Building2}
                title="Brand & Voice"
                description="First-pass scaffolding for brand profile and writing voice."
              />
              <div className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input placeholder="e.g. BlogFactory" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Input placeholder="e.g. founders, editors, agencies" disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>What We Do</Label>
                  <Textarea
                    placeholder="Brief description of products, services, and editorial positioning."
                    disabled
                    className="min-h-[110px] resize-none"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    ["Natural", "Human and direct", Brain],
                    ["Professional", "Formal and precise", ShieldCheck],
                    ["Conversational", "Relaxed and clear", MessageSquare],
                  ].map(([title, description, Icon]) => (
                    <div key={title as string} className="rounded-lg border border-byword-border p-5">
                      <IconTile icon={Icon as typeof Brain} />
                      <h3 className="mt-4 text-sm font-semibold">{title as string}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{description as string}</p>
                    </div>
                  ))}
                </div>
              </div>
            </BywordCard>
          )}

          {activeSection === "advanced" && (
            <BywordCard>
              <SectionHeader
                icon={SlidersHorizontal}
                title="Advanced"
                description="Future controls for generation limits, compliance, and workspace safety."
              />
              <div className="grid gap-4 p-6 md:grid-cols-2">
                <div className="rounded-lg border border-byword-border p-5">
                  <IconTile icon={ShieldCheck} />
                  <h3 className="mt-4 text-sm font-semibold">Private beta access</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Account approval and admin review stay enforced before users can access product routes.
                  </p>
                </div>
                <div className="rounded-lg border border-byword-border p-5">
                  <IconTile icon={Zap} />
                  <h3 className="mt-4 text-sm font-semibold">Provider usage</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Generation uses each approved user's own encrypted OpenRouter and Google Gemini keys.
                  </p>
                </div>
              </div>
            </BywordCard>
          )}
        </div>
      </div>
    </BywordPageShell>
  );
}

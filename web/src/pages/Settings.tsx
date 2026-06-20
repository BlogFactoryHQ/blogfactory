import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  Target,
  Plus,
  X,
  Upload,
  Link as LinkIcon,
  BookOpen,
  Globe2,
  ListChecks,
  Megaphone,
  Gauge,
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
import { Switch } from "@/components/ui/switch";
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
  cover_image_count?: number | null;
  cover_resolution?: string | null;
  cover_aspect_ratio?: string | null;
  inline_enabled?: boolean | null;
  inline_count?: number | null;
  inline_resolution?: string | null;
  inline_aspect_ratio?: string | null;
  article_word_count?: number | null;
  article_language?: string | null;
  article_voice?: string | null;
  include_table_of_contents?: boolean | null;
  enable_research?: boolean | null;
  enable_internal_links?: boolean | null;
  brand_company_name?: string | null;
  brand_description?: string | null;
  brand_target_audience?: string | null;
  brand_mentions?: string | null;
  brand_value_props?: string[] | null;
  brand_ctas?: BrandCta[] | null;
  knowledge_base_enabled?: boolean | null;
  knowledge_documents?: KnowledgeDocument[] | null;
}

interface BrandCta {
  id: string;
  label: string;
  url: string;
  description: string;
}

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
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

const articleLengthOptions = [
  { label: "Short", words: 500, icon: FileText },
  { label: "Standard", words: 1500, icon: BookOpen },
  { label: "Detailed", words: 2500, icon: ListChecks },
  { label: "Long", words: 3500, icon: Zap },
  { label: "Smart", words: 0, icon: Gauge },
];

const languageOptions = [
  "US English",
  "UK English",
  "Turkish",
  "German",
  "French",
  "Spanish",
];

const voiceOptions = [
  { label: "Natural", sub: "Human", icon: Brain },
  { label: "Professional", sub: "Formal", icon: Building2 },
  { label: "Conversational", sub: "Relaxed", icon: MessageSquare },
  { label: "Technical", sub: "Precise", icon: SlidersHorizontal },
  { label: "Friendly", sub: "Warm", icon: ShieldCheck },
  { label: "Authoritative", sub: "Expert", icon: Target },
];

const brandMentionOptions = [
  { value: "subtle", label: "Subtle", description: "Mentioned once if relevant", icon: MessageSquare },
  { value: "moderate", label: "Moderate", description: "Woven into 2-3 examples", icon: Zap },
  { value: "prominent", label: "Prominent", description: "Featured throughout", icon: Megaphone },
];

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
  const [activeSection, setActiveSection] = useState("basics");
  const [articleWordCount, setArticleWordCount] = useState(1500);
  const [articleLanguage, setArticleLanguage] = useState("US English");
  const [articleVoice, setArticleVoice] = useState("Natural");
  const [includeTableOfContents, setIncludeTableOfContents] = useState(false);
  const [enableResearch, setEnableResearch] = useState(false);
  const [enableInternalLinks, setEnableInternalLinks] = useState(false);
  const [brandCompanyName, setBrandCompanyName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [brandTargetAudience, setBrandTargetAudience] = useState("");
  const [brandMentions, setBrandMentions] = useState("moderate");
  const [brandValueProps, setBrandValueProps] = useState<string[]>([]);
  const [newValueProp, setNewValueProp] = useState("");
  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(false);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [brandCtas, setBrandCtas] = useState<BrandCta[]>([]);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaDescription, setCtaDescription] = useState("");
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
      setArticleWordCount(userSettings.article_word_count ?? 1500);
      setArticleLanguage(userSettings.article_language || "US English");
      setArticleVoice(userSettings.article_voice || "Natural");
      setIncludeTableOfContents(userSettings.include_table_of_contents ?? false);
      setEnableResearch(userSettings.enable_research ?? false);
      setEnableInternalLinks(userSettings.enable_internal_links ?? false);
      setBrandCompanyName(userSettings.brand_company_name || "");
      setBrandDescription(userSettings.brand_description || "");
      setBrandTargetAudience(userSettings.brand_target_audience || "");
      setBrandMentions(userSettings.brand_mentions || "moderate");
      setBrandValueProps(userSettings.brand_value_props || []);
      setBrandCtas(userSettings.brand_ctas || []);
      setKnowledgeBaseEnabled(userSettings.knowledge_base_enabled ?? false);
      setKnowledgeDocuments(userSettings.knowledge_documents || []);
    }
  }, [userSettings]);

  const saveArticleSettingsMutation = useMutation({
    mutationFn: async () => {
      await api.put("/settings", {
        article_word_count: articleWordCount,
        article_language: articleLanguage,
        article_voice: articleVoice,
        include_table_of_contents: includeTableOfContents,
        enable_research: enableResearch,
        enable_internal_links: enableInternalLinks,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Article settings saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save article settings"),
  });

  const saveBrandSettingsMutation = useMutation({
    mutationFn: async () => {
      await api.put("/settings", {
        brand_company_name: brandCompanyName,
        brand_description: brandDescription,
        brand_target_audience: brandTargetAudience,
        brand_mentions: brandMentions,
        brand_value_props: brandValueProps,
        brand_ctas: brandCtas,
        knowledge_base_enabled: knowledgeBaseEnabled,
        knowledge_documents: knowledgeDocuments,
        article_voice: articleVoice,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Brand settings saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save brand settings"),
  });

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

  const addValueProp = () => {
    const value = newValueProp.trim();
    if (!value) return;
    if (brandValueProps.length >= 5) {
      toast.error("You can add up to 5 value props");
      return;
    }
    setBrandValueProps((current) => [...current, value]);
    setNewValueProp("");
  };

  const addKnowledgeDocument = () => {
    const title = knowledgeTitle.trim();
    const content = knowledgeContent.trim();
    if (!title || !content) {
      toast.error("Add a title and content for the knowledge document");
      return;
    }
    setKnowledgeDocuments((current) => [
      ...current,
      { id: crypto.randomUUID(), title, content, createdAt: new Date().toISOString() },
    ]);
    setKnowledgeTitle("");
    setKnowledgeContent("");
  };

  const addCta = () => {
    const label = ctaLabel.trim();
    const url = ctaUrl.trim();
    const description = ctaDescription.trim();
    if (!label || !description) {
      toast.error("Add at least a CTA label and description");
      return;
    }
    setBrandCtas((current) => [
      ...current,
      { id: crypto.randomUUID(), label, url, description },
    ]);
    setCtaLabel("");
    setCtaUrl("");
    setCtaDescription("");
  };

  const settingsSections = [
    { id: "basics", title: "Article Basics", description: "Length, language", icon: SlidersHorizontal },
    { id: "brand", title: "Brand Settings", description: "Identity, products, CTAs", icon: Building2 },
    { id: "voice", title: "Voice & Style", description: "Tone, vocab, training", icon: MessageSquare },
    { id: "internal", title: "Internal Linking", description: "Sitemap index", icon: LinkIcon },
    { id: "images", title: "Images", description: "Generation settings", icon: ImageIcon },
    { id: "models", title: "Models", description: "Live pricing, filters", icon: Zap },
    { id: "api-keys", title: "API Keys", description: "Provider access", icon: KeyRound },
    { id: "advanced", title: "Advanced", description: "SEO, research, output", icon: SlidersHorizontal },
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
          {activeSection === "basics" && (
            <BywordCard>
              <SectionHeader
                icon={SlidersHorizontal}
                title="Article Basics"
                description="Core settings for generated content."
                action={
                  <Button
                    onClick={() => saveArticleSettingsMutation.mutate()}
                    disabled={saveArticleSettingsMutation.isPending}
                  >
                    {saveArticleSettingsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                }
              />
              <div className="space-y-8 p-6">
                <section className="space-y-4">
                  <div className="flex items-start gap-4">
                    <IconTile icon={FileText} />
                    <div>
                      <h3 className="text-base font-semibold">Article Length</h3>
                      <p className="text-sm text-muted-foreground">Target word count for generated articles.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-5">
                    {articleLengthOptions.map((option) => {
                      const selected = option.words === 0
                        ? articleWordCount === 0
                        : articleWordCount === option.words;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setArticleWordCount(option.words)}
                          className={cn(
                            "relative rounded-lg border p-5 text-center transition-calm",
                            selected
                              ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                              : "border-byword-border bg-card hover:border-byword-blue/40"
                          )}
                        >
                          <IconTile icon={option.icon} className={cn("mx-auto", selected && "bg-byword-blue text-white")} />
                          <p className="mt-4 text-sm font-semibold">{option.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {option.words === 0 ? "Auto" : `${option.words.toLocaleString()} words`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="article-word-count">Or enter a custom word count</Label>
                    <div className="relative">
                      <Input
                        id="article-word-count"
                        type="number"
                        min={300}
                        max={10000}
                        value={articleWordCount || ""}
                        onChange={(event) => setArticleWordCount(Number(event.target.value) || 0)}
                        className="h-12 pr-16 text-lg"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        words
                      </span>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 border-t border-byword-border pt-6 md:grid-cols-[1fr_320px]">
                  <div className="flex items-start gap-4">
                    <IconTile icon={Globe2} />
                    <div>
                      <h3 className="text-base font-semibold">Language</h3>
                      <p className="text-sm text-muted-foreground">Output language and regional variant.</p>
                    </div>
                  </div>
                  <Select value={articleLanguage} onValueChange={setArticleLanguage}>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languageOptions.map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>

                <section className="space-y-3 border-t border-byword-border pt-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Other Defaults</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { label: "Voice", value: articleVoice, icon: MessageSquare, section: "voice" },
                      { label: "Images", value: imageConfig.cover.enabled || imageConfig.inline.enabled ? "On" : "Off", icon: ImageIcon, section: "images" },
                      { label: "Links", value: enableInternalLinks ? "On" : "Off", icon: LinkIcon, section: "internal" },
                      { label: "Research", value: enableResearch ? "On" : "Off", icon: Globe2, section: "advanced" },
                      { label: "TOC", value: includeTableOfContents ? "On" : "Off", icon: ListChecks, section: "advanced" },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setActiveSection(item.section)}
                        className="flex h-12 items-center gap-3 rounded-lg border border-byword-border bg-card px-4 text-sm transition-calm hover:border-byword-blue/40"
                      >
                        <item.icon className="h-4 w-4 text-byword-blue" />
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-semibold text-foreground">{item.value}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </BywordCard>
          )}

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

          {activeSection === "voice" && (
            <div className="space-y-6">
              <BywordCard>
                <SectionHeader
                  icon={MessageSquare}
                  title="Voice & Style"
                  description="Choose how generated articles should sound."
                  action={
                    <Button
                      onClick={() => saveArticleSettingsMutation.mutate()}
                      disabled={saveArticleSettingsMutation.isPending}
                    >
                      {saveArticleSettingsMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                  }
                />
                <div className="space-y-8 p-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    {voiceOptions.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setArticleVoice(option.label)}
                        className={cn(
                          "rounded-lg border p-5 text-left transition-calm",
                          articleVoice === option.label
                            ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                            : "border-byword-border bg-card hover:border-byword-blue/40"
                        )}
                      >
                        <IconTile icon={option.icon} className={articleVoice === option.label ? "bg-byword-blue text-white" : ""} />
                        <p className="mt-4 font-semibold">{option.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{option.sub}</p>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-lg border border-byword-border p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <IconTile icon={FileText} />
                      <div>
                        <h3 className="font-semibold">Image Style Prompt</h3>
                        <p className="text-sm text-muted-foreground">Also used when BlogFactory generates article images.</p>
                      </div>
                    </div>
                    <Textarea
                      value={imageStylePrompt}
                      onChange={(event) => setImageStylePrompt(event.target.value)}
                      className="min-h-[110px] resize-none"
                    />
                    <Button
                      className="mt-4"
                      variant="outline"
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
                </div>
              </BywordCard>
            </div>
          )}

          {activeSection === "internal" && (
            <BywordCard>
              <SectionHeader
                icon={LinkIcon}
                title="Internal Linking"
                description="Configure whether generated articles should suggest internal link opportunities."
                action={
                  <Button
                    onClick={() => saveArticleSettingsMutation.mutate()}
                    disabled={saveArticleSettingsMutation.isPending}
                  >
                    {saveArticleSettingsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                }
              />
              <div className="space-y-6 p-6">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-byword-border p-5">
                  <div>
                    <h3 className="font-semibold">Enable internal link suggestions</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      BlogFactory will add natural internal link suggestions where they fit the article.
                    </p>
                  </div>
                  <Switch checked={enableInternalLinks} onCheckedChange={setEnableInternalLinks} />
                </div>
                <div className="rounded-lg border border-dashed border-byword-border p-8 text-center">
                  <IconTile icon={LinkIcon} className="mx-auto" />
                  <p className="mt-4 font-semibold">Sitemap indexing is prepared</p>
                  <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
                    The saved toggle already affects generation. Sitemap crawling can be connected later without changing this settings model.
                  </p>
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
            <div className="space-y-6">
              <BywordCard>
                <SectionHeader
                  icon={Building2}
                  title="Brand Profile"
                  description="Your brand identity for article integration."
                  action={
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => toast.info("Re-analysis will be connected to website crawling in a later pass")}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Re-analyze
                      </Button>
                      <Button
                        onClick={() => saveBrandSettingsMutation.mutate()}
                        disabled={saveBrandSettingsMutation.isPending}
                      >
                        {saveBrandSettingsMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save
                      </Button>
                    </div>
                  }
                />
                <div className="divide-y divide-byword-border">
                  <div className="grid gap-4 p-6 md:grid-cols-[1fr_420px]">
                    <div>
                      <Label htmlFor="brand-company" className="text-base font-semibold">Company Name</Label>
                      <p className="mt-1 text-sm text-muted-foreground">Your brand or company name.</p>
                    </div>
                    <Input
                      id="brand-company"
                      value={brandCompanyName}
                      onChange={(event) => setBrandCompanyName(event.target.value)}
                      placeholder="e.g. Acme Financial"
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-4 p-6">
                    <div>
                      <Label htmlFor="brand-description" className="text-base font-semibold">What We Do</Label>
                      <p className="mt-1 text-sm text-muted-foreground">Brief description of your products or services.</p>
                    </div>
                    <Textarea
                      id="brand-description"
                      value={brandDescription}
                      onChange={(event) => setBrandDescription(event.target.value)}
                      placeholder="e.g. We provide financial planning services for founders and growing teams."
                      className="min-h-[120px] resize-none"
                    />
                  </div>

                  <div className="space-y-4 p-6">
                    <div>
                      <h3 className="text-base font-semibold">Unique Value Propositions</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Key differentiators to weave into articles, max 5.</p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newValueProp}
                        onChange={(event) => setNewValueProp(event.target.value)}
                        placeholder="Add value prop..."
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addValueProp();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addValueProp}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                    {brandValueProps.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {brandValueProps.map((prop) => (
                          <span key={prop} className="inline-flex items-center gap-2 rounded-full border border-byword-border bg-byword-blue-soft px-3 py-1 text-sm text-byword-blue">
                            {prop}
                            <button
                              type="button"
                              onClick={() => setBrandValueProps((current) => current.filter((item) => item !== prop))}
                              aria-label={`Remove ${prop}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 p-6 md:grid-cols-[1fr_420px]">
                    <div>
                      <Label htmlFor="brand-audience" className="text-base font-semibold">Target Audience</Label>
                      <p className="mt-1 text-sm text-muted-foreground">Who your products or services are for.</p>
                    </div>
                    <Input
                      id="brand-audience"
                      value={brandTargetAudience}
                      onChange={(event) => setBrandTargetAudience(event.target.value)}
                      placeholder="e.g. Seed-stage founders, editors, content teams"
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-4 p-6">
                    <div>
                      <h3 className="text-base font-semibold">Brand Mentions</h3>
                      <p className="mt-1 text-sm text-muted-foreground">How prominently to integrate your brand into articles.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {brandMentionOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setBrandMentions(option.value)}
                          className={cn(
                            "rounded-lg border p-5 text-center transition-calm",
                            brandMentions === option.value
                              ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                              : "border-byword-border bg-card hover:border-byword-blue/40"
                          )}
                        >
                          <IconTile icon={option.icon} className="mx-auto" />
                          <p className="mt-3 font-semibold">{option.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </BywordCard>

              <BywordCard>
                <SectionHeader
                  icon={FileText}
                  title="Knowledge Base"
                  description="Reference saved content during article generation for more accurate, on-brand content."
                  action={
                    <Switch
                      checked={knowledgeBaseEnabled}
                      onCheckedChange={setKnowledgeBaseEnabled}
                      aria-label="Use knowledge documents"
                    />
                  }
                />
                <div className="space-y-5 p-6">
                  <div className="grid gap-3 md:grid-cols-[280px_1fr]">
                    <Input
                      value={knowledgeTitle}
                      onChange={(event) => setKnowledgeTitle(event.target.value)}
                      placeholder="Document title"
                    />
                    <Textarea
                      value={knowledgeContent}
                      onChange={(event) => setKnowledgeContent(event.target.value)}
                      placeholder="Paste notes, product facts, FAQs, or brand context..."
                      className="min-h-[110px] resize-none"
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={addKnowledgeDocument}>
                    <Upload className="mr-2 h-4 w-4" />
                    Add Knowledge
                  </Button>
                  {knowledgeDocuments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-byword-border p-8 text-center">
                      <IconTile icon={FileText} className="mx-auto" />
                      <p className="mt-4 font-semibold">No documents yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Add your first document to give BlogFactory context about your brand and products.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {knowledgeDocuments.map((document) => (
                        <div key={document.id} className="flex items-start gap-3 rounded-lg border border-byword-border p-4">
                          <IconTile icon={FileText} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{document.title}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{document.content}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setKnowledgeDocuments((current) => current.filter((item) => item.id !== document.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </BywordCard>

              <BywordCard>
                <SectionHeader
                  icon={Target}
                  title="Call to Action"
                  description="Promotional content included in your articles."
                  action={
                    <Button type="button" onClick={addCta}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add CTA
                    </Button>
                  }
                />
                <div className="space-y-5 p-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} placeholder="CTA label" />
                    <Input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="URL, optional" />
                    <Input value={ctaDescription} onChange={(event) => setCtaDescription(event.target.value)} placeholder="How to use it" />
                  </div>
                  {brandCtas.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-byword-border p-10 text-center">
                      <IconTile icon={Target} className="mx-auto" />
                      <p className="mt-4 font-semibold">No CTAs yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Articles will not include promotional content until you add a CTA.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {brandCtas.map((cta) => (
                        <div key={cta.id} className="flex items-start gap-3 rounded-lg border border-byword-border p-4">
                          <IconTile icon={Target} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{cta.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{cta.description}</p>
                            {cta.url && <p className="mt-1 text-xs text-byword-blue">{cta.url}</p>}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setBrandCtas((current) => current.filter((item) => item.id !== cta.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </BywordCard>
            </div>
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

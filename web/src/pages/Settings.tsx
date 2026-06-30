import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { createKnowledgeDocument, extractDocxText, knowledgeChunkCount, knowledgeStatus, type KnowledgeDocument } from "@/lib/knowledge";
import { cn } from "@/lib/utils";
import { normalizeHttpUrl, stripHttpProtocol } from "@/lib/url-validation";
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
  AlertCircle,
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
  FileUp,
  Link as LinkIcon,
  BookOpen,
  Globe2,
  ListChecks,
  Megaphone,
  Gauge,
  Check,
  CheckCircle2,
  Database,
  Clock,
  Filter,
  ArrowRight,
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
import { LiveImageModelSelect } from "@/components/content/LiveImageModelSelect";
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
  hasOpenaiKey: boolean;
  openaiKeyLast4: string | null;
  hasReplicateKey: boolean;
  replicateKeyLast4: string | null;
  hasPexelsKey: boolean;
  pexelsKeyLast4: string | null;
  hasPixabayKey: boolean;
  pixabayKeyLast4: string | null;
  updatedAt: string | null;
}

type ApiKeyProvider = "openrouter" | "google" | "openai" | "replicate";

interface ApiKeyTestResult {
  ok: boolean;
  error?: string;
}

interface UserSettings {
  image_style_prompt?: string | null;
  image_model?: string | null;
  inline_image_model?: string | null;
  image_advanced_options?: Record<string, unknown> | null;
  image_placement?: string | null;
  image_compression_enabled?: boolean | null;
  source_image_allowed?: boolean | null;
  ai_fallback_enabled?: boolean | null;
  max_ai_images_per_day?: number | null;
  min_minutes_between_ai_images?: number | null;
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
  internal_link_sitemap_url?: string | null;
  internal_link_status?: string | null;
  internal_link_mode?: string | null;
  internal_link_density?: string | null;
  internal_link_include_patterns?: string[] | null;
  internal_link_exclude_patterns?: string[] | null;
  internal_link_rules?: InternalLinkRule[] | null;
  internal_link_index?: InternalLinkIndex | null;
  internal_link_indexing_state?: InternalLinkIndexingState | null;
  internal_link_last_synced_at?: string | null;
}

interface BrandCta {
  id: string;
  label: string;
  url: string;
  description: string;
}

interface InternalLinkRule {
  id: string;
  triggers: string;
  url: string;
}

interface InternalLinkPage {
  url: string;
  title: string;
  description?: string;
  path: string;
}

interface InternalLinkIndex {
  sitemapUrl: string;
  siteHost: string;
  pageCount: number;
  vectorCount: number;
  pages: InternalLinkPage[];
  createdAt: string;
  sitemapMessages?: string[];
}

interface InternalLinkIndexingState {
  jobId?: string;
  step: "queued" | "fetch_sitemap" | "crawl_pages" | "create_embeddings" | "build_index" | "completed" | "failed";
  totalPages: number;
  crawledPages: number;
  embeddedPages: number;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}

type ModelPriceFilter = "all" | "free" | "low" | "medium" | "high";
type DirtyState = "clean" | "dirty";

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

const formatSavedAt = (value?: string | null) => {
  if (!value) return "Never saved";
  return `Saved ${new Date(value).toLocaleDateString()}`;
};

const unsavedBadge = (state: DirtyState) =>
  state === "dirty" ? (
    <span className="mr-2 rounded-full border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      Unsaved
    </span>
  ) : null;

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

const linkDensityOptions = [
  { value: "minimal", label: "Minimal", count: "Up to 1-2", description: "Only strong matches" },
  { value: "light", label: "Light", count: "Up to 3-4", description: "Subtle linking" },
  { value: "balanced", label: "Balanced", count: "Up to 5-7", description: "Relevant matches", badge: "Best" },
  { value: "rich", label: "Rich", count: "Up to 8-12", description: "When the article supports it" },
];

const DEFAULT_IMAGE_MODEL = "openrouter/free";

function normalizeCoverImageModelId(modelId?: string | null) {
  const value = modelId?.trim();
  if (!value) return DEFAULT_IMAGE_MODEL;
  if (value === "auto/consistent-cover" || value === "auto/cost-effective") return DEFAULT_IMAGE_MODEL;
  return value;
}

function normalizeInlineImageModelId(modelId?: string | null) {
  if (
    !modelId
    || modelId === "auto/consistent-cover"
    || modelId === "auto/cost-effective"
    || modelId.startsWith("google-ai-studio/")
    || modelId.startsWith("google/")
    || modelId.startsWith("replicate/")
  ) {
    return DEFAULT_IMAGE_MODEL;
  }
  return modelId;
}

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [imageStylePrompt, setImageStylePrompt] = useState(
    "Professional, modern, clean style. High quality, suitable for a tech/business blog. No text overlays."
  );
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);
  const [selectedImageModel, setSelectedImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [selectedInlineImageModel, setSelectedInlineImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [pexelsKey, setPexelsKey] = useState("");
  const [pixabayKey, setPixabayKey] = useState("");
  const [sourceImageAllowed, setSourceImageAllowed] = useState(false);
  const [aiFallbackEnabled, setAiFallbackEnabled] = useState(true);
  const [maxAiImagesPerDay, setMaxAiImagesPerDay] = useState(30);
  const [minMinutesBetweenAiImages, setMinMinutesBetweenAiImages] = useState(5);
  const [showAdvancedImageStrategy, setShowAdvancedImageStrategy] = useState(false);
  const [testingProvider, setTestingProvider] = useState<ApiKeyProvider | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState<ModelPriceFilter>("all");
  const [activeSection, setActiveSection] = useState(() => searchParams.get("section") || "basics");
  const [articleWordCount, setArticleWordCount] = useState(1500);
  const [articleLanguage, setArticleLanguage] = useState("US English");
  const [articleVoice, setArticleVoice] = useState("Natural");
  const [includeTableOfContents, setIncludeTableOfContents] = useState(false);
  const [enableResearch, setEnableResearch] = useState(false);
  const [enableInternalLinks, setEnableInternalLinks] = useState(false);
  const [internalLinkSitemapUrl, setInternalLinkSitemapUrl] = useState("");
  const [internalLinkMode, setInternalLinkMode] = useState("all");
  const [internalLinkDensity, setInternalLinkDensity] = useState("balanced");
  const [internalLinkIncludePatterns, setInternalLinkIncludePatterns] = useState("");
  const [internalLinkExcludePatterns, setInternalLinkExcludePatterns] = useState("");
  const [internalLinkRules, setInternalLinkRules] = useState<InternalLinkRule[]>([]);
  const [internalRuleTriggers, setInternalRuleTriggers] = useState("");
  const [internalRuleUrl, setInternalRuleUrl] = useState("");
  const [internalLinkIndex, setInternalLinkIndex] = useState<InternalLinkIndex | null>(null);
  const [internalLinkStatus, setInternalLinkStatus] = useState("disconnected");
  const [internalLinkIndexingState, setInternalLinkIndexingState] = useState<InternalLinkIndexingState | null>(null);
  const [internalLinkLastSyncedAt, setInternalLinkLastSyncedAt] = useState<string | null>(null);
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
  const [isImportingKnowledge, setIsImportingKnowledge] = useState(false);
  const [brandCtas, setBrandCtas] = useState<BrandCta[]>([]);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaDescription, setCtaDescription] = useState("");
  const previousInternalLinkStatus = useRef<string | null>(null);
  const { data: imageModels = [], isLoading: imageModelsLoading } = useImageModels();
  const { data: textModels = [], isLoading: textModelsLoading } = useTextModels();

  useEffect(() => {
    const section = searchParams.get("section");
    if (section) setActiveSection(section);
  }, [searchParams]);

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
  const coverImageModels = useMemo(
    () => imageModels.filter((model) => model.id !== DEFAULT_IMAGE_MODEL),
    [imageModels]
  );
  const filteredTextModels = useMemo(
    () => textModels.filter(modelMatchesFilters),
    [textModels, modelMatchesFilters]
  );
  const selectedImageModelUnavailable = Boolean(
    selectedImageModel && (
      selectedImageModel === DEFAULT_IMAGE_MODEL
      || (imageModels.length > 0 && !coverImageModels.some((model) => model.id === selectedImageModel))
    )
  );
  const selectedInlineImageModelUnavailable = Boolean(
    selectedInlineImageModel && imageModels.length > 0 && !imageModels.some((model) => model.id === selectedInlineImageModel)
  );

  // Fetch user settings
  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      return api.get<UserSettings>("/settings");
    },
    enabled: !!user,
    refetchInterval: (query) =>
      (query.state.data as UserSettings | undefined)?.internal_link_status === "indexing" ? 3000 : false,
  });

  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKeyMetadata>("/settings/api-keys"),
    enabled: !!user,
  });
  const savedCoverImageModel = normalizeCoverImageModelId(userSettings?.image_model);
  const savedInlineImageModel = normalizeInlineImageModelId(
    userSettings?.inline_image_model
    || (userSettings?.image_advanced_options?.inlineImageModel as string | undefined)
  );

  const basicsDirty: DirtyState = userSettings && (
    articleWordCount !== (userSettings.article_word_count ?? 1500) ||
    articleLanguage !== (userSettings.article_language || "US English")
  ) ? "dirty" : "clean";

  const advancedDirty: DirtyState = userSettings && (
    includeTableOfContents !== (userSettings.include_table_of_contents ?? false) ||
    enableResearch !== (userSettings.enable_research ?? false) ||
    articleVoice !== (userSettings.article_voice || "Natural")
  ) ? "dirty" : "clean";

  const internalDirty: DirtyState = userSettings && (
    enableInternalLinks !== (userSettings.enable_internal_links ?? false) ||
    internalLinkMode !== (userSettings.internal_link_mode || "all") ||
    internalLinkDensity !== (userSettings.internal_link_density || "balanced") ||
    internalLinkIncludePatterns !== ((userSettings.internal_link_include_patterns || []).join(", ")) ||
    internalLinkExcludePatterns !== ((userSettings.internal_link_exclude_patterns || []).join(", ")) ||
    JSON.stringify(internalLinkRules) !== JSON.stringify(userSettings.internal_link_rules || [])
  ) ? "dirty" : "clean";

  const imageStrategyDirty: DirtyState = userSettings && (
    selectedImageModel !== savedCoverImageModel ||
    selectedInlineImageModel !== savedInlineImageModel ||
    sourceImageAllowed !== (userSettings.source_image_allowed ?? false) ||
    aiFallbackEnabled !== (userSettings.ai_fallback_enabled ?? true) ||
    maxAiImagesPerDay !== (userSettings.max_ai_images_per_day ?? 30) ||
    minMinutesBetweenAiImages !== (userSettings.min_minutes_between_ai_images ?? 5)
  ) ? "dirty" : "clean";
  const imagePromptDirty: DirtyState = userSettings && imageStylePrompt !== (userSettings.image_style_prompt || "Professional, modern, clean style. High quality, suitable for a tech/business blog. No text overlays.") ? "dirty" : "clean";
  const imageDefaultsDirty: DirtyState = userSettings && (
    imageConfig.cover.enabled !== (userSettings.cover_enabled ?? true) ||
    imageConfig.cover.resolution !== ((userSettings.cover_resolution as Resolution) || "1K") ||
    imageConfig.cover.aspectRatio !== ((userSettings.cover_aspect_ratio as AspectRatio) || "16:9") ||
    imageConfig.inline.enabled !== (userSettings.inline_enabled ?? true) ||
    imageConfig.inline.count !== (userSettings.inline_count ?? 2) ||
    imageConfig.inline.resolution !== ((userSettings.inline_resolution as Resolution) || "Web") ||
    imageConfig.inline.aspectRatio !== ((userSettings.inline_aspect_ratio as AspectRatio) || "3:2")
  ) ? "dirty" : "clean";

  const brandDirty: DirtyState = userSettings && (
    brandCompanyName !== (userSettings.brand_company_name || "") ||
    brandDescription !== (userSettings.brand_description || "") ||
    brandTargetAudience !== (userSettings.brand_target_audience || "") ||
    brandMentions !== (userSettings.brand_mentions || "moderate") ||
    knowledgeBaseEnabled !== (userSettings.knowledge_base_enabled ?? false) ||
    JSON.stringify(brandValueProps) !== JSON.stringify(userSettings.brand_value_props || []) ||
    JSON.stringify(brandCtas) !== JSON.stringify(userSettings.brand_ctas || []) ||
    JSON.stringify(knowledgeDocuments) !== JSON.stringify(userSettings.knowledge_documents || [])
  ) ? "dirty" : "clean";

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
          count: userSettings.inline_count ?? 2,
          resolution: (userSettings.inline_resolution as Resolution) || "Web",
          aspectRatio: (userSettings.inline_aspect_ratio as AspectRatio) || "3:2",
        },
        imagePlacement: (userSettings.image_placement as SplitImageConfig["imagePlacement"]) || "auto",
        compressionEnabled: userSettings.image_compression_enabled ?? true,
      });
      setSelectedImageModel(normalizeCoverImageModelId(userSettings.image_model));
      setSelectedInlineImageModel(
        normalizeInlineImageModelId(userSettings.inline_image_model
          || (userSettings.image_advanced_options?.inlineImageModel as string | undefined)
        )
      );
      setSourceImageAllowed(userSettings.source_image_allowed ?? false);
      setAiFallbackEnabled(userSettings.ai_fallback_enabled ?? true);
      setMaxAiImagesPerDay(userSettings.max_ai_images_per_day ?? 30);
      setMinMinutesBetweenAiImages(userSettings.min_minutes_between_ai_images ?? 5);
      setArticleWordCount(userSettings.article_word_count ?? 1500);
      setArticleLanguage(userSettings.article_language || "US English");
      setArticleVoice(userSettings.article_voice || "Natural");
      setIncludeTableOfContents(userSettings.include_table_of_contents ?? false);
      setEnableResearch(userSettings.enable_research ?? false);
      setEnableInternalLinks(userSettings.enable_internal_links ?? false);
      setInternalLinkSitemapUrl(stripHttpProtocol(userSettings.internal_link_sitemap_url || ""));
      setInternalLinkStatus(userSettings.internal_link_status || (userSettings.internal_link_index ? "connected" : "disconnected"));
      setInternalLinkMode(userSettings.internal_link_mode || "all");
      setInternalLinkDensity(userSettings.internal_link_density || "balanced");
      setInternalLinkIncludePatterns((userSettings.internal_link_include_patterns || []).join(", "));
      setInternalLinkExcludePatterns((userSettings.internal_link_exclude_patterns || []).join(", "));
      setInternalLinkRules(userSettings.internal_link_rules || []);
      setInternalLinkIndex(userSettings.internal_link_index || null);
      setInternalLinkIndexingState(userSettings.internal_link_indexing_state || null);
      setInternalLinkLastSyncedAt(userSettings.internal_link_last_synced_at || null);
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

  useEffect(() => {
    const status = userSettings?.internal_link_status;
    if (!status) return;
    const previous = previousInternalLinkStatus.current;
    if (previous === "indexing" && status === "connected") toast.success("Internal link index is ready");
    if (previous === "indexing" && status === "failed") {
      toast.error(userSettings.internal_link_indexing_state?.errorMessage || "Internal link indexing failed");
    }
    previousInternalLinkStatus.current = status;
  }, [userSettings?.internal_link_status, userSettings?.internal_link_indexing_state]);

  const saveArticleSettingsMutation = useMutation({
    mutationFn: async () => {
      await api.put("/settings", {
        article_word_count: articleWordCount,
        article_language: articleLanguage,
        article_voice: articleVoice,
        include_table_of_contents: includeTableOfContents,
        enable_research: enableResearch,
        enable_internal_links: enableInternalLinks,
        internal_link_mode: internalLinkMode,
        internal_link_density: internalLinkDensity,
        internal_link_rules: internalLinkRules,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Article settings saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save article settings"),
  });

  const splitPatterns = (value: string) =>
    value.split(",").map((item) => item.trim()).filter(Boolean);

  const indexInternalLinksMutation = useMutation({
    mutationFn: async () => {
      return api.post<UserSettings>("/settings/internal-linking/index", {
        sitemap_url: normalizeHttpUrl(internalLinkSitemapUrl),
        mode: internalLinkMode,
        density: internalLinkDensity,
        include_patterns: splitPatterns(internalLinkIncludePatterns),
        exclude_patterns: splitPatterns(internalLinkExcludePatterns),
      });
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(["user-settings"], settings);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.info("Internal link indexing started");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to index sitemap"),
  });

  const saveInternalLinkSettingsMutation = useMutation({
    mutationFn: async () => {
      return api.put<UserSettings>("/settings", {
        enable_internal_links: enableInternalLinks,
        internal_link_mode: internalLinkMode,
        internal_link_density: internalLinkDensity,
        internal_link_include_patterns: splitPatterns(internalLinkIncludePatterns),
        internal_link_exclude_patterns: splitPatterns(internalLinkExcludePatterns),
        internal_link_rules: internalLinkRules,
      });
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(["user-settings"], settings);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Internal linking settings saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save internal linking settings"),
  });

  const disconnectInternalLinksMutation = useMutation({
    mutationFn: async () => api.delete<UserSettings>("/settings/internal-linking"),
    onSuccess: (settings) => {
      queryClient.setQueryData(["user-settings"], settings);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Internal linking disconnected");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to disconnect internal linking"),
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
        image_placement: defaults.imagePlacement || "auto",
        image_compression_enabled: defaults.compressionEnabled ?? true,
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

  const saveImageCostSettingsMutation = useMutation({
    mutationFn: async () => {
      await api.put("/settings", {
        image_model: selectedImageModel,
        image_advanced_options: {
          ...(userSettings?.image_advanced_options || {}),
          inlineImageModel: selectedInlineImageModel,
        },
        source_image_allowed: sourceImageAllowed,
        ai_fallback_enabled: aiFallbackEnabled,
        max_ai_images_per_day: maxAiImagesPerDay,
        min_minutes_between_ai_images: minMinutesBetweenAiImages,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Image strategy saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save image cost settings"),
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: "openrouter" | "google" | "openai" | "replicate" | "pexels" | "pixabay"; apiKey: string }) =>
      api.put<ApiKeyMetadata>("/settings/api-keys", { provider, apiKey }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["image-models"] });
      queryClient.invalidateQueries({ queryKey: ["text-models"] });
      if (variables.provider === "openrouter") setOpenrouterKey("");
      if (variables.provider === "google") setGoogleKey("");
      if (variables.provider === "openai") setOpenaiKey("");
      if (variables.provider === "pexels") setPexelsKey("");
      if (variables.provider === "pixabay") setPixabayKey("");
      toast.success("API key saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: (provider: "openrouter" | "google" | "openai" | "replicate" | "pexels" | "pixabay") => api.delete<ApiKeyMetadata>(`/settings/api-keys?provider=${provider}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["image-models"] });
      queryClient.invalidateQueries({ queryKey: ["text-models"] });
      toast.success("API key deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testApiKeyMutation = useMutation({
    mutationFn: (provider: ApiKeyProvider) => api.post<ApiKeyTestResult>("/settings/api-keys/test", { provider }),
    onMutate: (provider) => setTestingProvider(provider),
    onSuccess: () => toast.success("Provider key works"),
    onError: (err: Error) => toast.error(err.message || "Provider key failed"),
    onSettled: () => setTestingProvider(null),
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
      createKnowledgeDocument(title, content),
    ]);
    setKnowledgeBaseEnabled(true);
    setKnowledgeTitle("");
    setKnowledgeContent("");
  };

  const importKnowledgeFile = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    let content = "";

    if (extension === "txt" || file.type === "text/plain") {
      content = await file.text();
    } else if (extension === "docx") {
      content = await extractDocxText(file);
    } else if (extension === "pdf" || file.type === "application/pdf") {
      const formData = new FormData();
      formData.append("file", file);
      const imported = await api.upload<Pick<KnowledgeDocument, "title" | "content" | "status" | "chunks" | "error">>("/settings/knowledge/import", formData);
      content = imported.content;
    } else {
      throw new Error("Upload a PDF, DOCX, or TXT file");
    }

    const document = createKnowledgeDocument(file.name.replace(/\.[^.]+$/, ""), content);
    setKnowledgeDocuments((current) => [...current, document]);
    setKnowledgeBaseEnabled(true);
    toast.success("Knowledge file imported");
  };

  const handleKnowledgeFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImportingKnowledge(true);
    try {
      await importKnowledgeFile(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import knowledge file");
    } finally {
      setIsImportingKnowledge(false);
    }
  };

  const addInternalLinkRule = () => {
    const triggers = internalRuleTriggers.trim();
    const url = internalRuleUrl.trim();
    if (!triggers || !url) {
      toast.error("Add trigger phrases and a destination URL");
      return;
    }
    try {
      new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      toast.error("Add a valid destination URL");
      return;
    }
    setInternalLinkRules((current) => [
      ...current,
      { id: crypto.randomUUID(), triggers, url: /^https?:\/\//i.test(url) ? url : `https://${url}` },
    ]);
    setInternalRuleTriggers("");
    setInternalRuleUrl("");
  };

  const formatRelativeLabel = (value?: string | null) => {
    if (!value) return "Never";
    const deltaMs = new Date(value).getTime() - Date.now();
    const absMs = Math.abs(deltaMs);
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    if (absMs >= 24 * 60 * 60 * 1000) return formatter.format(Math.round(deltaMs / (24 * 60 * 60 * 1000)), "day");
    if (absMs >= 60 * 60 * 1000) return formatter.format(Math.round(deltaMs / (60 * 60 * 1000)), "hour");
    return formatter.format(Math.round(deltaMs / 60000), "minute");
  };

  const lastSyncLabel = formatRelativeLabel(internalLinkLastSyncedAt);
  const refreshAvailableAt = internalLinkLastSyncedAt
    ? new Date(new Date(internalLinkLastSyncedAt).getTime() + 14 * 24 * 60 * 60 * 1000)
    : null;
  const refreshBlocked = internalLinkStatus === "connected" && refreshAvailableAt ? refreshAvailableAt.getTime() > Date.now() : false;
  const comparableSitemapUrl = (value?: string | null) => (value || "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  const sitemapChanged = Boolean(
    internalLinkSitemapUrl.trim() &&
    comparableSitemapUrl(internalLinkSitemapUrl) !== comparableSitemapUrl(internalLinkIndex?.sitemapUrl || userSettings?.internal_link_sitemap_url)
  );
  const cooldownBlocksIndexing = refreshBlocked && !sitemapChanged;
  const isIndexingInternalLinks = internalLinkStatus === "indexing" || indexInternalLinksMutation.isPending;
  const hasOpenAiKey = Boolean(apiKeys?.hasOpenaiKey);
  const indexedPagePreview = internalLinkIndex?.pages?.slice(0, 5) || [];
  const indexingSteps = [
    { key: "fetch_sitemap", label: "Fetch sitemap" },
    { key: "crawl_pages", label: "Crawl pages" },
    { key: "create_embeddings", label: "Create embeddings" },
    { key: "build_index", label: "Build index" },
  ];
  const indexingStep = internalLinkIndexingState?.step || (isIndexingInternalLinks ? "queued" : internalLinkStatus);
  const indexingStepIndex = Math.max(0, indexingSteps.findIndex((step) => step.key === indexingStep));
  const indexingProgress = (() => {
    if (internalLinkStatus === "connected") return 100;
    if (!isIndexingInternalLinks) return 0;
    const total = internalLinkIndexingState?.totalPages || 0;
    if (indexingStep === "crawl_pages" && total) return Math.min(50, 20 + ((internalLinkIndexingState?.crawledPages || 0) / total) * 30);
    if (indexingStep === "create_embeddings" && total) return Math.min(85, 55 + ((internalLinkIndexingState?.embeddedPages || 0) / total) * 30);
    if (indexingStep === "build_index") return 92;
    return Math.max(8, (indexingStepIndex + 1) * 18);
  })();

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
    { id: "images", title: "Images", description: "Generation settings", icon: ImageIcon },
    { id: "models", title: "Model Pricing", description: "Live prices, filters", icon: Zap },
    { id: "api-keys", title: "API Keys", description: "Provider access", icon: KeyRound },
    { id: "voice", title: "Voice", description: "Tone, image style", icon: MessageSquare },
    { id: "brand", title: "Brand", description: "Profile, CTAs, knowledge", icon: Building2 },
    { id: "advanced", title: "Advanced", description: "Research, TOC, voice", icon: SlidersHorizontal },
  ];

  const imageStrategy =
    !aiFallbackEnabled
      ? "stock"
      : "consistent";

  const applyImageStrategy = (strategy: "consistent" | "stock") => {
    setSourceImageAllowed(false);
    if (strategy === "consistent") {
      setSelectedImageModel(coverImageModels[0]?.id || selectedImageModel);
      setSelectedInlineImageModel(imageModels[0]?.id || selectedInlineImageModel);
      setAiFallbackEnabled(true);
      setMaxAiImagesPerDay(30);
      setMinMinutesBetweenAiImages(5);
    } else {
      setSelectedInlineImageModel(DEFAULT_IMAGE_MODEL);
      setAiFallbackEnabled(false);
      setMaxAiImagesPerDay(0);
      setMinMinutesBetweenAiImages(5);
    }
  };
  const knowledgeChunkTotal = knowledgeDocuments.reduce((total, document) => total + knowledgeChunkCount(document), 0);
  const readyKnowledgeCount = knowledgeDocuments.filter((document) => knowledgeStatus(document) === "ready").length;
  const canAddKnowledge = Boolean(knowledgeTitle.trim() && knowledgeContent.trim());
  const articleWordRangeLabel = articleWordCount > 0
    ? `${articleWordCount.toLocaleString()} target · ${Math.round(articleWordCount * 0.8).toLocaleString()}-${Math.round(articleWordCount * 1.2).toLocaleString()} acceptable`
    : "Smart length · no repair pass";

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
                    {unsavedBadge(basicsDirty)}
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
                      <p className="text-sm text-muted-foreground">{articleWordRangeLabel}</p>
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
                  <p className="text-xs text-muted-foreground">{formatSavedAt(apiKeys?.updatedAt)}</p>
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testApiKeyMutation.mutate("openrouter")}
                      disabled={!apiKeys?.hasOpenrouterKey || testingProvider === "openrouter"}
                    >
                      {testingProvider === "openrouter" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Test
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-byword-border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="google-key">Google Gemini PDF/Knowledge</Label>
                    <Badge variant={apiKeys?.hasGoogleAiKey ? "default" : "secondary"}>
                      {apiKeys?.hasGoogleAiKey ? `Saved ****${apiKeys.googleKeyLast4}` : "Missing"}
                    </Badge>
                  </div>
                  <Input
                    id="google-key"
                    type="password"
                    placeholder="Google Gemini API key"
                    value={googleKey}
                    onChange={(e) => setGoogleKey(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Optional for PDF knowledge imports. Images use OpenRouter. {formatSavedAt(apiKeys?.updatedAt)}</p>
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testApiKeyMutation.mutate("google")}
                      disabled={!apiKeys?.hasGoogleAiKey || testingProvider === "google"}
                    >
                      {testingProvider === "google" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Test
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-byword-border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="openai-key">OpenAI Embeddings</Label>
                    <Badge variant={apiKeys?.hasOpenaiKey ? "default" : "secondary"}>
                      {apiKeys?.hasOpenaiKey ? `Saved ****${apiKeys.openaiKeyLast4}` : "Missing"}
                    </Badge>
                  </div>
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Optional for semantic internal linking. Images use OpenRouter. {formatSavedAt(apiKeys?.updatedAt)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveApiKeyMutation.mutate({ provider: "openai", apiKey: openaiKey })}
                      disabled={!openaiKey || saveApiKeyMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKeyMutation.mutate("openai")}
                      disabled={!apiKeys?.hasOpenaiKey || deleteApiKeyMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testApiKeyMutation.mutate("openai")}
                      disabled={!apiKeys?.hasOpenaiKey || testingProvider === "openai"}
                    >
                      {testingProvider === "openai" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Test
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-byword-border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="pixabay-key">Pixabay Stock Photos</Label>
                    <Badge variant={apiKeys?.hasPixabayKey ? "default" : "secondary"}>
                      {apiKeys?.hasPixabayKey ? `Saved ****${apiKeys.pixabayKeyLast4}` : "Missing"}
                    </Badge>
                  </div>
                  <Input
                    id="pixabay-key"
                    type="password"
                    placeholder="Pixabay API key"
                    value={pixabayKey}
                    onChange={(e) => setPixabayKey(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Used first for free stock images before paid AI fallback.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveApiKeyMutation.mutate({ provider: "pixabay", apiKey: pixabayKey })}
                      disabled={!pixabayKey || saveApiKeyMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKeyMutation.mutate("pixabay")}
                      disabled={!apiKeys?.hasPixabayKey || deleteApiKeyMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-byword-border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="pexels-key">Pexels Stock Photos</Label>
                    <Badge variant={apiKeys?.hasPexelsKey ? "default" : "secondary"}>
                      {apiKeys?.hasPexelsKey ? `Saved ****${apiKeys.pexelsKeyLast4}` : "Missing"}
                    </Badge>
                  </div>
                  <Input
                    id="pexels-key"
                    type="password"
                    placeholder="Pexels API key"
                    value={pexelsKey}
                    onChange={(e) => setPexelsKey(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Fallback stock provider with photographer attribution stored on assets.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveApiKeyMutation.mutate({ provider: "pexels", apiKey: pexelsKey })}
                      disabled={!pexelsKey || saveApiKeyMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKeyMutation.mutate("pexels")}
                      disabled={!apiKeys?.hasPexelsKey || deleteApiKeyMutation.isPending}
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
                title="Model Pricing"
                description="Live price browser only. Choose the article model on Create Content."
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
                      {unsavedBadge(advancedDirty)}
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
                      {unsavedBadge(imagePromptDirty)}
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
                title="Internal Links moved to Search Growth"
                description="Sitemap indexing and semantic internal links now live beside Optimize and Indexing."
                action={
                  <Button asChild>
                    <Link to="/search-growth?tab=internal-links">
                      Open Search Growth
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                }
              />
              <div className="grid gap-4 p-6 md:grid-cols-3">
                <div className="rounded-lg border border-byword-border p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Status</p>
                  <p className="mt-2 text-2xl font-semibold">{internalLinkStatus === "connected" ? "Ready" : internalLinkStatus}</p>
                </div>
                <div className="rounded-lg border border-byword-border p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Pages</p>
                  <p className="mt-2 text-2xl font-semibold">{internalLinkIndex?.pageCount || internalLinkIndexingState?.totalPages || 0}</p>
                </div>
                <div className="rounded-lg border border-byword-border p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Last sync</p>
                  <p className="mt-2 text-2xl font-semibold">{lastSyncLabel}</p>
                </div>
              </div>
            </BywordCard>
          )}

          {activeSection === "__internal_legacy" && (
            <BywordCard>
              <SectionHeader
                icon={LinkIcon}
                title="Internal Linking"
                description="Sitemap indexing helps generated posts support each other."
                action={
                  <div className="flex items-center gap-3">
                    <Label htmlFor="internal-links-enabled" className="text-sm text-muted-foreground">Enabled</Label>
                    <Switch
                      id="internal-links-enabled"
                      checked={enableInternalLinks}
                      onCheckedChange={setEnableInternalLinks}
                      disabled={!internalLinkIndex}
                    />
                    <Button
                      onClick={() => saveInternalLinkSettingsMutation.mutate()}
                      disabled={saveInternalLinkSettingsMutation.isPending || isIndexingInternalLinks}
                    >
                      {unsavedBadge(internalDirty)}
                      {saveInternalLinkSettingsMutation.isPending ? (
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
                <div className="space-y-5 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-byword-border p-5">
                    <div className="flex items-start gap-4">
                      <IconTile
                        icon={
                          internalLinkStatus === "connected"
                            ? CheckCircle2
                            : internalLinkStatus === "failed"
                              ? AlertCircle
                              : internalLinkStatus === "indexing"
                                ? Loader2
                                : LinkIcon
                        }
                        className={cn(
                          internalLinkStatus === "connected" && "bg-[hsl(var(--status-success)/0.12)] text-status-success",
                          internalLinkStatus === "failed" && "bg-destructive/10 text-destructive",
                          internalLinkStatus === "indexing" && "bg-byword-blue-soft text-byword-blue"
                        )}
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">
                            {internalLinkStatus === "connected"
                              ? "Connected"
                              : internalLinkStatus === "indexing"
                                ? "Indexing"
                                : internalLinkStatus === "failed"
                                  ? "Failed"
                                  : "Disconnected"}
                          </h3>
                          <Badge variant={internalLinkStatus === "failed" ? "destructive" : "secondary"}>
                            {internalLinkStatus === "connected" ? "Ready" : internalLinkStatus}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {internalLinkIndex?.siteHost || internalLinkSitemapUrl || "Connect a sitemap to start semantic link matching."}
                        </p>
                      </div>
                    </div>
                    {internalLinkStatus === "indexing" && <Loader2 className="h-5 w-5 animate-spin text-byword-blue" />}
                  </div>

                  {!hasOpenAiKey && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                        <p className="text-sm text-muted-foreground">Add an OpenAI API key before creating semantic link embeddings.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setActiveSection("api-keys")}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        API Keys
                      </Button>
                    </div>
                  )}

                  {internalLinkStatus === "failed" && internalLinkIndexingState?.errorMessage && (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                      {internalLinkIndexingState.errorMessage}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="sitemap-url" className="text-base font-semibold">Sitemap URL</Label>
                    <div className="grid gap-3 md:grid-cols-[1fr_190px]">
                      <InputAffordance
                        id="sitemap-url"
                        type="text"
                        inputMode="url"
                        prefix="https://"
                        icon={Globe2}
                        value={internalLinkSitemapUrl}
                        onChange={(event) => setInternalLinkSitemapUrl(stripHttpProtocol(event.target.value))}
                        placeholder="yoursite.com/sitemap.xml"
                        className="h-12"
                        help="Paste a sitemap URL or your domain. BlogFactory will also try standard sitemap locations."
                        onClear={() => setInternalLinkSitemapUrl("")}
                        clearLabel="Clear sitemap URL"
                      />
                      <Button
                        type="button"
                        className="h-12"
                        onClick={() => indexInternalLinksMutation.mutate()}
                        disabled={!internalLinkSitemapUrl.trim() || isIndexingInternalLinks || !hasOpenAiKey || cooldownBlocksIndexing}
                      >
                        {isIndexingInternalLinks ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                        {internalLinkStatus === "failed" ? "Retry" : internalLinkStatus === "connected" ? "Re-index" : "Connect"}
                      </Button>
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-4 rounded-lg border border-byword-border p-5">
                    <span>
                      <span className="block font-semibold">Use internal links in generated articles</span>
                      <span className="mt-1 block text-sm text-muted-foreground">Turn this off to stop adding backlink/internal-link suggestions during generation.</span>
                    </span>
                    <Switch checked={enableInternalLinks} onCheckedChange={setEnableInternalLinks} />
                  </label>

                  {isIndexingInternalLinks && (
                    <div className="space-y-4 rounded-lg border border-byword-border p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Indexing progress</h3>
                          <p className="text-sm text-muted-foreground">
                            {internalLinkIndexingState?.totalPages
                              ? `${internalLinkIndexingState.crawledPages || 0}/${internalLinkIndexingState.totalPages} crawled, ${internalLinkIndexingState.embeddedPages || 0} embedded`
                              : "Preparing sitemap crawl"}
                          </p>
                        </div>
                        <span className="font-mono text-sm text-muted-foreground">{Math.round(indexingProgress)}%</span>
                      </div>
                      <Progress value={indexingProgress} className="h-2" />
                      <div className="grid gap-2 md:grid-cols-4">
                        {indexingSteps.map((step, index) => {
                          const activeIndex = Math.max(0, indexingSteps.findIndex((item) => item.key === indexingStep));
                          const done = activeIndex > index || internalLinkStatus === "connected";
                          const active = activeIndex === index && isIndexingInternalLinks;
                          return (
                            <div
                              key={step.key}
                              className={cn(
                                "flex items-center gap-2 rounded-md border border-byword-border px-3 py-2 text-sm",
                                done && "border-byword-blue/30 bg-byword-blue-soft text-byword-blue",
                                active && "font-medium text-foreground"
                              )}
                            >
                              {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-4 w-4 rounded-full border" />}
                              <span>{step.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {(internalLinkIndex || isIndexingInternalLinks) && (
                  <div className="space-y-5 p-6">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="flex items-center gap-4 rounded-lg border border-byword-border p-5">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <span className="text-2xl font-semibold">{internalLinkIndex?.pageCount || internalLinkIndexingState?.totalPages || 0}</span>
                        <span className="text-sm text-muted-foreground">Pages</span>
                      </div>
                      <div className="flex items-center gap-4 rounded-lg border border-byword-border p-5">
                        <Database className="h-5 w-5 text-muted-foreground" />
                        <span className="text-2xl font-semibold">{internalLinkIndex?.vectorCount || internalLinkIndexingState?.embeddedPages || 0}</span>
                        <span className="text-sm text-muted-foreground">Link candidates</span>
                      </div>
                      <div className="flex items-center gap-4 rounded-lg border border-byword-border p-5">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <span className="text-lg font-semibold">{lastSyncLabel}</span>
                        <span className="text-sm text-muted-foreground">Last sync</span>
                      </div>
                      <div className="flex items-center gap-4 rounded-lg border border-byword-border p-5">
                        <RefreshCw className="h-5 w-5 text-muted-foreground" />
                        <span className="text-lg font-semibold">{refreshBlocked && refreshAvailableAt ? formatRelativeLabel(refreshAvailableAt.toISOString()) : "Ready"}</span>
                        <span className="text-sm text-muted-foreground">Refresh</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-5 p-6">
                  <div className="flex items-start gap-4">
                    <IconTile icon={Filter} />
                    <div>
                      <h3 className="text-lg font-semibold">URL Filters</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Control which pages get indexed for linking.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setInternalLinkMode("all")}
                      disabled={isIndexingInternalLinks}
                      className={cn(
                        "rounded-lg border p-4 text-center font-semibold transition-calm",
                        internalLinkMode === "all"
                          ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                          : "border-byword-border hover:border-byword-blue/40"
                      )}
                    >
                      Index all pages
                    </button>
                    <button
                      type="button"
                      onClick={() => setInternalLinkMode("filtered")}
                      disabled={isIndexingInternalLinks}
                      className={cn(
                        "rounded-lg border p-4 text-center font-semibold transition-calm",
                        internalLinkMode === "filtered"
                          ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                          : "border-byword-border hover:border-byword-blue/40"
                      )}
                    >
                      Filter pages
                    </button>
                  </div>
                  {internalLinkMode === "filtered" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        value={internalLinkIncludePatterns}
                        onChange={(event) => setInternalLinkIncludePatterns(event.target.value)}
                        placeholder="/blog, /guides"
                        disabled={isIndexingInternalLinks}
                      />
                      <Input
                        value={internalLinkExcludePatterns}
                        onChange={(event) => setInternalLinkExcludePatterns(event.target.value)}
                        placeholder="/tag, /author, /page"
                        disabled={isIndexingInternalLinks}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-5 p-6">
                  <div>
                    <h3 className="text-lg font-semibold">Links per article</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Maximum relevant internal links to add. Nothing is appended when there is no natural match.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    {linkDensityOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setInternalLinkDensity(option.value)}
                        className={cn(
                          "relative rounded-lg border p-5 text-center transition-calm",
                          internalLinkDensity === option.value
                            ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                            : "border-byword-border hover:border-byword-blue/40"
                        )}
                      >
                        {option.badge && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-byword-blue px-3 py-1 text-[10px] font-bold uppercase text-white">
                            {option.badge}
                          </span>
                        )}
                        <p className="font-semibold">{option.label}</p>
                        <p className="mt-2 text-xl font-bold">{option.count}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-5 p-6">
                  <div className="flex items-start gap-4">
                    <IconTile icon={LinkIcon} />
                    <div>
                      <h3 className="text-lg font-semibold">Custom Link Rules</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Override AI linking for specific keywords.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto]">
                    <Input
                      value={internalRuleTriggers}
                      onChange={(event) => setInternalRuleTriggers(event.target.value)}
                      placeholder="demo, free trial, book a call"
                    />
                    <ArrowRight className="hidden h-10 w-5 text-muted-foreground md:block" />
                    <Input
                      value={internalRuleUrl}
                      onChange={(event) => setInternalRuleUrl(event.target.value)}
                      placeholder="https://example.com/book-demo"
                    />
                    <Button type="button" onClick={addInternalLinkRule}>
                      Add
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Separate multiple trigger phrases with commas. These rules take priority over AI-discovered links.
                  </p>
                  {internalLinkRules.length > 0 && (
                    <div className="grid gap-3">
                      {internalLinkRules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-3 rounded-lg border border-byword-border p-3">
                          <LinkIcon className="h-4 w-4 text-byword-blue" />
                          <span className="min-w-0 flex-1 truncate text-sm">{rule.triggers}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{rule.url}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setInternalLinkRules((current) => current.filter((item) => item.id !== rule.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {indexedPagePreview.length > 0 && (
                  <div className="space-y-4 p-6">
                    <div>
                      <h3 className="text-lg font-semibold">Indexed Pages</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Recent pages available for semantic matching.</p>
                    </div>
                    <div className="grid gap-3">
                      {indexedPagePreview.map((page) => (
                        <div key={page.url} className="rounded-lg border border-byword-border p-4">
                          <p className="truncate font-medium">{page.title || page.path}</p>
                          <p className="mt-1 truncate text-sm text-muted-foreground">{page.path || page.url}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-between gap-3 p-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => indexInternalLinksMutation.mutate()}
                    disabled={!internalLinkSitemapUrl.trim() || isIndexingInternalLinks || refreshBlocked || !hasOpenAiKey}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Index
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => disconnectInternalLinksMutation.mutate()}
                    disabled={disconnectInternalLinksMutation.isPending || isIndexingInternalLinks}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
              </div>
            </BywordCard>
          )}

          {activeSection === "images" && (
            <div className="space-y-6">
              <BywordCard>
                <SectionHeader
                  icon={Gauge}
                  title="Image Strategy"
                  description="Choose the default source for blog visuals."
                  action={
                    <Button
                      size="sm"
                      onClick={() => saveImageCostSettingsMutation.mutate()}
                      disabled={saveImageCostSettingsMutation.isPending || (aiFallbackEnabled && (selectedImageModelUnavailable || selectedInlineImageModelUnavailable))}
                    >
                      {unsavedBadge(imageStrategyDirty)}
                      {saveImageCostSettingsMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                  }
                />
                <div className="space-y-5 p-6">
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { id: "consistent", title: "Recommended", text: "Cover uses only the selected AI model. Inline uses AI, then stock.", badge: "Stable" },
                      { id: "stock", title: "Stock Only", text: "Skip AI generation and use stock/source images only.", badge: "$0" },
                    ].map((strategy) => (
                      <button
                        key={strategy.id}
                        type="button"
                        onClick={() => applyImageStrategy(strategy.id as "consistent" | "stock")}
                        className={cn(
                          "rounded-lg border p-4 text-left transition-calm",
                          imageStrategy === strategy.id
                            ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                            : "border-byword-border hover:border-byword-blue/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{strategy.title}</p>
                          <Badge variant="secondary">{strategy.badge}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{strategy.text}</p>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-lg border border-byword-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    {imageStrategy === "consistent" && "Current: cover queues only the cover AI model with your style prompt. Inline queues the inline AI model, then stock fallback."}
                    {imageStrategy === "stock" && "Current: AI queue is off; images resolve from stock or allowed source images."}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvancedImageStrategy((value) => !value)}
                  >
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Advanced
                  </Button>

                  {showAdvancedImageStrategy && (
                    <div className="grid gap-5 rounded-lg border border-byword-border p-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Cover AI Model</Label>
                        <LiveImageModelSelect value={selectedImageModel} onValueChange={setSelectedImageModel} models={coverImageModels} />
                      </div>

                      <div className="space-y-2">
                        <Label>Inline AI Model</Label>
                        <LiveImageModelSelect value={selectedInlineImageModel} onValueChange={setSelectedInlineImageModel} models={imageModels} />
                      </div>

                      <div className="flex items-center justify-between gap-4 rounded-lg border border-byword-border p-4">
                        <div>
                          <Label>AI Queue</Label>
                          <p className="text-xs text-muted-foreground">Queue AI first; only inline images use stock fallback.</p>
                        </div>
                        <Switch checked={aiFallbackEnabled} onCheckedChange={setAiFallbackEnabled} />
                      </div>

                      <div className="flex items-center justify-between gap-4 rounded-lg border border-byword-border p-4">
                        <div>
                          <Label>Source Images</Label>
                          <p className="text-xs text-muted-foreground">Reuse source images only when license or allowlist permits it.</p>
                        </div>
                        <Switch checked={sourceImageAllowed} onCheckedChange={setSourceImageAllowed} />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                        <div className="space-y-2">
                          <Label htmlFor="ai-per-day">AI/Day</Label>
                          <Input id="ai-per-day" type="number" min={0} max={100} value={maxAiImagesPerDay} onChange={(e) => setMaxAiImagesPerDay(Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ai-spacing">Minutes</Label>
                          <Input id="ai-spacing" type="number" min={0} max={240} value={minMinutesBetweenAiImages} onChange={(e) => setMinMinutesBetweenAiImages(Number(e.target.value))} />
                        </div>
                      </div>
                    </div>
                  )}
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
                    aiFallbackEnabled={aiFallbackEnabled}
                  />
                  {imageDefaultsDirty === "dirty" && (
                    <Badge variant="outline" className="mt-4 border-amber-300 text-amber-700">Unsaved defaults</Badge>
                  )}
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
                    {unsavedBadge(imagePromptDirty)}
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
                  <Button
                    onClick={() => saveBrandSettingsMutation.mutate()}
                    disabled={saveBrandSettingsMutation.isPending}
                  >
                    {unsavedBadge(brandDirty)}
                    {saveBrandSettingsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
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
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={knowledgeBaseEnabled}
                      onCheckedChange={setKnowledgeBaseEnabled}
                      aria-label="Use knowledge documents"
                    />
                    <Button
                      onClick={() => saveBrandSettingsMutation.mutate()}
                      disabled={saveBrandSettingsMutation.isPending}
                    >
                      {unsavedBadge(brandDirty)}
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
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={addCta}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                    <Button
                      onClick={() => saveBrandSettingsMutation.mutate()}
                      disabled={saveBrandSettingsMutation.isPending}
                    >
                      {unsavedBadge(brandDirty)}
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
                title="Advanced Defaults"
                description="Article instructions saved into the generation prompt."
                action={
                  <Button
                    onClick={() => saveArticleSettingsMutation.mutate()}
                    disabled={saveArticleSettingsMutation.isPending}
                  >
                    {unsavedBadge(advancedDirty)}
                    {saveArticleSettingsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                }
              />
              <div className="divide-y divide-byword-border">
                <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto]">
                  <div className="flex items-start gap-4">
                    <IconTile icon={Globe2} />
                    <div>
                      <h3 className="text-base font-semibold">Research Context</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Ask the writer to add useful context and explain claims clearly.</p>
                    </div>
                  </div>
                  <Switch checked={enableResearch} onCheckedChange={setEnableResearch} aria-label="Enable research context" />
                </div>

                <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto]">
                  <div className="flex items-start gap-4">
                    <IconTile icon={ListChecks} />
                    <div>
                      <h3 className="text-base font-semibold">Table of Contents</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Include a concise table of contents near the beginning.</p>
                    </div>
                  </div>
                  <Switch checked={includeTableOfContents} onCheckedChange={setIncludeTableOfContents} aria-label="Include table of contents" />
                </div>

                <div className="grid gap-4 p-6 md:grid-cols-[1fr_320px]">
                  <div className="flex items-start gap-4">
                    <IconTile icon={MessageSquare} />
                    <div>
                      <h3 className="text-base font-semibold">Default Voice</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Fallback voice used when no persona overrides it.</p>
                    </div>
                  </div>
                  <Select value={articleVoice} onValueChange={setArticleVoice}>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((voice) => (
                        <SelectItem key={voice.label} value={voice.label}>
                          {voice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </BywordCard>
          )}
        </div>
      </div>
    </BywordPageShell>
  );
}

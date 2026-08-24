import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Link as LinkIcon,
  FileText,
  Youtube,
  Upload,
  Sparkles,
  Clock,
  FileText as FileTextIcon,
  Loader2,
  X,
  Layers,
  Grid2X2,
  ArrowRight,
  SlidersHorizontal,
  Archive,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeHttpUrl, stripHttpProtocol } from "@/lib/url-validation";
import { safeFormatDistanceToNow } from "@/lib/date-format";
import { useAuth } from "@/hooks/useAuth";
import { SourceType } from "@/components/content/GenerationProgress";
import { LiveTextModelSelect, isUnavailableModel, preferredTextModelId } from "@/components/content/LiveTextModelSelect";
import {
  SplitImageGenerationSettings,
  SplitImageConfig,
  DEFAULT_SPLIT_CONFIG,
  InlineImageSource,
  ImageDeliveryMode,
  ManualImageProvider,
} from "@/components/content/ImageGenerationSettings";
import { useJobTracker } from "@/hooks/useJobTracker";
import { ConcurrentJobDialog, ConcurrentAction } from "@/components/content/ConcurrentJobDialog";
import { ActiveJobsPanel } from "@/components/content/ActiveJobsPanel";
import {
  BywordCard,
  BywordPageShell,
  IconTile,
  OptionCard,
  SectionHeader,
} from "@/components/layout/BywordSurface";
import { useTextModels } from "@/hooks/useTextModels";
import { useImageModels } from "@/hooks/useImageModels";
import { useUsageAnalytics } from "@/hooks/useUsageAnalytics";
import { useSites } from "@/hooks/useSites";
import { estimateGenerationCost, shouldWarnForCost, type CostEstimate } from "@/lib/cost-estimator";
import { analyzeCampaignPattern, analyzeTopicFit, type TopicFitResult } from "@/lib/topic-fit";
import { ProgrammaticPanel } from "@/pages/Programmatic";
import { formatCompactCurrency, semanticToneClass, type SemanticTone } from "@/lib/search-insights";

const DEFAULT_COVER_IMAGE_MODEL = "";
const DEFAULT_INLINE_IMAGE_MODEL = "";
const OPENROUTER_IMAGE_MODEL_IDS = new Set([
  "google/gemini-3.1-flash-image",
  "google/gemini-3-pro-image",
  "x-ai/grok-imagine-image-quality",
  "google/gemini-3.1-flash-image-preview",
]);

function normalizeCoverImageModelId(modelId?: string | null) {
  const value = modelId?.trim();
  return value && OPENROUTER_IMAGE_MODEL_IDS.has(value) ? value : DEFAULT_COVER_IMAGE_MODEL;
}

function normalizeInlineImageModelId(modelId?: string | null) {
  const value = modelId?.trim();
  return value && OPENROUTER_IMAGE_MODEL_IDS.has(value) ? value : DEFAULT_INLINE_IMAGE_MODEL;
}

function normalizeImageResolution(value?: string | null): "512" | "1K" {
  return value === "512" ? "512" : "1K";
}

function normalizeInlineImageSource(value?: string | null): InlineImageSource {
  return value === "stock" ? "stock" : "ai";
}

function normalizeImageDeliveryMode(value?: string | null): ImageDeliveryMode {
  return value === "manual_prompt" ? "manual_prompt" : "generate";
}

function normalizeManualImageProvider(value?: string | null): ManualImageProvider {
  return value === "midjourney" ? "midjourney" : "midjourney";
}

interface ContentUserSettings {
  image_model?: string | null;
  inline_image_model?: string | null;
  inline_image_source?: InlineImageSource | null;
  image_delivery_mode?: ImageDeliveryMode | null;
  manual_image_provider?: ManualImageProvider | null;
  image_style_prompt?: string | null;
  cover_image_resolution?: "512" | "1K" | null;
  inline_image_resolution?: "512" | "1K" | null;
  article_word_count?: number | null;
  article_language?: string | null;
  include_table_of_contents?: boolean | null;
  enable_research?: boolean | null;
  enable_internal_links?: boolean | null;
  internal_link_density?: string | null;
  monthly_budget?: number | null;
  cover_enabled?: boolean | null;
  inline_enabled?: boolean | null;
  inline_count?: number | null;
}

interface PersonaOption {
  id: string;
  name: string;
  status: string;
  base_model: string;
  system_prompt: string;
}

interface RecentPost {
  id: string;
  title: string;
  source_type?: string | null;
  created_at: string;
}

interface GenerateResponse {
  error?: string;
  jobId?: string | null;
  postIds?: string[];
}

interface ArticlePlanResponse {
  title: string;
  outline: string;
}

type CreationMode = "article" | "campaign" | "programmatic";
type CampaignMode = "keyword" | "title" | "title_outline";
type ArticleType = "auto" | "how_to" | "list" | "what_is" | "pillar" | "alternatives" | "best_of" | "comparison" | "newsjacking";
type InternalLinkDensity = "minimal" | "light" | "balanced" | "rich";

const ARTICLE_TYPE_OPTIONS: Array<{ value: ArticleType; label: string; description: string }> = [
  { value: "auto", label: "Auto", description: "Pick the best structure from the brief." },
  { value: "how_to", label: "How-to", description: "Step-by-step educational article." },
  { value: "list", label: "List", description: "Tips, examples, resources, or ideas." },
  { value: "what_is", label: "What is", description: "Definition-led informational article." },
  { value: "pillar", label: "Pillar", description: "Broad guide with cluster-style sections." },
  { value: "alternatives", label: "Alternatives", description: "Commercial list against one competitor." },
  { value: "best_of", label: "Best-of", description: "Ranked products with selection criteria." },
  { value: "comparison", label: "Comparison", description: "One product versus another." },
  { value: "newsjacking", label: "Newsjacking", description: "Timely article tied to a news event." },
];

const LINK_DENSITY_OPTIONS: Array<{ value: InternalLinkDensity; label: string; shortLabel: string }> = [
  { value: "minimal", label: "Up to 1-2 relevant links", shortLabel: "1-2" },
  { value: "light", label: "Up to 3-4 relevant links", shortLabel: "3-4" },
  { value: "balanced", label: "Up to 5-7 relevant links", shortLabel: "5-7" },
  { value: "rich", label: "Up to 8-12 relevant links", shortLabel: "8-12" },
];
const LINK_DENSITY_LABELS = Object.fromEntries(
  LINK_DENSITY_OPTIONS.map((option) => [option.value, option.label])
) as Record<InternalLinkDensity, string>;

function isInternalLinkDensity(value: unknown): value is InternalLinkDensity {
  return LINK_DENSITY_OPTIONS.some((option) => option.value === value);
}

interface Campaign {
  id: string;
}

interface CampaignItem {
  id: string;
}

function parseSharedOutline(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^h3\s*:/i.test(line)) return { level: 3, text: line.replace(/^h3\s*:/i, "").trim() };
      if (/^h2\s*:/i.test(line)) return { level: 2, text: line.replace(/^h2\s*:/i, "").trim() };
      return { level: 2, text: line };
    })
    .filter((heading) => heading.text);
}

function linesCount(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

const formatCost = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(value);

function CostEstimateCard({ estimate }: { estimate: CostEstimate }) {
  return (
    <div className="rounded-lg border border-byword-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-byword-blue" />
          <p className="font-semibold">Projected cost</p>
        </div>
        <p className="text-lg font-bold">{formatCost(estimate.totalExpected)}</p>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Text {formatCost(estimate.textCost)}</span>
        <span>Cover {formatCost(estimate.coverImageCost)}</span>
        <span>Inline {formatCost(estimate.inlineImageCost)}</span>
      </div>
      <div className="mt-3 rounded-md border border-byword-border bg-card p-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-3 font-medium text-foreground">
          <span>Per draft text</span>
          <span>{formatCost(estimate.textCostPerPost)} × {estimate.postCount}</span>
        </div>
        <div className="mt-2 grid gap-1 sm:grid-cols-3">
          <span>Prompt ~{Math.round(estimate.promptTokensPerPost).toLocaleString()} tokens · {formatCost(estimate.promptCostPerPost)}</span>
          <span>Output ~{Math.round(estimate.completionTokensPerPost).toLocaleString()} tokens · {formatCost(estimate.completionCostPerPost)}</span>
          <span>Request {formatCost(estimate.requestCostPerPost)}</span>
        </div>
        <p className="mt-2">
          Rates: ${estimate.promptPricePerMillion.toFixed(2)}/M input · ${estimate.completionPricePerMillion.toFixed(2)}/M output.
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {estimate.postCount} post{estimate.postCount === 1 ? "" : "s"} · high estimate {formatCost(estimate.totalHigh)}
      </p>
    </div>
  );
}

function TopicFitNote({ result }: { result: TopicFitResult }) {
  const toneClass = {
    good: "border-[hsl(var(--status-success)/0.28)] bg-[hsl(var(--status-success)/0.08)]",
    context: "border-[hsl(var(--status-warning)/0.32)] bg-[hsl(var(--status-warning)/0.1)]",
    scale: "border-byword-blue/25 bg-byword-blue-soft/35",
    neutral: "border-byword-border bg-muted/20 text-foreground",
  }[result.tone];

  return (
    <div className={cn("rounded-lg border border-l-4 px-4 py-3 text-sm text-foreground", toneClass)}>
      <p className="font-semibold">{result.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{result.detail}</p>
    </div>
  );
}

function GenerationBrief({
  title,
  source,
  persona,
  model,
  estimate,
  imagePlan,
  linkState,
  linksEnabled,
  linkDensity,
  onLinkDensityChange,
  topicFit,
  blockers,
}: {
  title: string;
  source: string;
  persona: string;
  model: string;
  estimate: CostEstimate;
  imagePlan: string;
  linkState: string;
  linksEnabled: boolean;
  linkDensity: InternalLinkDensity;
  onLinkDensityChange: (density: InternalLinkDensity) => void;
  topicFit: TopicFitResult;
  blockers: string[];
}) {
  const statusTone: SemanticTone = blockers.length ? "risk" : topicFit.tone === "good" ? "success" : topicFit.tone === "context" ? "opportunity" : "performance";
  const items = [
    { label: "Source", value: source || "Missing", tone: source ? "performance" as SemanticTone : "risk" as SemanticTone },
    { label: "Voice", value: persona || "No persona", tone: persona ? "success" as SemanticTone : "risk" as SemanticTone },
    { label: "Model", value: model || "No model", tone: model ? "neutral" as SemanticTone : "risk" as SemanticTone },
    { label: "Cost", value: formatCompactCurrency(estimate.totalExpected), tone: "opportunity" as SemanticTone },
    { label: "Images", value: imagePlan, tone: imagePlan === "Off" ? "neutral" as SemanticTone : "performance" as SemanticTone },
    { label: "Links", value: linkState, tone: linkState === "Off" ? "neutral" as SemanticTone : "success" as SemanticTone },
  ];

  return (
    <div className="rounded-lg border border-byword-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{topicFit.title}</p>
        </div>
        <span className={cn("rounded-md border px-2.5 py-1 text-xs font-semibold", semanticToneClass(statusTone))}>
          {blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}` : "Ready"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className={cn("rounded-md border px-3 py-2", semanticToneClass(item.tone))}>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">{item.label}</p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
      <div className={cn("mt-3 rounded-md border px-3 py-2", linksEnabled ? semanticToneClass("success") : semanticToneClass("neutral"))}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">Link density</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{linksEnabled ? "Applies to this generation" : "Internal links off"}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LINK_DENSITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!linksEnabled}
                onClick={() => onLinkDensityChange(option.value)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-semibold transition-calm disabled:cursor-not-allowed disabled:opacity-45",
                  linksEnabled && linkDensity === option.value
                    ? "border-[hsl(var(--status-success)/0.45)] bg-[hsl(var(--status-success)/0.16)] text-[hsl(var(--status-success))]"
                    : "border-byword-border bg-card text-foreground hover:border-[hsl(var(--status-success)/0.45)]"
                )}
                title={option.label}
              >
                {option.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>
      {blockers.length > 0 && (
        <div className="mt-3 grid gap-2">
          {blockers.map((blocker) => (
            <p key={blocker} className="flex items-center gap-2 rounded-md border border-[hsl(var(--status-error)/0.35)] bg-[hsl(var(--status-error)/0.12)] px-3 py-2 text-xs font-medium text-[hsl(var(--status-error))]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {blocker}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContentCreator() {
  const { user } = useAuth();
  const { activeSiteId } = useSites();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const seoPlanParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialCreationMode = parseCreationMode(location.search);
  const [creationMode, setCreationMode] = useState<CreationMode>(initialCreationMode);
  const [sourceType, setSourceType] = useState("url");
  const [articleKeyword, setArticleKeyword] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleTitlePreview, setArticleTitlePreview] = useState("");
  const [articleRelatedKeywords, setArticleRelatedKeywords] = useState("");
  const [articleOutline, setArticleOutline] = useState("");
  const [articleDirection, setArticleDirection] = useState("");
  const [articleCustomInstructions, setArticleCustomInstructions] = useState("");
  const [articleType, setArticleType] = useState<ArticleType>("auto");
  const [articleWordCount, setArticleWordCount] = useState("");
  const [articleIncludeToc, setArticleIncludeToc] = useState(false);
  const [articleResearchFocus, setArticleResearchFocus] = useState(false);
  const [articleAdvancedOpen, setArticleAdvancedOpen] = useState(false);
  const [isPlanningArticle, setIsPlanningArticle] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPath, setPdfPath] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [personaId, setPersonaId] = useState("");
  const [modelId, setModelId] = useState("anthropic/claude-3.5-sonnet");
  const [variations, setVariations] = useState<1 | 3 | 5>(1);
  const [imageConfig, setImageConfig] = useState<SplitImageConfig>(DEFAULT_SPLIT_CONFIG);
  const [imageDeliveryMode, setImageDeliveryMode] = useState<ImageDeliveryMode>("generate");
  const [manualImageProvider, setManualImageProvider] = useState<ManualImageProvider>("midjourney");
  const [internalLinkDensity, setInternalLinkDensity] = useState<InternalLinkDensity>("balanced");
  const [showConcurrentDialog, setShowConcurrentDialog] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("keyword");
  const [campaignOutlineMode, setCampaignOutlineMode] = useState("none");
  const [campaignLines, setCampaignLines] = useState("");
  const [campaignSharedOutline, setCampaignSharedOutline] = useState("");
  const [campaignCustomInstructions, setCampaignCustomInstructions] = useState("");
  const [campaignStartNow, setCampaignStartNow] = useState(true);
  const [pendingCostAction, setPendingCostAction] = useState<"article" | "campaign" | null>(null);

  const refetchPostsRef = useRef<(() => void) | null>(null);
  const userSelectedModelRef = useRef(false);

  const {
    activeJobs,
    runningCount,
    canStartParallel,
    maxParallel,
    startJob,
    dismissJob,
    updateJob,
  } = useJobTracker(() => {
    refetchPostsRef.current?.();
  });

  useEffect(() => {
    setCreationMode(parseCreationMode(location.search));
    const itemId = seoPlanParams.get("seoPlanItemId");
    if (!itemId) return;
    const action = seoPlanParams.get("seoAction") || "new_content";
    const targetQuery = seoPlanParams.get("targetQuery") || "";
    const pageUrl = seoPlanParams.get("pageUrl") || "";
    setCreationMode("article");
    setArticleRelatedKeywords(targetQuery);
    if (action === "new_content") {
      setSourceType("article_keyword");
      setArticleKeyword(targetQuery);
    } else {
      setSourceType("url");
      setSourceUrl(stripHttpProtocol(pageUrl));
      setArticleDirection(seoActionInstruction(action, targetQuery));
    }
  }, [location.search, seoPlanParams]);

  const selectCreationMode = (mode: CreationMode) => {
    setCreationMode(mode);
    navigate(mode === "article" ? "/create" : `/create?mode=${mode}`, { replace: true });
  };

  // Fetch user settings for image defaults
  const { data: userSettings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      return api.get<ContentUserSettings>("/settings");
    },
    enabled: !!user,
  });

  // Apply user defaults when settings load
  useEffect(() => {
    if (userSettings) {
      setImageConfig({
        cover: {
          enabled: userSettings.cover_enabled ?? true,
          resolution: normalizeImageResolution(userSettings.cover_image_resolution),
        },
        inline: {
          enabled: userSettings.inline_enabled ?? true,
          count: userSettings.inline_count ?? 2,
          resolution: normalizeImageResolution(userSettings.inline_image_resolution),
        },
      });
      setInternalLinkDensity(
        isInternalLinkDensity(userSettings.internal_link_density) ? userSettings.internal_link_density : "balanced"
      );
      setImageDeliveryMode(normalizeImageDeliveryMode(userSettings.image_delivery_mode));
      setManualImageProvider(normalizeManualImageProvider(userSettings.manual_image_provider));
    }
  }, [userSettings]);

  // Fetch personas
  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      return api.getArray<PersonaOption>("/personas");
    },
  });

  // Filter to only active personas for the dropdown
  const activePersonas = useMemo(() => personas.filter((p) => p.status === "active"), [personas]);
  const { data: textModels = [] } = useTextModels();
  const { data: imageModels = [] } = useImageModels();
  const selectedModelUnavailable = isUnavailableModel(modelId, textModels);
  const fallbackTextModelId = preferredTextModelId(textModels);
  const selectedPersona = activePersonas.find((persona) => persona.id === personaId);
  const selectedTextModel = textModels.find((model) => model.id === modelId);
  const selectedImageModelId = normalizeCoverImageModelId(userSettings?.image_model);
  const selectedInlineImageModelId = normalizeInlineImageModelId(
    userSettings?.inline_image_model
  );
  const selectedInlineImageSource = normalizeInlineImageSource(
    userSettings?.inline_image_source
  );
  const selectedImageModel = imageModels.find((model) => model.id === selectedImageModelId);
  const selectedInlineImageModel = imageModels.find((model) => model.id === selectedInlineImageModelId);
  const { costs: usageCosts, openRouterUsage } = useUsageAnalytics(30);
  const currentMonthSpend = usageCosts?.monthToDateSpend || 0;
  const openRouterData = openRouterUsage?.data || openRouterUsage || {};
  const openRouterRemaining = Number(openRouterData.limit_remaining ?? openRouterData.limitRemaining ?? 0) || null;
  const resolveLiveModelId = useCallback((preferredModelId?: string | null) => {
    if (preferredModelId && (!textModels.length || textModels.some((model) => model.id === preferredModelId))) {
      return preferredModelId;
    }
    return preferredTextModelId(textModels, preferredModelId) || fallbackTextModelId || preferredModelId || modelId;
  }, [fallbackTextModelId, modelId, textModels]);

  const handlePersonaChange = (nextPersonaId: string) => {
    if (nextPersonaId === "default") {
      setPersonaId("");
      return;
    }
    setPersonaId(nextPersonaId);
    const selectedPersona = activePersonas.find((persona) => persona.id === nextPersonaId);
    setModelId(resolveLiveModelId(selectedPersona?.base_model));
  };

  const handleModelChange = (nextModelId: string) => {
    userSelectedModelRef.current = true;
    setModelId(nextModelId);
  };

  const handleCampaignPersonaChange = (nextPersonaId: string) => {
    if (nextPersonaId === "none") {
      setPersonaId("");
      return;
    }
    handlePersonaChange(nextPersonaId);
  };

  useEffect(() => {
    if (!fallbackTextModelId || !selectedModelUnavailable || userSelectedModelRef.current) return;
    setModelId(fallbackTextModelId);
  }, [fallbackTextModelId, selectedModelUnavailable]);

  useEffect(() => {
    if (!personaId || !selectedModelUnavailable || !fallbackTextModelId) return;
    const selectedPersona = activePersonas.find((persona) => persona.id === personaId);
    if (selectedPersona?.base_model === modelId) setModelId(fallbackTextModelId);
  }, [activePersonas, fallbackTextModelId, modelId, personaId, selectedModelUnavailable]);

  useEffect(() => {
    setArticleTitlePreview("");
  }, [articleKeyword]);

  // Fetch recent posts
  const { data: recentPosts = [], refetch: refetchPosts } = useQuery({
    queryKey: ["recent-posts"],
    queryFn: async () => {
      return api.getArray<RecentPost>("/posts?limit=3");
    },
  });

  // Keep ref updated for the job tracker callback
  refetchPostsRef.current = refetchPosts;

  const getSourceValue = () => {
    switch (sourceType) {
      case "article_keyword":
        return articleKeyword;
      case "article_title":
        return articleTitle;
      case "url":
        return normalizeHttpUrl(sourceUrl);
      case "raw_text":
        return rawText;
      case "youtube":
        return normalizeHttpUrl(youtubeUrl);
      case "pdf":
        return pdfPath;
      default:
        return "";
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (!user?.id) {
      toast.error("You must be logged in to upload files");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<{ path: string }>("/content/upload-pdf", formData);
      setPdfFile(file);
      setPdfPath(result.path);
      toast.success("PDF uploaded successfully!");
    } catch (err) {
      console.error("PDF upload error:", err);
      toast.error("Failed to upload PDF");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("PDF must be under 10MB");
        return;
      }
      handlePdfUpload(file);
    }
  };

  const clearPdf = () => {
    setPdfFile(null);
    setPdfPath("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isGenerating = runningCount > 0;
  const campaignItemCount = linesCount(campaignLines);
  const campaignSharedOutlineCount = parseSharedOutline(campaignSharedOutline).length;
  const campaignHasTooManyItems = campaignItemCount > 100;
  const campaignNeedsSharedOutline = campaignMode === "title_outline" && campaignOutlineMode === "shared" && campaignSharedOutlineCount === 0;
  const campaignCanSubmit = Boolean(
    campaignName.trim() &&
    modelId.trim() &&
    campaignItemCount &&
    !campaignHasTooManyItems &&
    !campaignNeedsSharedOutline &&
    !selectedModelUnavailable
  );
  const campaignBlocker = !campaignName.trim()
    ? "Add a campaign name."
    : !campaignItemCount
      ? "Add at least one item."
      : campaignHasTooManyItems
        ? "Campaigns support up to 100 items."
        : campaignNeedsSharedOutline
          ? "Add at least one shared heading."
          : selectedModelUnavailable
            ? "Pick a live OpenRouter model."
            : "";
  const effectiveWordCount = Number(articleWordCount) || userSettings?.article_word_count || 1500;
  const articleCostEstimate = useMemo(() => estimateGenerationCost({
    postCount: variations,
    articleWordCount: effectiveWordCount,
    textModel: selectedTextModel,
    imageModel: selectedImageModel,
    inlineImageModel: selectedInlineImageModel,
    imageConfig,
    imageDeliveryMode,
    inlineImageSource: selectedInlineImageSource,
  }), [variations, effectiveWordCount, selectedTextModel, selectedImageModel, selectedInlineImageModel, imageConfig, imageDeliveryMode, selectedInlineImageSource]);
  const campaignCostEstimate = useMemo(() => estimateGenerationCost({
    postCount: Math.max(1, campaignItemCount),
    articleWordCount: userSettings?.article_word_count || 1500,
    textModel: selectedTextModel,
    imageModel: selectedImageModel,
    inlineImageModel: selectedInlineImageModel,
    imageConfig,
    imageDeliveryMode,
    inlineImageSource: selectedInlineImageSource,
  }), [campaignItemCount, userSettings?.article_word_count, selectedTextModel, selectedImageModel, selectedInlineImageModel, imageConfig, imageDeliveryMode, selectedInlineImageSource]);
  const costWarningInput = (estimate: CostEstimate) => ({
    estimate,
    monthlyBudget: userSettings?.monthly_budget,
    currentMonthSpend,
    openRouterRemaining,
  });
  const selectedArticleType = ARTICLE_TYPE_OPTIONS.find((option) => option.value === articleType) || ARTICLE_TYPE_OPTIONS[0];
  const internalLinksEnabled = Boolean(userSettings?.enable_internal_links);
  const contractLinkLabel = internalLinksEnabled
    ? LINK_DENSITY_LABELS[internalLinkDensity]
    : "Off";
  const articleTopicFit = useMemo(
    () => analyzeTopicFit(sourceType === "article_title" ? articleTitle : articleKeyword),
    [articleKeyword, articleTitle, sourceType]
  );
  const campaignTopicFit = useMemo(() => analyzeCampaignPattern(campaignLines), [campaignLines]);

  const getSourceLabel = () => {
    switch (sourceType) {
      case "article_keyword": return articleKeyword.slice(0, 40) || "Keyword";
      case "article_title": return articleTitle.slice(0, 40) || "Title";
      case "url": return sourceUrl.slice(0, 40) || "URL";
      case "youtube": return youtubeUrl.slice(0, 40) || "YouTube";
      case "pdf": return pdfFile?.name || "PDF";
      case "raw_text": return rawText.slice(0, 40) || "Text";
      default: return "Source";
    }
  };
  const imagePlanLabel = imageDeliveryMode === "manual_prompt"
    ? [
      imageConfig.cover.enabled ? "Cover prompt slot" : "",
      imageConfig.inline.enabled && imageConfig.inline.count > 0 ? `${imageConfig.inline.count} inline prompt slot${imageConfig.inline.count === 1 ? "" : "s"}` : "",
      "$0 image generation",
    ].filter(Boolean).join(" · ") || "Off"
    : imageConfig.cover.enabled || (imageConfig.inline.enabled && imageConfig.inline.count > 0)
    ? `${imageConfig.cover.enabled ? "Cover AI" : "No cover"} · ${imageConfig.inline.enabled ? `${imageConfig.inline.count} inline ${selectedInlineImageSource === "stock" ? "stock" : "AI"}` : "No inline"}`
    : "Off";
  const articleBriefBlockers = [
    !getSourceValue().trim() ? "Add source content." : "",
    selectedModelUnavailable ? "Pick a live OpenRouter model." : "",
    shouldWarnForCost(costWarningInput(articleCostEstimate)) ? "Projected cost needs confirmation." : "",
  ].filter(Boolean);
  const campaignBriefBlockers = [
    campaignBlocker,
    shouldWarnForCost(costWarningInput(campaignCostEstimate)) ? "Projected campaign cost needs confirmation." : "",
  ].filter(Boolean);

  const executeGeneration = async () => {
    const sourceValue = getSourceValue();
    const imagesEnabled = imageConfig.cover.enabled || (imageConfig.inline.enabled && imageConfig.inline.count > 0);
    const isArticleSource = sourceType.startsWith("article_");
    const draftBatchId = variations > 1 ? `draft_batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : undefined;

    const buildPayload = (draftIndex?: number) => ({
      sourceType,
      sourceValue,
      personaId: personaId || null,
      modelId,
      variations: 1,
      draftBatchId,
      draftVariationIndex: draftIndex,
      draftVariationCount: variations > 1 ? variations : undefined,
      relatedKeywords: isArticleSource
        ? articleRelatedKeywords.split(",").map((keyword) => keyword.trim()).filter(Boolean).slice(0, 5)
        : undefined,
      outline: isArticleSource ? articleOutline : undefined,
      articleDirection: isArticleSource ? articleDirection : undefined,
      customInstructions: isArticleSource ? articleCustomInstructions : undefined,
      articleType: isArticleSource ? articleType : undefined,
      articleTitleOverride: sourceType === "article_keyword" ? articleTitlePreview : undefined,
      articleWordCount: isArticleSource && articleWordCount ? Number(articleWordCount) : undefined,
      includeTableOfContents: isArticleSource && articleIncludeToc ? true : undefined,
      enableResearch: isArticleSource && articleResearchFocus ? true : undefined,
      internalLinkDensity: internalLinksEnabled ? internalLinkDensity : undefined,
      generateImages: imagesEnabled,
      imageDeliveryMode,
      manualImageProvider,
      imageConfig: imagesEnabled ? {
        cover: imageConfig.cover.enabled ? { resolution: imageConfig.cover.resolution || "1K" } : null,
        inline: imageConfig.inline.enabled ? {
          count: imageConfig.inline.count,
          resolution: imageConfig.inline.resolution || "1K",
        } : null,
      } : undefined,
      siteId: seoPlanParams.get("siteId") || activeSiteId || undefined,
      campaignId: seoPlanParams.get("campaignId") || undefined,
      campaignItemId: seoPlanParams.get("seoPlanItemId") || undefined,
    });

    const startOneDraft = async (draftIndex?: number) => {
      const trackId = startJob({
        jobId: null,
        sourceType: sourceType as SourceType,
        sourceLabel: variations > 1 ? `${getSourceLabel()} · Draft ${draftIndex}/${variations}` : getSourceLabel(),
        variations: 1,
      });

      try {
        const data = await api.post<GenerateResponse>("/content/generate", buildPayload(draftIndex));
        if (data.error) throw new Error(data.error);

        const jobId = data.jobId;
        if (data.postIds?.length) {
          updateJob(trackId, { step: "complete", jobId });
          refetchPosts();
        } else if (jobId) {
          updateJob(trackId, { jobId, step: "generating" });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to generate content";
        updateJob(trackId, { step: "error", error: errorMessage });
        throw err;
      }
    };

    try {
      if (variations > 1) {
        const results = await Promise.allSettled(
          Array.from({ length: variations }, (_, index) => startOneDraft(index + 1))
        );
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed) throw new Error(`${failed}/${variations} drafts failed to start.`);
        toast.info(`${variations} separate draft jobs started.`);
      } else {
        await startOneDraft();
        toast.info("Draft job started. Generating...");
      }
    } catch (err) {
      console.error("Generation error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to generate content";
      toast.error(errorMessage);
    }
  };

  const handleGenerate = async () => {
    if (selectedModelUnavailable) {
      toast.error("Selected model is no longer available on OpenRouter.");
      return;
    }

    const sourceValue = getSourceValue();
    if (!sourceValue.trim()) {
      toast.error("Please provide source content.");
      return;
    }

    if (shouldWarnForCost(costWarningInput(articleCostEstimate))) {
      setPendingCostAction("article");
      return;
    }

    // If jobs are running, show the concurrent dialog
    if (runningCount > 0) {
      setShowConcurrentDialog(true);
      return;
    }

    await executeGeneration();
  };

  const handleGenerateArticlePlan = async () => {
    if (selectedModelUnavailable) {
      toast.error("Selected model is no longer available on OpenRouter.");
      return;
    }

    const sourceValue = getSourceValue();
    if (!sourceValue.trim()) {
      toast.error(sourceType === "article_title" ? "Enter a title first." : "Enter a keyword first.");
      return;
    }

    setIsPlanningArticle(true);
    try {
      const plan = await api.post<ArticlePlanResponse>("/content/article-plan", {
        sourceType,
        sourceValue,
        personaId: personaId || null,
        modelId,
        relatedKeywords: articleRelatedKeywords.split(",").map((keyword) => keyword.trim()).filter(Boolean).slice(0, 5),
        articleDirection,
        articleType,
        articleWordCount: articleWordCount ? Number(articleWordCount) : undefined,
        includeTableOfContents: articleIncludeToc || undefined,
        enableResearch: articleResearchFocus || undefined,
      });

      if (sourceType === "article_keyword") setArticleTitlePreview(plan.title);
      else setArticleTitle(plan.title);
      setArticleOutline(plan.outline);
      toast.success("Title and outline ready.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate article plan";
      toast.error(message);
    } finally {
      setIsPlanningArticle(false);
    }
  };

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const imagesEnabled = imageConfig.cover.enabled || (imageConfig.inline.enabled && imageConfig.inline.count > 0);
      const result = await api.post<{ campaign: Campaign; items: CampaignItem[] }>("/campaigns", {
        name: campaignName,
        mode: campaignMode,
        outlineMode: campaignMode === "title_outline" ? campaignOutlineMode : "none",
        lines: campaignLines,
        sharedOutline: parseSharedOutline(campaignSharedOutline),
        personaId: personaId || null,
        modelId,
        customInstructions: campaignCustomInstructions,
        internalLinkDensity: internalLinksEnabled ? internalLinkDensity : undefined,
        generateImages: imagesEnabled,
        imageDeliveryMode,
        manualImageProvider,
        imageConfig: imagesEnabled ? imageConfig : null,
        siteId: activeSiteId || undefined,
      });
      if (campaignStartNow) await api.post(`/campaigns/${result.campaign.id}/start`);
      return result;
    },
    onSuccess: ({ campaign }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(campaignStartNow ? "Campaign started" : "Campaign created");
      navigate(`/sources/campaigns/${campaign.id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create campaign"),
  });

  const handleCreateCampaign = () => {
    if (campaignNeedsSharedOutline) {
      toast.error("Add at least one shared heading.");
      return;
    }
    if (shouldWarnForCost(costWarningInput(campaignCostEstimate))) {
      setPendingCostAction("campaign");
      return;
    }
    createCampaignMutation.mutate();
  };

  const confirmCost = async () => {
    const action = pendingCostAction;
    setPendingCostAction(null);
    if (action === "campaign") {
      createCampaignMutation.mutate();
      return;
    }
    if (action === "article") {
      if (runningCount > 0) setShowConcurrentDialog(true);
      else await executeGeneration();
    }
  };

  const handleConcurrentAction = async (action: ConcurrentAction) => {
    setShowConcurrentDialog(false);

    if (action === "dismiss") return;

    if (action === "parallel") {
      await executeGeneration();
    } else if (action === "queue") {
      toast.info("Job queued. It will start when the current job finishes.");
      // For now, just start it - the backend handles isolation per job ID
      await executeGeneration();
    } else if (action === "cancel_current") {
      // Dismiss all running jobs from UI
      activeJobs
        .filter((j) => j.step !== "complete" && j.step !== "error")
        .forEach((j) => dismissJob(j.id));
      await executeGeneration();
    }
  };
  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Create Content"
        description={`Welcome to BlogFactory${user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}. Create article drafts or batch campaigns from one place.`}
      />

      <div className={cn("mx-auto space-y-9", creationMode === "programmatic" ? "max-w-7xl" : "max-w-5xl")}>
        <div className="flex items-center gap-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <div className="h-px flex-1 bg-byword-border" />
          Choose how to create
          <div className="h-px flex-1 bg-byword-border" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <OptionCard
            icon={FileTextIcon}
            title="Article"
            description="One source in, one optimized article draft out."
            selected={creationMode === "article"}
            onClick={() => selectCreationMode("article")}
          />
          <OptionCard
            icon={Layers}
            title="Campaign"
            description="Batch multiple articles with shared strategy and context."
            badge="Batch"
            selected={creationMode === "campaign"}
            onClick={() => selectCreationMode("campaign")}
          />
          <OptionCard
            icon={Grid2X2}
            title="Programmatic"
            description="Generate from templates and structured data at scale."
            selected={creationMode === "programmatic"}
            onClick={() => selectCreationMode("programmatic")}
          />
        </div>

        <BywordCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconTile icon={Archive} />
              <div>
                <p className="text-sm font-semibold">Import prepared posts</p>
                <p className="text-xs text-muted-foreground">Bring in markdown and images from a zip package.</p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/sources/batch-import">Open Batch Import</Link>
            </Button>
          </div>
        </BywordCard>

        {creationMode === "article" && (
          <>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)] xl:items-start">
          <div className="min-w-0">
        <BywordCard>
          <SectionHeader
            icon={Sparkles}
            title="Your next article"
            description="Choose a source, configure the draft, and send it to the generation queue."
          />
          <div className="p-6">
            <Tabs
              value={sourceType.startsWith("article_") ? "article" : sourceType}
              onValueChange={(value) => setSourceType(value === "article" ? "article_keyword" : value)}
            >
              <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-2 rounded-lg bg-muted/60 p-1 sm:grid-cols-5">
                <TabsTrigger value="article" className="gap-2 rounded-md">
                  <Sparkles className="h-4 w-4" />
                  Article
                </TabsTrigger>
                <TabsTrigger value="url" className="gap-2 rounded-md">
                  <LinkIcon className="h-4 w-4" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="pdf" className="gap-2 rounded-md">
                  <Upload className="h-4 w-4" />
                  PDF
                </TabsTrigger>
                <TabsTrigger value="raw_text" className="gap-2 rounded-md">
                  <FileText className="h-4 w-4" />
                  Text
                </TabsTrigger>
                <TabsTrigger value="youtube" className="gap-2 rounded-md">
                  <Youtube className="h-4 w-4" />
                  YouTube
                </TabsTrigger>
              </TabsList>

              <TabsContent value="article" className="space-y-4">
                <Tabs value={sourceType} onValueChange={setSourceType}>
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-lg bg-muted/60 p-1">
                    <TabsTrigger value="article_keyword" className="rounded-md">Keyword</TabsTrigger>
                    <TabsTrigger value="article_title" className="rounded-md">Title</TabsTrigger>
                  </TabsList>

                  <TabsContent value="article_keyword" className="space-y-2">
                    <Label>Target Keyword</Label>
                    <div className="relative">
                      <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="best standing desks for home office"
                        value={articleKeyword}
                        onChange={(e) => setArticleKeyword(e.target.value)}
                        className="h-11 pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Generate an SEO-focused title and article from this keyword.
                    </p>
                    <TopicFitNote result={articleTopicFit} />
                  </TabsContent>

                  <TabsContent value="article_title" className="space-y-2">
                    <Label>Article Title</Label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="The Ultimate Guide to Remote Team Management"
                        value={articleTitle}
                        onChange={(e) => setArticleTitle(e.target.value)}
                        className="h-11 pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Keep this title and generate a publish-ready article around it.
                    </p>
                    <TopicFitNote result={articleTopicFit} />
                  </TabsContent>
                </Tabs>

                {sourceType === "article_keyword" && articleTitlePreview && (
                  <div className="space-y-2">
                    <Label>Title Preview</Label>
                    <Input
                      value={articleTitlePreview}
                      onChange={(e) => setArticleTitlePreview(e.target.value)}
                      className="h-11"
                    />
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Angle</Label>
                    <Input
                      placeholder="Original data, product POV, customer example"
                      value={articleDirection}
                      onChange={(e) => setArticleDirection(e.target.value)}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Instructions</Label>
                    <Input
                      placeholder="Keep it practical, skeptical, and example-led"
                      value={articleCustomInstructions}
                      onChange={(e) => setArticleCustomInstructions(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>

                <Collapsible open={articleAdvancedOpen} onOpenChange={setArticleAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between">
                      <span className="inline-flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        Advanced article controls
                      </span>
                      <span className="text-xs text-muted-foreground">{articleAdvancedOpen ? "Hide" : "Show"}</span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Article Type</Label>
                        <Select value={articleType} onValueChange={(value) => setArticleType(value as ArticleType)}>
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ARTICLE_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{selectedArticleType.description}</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Related Keywords</Label>
                        <Input
                          placeholder="free project management software, agile project management"
                          value={articleRelatedKeywords}
                          onChange={(e) => setArticleRelatedKeywords(e.target.value)}
                          className="h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Word Count</Label>
                        <Input
                          type="number"
                          min={300}
                          step={100}
                          placeholder="Smart"
                          value={articleWordCount}
                          onChange={(e) => setArticleWordCount(e.target.value)}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex items-center gap-3 rounded-lg border border-byword-border bg-card px-4 py-3 text-sm">
                        <Checkbox checked={articleIncludeToc} onCheckedChange={(checked) => setArticleIncludeToc(Boolean(checked))} />
                        Table of contents
                      </label>

                      <label className="flex items-center gap-3 rounded-lg border border-byword-border bg-card px-4 py-3 text-sm">
                        <Checkbox checked={articleResearchFocus} onCheckedChange={(checked) => setArticleResearchFocus(Boolean(checked))} />
                        Research emphasis
                      </label>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Outline</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateArticlePlan}
                          disabled={isPlanningArticle || selectedModelUnavailable}
                        >
                          {isPlanningArticle ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          Generate title + outline
                        </Button>
                      </div>
                      <Textarea
                        placeholder={"H2: What to look for\nH2: Top options\nH3: Budget picks"}
                        value={articleOutline}
                        onChange={(e) => setArticleOutline(e.target.value)}
                        className="min-h-[120px] resize-none"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </TabsContent>

              <TabsContent value="url" className="space-y-2">
                <Label>Source URL</Label>
                <InputAffordance
                  type="text"
                  inputMode="url"
                  prefix="https://"
                  icon={LinkIcon}
                  placeholder="example.com/article-source"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(stripHttpProtocol(e.target.value))}
                  className="h-11"
                  help="Paste the source URL. BlogFactory adds HTTPS when you omit it."
                  onClear={() => setSourceUrl("")}
                  clearLabel="Clear source URL"
                />
                <p className="text-xs text-muted-foreground">
                  Provide a direct link to the source article or blog post.
                </p>
              </TabsContent>

              <TabsContent value="pdf" className="space-y-4">
                <Label>PDF Document</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {pdfFile ? (
                  <div className="flex items-center gap-3 rounded-lg border border-byword-border bg-muted/30 p-4">
                    <IconTile icon={FileText} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pdfFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(pdfFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearPdf}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full rounded-lg border border-dashed border-byword-border bg-muted/20 p-9 text-center transition-calm hover:border-byword-blue/50 hover:bg-byword-blue-soft/30"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-byword-blue" />
                        <p className="mb-1 text-sm font-medium">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="mx-auto mb-3 h-8 w-8 text-byword-blue" />
                        <p className="mb-1 text-sm font-medium">Drop a PDF or click to browse</p>
                        <p className="text-xs text-muted-foreground">Max 10MB</p>
                      </>
                    )}
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload a PDF document to extract content for blog generation.
                </p>
              </TabsContent>

              <TabsContent value="raw_text" className="space-y-2">
                <Label>Source Content</Label>
                <Textarea
                  placeholder="Paste or type your content here..."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="min-h-[220px] resize-none"
                />
              </TabsContent>

              <TabsContent value="youtube" className="space-y-2">
                <Label>YouTube URL</Label>
                <InputAffordance
                  type="text"
                  inputMode="url"
                  prefix="https://"
                  icon={Youtube}
                  placeholder="www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(stripHttpProtocol(e.target.value))}
                  className="h-11"
                  help="Paste a YouTube URL. BlogFactory adds HTTPS when you omit it."
                  onClear={() => setYoutubeUrl("")}
                  clearLabel="Clear YouTube URL"
                />
                <p className="text-xs text-muted-foreground">
                  Paste a YouTube video URL to generate content from its transcript.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </BywordCard>
          </div>

          <div className="min-w-0 space-y-6 xl:sticky xl:top-6">
        <BywordCard>
          <SectionHeader
            icon={SlidersHorizontal}
            title="Generation controls"
            description="Voice, model, images, links, and draft count."
          />
          <div className="space-y-7 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Brand voice <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Select value={personaId || "default"} onValueChange={handlePersonaChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default editorial voice</SelectItem>
                    {activePersonas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.name}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Use the built-in editorial voice now; add a brand voice when you need one.</p>
              </div>

              <div className="space-y-2">
                <Label>OpenRouter Text Model</Label>
                <LiveTextModelSelect value={modelId} onValueChange={handleModelChange} triggerClassName="h-11" />
                {selectedModelUnavailable && (
                  <p className="text-xs text-destructive">Unavailable: {modelId}. Pick a live OpenRouter model.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  $ = low cost, $$ = medium, $$$ = high.
                </p>
              </div>
            </div>

            <GenerationBrief
              title="Generation brief"
              source={getSourceLabel()}
              persona={selectedPersona?.name || "Default editorial voice"}
              model={selectedTextModel?.name || modelId}
              estimate={articleCostEstimate}
              imagePlan={imagePlanLabel}
              linkState={contractLinkLabel}
              linksEnabled={internalLinksEnabled}
              linkDensity={internalLinkDensity}
              onLinkDensityChange={setInternalLinkDensity}
              topicFit={articleTopicFit}
              blockers={articleBriefBlockers}
            />

            <SplitImageGenerationSettings
              config={imageConfig}
              onConfigChange={setImageConfig}
              compact
              inlineImageSource={selectedInlineImageSource}
              imageDeliveryMode={imageDeliveryMode}
              manualImageProvider={manualImageProvider}
              onImageDeliveryModeChange={setImageDeliveryMode}
              coverResolutions={selectedImageModel?.constraints?.resolutions}
              inlineResolutions={selectedInlineImageModel?.constraints?.resolutions}
            />

            <div className="space-y-3">
              <Label>Output Variations</Label>
              <div className="grid grid-cols-3 gap-3">
                {([1, 3, 5] as const).map((num) => (
                  <button
                    key={num}
                    onClick={() => setVariations(num)}
                    className={cn(
                      "rounded-lg border p-4 text-center transition-calm",
                      variations === num
                        ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                        : "border-byword-border bg-card hover:border-byword-blue/40"
                    )}
                  >
                    <p className="text-base font-semibold">
                      {num} Draft{num > 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {num === 1 ? "Fastest" : num === 3 ? "Recommended" : "Exploratory"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <ActiveJobsPanel jobs={activeJobs} onDismiss={dismissJob} />

            <CostEstimateCard estimate={articleCostEstimate} />

            <Button
              onClick={handleGenerate}
              disabled={selectedModelUnavailable}
              className="h-12 w-full text-base"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {runningCount > 0 ? `New Generation (${runningCount} running)` : "Generate Drafts"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            {!isGenerating && (
              <p className="flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Estimated generation time: about {variations * 15} seconds.
              </p>
            )}
          </div>
        </BywordCard>
          </div>
        </div>

        <BywordCard>
          <SectionHeader
            icon={FileTextIcon}
            title="Recent generations"
            description="The latest drafts created in this workspace."
          />
          <div className="p-6">
            {recentPosts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-byword-border p-8 text-center text-sm text-muted-foreground">
                No posts generated yet. Create your first one.
              </div>
            ) : (
              <div className="grid gap-3">
                {recentPosts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/library/posts/${post.id}/edit`}
                    className="flex items-start gap-3 rounded-lg border border-byword-border bg-card p-4 transition-calm hover:border-byword-blue/40 hover:bg-byword-blue-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byword-blue/40"
                  >
                    <IconTile icon={FileTextIcon} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">
                        {post.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Generated from {post.source_type?.replace("_", " ") || "unknown"}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {safeFormatDistanceToNow(post.created_at)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </BywordCard>
          </>
        )}

        {creationMode === "campaign" && (
          <BywordCard>
            <SectionHeader
              icon={Layers}
              title="Your next campaign"
              description="Batch articles with shared voice, model, image settings, and context."
              action={
                <span className="rounded-md border border-byword-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {campaignItemCount} item{campaignItemCount === 1 ? "" : "s"}
                </span>
              }
            />
            <div className="space-y-7 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Q1 product guides" className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label>Input Mode</Label>
                  <Select value={campaignMode} onValueChange={(value) => setCampaignMode(value as CampaignMode)}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">Keyword</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="title_outline">Title + Outline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-byword-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Flat keyword list? Campaigns is right. Repeatable pattern with variables?{" "}
                <Link to="/create?mode=programmatic" className="font-medium text-byword-blue hover:underline">Use Programmatic</Link>.
              </div>

              {campaignMode === "title_outline" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Outline Mode</Label>
                    <Select value={campaignOutlineMode} onValueChange={setCampaignOutlineMode}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Per line</SelectItem>
                        <SelectItem value="shared">Shared outline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {campaignOutlineMode === "shared" && (
                    <div className="space-y-2">
                      <Label>Shared Outline</Label>
                      <Textarea value={campaignSharedOutline} onChange={(event) => setCampaignSharedOutline(event.target.value)} placeholder={"Introduction\nH3:Key details\nConclusion"} className="min-h-24" />
                      {campaignNeedsSharedOutline && <p className="text-xs text-destructive">Add at least one shared heading.</p>}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Items</Label>
                <Textarea
                  value={campaignLines}
                  onChange={(event) => setCampaignLines(event.target.value)}
                  placeholder={campaignMode === "keyword" ? "best crm for startups" : campaignMode === "title" ? "Best CRM for Startups" : "Best CRM for Startups; Introduction; H3:Pricing; Conclusion"}
                  className="min-h-56 font-mono text-sm"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{campaignItemCount} item{campaignItemCount === 1 ? "" : "s"} ready</span>
                  {campaignHasTooManyItems && <span className="text-destructive">Campaigns support up to 100 items.</span>}
                </div>
                <TopicFitNote result={campaignTopicFit} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Brand Voice</Label>
                  <Select value={personaId || "none"} onValueChange={handleCampaignPersonaChange}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {activePersonas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>OpenRouter Text Model</Label>
                  <LiveTextModelSelect value={modelId} onValueChange={handleModelChange} triggerClassName="h-11" />
                  {selectedModelUnavailable && (
                    <p className="text-xs text-destructive">Unavailable: {modelId}. Pick a live OpenRouter model.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Custom Instructions</Label>
                <Textarea value={campaignCustomInstructions} onChange={(event) => setCampaignCustomInstructions(event.target.value)} className="min-h-24" />
              </div>

              <SplitImageGenerationSettings
                config={imageConfig}
                onConfigChange={setImageConfig}
                compact
                inlineImageSource={selectedInlineImageSource}
                imageDeliveryMode={imageDeliveryMode}
                manualImageProvider={manualImageProvider}
                onImageDeliveryModeChange={setImageDeliveryMode}
                coverResolutions={selectedImageModel?.constraints?.resolutions}
                inlineResolutions={selectedInlineImageModel?.constraints?.resolutions}
              />

              <CostEstimateCard estimate={campaignCostEstimate} />

              <GenerationBrief
                title="Campaign brief"
                source={`${campaignItemCount} ${campaignMode.replace(/_/g, " ")} item${campaignItemCount === 1 ? "" : "s"}`}
                persona={selectedPersona?.name || "Default"}
                model={selectedTextModel?.name || modelId}
                estimate={campaignCostEstimate}
                imagePlan={imagePlanLabel}
                linkState={contractLinkLabel}
                linksEnabled={internalLinksEnabled}
                linkDensity={internalLinkDensity}
                onLinkDensityChange={setInternalLinkDensity}
                topicFit={campaignTopicFit}
                blockers={campaignBriefBlockers}
              />

              <label className="flex items-center gap-3 rounded-lg border border-byword-border bg-muted/20 px-4 py-3 text-sm">
                <Checkbox checked={campaignStartNow} onCheckedChange={(checked) => setCampaignStartNow(Boolean(checked))} />
                <span>
                  <span className="block font-medium">Start after create</span>
                  <span className="block text-xs text-muted-foreground">Turn this off to review the campaign before it runs.</span>
                </span>
              </label>

              <div className="flex flex-col gap-3 border-t border-byword-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className={cn("text-sm text-muted-foreground", campaignBlocker && "text-destructive")} aria-live="polite">
                  {campaignBlocker || (campaignStartNow ? "Ready to create and start." : "Ready to create as a draft.")}
                </p>
                <Button
                  onClick={handleCreateCampaign}
                  disabled={createCampaignMutation.isPending || !campaignCanSubmit}
                  className="h-11 sm:min-w-[220px]"
                >
                  {createCampaignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {createCampaignMutation.isPending ? "Creating..." : campaignStartNow ? "Create & Start Campaign" : "Create Campaign"}
                  {!createCampaignMutation.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </div>
          </BywordCard>
        )}

        {creationMode === "programmatic" && <ProgrammaticPanel />}
      </div>

      <ConcurrentJobDialog
        open={showConcurrentDialog}
        onAction={handleConcurrentAction}
        runningCount={runningCount}
        canStartParallel={canStartParallel}
        maxParallel={maxParallel}
      />
      <Dialog open={!!pendingCostAction} onOpenChange={(open) => !open && setPendingCostAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--status-warning))]" />
              Confirm projected cost
            </DialogTitle>
          </DialogHeader>
          {pendingCostAction && (
            <div className="space-y-4">
              <CostEstimateCard estimate={pendingCostAction === "campaign" ? campaignCostEstimate : articleCostEstimate} />
              <div className="rounded-lg border border-byword-border p-3 text-sm text-muted-foreground">
                {(pendingCostAction === "campaign" ? campaignCostEstimate : articleCostEstimate).assumptions.map((item) => (
                  <p key={item}>- {item}</p>
                ))}
                <p className="mt-2">Actual cost uses provider-returned billing data after each call.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCostAction(null)}>Cancel</Button>
            <Button onClick={confirmCost}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BywordPageShell>
  );
}

function parseCreationMode(search: string): CreationMode {
  const mode = new URLSearchParams(search).get("mode");
  return mode === "campaign" || mode === "programmatic" ? mode : "article";
}

function seoActionInstruction(action: string, targetQuery: string) {
  const query = targetQuery ? ` for the target query “${targetQuery}”` : "";
  if (action === "snippet_test") return `Refresh the article and improve its title and meta-description angle${query}. Preserve the canonical topic and do not change the URL.`;
  if (action === "internal_link") return `Refresh only where useful${query}, and add relevant internal-link opportunities supported by the site index.`;
  return `Refresh declining or outdated sections${query}. Preserve accurate material and make the smallest evidence-backed revision.`;
}

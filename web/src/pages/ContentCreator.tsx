import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { SourceType } from "@/components/content/GenerationProgress";
import { LiveTextModelSelect, isUnavailableModel } from "@/components/content/LiveTextModelSelect";
import {
  SplitImageGenerationSettings,
  SplitImageConfig,
  SplitImageDefaults,
  DEFAULT_SPLIT_CONFIG,
  Resolution,
  AspectRatio
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

interface ContentUserSettings {
  cover_enabled?: boolean | null;
  cover_resolution?: string | null;
  cover_aspect_ratio?: string | null;
  inline_enabled?: boolean | null;
  inline_count?: number | null;
  inline_resolution?: string | null;
  inline_aspect_ratio?: string | null;
}

interface PersonaOption {
  id: string;
  name: string;
  status: string;
  base_model: string;
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

export default function ContentCreator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState("url");
  const [articleKeyword, setArticleKeyword] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleRelatedKeywords, setArticleRelatedKeywords] = useState("");
  const [articleOutline, setArticleOutline] = useState("");
  const [articleDirection, setArticleDirection] = useState("");
  const [articleWordCount, setArticleWordCount] = useState("");
  const [articleIncludeToc, setArticleIncludeToc] = useState(false);
  const [articleResearchFocus, setArticleResearchFocus] = useState(false);
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
  const [showConcurrentDialog, setShowConcurrentDialog] = useState(false);

  const refetchPostsRef = useRef<(() => void) | null>(null);

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
    }
  }, [userSettings]);

  // Get defaults from user settings
  const imageDefaults: SplitImageDefaults | undefined = userSettings
    ? {
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
      }
    : undefined;

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
    onError: () => {
      toast.error("Failed to save defaults");
    },
  });

  // Reset to defaults handler
  const handleResetToDefaults = () => {
    if (imageDefaults) {
      setImageConfig({
        cover: { ...imageDefaults.cover, enabled: imageDefaults.cover.enabled ?? true },
        inline: { ...imageDefaults.inline, enabled: imageDefaults.inline.enabled ?? true },
      });
      toast.success("Reset to your saved defaults");
    }
  };

  // Fetch personas
  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      return api.get<PersonaOption[]>("/personas");
    },
  });

  // Filter to only active personas for the dropdown
  const activePersonas = personas.filter((p) => p.status === "active");
  const { data: textModels = [] } = useTextModels();
  const selectedModelUnavailable = isUnavailableModel(modelId, textModels);
  const fallbackTextModelId = textModels[0]?.id;

  const resolveLiveModelId = useCallback((preferredModelId?: string | null) => {
    if (preferredModelId && (!textModels.length || textModels.some((model) => model.id === preferredModelId))) {
      return preferredModelId;
    }
    return fallbackTextModelId || preferredModelId || modelId;
  }, [fallbackTextModelId, modelId, textModels]);

  const handlePersonaChange = (nextPersonaId: string) => {
    setPersonaId(nextPersonaId);
    const selectedPersona = activePersonas.find((persona) => persona.id === nextPersonaId);
    setModelId(resolveLiveModelId(selectedPersona?.base_model));
  };

  useEffect(() => {
    if (!personaId || !selectedModelUnavailable || !fallbackTextModelId) return;
    const selectedPersona = activePersonas.find((persona) => persona.id === personaId);
    if (selectedPersona?.base_model === modelId) setModelId(fallbackTextModelId);
  }, [activePersonas, fallbackTextModelId, modelId, personaId, selectedModelUnavailable]);

  // Fetch recent posts
  const { data: recentPosts = [], refetch: refetchPosts } = useQuery({
    queryKey: ["recent-posts"],
    queryFn: async () => {
      return api.get<RecentPost[]>("/posts?limit=3");
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
        return sourceUrl;
      case "raw_text":
        return rawText;
      case "youtube":
        return youtubeUrl;
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

  const executeGeneration = async () => {
    const sourceValue = getSourceValue();
    const imagesEnabled = imageConfig.cover.enabled || imageConfig.inline.enabled;
    const isArticleSource = sourceType.startsWith("article_");

    // Show progress immediately before the API call returns
    const trackId = startJob({
      jobId: null,
      sourceType: sourceType as SourceType,
      sourceLabel: getSourceLabel(),
      variations,
    });

    try {
      const data = await api.post<GenerateResponse>("/content/generate", {
        sourceType,
        sourceValue,
        personaId,
        modelId,
        variations,
        relatedKeywords: isArticleSource
          ? articleRelatedKeywords.split(",").map((keyword) => keyword.trim()).filter(Boolean).slice(0, 5)
          : undefined,
        outline: isArticleSource ? articleOutline : undefined,
        articleDirection: isArticleSource ? articleDirection : undefined,
        articleWordCount: isArticleSource && articleWordCount ? Number(articleWordCount) : undefined,
        includeTableOfContents: isArticleSource && articleIncludeToc ? true : undefined,
        enableResearch: isArticleSource && articleResearchFocus ? true : undefined,
        generateImages: imagesEnabled,
        imageConfig: imagesEnabled ? {
          cover: imageConfig.cover.enabled ? {
            resolution: imageConfig.cover.resolution,
            aspectRatio: imageConfig.cover.aspectRatio,
          } : null,
          inline: imageConfig.inline.enabled ? {
            count: imageConfig.inline.count,
            resolution: imageConfig.inline.resolution,
            aspectRatio: imageConfig.inline.aspectRatio,
          } : null,
        } : undefined,
      });

      if (data.error) throw new Error(data.error);

      const jobId = data.jobId;
      const immediateComplete = variations <= 1 && data.postIds?.length > 0;

      if (immediateComplete) {
        updateJob(trackId, { step: "complete", jobId });
        toast.success("Draft generated! Check the Posts page.");
        refetchPosts();
      } else if (jobId) {
        // Update the tracked job with the real jobId so polling can begin
        updateJob(trackId, { jobId, step: "generating" });
        toast.info(`Job started with ${variations} variation${variations > 1 ? "s" : ""}. Generating...`);
      }
    } catch (err) {
      console.error("Generation error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to generate content";
      updateJob(trackId, { step: "error", error: errorMessage });
      toast.error(errorMessage);
    }
  };

  const handleGenerate = async () => {
    if (!personaId) {
      toast.error("Please select a persona.");
      return;
    }
    if (selectedModelUnavailable) {
      toast.error("Selected model is no longer available on OpenRouter.");
      return;
    }

    const sourceValue = getSourceValue();
    if (!sourceValue.trim()) {
      toast.error("Please provide source content.");
      return;
    }

    // If jobs are running, show the concurrent dialog
    if (runningCount > 0) {
      setShowConcurrentDialog(true);
      return;
    }

    await executeGeneration();
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
        description={`Welcome to BlogFactory${user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}. Create article drafts from URLs, PDFs, raw text, or YouTube.`}
      />

      <div className="mx-auto max-w-5xl space-y-9">
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
                  </TabsContent>
                </Tabs>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Related Keywords</Label>
                    <Input
                      placeholder="free project management software, agile project management"
                      value={articleRelatedKeywords}
                      onChange={(e) => setArticleRelatedKeywords(e.target.value)}
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional, comma-separated. The first 5 are used.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Direction</Label>
                    <Input
                      placeholder="Focus on beginner-friendly examples"
                      value={articleDirection}
                      onChange={(e) => setArticleDirection(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
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
                  <Label>Outline</Label>
                  <Textarea
                    placeholder={"H2: What to look for\nH2: Top options\nH3: Budget picks"}
                    value={articleOutline}
                    onChange={(e) => setArticleOutline(e.target.value)}
                    className="min-h-[120px] resize-none"
                  />
                </div>
              </TabsContent>

              <TabsContent value="url" className="space-y-2">
                <Label>Source URL</Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="https://example.com/article-source"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
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
                <div className="relative">
                  <Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a YouTube video URL to generate content from its transcript.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </BywordCard>

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
            selected
          />
          <OptionCard
            icon={Layers}
            title="Campaign"
            description="Batch multiple articles with shared strategy and context."
            badge="Batch"
            disabled
          />
          <OptionCard
            icon={Grid2X2}
            title="Programmatic"
            description="Generate from templates and structured data at scale."
            badge="Scale"
            disabled
          />
        </div>

        <BywordCard>
          <SectionHeader
            icon={SlidersHorizontal}
            title="Generation settings"
            description="Select the voice, model, image defaults, and draft count."
          />
          <div className="space-y-7 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Voice Persona</Label>
                <Select value={personaId} onValueChange={handlePersonaChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activePersonas.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No personas yet. Create one first.
                      </div>
                    ) : (
                      activePersonas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>AI Model</Label>
                <LiveTextModelSelect value={modelId} onValueChange={setModelId} triggerClassName="h-11" />
                {selectedModelUnavailable && (
                  <p className="text-xs text-destructive">Unavailable: {modelId}. Pick a live OpenRouter model.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  $ = low cost, $$ = medium, $$$ = high.
                </p>
              </div>
            </div>

            <SplitImageGenerationSettings
              config={imageConfig}
              onConfigChange={setImageConfig}
              defaults={imageDefaults}
              onSaveDefaults={(defaults) => saveDefaultsMutation.mutate(defaults)}
              onResetToDefaults={handleResetToDefaults}
              showSaveOption
              compact
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

            <Button
              onClick={handleGenerate}
              disabled={activePersonas.length === 0 || selectedModelUnavailable}
              className="h-12 w-full text-base"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {runningCount > 0 ? `New Generation (${runningCount} running)` : "Generate Drafts"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            {activePersonas.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Create a persona first to start generating content.
              </p>
            )}

            {activePersonas.length > 0 && !isGenerating && (
              <p className="flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Estimated generation time: about {variations * 15} seconds.
              </p>
            )}
          </div>
        </BywordCard>

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
                  <div
                    key={post.id}
                    className="flex items-start gap-3 rounded-lg border border-byword-border bg-card p-4 transition-calm hover:border-byword-blue/40"
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
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BywordCard>
      </div>

      <ConcurrentJobDialog
        open={showConcurrentDialog}
        onAction={handleConcurrentAction}
        runningCount={runningCount}
        canStartParallel={canStartParallel}
        maxParallel={maxParallel}
      />
    </BywordPageShell>
  );
}

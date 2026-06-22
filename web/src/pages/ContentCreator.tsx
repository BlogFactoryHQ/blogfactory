import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  ArrowRight,
  SlidersHorizontal,
  CheckCircle2,
  Circle,
  Image as ImageIcon,
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

  const clearSource = () => {
    if (sourceType === "url") setSourceUrl("");
    if (sourceType === "youtube") setYoutubeUrl("");
    if (sourceType === "raw_text") setRawText("");
    if (sourceType === "pdf") clearPdf();
  };

  const isGenerating = runningCount > 0;

  const getSourceLabel = () => {
    switch (sourceType) {
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

    // Show progress immediately before the API call returns
    const trackId = startJob({
      jobId: null,
      sourceType: sourceType as SourceType,
      sourceLabel: getSourceLabel(),
      variations,
    });

    try {
      const data = await api.post<GenerateResponse>("/content/generate", {
        sourceType: sourceType === "url" ? "url" : sourceType === "raw_text" ? "raw_text" : sourceType,
        sourceValue,
        personaId,
        modelId,
        variations,
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

  const sourceValue = getSourceValue().trim();
  const sourceReady = sourceValue.length > 0;
  const selectedPersonaName = activePersonas.find((persona) => persona.id === personaId)?.name;
  const imagesEnabled = imageConfig.cover.enabled || imageConfig.inline.enabled;
  const imageSummary = imagesEnabled
    ? [
        imageConfig.cover.enabled && "cover",
        imageConfig.inline.enabled && `${imageConfig.inline.count} inline`,
      ].filter(Boolean).join(" + ")
    : "No images";
  const canGenerate = activePersonas.length > 0 && !!personaId && sourceReady && !selectedModelUnavailable;
  const draftLabel = `${variations} Draft${variations > 1 ? "s" : ""}`;
  const sourceMeta = sourceType === "raw_text"
    ? `${rawText.trim().length.toLocaleString()} characters`
    : sourceType === "pdf" && pdfFile
      ? `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB PDF`
      : sourceReady
        ? "Ready"
        : "Waiting for input";
  const disabledReason = !sourceReady
    ? "Add a source to unlock generation."
    : !personaId
      ? "Choose a voice persona."
      : selectedModelUnavailable
        ? "Pick a live OpenRouter model."
        : "";
  const readyItems = [
    ["Source", sourceReady, sourceReady ? sourceMeta : "Required"],
    ["Persona", !!personaId, selectedPersonaName || "Required"],
    ["Model", !selectedModelUnavailable, selectedModelUnavailable ? "Unavailable" : "Ready"],
    ["Images", true, imageSummary],
  ] as const;

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Content Studio"
        description={`Create newsroom-ready drafts from URLs, PDFs, raw text, or YouTube${user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}.`}
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          ["1. Source", sourceReady ? getSourceLabel() : "Add source content", sourceReady],
          ["2. Defaults", personaId ? "Persona and model selected" : "Choose persona and model", !!personaId && !selectedModelUnavailable],
          ["3. Drafts", `${draftLabel} queued to Posts`, canGenerate],
        ].map(([title, description, ready]) => (
          <div key={title as string} className="flex items-center gap-3 rounded-lg border border-byword-border bg-card px-4 py-3 shadow-[0_10px_30px_rgba(22,82,125,0.04)]">
            {ready ? <CheckCircle2 className="h-5 w-5 shrink-0 text-status-success" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <div className="space-y-6">
          <BywordCard>
          <SectionHeader
            icon={Sparkles}
            title="Source"
            description="Pick one input. The draft uses your saved defaults below."
          />
          <div className="p-6">
            <Tabs value={sourceType} onValueChange={setSourceType}>
              <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-2 rounded-lg bg-muted/60 p-1 sm:grid-cols-4">
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

              <TabsContent value="url" className="space-y-2">
                <Label>Source URL</Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="https://example.com/article-source"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="h-11 pl-9 pr-10"
                  />
                  {sourceUrl && (
                    <Button type="button" variant="ghost" size="icon" onClick={clearSource} aria-label="Clear source URL" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Direct article links produce the cleanest drafts. {sourceReady && sourceMeta}
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
                      aria-label="Remove PDF"
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
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
                        <p className="mb-1 text-sm font-medium">Click to browse PDF</p>
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
                <div className="flex items-center justify-between gap-3">
                  <Label>Source Content</Label>
                  {rawText && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearSource} className="h-8 px-2">
                      <X className="h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Paste article notes, transcript excerpts, or source text..."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="min-h-[220px] resize-none"
                />
                <p className="text-xs text-muted-foreground">{sourceMeta}</p>
              </TabsContent>

              <TabsContent value="youtube" className="space-y-2">
                <Label>YouTube URL</Label>
                <div className="relative">
                  <Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="h-11 pl-9 pr-10"
                  />
                  {youtubeUrl && (
                    <Button type="button" variant="ghost" size="icon" onClick={clearSource} aria-label="Clear YouTube URL" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a YouTube video URL to generate content from its transcript. {sourceReady && sourceMeta}
                </p>
              </TabsContent>
            </Tabs>
          </div>
          <div className="grid border-t border-byword-border sm:grid-cols-4">
            {[
              [LinkIcon, "Source", sourceReady ? getSourceLabel() : "Not set"],
              [SlidersHorizontal, "Voice", selectedPersonaName || "Not set"],
              [ImageIcon, "Images", imageSummary],
              [FileTextIcon, "Output", draftLabel],
            ].map(([Icon, label, value]) => (
              <div key={label as string} className="flex min-w-0 items-start gap-3 border-byword-border p-4 sm:border-r sm:last:border-r-0">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-byword-blue" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{label as string}</p>
                  <p className="truncate text-sm font-semibold text-foreground">{value as string}</p>
                </div>
              </div>
            ))}
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

        <BywordCard className="h-fit xl:sticky xl:top-6">
          <SectionHeader
            icon={SlidersHorizontal}
            title="Draft defaults"
            description="Voice, model, images, and output count."
          />
          <div className="space-y-7 p-6">
            <div className="grid gap-4">
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

            <div className="rounded-lg border border-byword-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Ready check</p>
                <span className={cn("rounded-full px-2 py-1 text-xs font-medium", canGenerate ? "bg-status-success/10 text-status-success" : "bg-muted text-muted-foreground")}>
                  {canGenerate ? "Ready" : "Incomplete"}
                </span>
              </div>
              <div className="grid gap-2">
                {readyItems.map(([label, ready, value]) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    {ready ? <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="h-12 w-full text-base"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {runningCount > 0 ? `Generate ${draftLabel} (${runningCount} running)` : `Generate ${draftLabel}`}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            {disabledReason && (
              <p className="text-center text-sm text-muted-foreground">
                {disabledReason}
              </p>
            )}

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

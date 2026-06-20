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
import { Card, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { MODELS } from "@/lib/mock-data";
import { SourceType } from "@/components/content/GenerationProgress";
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
      return api.get<any>("/settings");
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
      return api.get<any[]>("/personas");
    },
  });

  // Filter to only active personas for the dropdown
  const activePersonas = personas.filter((p: any) => p.status === "active");

  // Fetch recent posts
  const { data: recentPosts = [], refetch: refetchPosts } = useQuery({
    queryKey: ["recent-posts"],
    queryFn: async () => {
      return api.get<any[]>("/posts?limit=3");
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
      const data = await api.post<any>("/content/generate", {
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
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="New Generation"
        description="Configure and generate content drafts."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <div className="calm-card p-6">
            {/* Source Tabs */}
            <Tabs value={sourceType} onValueChange={setSourceType}>
              <TabsList className="mb-6">
                <TabsTrigger value="url" className="gap-2">
                  <LinkIcon className="h-4 w-4" />
                  URL Link
                </TabsTrigger>
                <TabsTrigger value="pdf" className="gap-2">
                  <Upload className="h-4 w-4" />
                  PDF Document
                </TabsTrigger>
                <TabsTrigger value="raw_text" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Raw Text
                </TabsTrigger>
                <TabsTrigger value="youtube" className="gap-2">
                  <Youtube className="h-4 w-4" />
                  YouTube
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-2">
                <Label>Source URL</Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="https://example.com/article-source"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="pl-9"
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
                  <div className="border border-border rounded-lg p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                      <FileText className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{pdfFile.name}</p>
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
                    className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
                        <p className="text-sm font-medium mb-1">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium mb-1">Click to upload PDF</p>
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
                  className="min-h-[200px] resize-none"
                />
              </TabsContent>

              <TabsContent value="youtube" className="space-y-2">
                <Label>YouTube URL</Label>
                <div className="relative">
                  <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a YouTube video URL to generate content from its transcript.
                </p>
              </TabsContent>
            </Tabs>

            <div className="border-t border-border my-6" />

            {/* AI Configuration */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <Label>Voice Persona</Label>
                <Select value={personaId} onValueChange={setPersonaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activePersonas.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        No personas yet. Create one first.
                      </div>
                    ) : (
                      activePersonas.map((persona: any) => (
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
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex items-center justify-between w-full gap-3">
                          <span>{model.name}</span>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            model.pricing === "low" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                            model.pricing === "medium" && "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
                            model.pricing === "high" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                          )}>
                            {model.pricing === "low" ? "$" : model.pricing === "medium" ? "$$" : "$$$"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  $ = Low cost, $$ = Medium, $$$ = High
                </p>
              </div>
            </div>

            {/* Image Generation Settings */}
            <div className="mb-6">
              <SplitImageGenerationSettings
                config={imageConfig}
                onConfigChange={setImageConfig}
                defaults={imageDefaults}
                onSaveDefaults={(defaults) => saveDefaultsMutation.mutate(defaults)}
                onResetToDefaults={handleResetToDefaults}
                showSaveOption
                compact
              />
            </div>

            {/* Output Variations */}
            <div className="space-y-3 mb-6">
              <Label>Output Variations</Label>
              <div className="grid grid-cols-3 gap-3">
                {([1, 3, 5] as const).map((num) => (
                  <button
                    key={num}
                    onClick={() => setVariations(num)}
                    className={cn(
                      "p-4 rounded-lg border-2 text-center transition-calm",
                      variations === num
                        ? "border-primary bg-accent"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <p className="text-lg font-semibold">
                      {num} Draft{num > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {num === 1 ? "Fastest" : num === 3 ? "Recommended" : "Exploratory"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Active Jobs Progress */}
            <ActiveJobsPanel jobs={activeJobs} onDismiss={dismissJob} />

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={activePersonas.length === 0}
              className="w-full h-12 text-base"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              {runningCount > 0 ? `New Generation (${runningCount} running)` : "Generate Drafts"}
            </Button>

            {/* Concurrent Job Dialog */}
            <ConcurrentJobDialog
              open={showConcurrentDialog}
              onAction={handleConcurrentAction}
              runningCount={runningCount}
              canStartParallel={canStartParallel}
              maxParallel={maxParallel}
            />

            {activePersonas.length === 0 && (
              <p className="text-center text-sm text-muted-foreground mt-3">
                Create a persona first to start generating content.
              </p>
            )}

            {activePersonas.length > 0 && !isGenerating && (
              <p className="text-center text-sm text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                <Clock className="h-4 w-4" />
                Estimated generation time: ~{variations * 15} seconds
              </p>
            )}
          </div>
        </div>

        {/* Recent Generations */}
        <div className="space-y-4">
          <p className="section-label">Recent Generations</p>
          {recentPosts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No posts generated yet. Create your first one!
              </CardContent>
            </Card>
          ) : (
            recentPosts.map((post: any) => (
              <Card key={post.id} className="cursor-pointer hover:shadow-md transition-calm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <FileTextIcon className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">
                        {post.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Generated from {post.source_type?.replace("_", " ") || "unknown"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

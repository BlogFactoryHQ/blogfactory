import { CheckCircle2, Loader2, Link, FileText, Youtube, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { DraftProgressList, DraftProgressItem } from "@/components/content/DraftProgressList";

export type GenerationStep = "idle" | "extracting" | "generating" | "images" | "prompts" | "complete" | "error";
export type SourceType = "article_keyword" | "article_title" | "url" | "raw_text" | "youtube" | "pdf";

export interface DraftProgress {
  current: number;
  total: number;
  completed: number;
  failedDrafts?: Array<{ index: number; error: string }>;
}

interface GenerationProgressProps {
  currentStep: GenerationStep;
  sourceType?: SourceType;
  error?: string;
  draftProgress?: DraftProgress | null;
}

// Define steps for each source type
const getStepsForSourceType = (sourceType: SourceType = "url", currentStep: GenerationStep = "idle") => {
  const mediaStep = currentStep === "prompts"
    ? { key: "prompts", label: "Creating manual prompt slots" }
    : { key: "images", label: "Creating images" };
  const baseGenerationSteps = [
    { key: "generating", label: "Generating blog post with AI" },
    mediaStep,
    { key: "complete", label: "Complete" },
  ];

  switch (sourceType) {
    case "article_keyword":
    case "article_title":
      return [
        { key: "extracting", label: "Planning article" },
        { key: "generating", label: "Generating article with AI" },
        mediaStep,
        { key: "complete", label: "Complete" },
      ];
    case "url":
      return [
        { key: "extracting", label: "Fetching & extracting webpage content" },
        ...baseGenerationSteps,
      ];
    case "youtube":
      return [
        { key: "extracting", label: "Fetching YouTube transcript" },
        ...baseGenerationSteps,
      ];
    case "pdf":
      return [
        { key: "extracting", label: "Parsing PDF document" },
        ...baseGenerationSteps,
      ];
    case "raw_text":
      return [
        { key: "extracting", label: "Processing text input" },
        ...baseGenerationSteps,
      ];
    default:
      return [
        { key: "extracting", label: "Extracting content from source" },
        ...baseGenerationSteps,
      ];
  }
};

const getSourceIcon = (sourceType: SourceType = "url") => {
  switch (sourceType) {
    case "article_keyword":
    case "article_title":
      return <FileText className="h-4 w-4" />;
    case "url":
      return <Link className="h-4 w-4" />;
    case "youtube":
      return <Youtube className="h-4 w-4" />;
    case "pdf":
      return <Upload className="h-4 w-4" />;
    case "raw_text":
      return <FileText className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const getSourceLabel = (sourceType: SourceType = "url") => {
  switch (sourceType) {
    case "article_keyword":
      return "Article Keyword";
    case "article_title":
      return "Article Title";
    case "url":
      return "Web Article";
    case "youtube":
      return "YouTube Video";
    case "pdf":
      return "PDF Document";
    case "raw_text":
      return "Text Input";
    default:
      return "Content";
  }
};

const stepOrder: Record<GenerationStep, number> = {
  idle: -1,
  extracting: 0,
  generating: 1,
  images: 2,
  prompts: 2,
  complete: 3,
  error: -1,
};

export function GenerationProgress({ currentStep, sourceType = "url", error, draftProgress }: GenerationProgressProps) {
  if (currentStep === "idle") return null;

  const steps = getStepsForSourceType(sourceType, currentStep);
  const currentIndex = stepOrder[currentStep];
  
  // Calculate progress considering draft progress for multi-draft jobs
  let progressPercent: number;
  if (currentStep === "complete") {
    progressPercent = 100;
  } else if (currentStep === "error") {
    progressPercent = 0;
  } else if (draftProgress && draftProgress.total > 1) {
    // For multi-draft: blend step progress with draft progress
    const draftFraction = draftProgress.completed / draftProgress.total;
    progressPercent = Math.min(10 + draftFraction * 85, 95);
  } else {
    progressPercent = Math.min(((currentIndex + 1) / steps.length) * 100, 95);
  }

  // Build dynamic label for the generating step when multi-draft
  const getStepLabel = (step: { key: string; label: string }) => {
    if (step.key === "generating" && draftProgress && draftProgress.total > 1) {
      return `Generating draft ${draftProgress.current} of ${draftProgress.total}`;
    }
    return step.label;
  };

  const draftSteps: DraftProgressItem[] = draftProgress && draftProgress.total > 1
    ? Array.from({ length: draftProgress.total }, (_, i) => {
      const draftNum = i + 1;
      const failed = draftProgress.failedDrafts?.find((draft) => draft.index === i);
      return {
        label: `Draft ${draftNum}`,
        done: !failed && draftNum <= draftProgress.completed,
        active: currentStep !== "complete" && !failed && draftNum === draftProgress.current,
        failed: Boolean(failed),
        error: failed?.error,
      };
    })
    : [];

  return (
    <div className="space-y-4 rounded-lg border border-border bg-byword-blue-soft/60 p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium">
          {getSourceIcon(sourceType)}
          <span>
            {currentStep === "error" 
              ? "Generation failed" 
              : currentStep === "complete"
                ? `${getSourceLabel(sourceType)} processed!`
                : `Processing ${getSourceLabel(sourceType)}...`}
          </span>
        </div>
        <span className="text-muted-foreground">
          {currentStep === "complete" 
            ? "Done!" 
            : draftProgress && draftProgress.total > 1
              ? `Draft ${draftProgress.current}/${draftProgress.total} • ${draftProgress.completed} done`
              : `Step ${currentIndex + 1} of ${steps.length}`}
        </span>
      </div>
      
      <Progress value={progressPercent} className="h-2" />

      <DraftProgressList steps={draftSteps} className="mt-3" />

      <div className="space-y-2">
        {steps.map((step, index) => {
          const isComplete = currentIndex > index || currentStep === "complete";
          const isCurrent = currentIndex === index && currentStep !== "error";
          const isPending = currentIndex < index;

          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-2.5 text-sm py-1.5 transition-colors",
                isComplete && "text-primary",
                isCurrent && "text-foreground font-medium",
                isPending && "text-muted-foreground"
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0" />
              )}
              <span>{getStepLabel(step)}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded p-2.5 mt-2">
          {error}
        </div>
      )}
    </div>
  );
}

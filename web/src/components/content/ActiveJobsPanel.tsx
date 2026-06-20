import { TrackedJob } from "@/hooks/useJobTracker";
import { GenerationProgress, SourceType } from "@/components/content/GenerationProgress";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ActiveJobsPanelProps {
  jobs: TrackedJob[];
  onDismiss: (trackId: string) => void;
}

export function ActiveJobsPanel({ jobs, onDismiss }: ActiveJobsPanelProps) {
  if (jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      {jobs.length > 1 && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Active Jobs ({jobs.length})
        </p>
      )}
      {jobs.map((job) => (
        <div key={job.id} className="relative">
          {(job.step === "complete" || job.step === "error") && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-6 w-6 z-10"
              onClick={() => onDismiss(job.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          <div className="text-xs text-muted-foreground mb-1 px-1">
            {job.sourceLabel}
          </div>
          <GenerationProgress
            currentStep={job.step}
            sourceType={job.sourceType}
            error={job.error}
            draftProgress={job.draftProgress}
          />
        </div>
      ))}
    </div>
  );
}

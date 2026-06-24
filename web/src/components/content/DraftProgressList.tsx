import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DraftProgressItem {
  label: string;
  done: boolean;
  active: boolean;
  failed?: boolean;
  error?: string;
}

interface DraftProgressListProps {
  steps: DraftProgressItem[];
  className?: string;
}

export function DraftProgressList({ steps, className }: DraftProgressListProps) {
  if (!steps.length) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {steps.map((step, index) => (
        <div key={`${step.label}-${index}`} className="flex items-center gap-2 text-sm">
          {step.done ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success flex-shrink-0" />
          ) : step.failed ? (
            <AlertCircle className="h-3.5 w-3.5 text-status-error flex-shrink-0" />
          ) : step.active ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-status-running flex-shrink-0" />
          ) : (
            <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
          )}
          <span
            className={cn(
              step.done && "text-muted-foreground line-through",
              step.failed && "text-status-error",
              step.active && "text-foreground font-medium",
              !step.done && !step.failed && !step.active && "text-muted-foreground/60"
            )}
          >
            {step.label}
          </span>
          {step.failed && step.error && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={step.error}>
              - {step.error}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

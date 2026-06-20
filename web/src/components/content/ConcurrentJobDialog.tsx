import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Layers, ListOrdered, XCircle, ArrowLeft } from "lucide-react";

export type ConcurrentAction = "parallel" | "queue" | "cancel_current" | "dismiss";

interface ConcurrentJobDialogProps {
  open: boolean;
  onAction: (action: ConcurrentAction) => void;
  runningCount: number;
  canStartParallel: boolean;
  maxParallel: number;
}

export function ConcurrentJobDialog({
  open,
  onAction,
  runningCount,
  canStartParallel,
  maxParallel,
}: ConcurrentJobDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onAction("dismiss")}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>A generation is currently running</AlertDialogTitle>
          <AlertDialogDescription>
            You have {runningCount} active job{runningCount > 1 ? "s" : ""}. How would you like to proceed?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3"
            disabled={!canStartParallel}
            onClick={() => onAction("parallel")}
          >
            <Layers className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <p className="font-medium text-sm">Start in parallel</p>
              <p className="text-xs text-muted-foreground">
                {canStartParallel
                  ? `Run alongside current job${runningCount > 1 ? "s" : ""} (${runningCount}/${maxParallel} slots used)`
                  : `Limit reached (${maxParallel} concurrent jobs max)`}
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={() => onAction("queue")}
          >
            <ListOrdered className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <p className="font-medium text-sm">Queue new job</p>
              <p className="text-xs text-muted-foreground">
                Will start automatically after current job finishes
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 text-destructive hover:text-destructive"
            onClick={() => onAction("cancel_current")}
          >
            <XCircle className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <p className="font-medium text-sm">Cancel current & start new</p>
              <p className="text-xs text-muted-foreground">
                Stops the running job and begins a new one
              </p>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Go back
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Check, FileText } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BulkActionsBarProps {
  selectedCount: number;
  onDelete: () => void;
  onPublish: () => void;
  onDraft: () => void;
  onClear: () => void;
  isDeleting: boolean;
  isPublishing: boolean;
  isDrafting: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onDelete,
  onPublish,
  onDraft,
  onClear,
  isDeleting,
  isPublishing,
  isDrafting,
}: BulkActionsBarProps) {
  const isLoading = isDeleting || isPublishing || isDrafting;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {selectedCount} post{selectedCount > 1 ? "s" : ""} selected
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={isLoading}>
          Clear
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDraft}
          disabled={isLoading}
        >
          {isDrafting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-1.5" />
          )}
          Move to Drafts
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onPublish}
          disabled={isLoading}
        >
          {isPublishing ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1.5" />
          )}
          Publish
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={isLoading}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedCount} post{selectedCount > 1 ? "s" : ""}?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The selected posts will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete {selectedCount} post{selectedCount > 1 ? "s" : ""}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

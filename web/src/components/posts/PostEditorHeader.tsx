import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Save, Loader2, Check, Trash2, ExternalLink } from "lucide-react";

interface PostEditorHeaderProps {
  status: string;
  hasChanges: boolean;
  isSaving: boolean;
  isUpdatePending: boolean;
  isPublishPending: boolean;
  isWixPending: boolean;
  onStatusChange: (status: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onWixDraft: () => void;
  onWixPublish: () => void;
}

export function PostEditorHeader({
  status,
  hasChanges,
  isSaving,
  isUpdatePending,
  isPublishPending,
  isWixPending,
  onStatusChange,
  onSave,
  onPublish,
  onDelete,
  onWixDraft,
  onWixPublish,
}: PostEditorHeaderProps) {
  return (
    <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <StatusBadge
          status={status === "published" ? "success" : "draft"}
          label={status === "published" ? "Published" : "Draft"}
        />
        {hasChanges && (
          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded">
            Unsaved changes
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The post and all its generated images will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={isSaving || !hasChanges}
        >
          {isUpdatePending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Save
        </Button>
        <Button
          size="sm"
          onClick={onPublish}
          disabled={isSaving || status === "published"}
        >
          {isPublishPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1.5" />
          )}
          Publish
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onWixDraft}
          disabled={isSaving}
          title="Save as draft to Wix with AI-generated SEO"
        >
          {isWixPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-1.5" />
          )}
          Draft to Wix
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onWixPublish}
          disabled={isSaving}
          title="Publish to Wix with AI-generated SEO"
        >
          {isWixPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-1.5" />
          )}
          Publish to Wix
        </Button>
      </div>
    </div>
  );
}

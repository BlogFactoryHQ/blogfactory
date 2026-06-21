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
import { Save, Loader2, Check, Trash2 } from "lucide-react";
import { PublishDialog } from "@/components/posts/PublishDialog";

interface PostEditorHeaderProps {
  postId: string;
  title: string;
  status: string;
  hasChanges: boolean;
  isSaving: boolean;
  isUpdatePending: boolean;
  isPublishPending: boolean;
  onStatusChange: (status: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

export function PostEditorHeader({
  postId,
  title,
  status,
  hasChanges,
  isSaving,
  isUpdatePending,
  isPublishPending,
  onStatusChange,
  onSave,
  onPublish,
  onDelete,
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
          Mark Published
        </Button>
        <PublishDialog
          postId={postId}
          title={title}
          disabled={isSaving || hasChanges}
          disabledReason={hasChanges ? "Save changes before publishing to an integration" : undefined}
        />
      </div>
    </div>
  );
}

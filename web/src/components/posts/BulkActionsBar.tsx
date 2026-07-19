import { Button } from "@/components/ui/button";
import { Check, Loader2, Trash2, RefreshCw, Send } from "lucide-react";
import { SiteIntegration } from "@/hooks/useIntegrations";
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

interface BulkActionsBarProps {
  selectedCount: number;
  onDelete: () => void;
  onPublish: () => void;
  onPushIntegration: () => void;
  onPrepareSeo: () => void;
  onClear: () => void;
  integrations: SiteIntegration[];
  integrationId: string;
  onIntegrationChange: (id: string) => void;
  isDeleting: boolean;
  isPublishing: boolean;
  isPushingIntegration: boolean;
  isPreparingSeo: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onDelete,
  onPublish,
  onPushIntegration,
  onPrepareSeo,
  onClear,
  integrations,
  integrationId,
  onIntegrationChange,
  isDeleting,
  isPublishing,
  isPushingIntegration,
  isPreparingSeo,
}: BulkActionsBarProps) {
  const isLoading = isDeleting || isPublishing || isPushingIntegration || isPreparingSeo;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md border border-byword-blue/25 bg-byword-blue-soft/35 px-4 py-3 shadow-[inset_0_1px_0_hsl(0_0%_100%)] animate-in fade-in slide-in-from-top-2 duration-200 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrepareSeo} disabled={isLoading}>
          {isPreparingSeo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Prepare SEO
        </Button>
        <span className="font-mono text-[12px] font-semibold uppercase text-foreground">
          {selectedCount} post{selectedCount > 1 ? "s" : ""} selected
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={isLoading}>
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {integrations.length > 0 && (
          <>
            <Select value={integrationId || integrations[0]?.id} onValueChange={onIntegrationChange} disabled={isLoading}>
              <SelectTrigger className="h-8 w-full min-w-[180px] sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {integrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    {integration.provider} · {integration.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={onPushIntegration}
              disabled={isLoading}
            >
              {isPushingIntegration ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Push draft
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={onPublish} disabled={isLoading}>
          {isPublishing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
          Mark published
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

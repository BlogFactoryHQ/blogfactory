import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, History, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { lineRevisionDiff } from "@/lib/revision-diff";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

export type EditorialState = "draft" | "in_review" | "approved" | "changes_requested";

export interface PostRevision {
  id: string;
  post_id: string;
  revision_number: number;
  source: string;
  snapshot: {
    title: string;
    content: string;
    summary: string | null;
    cover_image_url: string | null;
    inline_images: string[] | null;
    publishing_metadata: unknown;
  };
  created_at: string;
}

type Preflight = {
  can_send: boolean;
  requires_review_override: boolean;
  checks: Array<{ id: string; label: string; status: "pass" | "warning" | "blocker"; message: string }>;
};

const stateCopy: Record<EditorialState, { label: string; status: StatusType }> = {
  draft: { label: "Draft", status: "draft" },
  in_review: { label: "In review", status: "pending" },
  approved: { label: "Approved", status: "success" },
  changes_requested: { label: "Changes requested", status: "warning" },
};

function RevisionHistoryDialog({
  postId,
  updatedAt,
  open,
  onOpenChange,
  onRestored,
}: {
  postId: string;
  updatedAt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: (post: { title: string; content: string; summary: string | null; coverImageUrl: string | null; inlineImages: string[] | null }) => void;
}) {
  const queryClient = useQueryClient();
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["post-revisions", postId],
    queryFn: () => api.get<{ revisions: PostRevision[] }>(`/posts/${postId}/revisions`),
    enabled: open,
  });
  const revisions = data?.revisions || [];

  useEffect(() => {
    if (!revisions.length) return;
    if (!afterId || !revisions.some((item) => item.id === afterId)) setAfterId(revisions[0].id);
    if (!beforeId || !revisions.some((item) => item.id === beforeId)) setBeforeId((revisions[1] || revisions[0]).id);
  }, [afterId, beforeId, revisions]);

  const before = revisions.find((item) => item.id === beforeId);
  const after = revisions.find((item) => item.id === afterId);
  const diff = useMemo(() => lineRevisionDiff(before?.snapshot.content || "", after?.snapshot.content || ""), [after, before]);
  const restoreMutation = useMutation({
    mutationFn: () => api.post<{ post: { title: string; content: string; summary: string | null; coverImageUrl: string | null; inlineImages: string[] | null } }>(`/posts/${postId}/revisions/${beforeId}/restore`, { expected_updated_at: updatedAt }),
    onSuccess: (result) => {
      onRestored(result.post);
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post-revisions", postId] });
      queryClient.invalidateQueries({ queryKey: ["post-preflight", postId] });
      toast.success("Revision restored", { description: "The previous history was preserved and SEO is being checked again." });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Revision could not be restored"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Revision history</DialogTitle>
          <DialogDescription>Compare saved Markdown revisions or restore an older version without deleting history.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : revisions.length ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="section-label" htmlFor="revision-before">Before</label>
                <Select value={beforeId} onValueChange={setBeforeId}>
                  <SelectTrigger id="revision-before"><SelectValue /></SelectTrigger>
                  <SelectContent>{revisions.map((revision) => <SelectItem key={revision.id} value={revision.id}>Revision {revision.revision_number} · {new Date(revision.created_at).toLocaleString()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="section-label" htmlFor="revision-after">After</label>
                <Select value={afterId} onValueChange={setAfterId}>
                  <SelectTrigger id="revision-after"><SelectValue /></SelectTrigger>
                  <SelectContent>{revisions.map((revision) => <SelectItem key={revision.id} value={revision.id}>Revision {revision.revision_number} · {new Date(revision.created_at).toLocaleString()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-sm border border-byword-border bg-muted/20 p-3"><p className="section-label">Before title</p><p className="mt-2 break-words text-sm font-semibold">{before?.snapshot.title || "—"}</p></div>
              <div className="rounded-sm border border-byword-border bg-muted/20 p-3"><p className="section-label">After title</p><p className="mt-2 break-words text-sm font-semibold">{after?.snapshot.title || "—"}</p></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-byword-border bg-background font-mono text-xs leading-5" aria-label="Line by line revision comparison">
              {diff.map((line, index) => (
                <div key={`${index}-${line.type}`} className={cn(
                  "grid grid-cols-[2rem_minmax(0,1fr)] border-b border-border/50 px-2",
                  line.type === "added" && "bg-emerald-50 text-emerald-950",
                  line.type === "removed" && "bg-red-50 text-red-950",
                )}>
                  <span className="select-none text-center text-muted-foreground">{line.type === "added" ? "+" : line.type === "removed" ? "−" : ""}</span>
                  <span className="whitespace-pre-wrap break-words py-0.5">{line.text || " "}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" disabled={!before || before.id === revisions[0]?.id || restoreMutation.isPending}><RotateCcw className="mr-1.5 h-4 w-4" />Restore “Before”</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Restore revision {before?.revision_number}?</AlertDialogTitle><AlertDialogDescription>This creates a new draft revision. Existing history remains available.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => restoreMutation.mutate()}>Restore revision</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : <p className="py-10 text-center text-sm text-muted-foreground">No saved revisions found.</p>}
      </DialogContent>
    </Dialog>
  );
}

export function EditorialSafetyPanel({
  postId,
  updatedAt,
  editorialState,
  currentRevision,
  preferredIntegrationId,
  hasUnsavedChanges,
  onRestored,
}: {
  postId: string;
  updatedAt: string;
  editorialState: EditorialState;
  currentRevision: PostRevision | null;
  preferredIntegrationId?: string | null;
  hasUnsavedChanges: boolean;
  onRestored: (post: { title: string; content: string; summary: string | null; coverImageUrl: string | null; inlineImages: string[] | null }) => void;
}) {
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const preflightPath = `/posts/${postId}/preflight?mode=publish${preferredIntegrationId ? `&integration_id=${encodeURIComponent(preferredIntegrationId)}` : ""}`;
  const { data: preflight, isLoading: preflightLoading } = useQuery({
    queryKey: ["post-preflight", postId, preferredIntegrationId],
    queryFn: () => api.get<Preflight>(preflightPath),
    enabled: Boolean(currentRevision),
  });
  const reviewMutation = useMutation({
    mutationFn: (state: EditorialState) => api.patch(`/posts/${postId}/editorial-state`, { state, expected_revision_id: currentRevision?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post-preflight", postId] });
      toast.success("Editorial state updated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Editorial state could not be updated"),
  });
  const blockers = preflight?.checks.filter((check) => check.status === "blocker") || [];
  const warnings = preflight?.checks.filter((check) => check.status === "warning") || [];
  const state = stateCopy[editorialState] || stateCopy.draft;

  return (
    <>
      <BywordCard className="mb-8">
        <SectionHeader
          icon={ShieldAlert}
          title="Editorial safety"
          description="Review the saved revision, compare history, and check delivery readiness before publishing."
          action={<StatusBadge status={state.status} label={state.label} />}
        />
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="section-label">Current revision</span>
              <span className="font-mono text-xs text-foreground">{currentRevision ? `R${currentRevision.revision_number}` : "—"}</span>
              {currentRevision && <span className="text-xs text-muted-foreground">{new Date(currentRevision.created_at).toLocaleString()}</span>}
            </div>
            {hasUnsavedChanges && <p className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Preview and review actions use the last saved revision. Save your changes first.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {preflightLoading ? <div className="col-span-full flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Running preflight…</div> : preflight?.checks.map((check) => (
                <div key={check.id} className="flex gap-2 rounded-sm border border-byword-border bg-muted/15 p-3">
                  {check.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <ShieldAlert className={cn("mt-0.5 h-4 w-4 shrink-0", check.status === "blocker" ? "text-destructive" : "text-amber-600")} />}
                  <div className="min-w-0"><p className="text-xs font-semibold">{check.label}</p><p className="mt-0.5 break-words text-xs text-muted-foreground">{check.message}</p></div>
                </div>
              ))}
            </div>
            {preflight && <p className="font-mono text-[11px] uppercase text-muted-foreground">{blockers.length} blockers · {warnings.length} warnings</p>}
          </div>
          <div className="flex min-w-52 flex-col gap-2">
            <Select value={editorialState} onValueChange={(value) => reviewMutation.mutate(value as EditorialState)} disabled={!currentRevision || hasUnsavedChanges || reviewMutation.isPending}>
              <SelectTrigger aria-label="Editorial state"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_review">Submit for review</SelectItem>
                <SelectItem value="approved">Approve revision</SelectItem>
                <SelectItem value="changes_requested">Request changes</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}><History className="mr-1.5 h-4 w-4" />Revision history</Button>
            <Button variant="outline" asChild><Link to={`/posts/${postId}/preview`} target="_blank"><Eye className="mr-1.5 h-4 w-4" />BlogFactory preview</Link></Button>
          </div>
        </div>
      </BywordCard>
      <RevisionHistoryDialog postId={postId} updatedAt={updatedAt} open={historyOpen} onOpenChange={setHistoryOpen} onRestored={onRestored} />
    </>
  );
}

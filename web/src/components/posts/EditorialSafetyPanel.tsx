import { useEffect, useMemo, useState } from "react";
import { EDITORIAL_STATE_BADGES } from "@/lib/editorial-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, History, RotateCcw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { groupRevisionDiffHunks, lineRevisionDiff, summarizeRevisionDiff } from "@/lib/revision-diff";
import { RevisionTimeline } from "@/components/posts/RevisionTimeline";
import { RevisionScorecard, type RevisionScore } from "@/components/posts/RevisionScorecard";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ListSkeleton } from "@/components/patterns/PageSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const stateCopy: Record<EditorialState, { label: string; status: StatusType }> = EDITORIAL_STATE_BADGES;

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
  const { data: scorecard } = useQuery({
    queryKey: ["post-revision-scorecard", postId],
    queryFn: () => api.get<{ keyword: string; revisions: RevisionScore[] }>(`/posts/${postId}/revisions/scorecard`),
    enabled: open,
  });
  const scoreEntries = useMemo(() => scorecard?.revisions || [], [scorecard]);
  const scoreById = useMemo(
    () => Object.fromEntries(scoreEntries.map((entry) => [entry.revision_id, entry.score])),
    [scoreEntries],
  );

  useEffect(() => {
    if (!revisions.length) return;
    if (!afterId || !revisions.some((item) => item.id === afterId)) setAfterId(revisions[0].id);
    if (!beforeId || !revisions.some((item) => item.id === beforeId)) setBeforeId((revisions[1] || revisions[0]).id);
  }, [afterId, beforeId, revisions]);

  const before = revisions.find((item) => item.id === beforeId);
  const after = revisions.find((item) => item.id === afterId);
  // Revisions arrive newest first, so the next index is the older neighbour to compare against.
  const selectCandidate = (revisionId: string) => {
    const index = revisions.findIndex((item) => item.id === revisionId);
    if (index < 0) return;
    setAfterId(revisionId);
    setBeforeId((revisions[index + 1] || revisions[index]).id);
  };
  const diff = useMemo(() => lineRevisionDiff(before?.snapshot.content || "", after?.snapshot.content || ""), [after, before]);
  const hunks = useMemo(() => groupRevisionDiffHunks(diff), [diff]);
  const summary = useMemo(() => summarizeRevisionDiff(diff), [diff]);
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
          <ListSkeleton rows={5} className="min-h-64" />
        ) : revisions.length ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <RevisionTimeline revisions={revisions} baseId={beforeId} candidateId={afterId} onSelectCandidate={selectCandidate} scores={scoreById} />

            {scoreEntries.length > 0 && <RevisionScorecard entries={scoreEntries} baseId={beforeId} candidateId={afterId} />}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <label className="section-label" htmlFor="revision-before">Compare against</label>
                <Select value={beforeId} onValueChange={setBeforeId}>
                  <SelectTrigger id="revision-before" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>{revisions.map((revision) => <SelectItem key={revision.id} value={revision.id}>Revision {revision.revision_number} · {new Date(revision.created_at).toLocaleString()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
                <span><span className="font-semibold text-status-success">+{summary.added}</span> / <span className="font-semibold text-status-error">−{summary.removed}</span> lines</span>
                <span>{hunks.length} {hunks.length === 1 ? "hunk" : "hunks"}</span>
              </div>
            </div>

            {before?.snapshot.title !== after?.snapshot.title && (
              <div className="rounded-sm border border-byword-border bg-muted/20 p-3">
                <p className="section-label">Title changed</p>
                <p className="mt-2 break-words font-mono text-xs text-status-error line-through">{before?.snapshot.title || "—"}</p>
                <p className="mt-1 break-words font-mono text-xs font-semibold text-status-success">{after?.snapshot.title || "—"}</p>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-byword-border bg-background font-mono text-xs leading-5" aria-label="Line by line revision comparison">
              {hunks.length ? hunks.map((hunk, hunkIndex) => (
                <div key={`${hunk.beforeStart}-${hunk.afterStart}-${hunkIndex}`}>
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-y border-byword-border bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                    <span>@@ -{hunk.beforeStart},{hunk.beforeCount} +{hunk.afterStart},{hunk.afterCount} @@</span>
                    <span className="uppercase">hunk {hunkIndex + 1} / {hunks.length}</span>
                  </div>
                  {hunk.lines.map((line, index) => (
                    <div key={`${hunkIndex}-${index}-${line.type}`} className={cn(
                      "grid grid-cols-[2.25rem_2.25rem_1rem_minmax(0,1fr)] border-b border-border/50 pr-2",
                      line.type === "added" && "bg-status-success/10 text-status-success",
                      line.type === "removed" && "bg-status-error/10 text-status-error",
                    )}>
                      <span className="select-none border-r border-border/50 px-1 text-right text-[10px] text-muted-foreground">{line.beforeLine ?? ""}</span>
                      <span className="select-none border-r border-border/50 px-1 text-right text-[10px] text-muted-foreground">{line.afterLine ?? ""}</span>
                      <span className="select-none text-center text-muted-foreground">{line.type === "added" ? "+" : line.type === "removed" ? "−" : ""}</span>
                      <span className="whitespace-pre-wrap break-words py-0.5 pl-1">{line.text || " "}</span>
                    </div>
                  ))}
                </div>
              )) : <EmptyState size="row" tone="empty" title="No text changes" description="These two revisions have identical body text." />}
            </div>

            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" disabled={!before || before.id === revisions[0]?.id || restoreMutation.isPending}><RotateCcw className="mr-1.5 h-4 w-4" />Restore revision {before?.revision_number}</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Restore revision {before?.revision_number}?</AlertDialogTitle><AlertDialogDescription>This creates a new draft revision. Existing history remains available.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => restoreMutation.mutate()}>Restore revision</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : <EmptyState size="row" title="No saved revisions" description="Revisions are recorded each time the draft is edited or regenerated." />}
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
            {hasUnsavedChanges && <Alert variant="warning"><AlertDescription>Preview and review actions use the last saved revision. Save your changes first.</AlertDescription></Alert>}
            <div className="grid gap-2 sm:grid-cols-2">
              {preflightLoading ? [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-16 rounded-sm" aria-label={index === 0 ? "Running preflight" : undefined} />) : preflight?.checks.map((check) => (
                <div key={check.id} className="flex gap-2 rounded-sm border border-border bg-muted/40 p-3">
                  {check.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success" /> : <ShieldAlert className={cn("mt-0.5 h-4 w-4 shrink-0", check.status === "blocker" ? "text-status-error" : "text-status-warning")} />}
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
            <Button variant="outline" asChild><Link to={`/library/posts/${postId}/preview`} target="_blank"><Eye className="mr-1.5 h-4 w-4" />BlogFactory preview</Link></Button>
          </div>
        </div>
      </BywordCard>
      <RevisionHistoryDialog postId={postId} updatedAt={updatedAt} open={historyOpen} onOpenChange={setHistoryOpen} onRestored={onRestored} />
    </>
  );
}

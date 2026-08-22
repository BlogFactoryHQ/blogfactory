import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { ActionItem, ReviewPacket } from "@/lib/control-plane";
import { useSites } from "@/hooks/useSites";
import { safeFormatDistanceToNow } from "@/lib/date-format";

type QueueResponse = { items: ActionItem[]; counts: { total: number; blocker: number; review: number; warning: number } };
type PublishResponse = { success: boolean; idempotent?: boolean; publication?: { externalEditUrl?: string | null; externalUrl?: string | null } };
type SeverityFilter = "all" | "blocker" | "review" | "warning";

export default function ReviewQueue() {
  const { activeSite } = useSites();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("post");
  const severity = (["blocker", "review", "warning"].includes(searchParams.get("severity") || "") ? searchParams.get("severity") : "all") as SeverityFilter;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["action-items", activeSite?.id, severity],
    queryFn: () => api.get<QueueResponse>(`/control-plane/action-items?site_id=${encodeURIComponent(activeSite!.id)}&limit=50${severity === "all" ? "" : `&severity=${severity}`}`),
    enabled: Boolean(activeSite?.id),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!selectedId && data?.items[0]) {
      const next = new URLSearchParams(searchParams);
      next.set("post", data.items[0].id);
      setSearchParams(next, { replace: true });
    }
  }, [data?.items, searchParams, selectedId, setSearchParams]);

  const setSeverity = (nextSeverity: SeverityFilter) => {
    const next = new URLSearchParams(searchParams);
    next.delete("post");
    if (nextSeverity === "all") next.delete("severity");
    else next.set("severity", nextSeverity);
    setSearchParams(next);
  };

  const selectPost = (postId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("post", postId);
    setSearchParams(next);
  };

  return <BywordPageShell className="max-w-7xl">
    <PageHeader title="Review Queue" description="Drafts that require an editorial decision or delivery fix.">
      <Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </PageHeader>
    {isLoading && <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
    {error && <BywordCard><p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Review Queue could not be loaded."}</p></BywordCard>}
    {data && <>
      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Queue severity filters">
        {([
          ["all", "All", data.counts.total],
          ["blocker", "Blockers", data.counts.blocker],
          ["review", "Review", data.counts.review],
          ["warning", "Warnings", data.counts.warning],
        ] as const).map(([value, label, count]) => <Button key={value} type="button" size="sm" variant={severity === value ? "secondary" : "outline"} aria-pressed={severity === value} onClick={() => setSeverity(value)}>{label}<span className="ml-2 font-mono text-[10px] opacity-70">{count}</span></Button>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <BywordCard className="order-2 xl:order-1"><div className="divide-y divide-byword-border">{data.items.map((item) => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => selectPost(item.id)} className={`relative flex w-full gap-4 p-4 text-left transition-calm hover:bg-muted/30 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedId === item.id ? "bg-byword-blue-soft/50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-byword-blue" : ""}`}>
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === "blocker" ? "bg-red-500" : item.severity === "review" ? "bg-amber-500" : "bg-slate-400"}`} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.source_type.replace(/_/g, " ")} · {item.editorial_state.replace(/_/g, " ")} · Revision {item.revision_number || "—"}</span><span className="mt-2 flex flex-wrap gap-1">{item.reasons.map((reason) => <Badge key={reason.kind} variant="outline" className="text-[10px]">{reason.label}</Badge>)}</span></span>
          <span className="shrink-0 text-right text-[11px] text-muted-foreground">{safeFormatDistanceToNow(item.updated_at)}<span className="mt-1 block">{item.routing_status === "ready" ? [item.destination_name, item.destination_provider].filter(Boolean).join(" · ") || "Routed" : "Choose CMS"}</span></span>
        </button>)}{!data.items.length && <div className="p-12 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-green-600" /><p className="mt-3 text-sm font-medium">Queue clear</p><p className="mt-1 text-xs text-muted-foreground">No drafts need action.</p></div>}</div></BywordCard>
        <ReviewDetail postId={selectedId} />
      </div>
    </>}
  </BywordPageShell>;
}

function ReviewDetail({ postId }: { postId: string | null }) {
  const queryClient = useQueryClient();
  const [destinationId, setDestinationId] = useState("");
  const [delivery, setDelivery] = useState<PublishResponse | null>(null);
  const { data: packet, isLoading, error } = useQuery({
    queryKey: ["review-packet", postId],
    queryFn: () => api.get<ReviewPacket>(`/posts/${postId}/review`),
    enabled: Boolean(postId),
  });
  useEffect(() => {
    if (!packet) return;
    const preferred = packet.destinations.find((item) => item.preferred && item.status === "connected" && item.credential_status === "usable");
    const connected = packet.destinations.filter((item) => item.status === "connected" && item.credential_status === "usable");
    setDestinationId(preferred?.id || (connected.length === 1 ? connected[0].id : ""));
    setDelivery(null);
  }, [packet]);
  const push = useMutation({
    mutationFn: () => api.post<PublishResponse>(`/posts/${postId}/publish`, { integrationId: destinationId, mode: "draft", postType: "post", expected_updated_at: packet!.post.updated_at }),
    onSuccess: (result) => {
      setDelivery(result);
      queryClient.invalidateQueries({ queryKey: ["review-packet", postId] });
      queryClient.invalidateQueries({ queryKey: ["control-plane-overview"] });
      toast.success(result.idempotent ? "Existing CMS draft reused" : "CMS draft created");
    },
    onError: (pushError) => {
      queryClient.invalidateQueries({ queryKey: ["review-packet", postId] });
      toast.error(pushError instanceof ApiError && pushError.code === "POST_VERSION_CONFLICT" ? "Draft changed. Review the refreshed version before sending again." : pushError instanceof Error ? pushError.message : "CMS draft could not be created");
    },
  });
  if (!postId) return <BywordCard><p className="p-8 text-sm text-muted-foreground">Select a draft to review.</p></BywordCard>;
  if (isLoading) return <BywordCard><div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin" /></div></BywordCard>;
  if (error || !packet) return <BywordCard><p className="p-6 text-sm text-destructive">Review packet could not be loaded.</p></BywordCard>;
  const connected = packet.destinations.filter((item) => item.status === "connected" && item.credential_status === "usable");
  const canSend = packet.preflight.can_send && Boolean(destinationId);
  const externalUrl = delivery?.publication?.externalEditUrl || delivery?.publication?.externalUrl;

  return <BywordCard className="order-1 self-start xl:order-2 xl:sticky xl:top-16">
    <SectionHeader icon={AlertTriangle} title={packet.post.title} description={`${packet.source.type.replace(/_/g, " ")} · ${packet.editorial.state.replace(/_/g, " ")} · Revision ${packet.editorial.revision_number || "—"}`} />
    <div className="space-y-5 p-5">
      {packet.post.summary && <p className="text-sm leading-6 text-muted-foreground">{packet.post.summary}</p>}
      <div><p className="type-kicker text-muted-foreground">Last revision</p><p className="mt-2 text-sm">{packet.changes.changed_fields.length ? packet.changes.changed_fields.join(", ") : "No changed fields"} · {packet.changes.word_delta >= 0 ? "+" : ""}{packet.changes.word_delta} words</p></div>
      <div className={`rounded-sm border px-3 py-2.5 ${packet.preflight.has_blockers ? "border-destructive/30 bg-destructive/5" : "border-green-700/25 bg-green-700/5"}`}><p className="type-kicker">Delivery state</p><p className="mt-1 text-sm font-semibold">{packet.preflight.has_blockers ? "Resolve blockers before delivery" : "Ready for a CMS draft"}</p><p className="mt-0.5 text-xs text-muted-foreground">Draft only · live publishing is unavailable in this workflow.</p></div>
      <div className="grid gap-2 sm:grid-cols-2">{packet.preflight.checks.map((check) => <div key={check.id} className="flex items-start gap-3 rounded-sm border border-byword-border p-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${check.status === "blocker" ? "bg-red-500" : check.status === "warning" ? "bg-amber-500" : "bg-green-600"}`} /><div><p className="text-sm font-medium">{check.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{check.message}</p></div></div>)}</div>
      <div><p className="mb-2 text-xs font-semibold">CMS destination</p><Select value={destinationId} onValueChange={setDestinationId}><SelectTrigger aria-label="CMS destination"><SelectValue placeholder="Choose a destination" /></SelectTrigger><SelectContent>{connected.map((destination) => <SelectItem key={destination.id} value={destination.id}>{destination.display_name} · {destination.provider}</SelectItem>)}</SelectContent></Select>{!connected.length && <p className="mt-2 text-xs text-destructive">No usable CMS destination. Repair the connection in Control.</p>}</div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to={packet.links.edit}>Edit <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button><Button asChild variant="outline" size="sm"><Link to={packet.links.preview} target="_blank">Preview <ExternalLink className="ml-1.5 h-4 w-4" /></Link></Button>
        <AlertDialog><AlertDialogTrigger asChild><Button size="sm" disabled={!canSend || push.isPending}><Send className="mr-1.5 h-4 w-4" />Send CMS draft</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Send this revision to CMS?</AlertDialogTitle><AlertDialogDescription>This creates a draft in {connected.find((destination) => destination.id === destinationId)?.display_name || "the selected destination"}. It never publishes live.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => push.mutate()}>Create CMS draft</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>
      {!packet.preflight.can_send && <p className="text-xs text-destructive">Resolve revision, SEO, and destination blockers before delivery.</p>}
      {externalUrl && <Button asChild variant="outline" className="w-full"><a href={externalUrl} target="_blank" rel="noreferrer">Open CMS draft <ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
    </div>
  </BywordCard>;
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, FilePlus2, List, Loader2, Plus, RefreshCw, Target } from "lucide-react";
import { toast } from "sonner";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type SeoActionType, type SeoPlanItem, useSeoGrowthPlan } from "@/hooks/useSeoGrowthPlan";

const actionLabels: Record<SeoActionType, string> = {
  new_content: "New draft",
  refresh: "Content refresh",
  snippet_test: "Snippet test",
  internal_link: "Internal links",
  indexing_investigation: "Indexing check",
};

const stageTone: Record<SeoPlanItem["stage"], string> = {
  planned: "border-slate-300 text-slate-700",
  drafting: "border-blue-300 bg-blue-50 text-blue-700",
  review: "border-amber-300 bg-amber-50 text-amber-700",
  delivered: "border-emerald-300 bg-emerald-50 text-emerald-700",
  blocked: "border-red-300 bg-red-50 text-red-700",
  measuring: "border-violet-300 bg-violet-50 text-violet-700",
};

export function SeoGrowthPlanPanel() {
  const { activeSiteId, plan, generate, addItem, updateItem } = useSeoGrowthPlan();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [targetQuery, setTargetQuery] = useState("");
  const [actionType, setActionType] = useState<SeoActionType>("new_content");
  const [pageUrl, setPageUrl] = useState("");
  const [plannedFor, setPlannedFor] = useState("");
  const items = useMemo(() => plan.data?.items || [], [plan.data?.items]);
  const grouped = useMemo(() => Object.entries(items.reduce((map, item) => {
    const date = item.plannedFor || "Unscheduled";
    map[date] = [...(map[date] || []), item];
    return map;
  }, {} as Record<string, SeoPlanItem[]>)).sort(([left], [right]) => left.localeCompare(right)), [items]);

  const runGenerate = async () => {
    try {
      await generate.mutateAsync();
      toast.success(plan.data?.campaign ? "Untouched plan items regenerated" : "30-day SEO plan generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate plan");
    }
  };

  const submitItem = async () => {
    try {
      await addItem.mutateAsync({ targetQuery, actionType, pageUrl: pageUrl || undefined, plannedFor: plannedFor || undefined });
      setTargetQuery(""); setPageUrl(""); setPlannedFor("");
      toast.success("Added to SEO plan");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add plan item");
    }
  };

  if (!activeSiteId) return <PlanState title="Select a site" description="Choose an active site before creating an SEO plan." />;
  if (plan.isLoading) return <PlanState title="Loading SEO plan" description="Reading planned work and outcomes." loading />;
  if (plan.isError) return <PlanState title="SEO plan unavailable" description={plan.error.message} />;

  return (
    <div className="space-y-6">
      <BywordCard>
        <SectionHeader
          icon={CalendarDays}
          title="30-day SEO Growth Plan"
          description="Turn Search Console evidence into reviewable work. Nothing publishes automatically."
          action={<Button onClick={runGenerate} disabled={generate.isPending}>{generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{plan.data?.campaign ? "Regenerate untouched" : "Generate plan"}</Button>}
        />
        <div className="grid gap-3 border-t border-byword-border p-4 sm:grid-cols-3 lg:grid-cols-7">
          {(["total", "planned", "drafting", "review", "delivered", "blocked", "measuring"] as const).map((key) => (
            <div key={key} className="rounded-md border border-byword-border bg-muted/20 p-3"><p className="font-mono text-[10px] uppercase text-muted-foreground">{key}</p><p className="mt-1 text-xl font-semibold">{plan.data?.summary[key] || 0}</p></div>
          ))}
        </div>
        <p className="border-t border-byword-border px-4 py-3 font-mono text-[10px] uppercase text-muted-foreground">GSC data through {plan.data?.freshness.dataThrough || "not synced"} · Regeneration preserves active and completed work</p>
      </BywordCard>

      <BywordCard>
        <SectionHeader icon={Plus} title="Add target query" description="Use the next open slot or select a date." />
        <div className="grid gap-3 border-t border-byword-border p-4 lg:grid-cols-[1fr_190px_1fr_170px_auto]">
          <div className="space-y-1.5"><Label>Target query</Label><Input value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} placeholder="best crm for startups" /></div>
          <div className="space-y-1.5"><Label>Action</Label><Select value={actionType} onValueChange={(value) => setActionType(value as SeoActionType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(actionLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Page URL {actionType === "new_content" && "(optional)"}</Label><Input value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="https://example.com/page" /></div>
          <div className="space-y-1.5"><Label>Planned date</Label><Input type="date" value={plannedFor} onChange={(event) => setPlannedFor(event.target.value)} /></div>
          <div className="flex items-end"><Button className="w-full" onClick={submitItem} disabled={!targetQuery.trim() || addItem.isPending || (actionType !== "new_content" && !pageUrl.trim())}>{addItem.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add</Button></div>
        </div>
      </BywordCard>

      <BywordCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><h3 className="font-semibold">Planned work</h3><p className="text-sm text-muted-foreground">Evidence, blockers, dates, and handoff state.</p></div>
          <div className="flex rounded-md border border-byword-border p-1"><Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}><List className="mr-1.5 h-4 w-4" />List</Button><Button variant={view === "calendar" ? "secondary" : "ghost"} size="sm" onClick={() => setView("calendar")}><CalendarDays className="mr-1.5 h-4 w-4" />Calendar</Button></div>
        </div>
        {!items.length ? <div className="border-t border-byword-border p-10 text-center"><Target className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">No planned work yet</p><p className="mt-1 text-sm text-muted-foreground">Sync Search Console, then generate an evidence-backed plan.</p></div> : view === "list" ? (
          <div className="overflow-x-auto border-t border-byword-border"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Work</TableHead><TableHead>Evidence</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <PlanRow key={item.id} item={item} siteId={activeSiteId} campaignId={plan.data!.campaign!.id} onUpdate={(input) => updateItem.mutate({ id: item.id, ...input })} />)}</TableBody></Table></div>
        ) : (
          <div className="grid gap-px border-t border-byword-border bg-byword-border sm:grid-cols-2 lg:grid-cols-4">{grouped.map(([date, dateItems]) => <div key={date} className="min-h-40 bg-card p-3"><p className="font-mono text-[11px] font-semibold uppercase">{date}</p><div className="mt-3 space-y-2">{dateItems.map((item) => <div key={item.id} className="rounded-md border border-byword-border p-3"><Badge variant="outline" className={stageTone[item.stage]}>{item.stage}</Badge><p className="mt-2 text-sm font-medium">{item.keyword}</p><p className="mt-1 text-xs text-muted-foreground">{actionLabels[item.actionType]}</p></div>)}</div></div>)}</div>
        )}
      </BywordCard>
    </div>
  );
}

function PlanRow({ item, siteId, campaignId, onUpdate }: { item: SeoPlanItem; siteId: string; campaignId: string; onUpdate: (input: { plannedFor?: string; planningStatus?: SeoPlanItem["planningStatus"] }) => void }) {
  const createParams = new URLSearchParams({ siteId, campaignId, seoPlanItemId: item.id, seoAction: item.actionType, targetQuery: item.keyword || "" });
  if (item.pageUrl) createParams.set("pageUrl", item.pageUrl);
  const canCreate = item.actionType !== "indexing_investigation" && !item.postId;
  return <TableRow>
    <TableCell><Input aria-label={`Planned date for ${item.keyword || "item"}`} className="w-36" type="date" value={item.plannedFor || ""} onChange={(event) => onUpdate({ plannedFor: event.target.value })} /></TableCell>
    <TableCell className="max-w-[300px]"><p className="font-medium">{item.keyword || item.title}</p><p className="mt-1 text-xs text-muted-foreground">{actionLabels[item.actionType]}{item.pageUrl ? ` · ${item.pageUrl}` : ""}</p>{item.blocker && <p className="mt-1 text-xs text-destructive">{item.blocker}</p>}</TableCell>
    <TableCell className="max-w-[320px]"><p className="text-sm">{item.evidence?.recommendation || item.input}</p><p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">{item.evidence?.source || "manual"}{item.evidence?.baseline_date ? ` · baseline ${item.evidence.baseline_date}` : ""}</p></TableCell>
    <TableCell><Badge variant="outline" className={cn("capitalize", stageTone[item.stage])}>{item.stage}</Badge></TableCell>
    <TableCell className="text-right"><div className="flex justify-end gap-2">{canCreate && <Button size="sm" asChild><Link to={`/create?${createParams.toString()}`}><FilePlus2 className="mr-1.5 h-4 w-4" />Create draft</Link></Button>}{item.postId && <Button size="sm" variant="outline" asChild><Link to={`/library/posts/${item.postId}/preview`}>Review</Link></Button>}{item.actionType === "indexing_investigation" && item.planningStatus !== "completed" && <Button size="sm" variant="outline" onClick={() => onUpdate({ planningStatus: "in_progress" })}>Start check</Button>}{item.planningStatus === "in_progress" && <Button size="sm" variant="outline" onClick={() => onUpdate({ planningStatus: "completed" })}>Mark done</Button>}</div></TableCell>
  </TableRow>;
}

function PlanState({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) {
  return <BywordCard><div className="flex items-center gap-3 p-6">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarDays className="h-5 w-5 text-muted-foreground" />}<div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div></div></BywordCard>;
}

import { useState } from "react";
import { CalendarPlus, Loader2, Pencil, Plus, ScanSearch, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ListSkeleton } from "@/components/patterns/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { TagInput } from "@/components/ui/tag-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog, InlineError } from "@/components/search-growth/shared";
import { useAction } from "@/hooks/useAction";
import { type TopicIntent, useProductTopics } from "@/hooks/useProductTopics";

const intentLabel: Record<TopicIntent, string> = {
  informational: "Guide",
  commercial: "Best-of",
  comparison: "Versus",
  alternatives: "Alternatives",
  transactional: "Buy intent",
};

export function ProductTopicsPanel({ onOpenPlan }: { onOpenPlan?: () => void }) {
  const { activeSiteId, profile, generateProfile, saveProfile, discover, addToPlan, fillPlan, enableKnowledge } = useProductTopics();
  const { act, error } = useAction();
  const [editing, setEditing] = useState(false);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [rivals, setRivals] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmFill, setConfirmFill] = useState(false);
  const data = profile.data?.profile;
  const knowledge = profile.data?.knowledge;
  const topics = discover.data?.topics || [];
  const showVolume = topics.some((topic) => topic.volume != null);
  const planAction = onOpenPlan ? { label: "View plan", onClick: onOpenPlan } : undefined;
  const allSelected = topics.length > 0 && selected.size === topics.length;

  if (!activeSiteId) return null;

  const analyze = () => act(() => generateProfile.mutateAsync(), { success: "Product profile updated", failure: "Could not read the site. Check that it is public and try again." });
  const toggle = (keyword: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (checked) next.add(keyword); else next.delete(keyword);
    return next;
  });
  const startEdit = () => {
    setSeeds(data?.seedTopics || []);
    setRivals(data?.competitors || []);
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!data) return;
    const result = await act(() => saveProfile.mutateAsync({ ...data, seedTopics: seeds, competitors: rivals }), { success: "Seeds and rivals saved", failure: "Could not save the profile. Try again." });
    if (result.ok) setEditing(false);
  };
  const addSelected = async () => {
    const count = selected.size;
    const result = await act(() => addToPlan.mutateAsync({ keywords: [...selected] }), { success: `${count} topic${count === 1 ? "" : "s"} added to the plan`, failure: "Could not add topics to the plan. Try again.", action: planAction });
    if (result.ok) setSelected(new Set());
  };
  const fillMonth = async () => {
    const result = await act(() => fillPlan.mutateAsync(), { failure: "Could not fill the plan. Try again." });
    if (!result.ok) return;
    const count = result.value.items.length;
    if (count) toast.success(`${count} topics scheduled, one per day`, planAction ? { action: planAction } : undefined);
    else toast.message("Nothing new to schedule. Every strong topic is already covered or planned.");
  };

  return (
    <BywordCard>
      <SectionHeader
        icon={Sparkles}
        title="Product-led topics"
        description="Read your product site, then find what customers search before they know you."
        action={data && (
          <Button type="button" variant="outline" onClick={analyze} disabled={generateProfile.isPending}>
            {generateProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="mr-2 h-4 w-4" aria-hidden="true" />}Re-read site
          </Button>
        )}
      />

      {profile.isLoading && <ListSkeleton rows={2} className="border-t border-byword-border" />}
      {profile.isError && (
        <EmptyState tone="error" title="Could not load the product profile" description="Nothing was lost." primaryAction={{ label: "Retry", onClick: () => profile.refetch() }} className="border-t border-byword-border" />
      )}
      {!profile.isLoading && !profile.isError && !data && (
        <EmptyState
          title="No product profile yet"
          description="Analyze your site to get seed topics, rivals and a call to action. No Search Console data needed."
          primaryAction={{ label: generateProfile.isPending ? "Analyzing…" : "Analyze product", onClick: analyze }}
          className="border-t border-byword-border"
        />
      )}
      {error && <div className="border-t border-byword-border px-4 py-3 sm:px-5"><InlineError message={error} /></div>}

      {data && (
        <div className="space-y-4 border-t border-byword-border p-4 sm:p-5">
          <div className="space-y-3">
            <p className="text-sm leading-6 text-foreground">{data.summary}</p>
            <div>
              <p className="type-kicker">Seed topics</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Seed topics">
                {data.seedTopics.map((topic) => <li key={topic}><Badge variant="outline">{topic}</Badge></li>)}
              </ul>
            </div>
            {data.competitors.length > 0 && (
              <div>
                <p className="type-kicker">Rivals</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Rivals">
                  {data.competitors.map((name) => <li key={name}><Badge variant="outline">{name}</Badge></li>)}
                </ul>
              </div>
            )}
            <p className="type-meta">
              {data.source === "ai" ? "AI profile" : "Basic profile. Add an AI key for a deeper one."} · {data.pagesRead.length} page{data.pagesRead.length === 1 ? "" : "s"} read
            </p>
          </div>

          {knowledge?.saved && (
            <p className="rounded-sm border border-byword-border bg-muted/40 px-3 py-2 text-sm leading-6">
              {knowledge.enabled
                ? "Product facts are in this site's knowledge base and are used when drafts are written."
                : "Product facts are saved to this site's knowledge base, but it is switched off, so drafts will not use them."}
              {!knowledge.enabled && (
                <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0 text-sm" disabled={enableKnowledge.isPending} onClick={() => act(() => enableKnowledge.mutateAsync(), { success: "Drafts for this site now use your product facts", failure: "Could not switch on the knowledge base. Try again." })}>
                  Use product facts in drafts
                </Button>
              )}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => act(() => discover.mutateAsync(), { success: "Topics found", failure: "Could not find topics. Try again." })} disabled={discover.isPending}>
              {discover.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />}Find topics
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmFill(true)} disabled={fillPlan.isPending}>
              {fillPlan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />}Fill my month
            </Button>
            <Button type="button" variant="outline" onClick={startEdit}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Edit seeds and rivals</Button>
          </div>
        </div>
      )}

      {topics.length > 0 && (
        <div className="border-t border-byword-border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <p className="type-body min-w-0 flex-1">{topics.length} topics from {discover.data?.queriesRun} searches. Score blends demand, product fit and buying intent.</p>
            <div className="flex items-center gap-3">
              <span className="type-meta" aria-live="polite">{selected.size} selected</span>
              <Button type="button" variant="secondary" onClick={addSelected} disabled={!selected.size || addToPlan.isPending}>
                {addToPlan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="mr-2 h-4 w-4" aria-hidden="true" />}Add to plan
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto border-t border-byword-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox aria-label="Select all topics" checked={allSelected ? true : selected.size ? "indeterminate" : false} onCheckedChange={(checked) => setSelected(checked === true ? new Set(topics.map((topic) => topic.keyword)) : new Set())} /></TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Cluster</TableHead>
                  {showVolume && <TableHead className="text-right">Searches / mo</TableHead>}
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topics.map((topic) => (
                  <TableRow key={topic.keyword} data-state={selected.has(topic.keyword) ? "selected" : undefined}>
                    <TableCell><Checkbox aria-label={`Select ${topic.keyword}`} checked={selected.has(topic.keyword)} onCheckedChange={(checked) => toggle(topic.keyword, checked === true)} /></TableCell>
                    <TableCell className="min-w-[14rem]">
                      <div className="type-object-title">{topic.keyword}</div>
                      {(topic.question || topic.template || topic.overlap) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {topic.question && <Badge variant="outline">FAQ idea</Badge>}
                          {topic.template && <Badge variant="outline">Template</Badge>}
                          {topic.overlap && <span title={`Similar to: ${topic.overlap.title}`}><StatusBadge status="warning" label="Already covered" /></span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline">{intentLabel[topic.intent]}</Badge></TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{topic.cluster === topic.keyword ? <span aria-label="Not clustered">—</span> : topic.cluster}</TableCell>
                    {showVolume && <TableCell className="type-data text-right">{topic.volume != null ? topic.volume.toLocaleString() : <span aria-label="No data">—</span>}</TableCell>}
                    <TableCell className="type-data text-right">{topic.score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seeds and rivals</DialogTitle>
            <DialogDescription>Topic discovery and the alternatives and versus topics start from these.</DialogDescription>
          </DialogHeader>
          <form id="seeds-rivals-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="seed-topics">Seed topics</Label>
              <TagInput id="seed-topics" value={seeds} onChange={setSeeds} maxItems={10} placeholder="hair growth tracker" describedBy="seed-help" />
              <p id="seed-help" className="type-meta">Searches a customer would type. Press Enter or comma to add.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rival-names">Rivals</Label>
              <TagInput id="rival-names" value={rivals} onChange={setRivals} maxItems={8} placeholder="Hairmetric" describedBy="rival-help" />
              <p id="rival-help" className="type-meta">Names of competing products.</p>
            </div>
            {error && <InlineError message={error} />}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" form="seeds-rivals-form" disabled={saveProfile.isPending || seeds.length === 0}>
              {saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmFill}
        onOpenChange={setConfirmFill}
        title="Schedule up to 12 topics?"
        description="The best uncovered topics are added to the plan as planned items, one per day. Nothing is drafted or published. You can change dates in the plan."
        confirmLabel="Schedule topics"
        onConfirm={fillMonth}
      />
    </BywordCard>
  );
}

import { useState } from "react";
import { ArrowDown, ArrowUp, Bot, Loader2, Minus, Radar, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ListSkeleton } from "@/components/patterns/PageSkeleton";
import { RowActions } from "@/components/patterns/RowActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, InlineError } from "@/components/search-growth/shared";
import { useAction } from "@/hooks/useAction";
import { type RankRow, type Severity, useGrowthTools } from "@/hooks/useGrowthTools";
import { safeFormatDistanceToNow } from "@/lib/date-format";
import { cn } from "@/lib/utils";

const severityStatus: Record<Severity, StatusType> = { error: "error", warn: "warning", info: "pending" };
const severityLabel: Record<Severity, string> = { error: "Error", warn: "Warning", info: "Note" };
const PAGES_SHOWN = 8;
const RANKS_SHOWN = 10;
const MAX_QUESTIONS = 5;

function positionLabel(row: RankRow) {
  if (!row.lastCheckedAt) return "Not checked yet";
  return row.position ? `#${row.position}` : "Outside top 20";
}

function RankChange({ change }: { change: number | null }) {
  if (change === null) return null;
  const Icon = change > 0 ? ArrowUp : change < 0 ? ArrowDown : Minus;
  const text = change > 0 ? `Up ${change}` : change < 0 ? `Down ${Math.abs(change)}` : "No change";
  return (
    <span className={cn("type-meta flex items-center gap-0.5", change > 0 && "text-status-success", change < 0 && "text-status-error")}>
      <Icon className="h-3 w-3" aria-hidden="true" />{Math.abs(change)}<span className="sr-only">{text}</span>
    </span>
  );
}

function RankTracker() {
  const tools = useGrowthTools();
  const { act, error } = useAction();
  const [keyword, setKeyword] = useState("");
  const [pendingRemove, setPendingRemove] = useState<RankRow | null>(null);
  const [allRanks, setAllRanks] = useState(false);
  const rankings = tools.rankings.data?.rankings || [];
  const visibleRanks = allRanks ? rankings : rankings.slice(0, RANKS_SHOWN);
  const configured = tools.rankings.data?.serpConfigured !== false;

  const track = async () => {
    const result = await act(() => tools.track.mutateAsync({ keywords: [keyword.trim()] }), { failure: "Could not track the keyword. Try again." });
    if (!result.ok) return;
    setKeyword("");
    if (result.value.added) toast.success("Keyword tracked");
    else toast.message(`That keyword is already tracked, or the limit of ${result.value.limit} is reached.`);
  };
  const trackPlan = async () => {
    const result = await act(() => tools.track.mutateAsync({ fromPlan: true }), { failure: "Could not track the plan keywords. Try again." });
    if (result.ok) toast.message(result.value.added ? `${result.value.added} plan keyword${result.value.added === 1 ? "" : "s"} tracked` : "Plan keywords are already tracked.");
  };
  const check = async () => {
    const result = await act(() => tools.checkRankings.mutateAsync(), { failure: "Could not check rankings. Try again." });
    if (result.ok) toast.success(`Checked ${result.value.checked} keyword${result.value.checked === 1 ? "" : "s"}`);
  };

  return (
    <BywordCard>
      <SectionHeader icon={Radar} title="Rank tracker" description="Position in the top 20, before Search Console has data. Each check uses one search-provider call." />
      <div className="space-y-4 border-t border-byword-border p-4 sm:p-5">
        {!configured && (
          <div className="flex flex-wrap items-center gap-2 text-sm"><StatusBadge status="warning" label="Provider not set up" showIcon={false} /><span>Set BRAVE_SEARCH_API_KEY on the server to run checks.</span></div>
        )}
        <form className="space-y-1.5" onSubmit={(event) => { event.preventDefault(); if (keyword.trim().length >= 3) void track(); }}>
          <Label htmlFor="track-keyword">Keyword to track</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="track-keyword" className="min-w-0 flex-1 basis-48" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="hair growth tracker" maxLength={90} />
            <Button type="submit" variant="secondary" disabled={tools.track.isPending || keyword.trim().length < 3}>Track keyword</Button>
            <Button type="button" variant="outline" disabled={tools.track.isPending} onClick={trackPlan}>Track plan keywords</Button>
            <Button type="button" variant="outline" disabled={tools.checkRankings.isPending || !rankings.length || !configured} onClick={check}>
              {tools.checkRankings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Check rankings
            </Button>
          </div>
        </form>
        {error && <InlineError message={error} />}
      </div>

      {tools.rankings.isLoading && <ListSkeleton rows={3} className="border-t border-byword-border" />}
      {tools.rankings.isError && (
        <EmptyState tone="error" title="Could not load tracked keywords" description="Nothing was lost." primaryAction={{ label: "Retry", onClick: () => tools.rankings.refetch() }} className="border-t border-byword-border" />
      )}
      {tools.rankings.data && !rankings.length && (
        <EmptyState title="No keywords tracked yet" description="Track a keyword, or add the keywords from your plan, then check rankings." className="border-t border-byword-border" />
      )}
      {rankings.length > 0 && (
        <div className="border-t border-byword-border px-4 py-2 sm:px-5">
          <ul className="divide-y divide-byword-border">
            {visibleRanks.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 break-words text-sm font-medium">{row.keyword}</span>
                <span className="flex items-center gap-3">
                  <span className="type-data text-sm">{positionLabel(row)}</span>
                  <RankChange change={row.change} />
                  <RowActions
                    triggerLabel={`Actions for “${row.keyword}”`}
                    actions={[{ label: "Stop tracking", icon: Trash2, destructive: true, onSelect: () => setPendingRemove(row) }]}
                  />
                </span>
              </li>
            ))}
          </ul>
          {rankings.length > RANKS_SHOWN && (
            <Button type="button" variant="link" size="sm" className="my-1 h-auto p-0" onClick={() => setAllRanks((value) => !value)}>{allRanks ? "Show fewer keywords" : `Show all ${rankings.length} keywords`}</Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => { if (!open) setPendingRemove(null); }}
        title={`Stop tracking “${pendingRemove?.keyword ?? ""}”?`}
        description="Its position history is deleted. You can track it again, but the history starts over."
        confirmLabel="Stop tracking"
        destructive
        onConfirm={() => { if (pendingRemove) { const name = pendingRemove.keyword; void act(() => tools.untrack.mutateAsync(name), { success: `Stopped tracking “${name}”`, failure: "Could not stop tracking. Try again." }); } }}
      />
    </BywordCard>
  );
}

function SiteAudit() {
  const tools = useGrowthTools();
  const { act, error } = useAction();
  const [allPages, setAllPages] = useState(false);
  const audit = tools.audit.data;
  const pages = audit ? (allPages ? audit.pages : audit.pages.slice(0, PAGES_SHOWN)) : [];
  const scoreStatus: StatusType = !audit ? "pending" : audit.score >= 80 ? "success" : audit.score >= 50 ? "warning" : "error";

  return (
    <BywordCard>
      <SectionHeader
        icon={ShieldCheck}
        title="Technical audit"
        description="Checks up to 25 sitemap pages for titles, headings, canonicals, alt text and indexing. It does not check broken links or speed."
        action={(
          <Button type="button" variant="secondary" disabled={tools.audit.isPending} onClick={() => act(() => tools.audit.mutateAsync(Boolean(audit)), { success: "Audit finished", failure: "Could not run the audit. Check that the site is public and try again." })}>
            {tools.audit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{audit ? "Run again" : "Run audit"}
          </Button>
        )}
      />
      {error && <div className="border-t border-byword-border px-4 py-3 sm:px-5"><InlineError message={error} /></div>}
      {audit && (
        <div className="space-y-4 border-t border-byword-border p-4 text-sm sm:p-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <p><span className="type-data text-2xl">{audit.score}</span><span className="type-meta"> / 100</span></p>
            <StatusBadge status={scoreStatus} label={audit.score >= 80 ? "Healthy" : audit.score >= 50 ? "Needs work" : "Needs attention"} />
            <p className="type-meta">{audit.pagesChecked} page{audit.pagesChecked === 1 ? "" : "s"} · {audit.summary.error} errors · {audit.summary.warn} warnings · {audit.summary.info} notes</p>
          </div>
          {audit.siteIssues.length > 0 && (
            <div>
              <h3 className="type-kicker">Site-wide</h3>
              <ul className="mt-1 space-y-1">{audit.siteIssues.map((issue) => <li key={issue.rule + issue.detail} className="flex items-start gap-2"><StatusBadge status={severityStatus[issue.severity]} label={severityLabel[issue.severity]} showIcon={false} /><span className="min-w-0 break-words">{issue.detail}</span></li>)}</ul>
            </div>
          )}
          {pages.length > 0 && (
            <div>
              <h3 className="type-kicker">Pages with issues · {audit.pages.length}</h3>
              <ul className="mt-1 space-y-2">
                {pages.map((page) => (
                  <li key={page.url} className="rounded-sm border border-byword-border p-3">
                    <a className="break-all font-medium text-primary underline underline-offset-2" href={page.url} target="_blank" rel="noreferrer">{page.url}<span className="sr-only"> (opens in a new tab)</span></a>
                    <ul className="mt-1.5 space-y-1">{page.issues.map((issue) => <li key={issue.rule} className="flex items-start gap-2"><StatusBadge status={severityStatus[issue.severity]} label={severityLabel[issue.severity]} showIcon={false} /><span className="min-w-0 break-words">{issue.detail}</span></li>)}</ul>
                  </li>
                ))}
              </ul>
              {audit.pages.length > PAGES_SHOWN && (
                <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0" onClick={() => setAllPages((value) => !value)}>{allPages ? "Show fewer pages" : `Show all ${audit.pages.length} pages`}</Button>
              )}
            </div>
          )}
          {audit.notes.map((note) => <p key={note} className="type-meta">{note}</p>)}
        </div>
      )}
    </BywordCard>
  );
}

function AiVisibilityCheck() {
  const tools = useGrowthTools();
  const { act, error } = useAction();
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const vis = tools.visibility.data?.visibility;
  const questions = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const count = Math.min(questions.length || MAX_QUESTIONS, MAX_QUESTIONS);

  return (
    <BywordCard>
      <SectionHeader icon={Bot} title="AI search visibility" description="Asks a web-search model a few buyer questions and records whether it mentions or cites your site." />
      <div className="space-y-4 border-t border-byword-border p-4 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="ai-questions">Questions to ask (optional)</Label>
          <Textarea id="ai-questions" className="min-h-20" value={text} onChange={(event) => setText(event.target.value)} placeholder={"What are the best hair growth tracker apps?\nWhich app tracks hair loss progress?"} aria-describedby="ai-questions-help" />
          <p id="ai-questions-help" className="type-meta">One per line, up to {MAX_QUESTIONS}. Leave empty to use questions built from your profile. Each question costs model tokens plus a web-search fee.</p>
        </div>
        <Button type="button" variant="secondary" disabled={tools.checkVisibility.isPending} onClick={() => setConfirm(true)}>
          {tools.checkVisibility.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Check AI answers
        </Button>
        {error && <InlineError message={error} />}
        {tools.visibility.isError && <InlineError message="Could not load the last result. Check again to refresh it." />}

        {vis && (
          <div className="space-y-3 text-sm" aria-live="polite">
            <p>Mentioned in <strong className="type-data">{vis.mentionRate}%</strong> of answers and cited in <strong className="type-data">{vis.citationRate}%</strong>. <span className="type-meta">Checked {safeFormatDistanceToNow(vis.checkedAt)} with {vis.model}.</span></p>
            <ul className="space-y-2">
              {vis.results.map((result) => (
                <li key={result.prompt} className="rounded-sm border border-byword-border p-3">
                  <p className="font-medium">{result.prompt}</p>
                  {result.error ? <p className="mt-1 text-status-error">{result.error}</p> : (
                    <>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={result.mentioned ? "success" : "pending"} label={result.mentioned ? "Mentioned" : "Not mentioned"} />
                        {result.cited && <StatusBadge status="success" label="Cited" />}
                        {result.competitors.map((name) => <StatusBadge key={name} status="pending" label={`${name} named`} showIcon={false} />)}
                      </div>
                      {result.citations.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {result.citations.slice(0, 3).map((citation) => <li key={citation.url} className="truncate"><a className="text-primary underline underline-offset-2" href={citation.url} target="_blank" rel="noreferrer" title={citation.url}>{citation.title || citation.url}<span className="sr-only"> (opens in a new tab)</span></a></li>)}
                        </ul>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Ask ${count} question${count === 1 ? "" : "s"}?`}
        description="Each question uses your OpenRouter credits for model tokens plus a web-search fee. The result replaces the last saved check."
        confirmLabel="Check AI answers"
        onConfirm={() => act(() => tools.checkVisibility.mutateAsync(questions), { success: "AI answers checked", failure: "Could not check AI answers. Try again." })}
      />
    </BywordCard>
  );
}

export function GrowthToolsPanel() {
  const { activeSiteId } = useGrowthTools();
  if (!activeSiteId) return null;
  return (
    <div className="space-y-6">
      <RankTracker />
      <SiteAudit />
      <AiVisibilityCheck />
    </div>
  );
}

import { useState } from "react";
import { Loader2, Plus, Search, Swords } from "lucide-react";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/patterns/EmptyState";
import { Badge } from "@/components/ui/badge";
import { InlineError } from "@/components/search-growth/shared";
import { useAction } from "@/hooks/useAction";
import { useProductTopics } from "@/hooks/useProductTopics";
import { stripHttpProtocol } from "@/lib/url-validation";

const QUESTIONS_SHOWN = 10;
const GAPS_SHOWN = 12;

export function KeywordResearchPanel({ onOpenPlan }: { onOpenPlan?: () => void }) {
  const { activeSiteId, research, gaps, addToPlan } = useProductTopics();
  const { act, error } = useAction();
  const [keyword, setKeyword] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [allQuestions, setAllQuestions] = useState(false);
  const [allGaps, setAllGaps] = useState(false);
  const data = research.data;
  const gap = gaps.data;
  const planAction = onOpenPlan ? { label: "View plan", onClick: onOpenPlan } : undefined;
  if (!activeSiteId) return null;

  const plan = (topic: string) => act(() => addToPlan.mutateAsync({ keywords: [topic] }), { success: "Added to the plan", failure: "Could not add the topic. Try again.", action: planAction });
  const planWithBrief = () => data && act(
    () => addToPlan.mutateAsync({ keywords: [data.keyword], briefs: { [data.keyword]: data.planBrief } }),
    { success: "Added with its brief. Create draft will prefill the outline.", failure: "Could not add the topic. Try again.", action: planAction },
  );
  const questions = data ? (allQuestions ? data.questions : data.questions.slice(0, QUESTIONS_SHOWN)) : [];
  const gapRows = gap ? (allGaps ? gap.gaps : gap.gaps.slice(0, GAPS_SHOWN)) : [];

  return (
    <BywordCard>
      <SectionHeader icon={Search} title="Keyword research and competitor gaps" description="Questions people ask, the length and headings top results share, and rival topics you do not cover." />
      {error && <div className="border-t border-byword-border px-4 py-3 sm:px-5"><InlineError message={error} /></div>}
      <div className="grid gap-8 border-t border-byword-border p-4 sm:p-5 lg:grid-cols-2">
        <section aria-labelledby="research-heading" className="min-w-0 space-y-3">
          <h3 id="research-heading" className="type-object-title">Research a keyword</h3>
          <form className="space-y-1.5" onSubmit={(event) => { event.preventDefault(); if (keyword.trim().length >= 3) void act(() => research.mutateAsync(keyword.trim()), { failure: "Could not research this keyword. Try again." }); }}>
            <Label htmlFor="research-keyword">Keyword</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="research-keyword" className="min-w-0 flex-1 basis-48" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="hair growth tracker" maxLength={90} />
              <Button type="submit" disabled={research.isPending || keyword.trim().length < 3}>
                {research.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="mr-2 h-4 w-4" aria-hidden="true" />}Research keyword
              </Button>
            </div>
          </form>
          {data && (
            <div className="space-y-4 text-sm" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" className="h-auto min-h-8 whitespace-normal text-left" onClick={planWithBrief} disabled={addToPlan.isPending}><Plus className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Plan with this brief<span className="sr-only"> for {data.keyword}</span></span></Button>
                {data.metrics?.volume != null && <span className="type-meta">{data.metrics.volume.toLocaleString()} searches / mo{data.metrics.competition ? ` · ${data.metrics.competition.toLowerCase()} ad competition` : ""}</span>}
              </div>

              {data.serp && (
                <div className="rounded-sm border border-byword-border p-3">
                  <p className="type-kicker">SERP brief · {data.serp.results.length} results read</p>
                  <p className="mt-1">Aim for about <strong className="type-data">{data.serp.brief.targetWords}</strong> words. Top results median: {data.serp.brief.medianWords || "unknown"}.</p>
                  {data.serp.brief.terms && data.serp.brief.terms.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Terms top results share">
                      {data.serp.brief.terms.slice(0, 12).map((item) => <li key={item.term}><Badge variant="outline" title={`${item.docs} top pages use it`}>{item.term}</Badge></li>)}
                    </ul>
                  )}
                  {data.serp.brief.suggestedOutline.length > 0 && (
                    <ol className="mt-2 list-decimal space-y-0.5 pl-5">{data.serp.brief.suggestedOutline.map((heading) => <li key={heading}>{heading}</li>)}</ol>
                  )}
                </div>
              )}

              {data.questions.length > 0 ? (
                <div>
                  <h4 className="type-kicker">People also ask · {data.questions.length}</h4>
                  <ul className="mt-1 divide-y divide-byword-border">
                    {questions.map((item) => (
                      <li key={item.question} className="flex items-center justify-between gap-2 py-1">
                        <span className="min-w-0 break-words">{item.question}</span>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Add “${item.question}” to the plan`} onClick={() => plan(item.question)} disabled={addToPlan.isPending}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
                      </li>
                    ))}
                  </ul>
                  {data.questions.length > QUESTIONS_SHOWN && (
                    <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0" onClick={() => setAllQuestions((value) => !value)}>{allQuestions ? "Show fewer questions" : `Show all ${data.questions.length} questions`}</Button>
                  )}
                </div>
              ) : <EmptyState size="row" title="No questions found" description="Try a shorter or more common phrase." />}

              {data.related.length > 0 && (
                <div>
                  <h4 className="type-kicker">Related searches</h4>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">{data.related.slice(0, 10).map((item) => <li key={item}><Badge variant="outline">{item}</Badge></li>)}</ul>
                </div>
              )}
              {data.notes.map((note) => <p key={note} className="type-meta">{note}</p>)}
            </div>
          )}
        </section>

        <section aria-labelledby="gap-heading" className="min-w-0 space-y-3">
          <h3 id="gap-heading" className="type-object-title">Competitor content gap</h3>
          <form className="space-y-1.5" onSubmit={(event) => { event.preventDefault(); if (competitor.trim().length >= 3) void act(() => gaps.mutateAsync(competitor.trim()), { failure: "Could not compare the sitemap. Check the domain and try again." }); }}>
            <Label htmlFor="gap-competitor">Competitor domain</Label>
            <div className="flex flex-wrap gap-2">
              <InputAffordance id="gap-competitor" className="min-w-0 flex-1 basis-48" prefix="https://" value={competitor} onChange={(event) => setCompetitor(stripHttpProtocol(event.target.value))} placeholder="competitor.com" inputMode="url" autoComplete="off" />
              <Button type="submit" disabled={gaps.isPending || competitor.trim().length < 3}>
                {gaps.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Swords className="mr-2 h-4 w-4" aria-hidden="true" />}Compare sitemap
              </Button>
            </div>
          </form>
          {gap && (
            <div className="space-y-2 text-sm" aria-live="polite">
              <p className="type-meta">{gap.contentUrls} article URLs read from {gap.sitemapUrls} sitemap URLs. You already cover {gap.covered}.</p>
              {gap.gaps.length > 0 ? (
                <>
                  <ul className="divide-y divide-byword-border">
                    {gapRows.map((item) => (
                      <li key={item.url} className="flex items-center justify-between gap-2 py-1">
                        <div className="min-w-0 break-words">
                          <a className="font-medium text-primary underline underline-offset-2" href={item.url} target="_blank" rel="noreferrer">{item.topic}<span className="sr-only"> (opens in a new tab)</span></a>
                          <Badge variant="outline" className="ml-1.5 align-middle">{item.intent}</Badge>
                        </div>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Add “${item.topic}” to the plan`} onClick={() => plan(item.topic)} disabled={addToPlan.isPending}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
                      </li>
                    ))}
                  </ul>
                  {gap.gaps.length > GAPS_SHOWN && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setAllGaps((value) => !value)}>{allGaps ? "Show fewer topics" : `Show all ${gap.gaps.length} topics`}</Button>
                  )}
                </>
              ) : <EmptyState size="row" title="No gaps found" description="You already cover the topics this competitor publishes." />}
              {gap.notes.map((note) => <p key={note} className="type-meta">{note}</p>)}
            </div>
          )}
        </section>
      </div>
    </BywordCard>
  );
}

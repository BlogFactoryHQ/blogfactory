import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Loader2, Swords } from "lucide-react";
import { BywordCard } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InlineError, Tag, type TagTone } from "@/components/search-growth/shared";
import { api } from "@/lib/api";

interface QualityAnalysis {
  words: number;
  avgSentenceWords: number;
  readability: { fleschReadingEase: number | null; level: "easy" | "standard" | "hard" };
  keyword: { term: string; count: number; density: number; inTitle: boolean; inFirst100: boolean; stuffing: boolean } | null;
  structure: { h2: number; h3: number; lists: number; tables: number; longParagraphs: number };
  aiPatterns: { count: number; phrases: string[] };
  duplicates: Array<{ id: string; title: string; similarity: number }>;
  flags: string[];
  usedKeyword: string | null;
  seoQa: { score: number; passed: number; total: number; checks: Array<{ label: string; ok: boolean | null; detail: string }> };
}

type TermResult =
  | { available: false; reason: string }
  | { available: true; keyword: string; coverage: number; covered: string[]; missing: Array<{ term: string; docs: number }>; total: number };

function scoreTone(score: number): TagTone {
  return score >= 80 ? "success" : score >= 50 ? "warning" : "error";
}

export function PostQualityPanel({ postId, updatedAt }: { postId: string; updatedAt: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    // updatedAt in the key re-runs the analysis after each saved revision.
    queryKey: ["post-quality", postId, updatedAt],
    queryFn: () => api.get<QualityAnalysis>(`/product-seo/posts/${postId}/analysis`),
    staleTime: 60_000,
  });
  // Spends one search-provider call (cached for 12 hours), so it runs on click only.
  const terms = useMutation({ mutationFn: () => api.get<TermResult>(`/product-seo/posts/${postId}/term-coverage`) });
  const result = terms.data;

  if (isLoading) {
    return <BywordCard className="mb-6 flex items-center gap-2 p-4 type-body sm:p-5"><span role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking quality</span></BywordCard>;
  }
  if (isError || !data) {
    return <BywordCard className="mb-6 p-4 sm:p-5"><InlineError message="The quality check could not run." onRetry={() => refetch()} /></BywordCard>;
  }

  const flagCount = data.flags.length;
  return (
    <BywordCard className="mb-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-sm p-4 text-left transition-calm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:p-5">
          <span className="min-w-0">
            <span className="type-object-title block">Quality check</span>
            <span className="type-body mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tag tone={scoreTone(data.seoQa.score)} className="type-data">{data.seoQa.score}/100</Tag>
              <span>{flagCount ? `${flagCount} thing${flagCount === 1 ? "" : "s"} to fix` : "No flags"} in the saved version{data.usedKeyword ? ` · keyword “${data.usedKeyword}”` : ""}</span>
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 border-t border-byword-border p-4 text-sm sm:p-5">
          {flagCount > 0 && (
            <ul className="space-y-1.5" aria-label="Things to fix">
              {data.flags.map((flag) => <li key={flag} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-warning))]" aria-hidden="true" /><span>{flag}</span></li>)}
            </ul>
          )}
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2" aria-label="Checks">
            {data.seoQa.checks.map((check) => (
              <li key={check.label} className="flex items-start gap-2">
                {check.ok === null
                  ? <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  : check.ok
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-success))]" aria-hidden="true" />
                    : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-warning))]" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="font-medium">{check.label}</span>
                  <span className="sr-only">: {check.ok === null ? "not applicable" : check.ok ? "passed" : "needs work"}.</span>
                  <span className="type-meta block">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-1.5" aria-label="Measurements">
            <li><Tag>{data.words} words</Tag></li>
            <li><Tag>Readability: {data.readability.level}{data.readability.fleschReadingEase !== null ? ` (${data.readability.fleschReadingEase})` : ""}</Tag></li>
            <li><Tag>{data.avgSentenceWords} words per sentence</Tag></li>
            <li><Tag>{data.structure.h2} H2 · {data.structure.h3} H3</Tag></li>
            {data.keyword && <li><Tag>Keyword density {data.keyword.density}%</Tag></li>}
            {data.aiPatterns.count > 0 && <li><Tag tone="warning">Stock phrases: {data.aiPatterns.phrases.join(", ")}</Tag></li>}
          </ul>

          <div className="space-y-2 border-t border-byword-border pt-4">
            <Button type="button" size="sm" variant="outline" disabled={terms.isPending} onClick={() => terms.mutate()}>
              {terms.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Swords className="mr-2 h-4 w-4" aria-hidden="true" />}Compare with top results
            </Button>
            <div aria-live="polite" className="space-y-1.5">
              {terms.isError && <InlineError message={terms.error instanceof Error ? terms.error.message : "The comparison failed."} onRetry={() => terms.mutate()} />}
              {result && result.available === false && <p className="type-body">{result.reason}</p>}
              {result && result.available === true && (
                <>
                  <p>Covers <strong className="type-data">{result.coverage}%</strong> of the {result.total} terms the top results for “{result.keyword}” share.</p>
                  {result.missing.length > 0 && (
                    <>
                      <p className="type-kicker">Missing terms</p>
                      <ul className="flex flex-wrap gap-1.5">{result.missing.slice(0, 15).map((item) => <li key={item.term}><Tag title={`${item.docs} top pages use it`}>{item.term}</Tag></li>)}</ul>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {data.duplicates.length > 0 && (
            <div>
              <p className="type-kicker">Similar posts on this site</p>
              <ul className="mt-1 space-y-0.5">{data.duplicates.map((item) => <li key={item.id}>{item.title} <span className="type-meta">{Math.round(item.similarity * 100)}% overlap</span></li>)}</ul>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </BywordCard>
  );
}

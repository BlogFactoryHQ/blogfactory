import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, FileText, Layers, Loader2, Megaphone, Plus, RefreshCw } from "lucide-react";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, InlineError } from "@/components/search-growth/shared";
import { useAction } from "@/hooks/useAction";
import { safeFormatDistanceToNow } from "@/lib/date-format";
import { useProductTopics } from "@/hooks/useProductTopics";

export function ProductExtrasPanel({ onOpenPlan }: { onOpenPlan?: () => void }) {
  const { activeSiteId, profile, addToPlan, applyCta, buildDatasets, checkTopics, fetchLlmsTxt } = useProductTopics();
  const { act, error } = useAction();
  const [confirmCta, setConfirmCta] = useState(false);
  const data = profile.data?.profile;
  const suggestions = profile.data?.suggestions;
  if (!activeSiteId || !data) return null;

    const planAction = onOpenPlan ? { label: "View plan", onClick: onOpenPlan } : undefined;
  const copyLlms = () => act(async () => {
    const { text } = await fetchLlmsTxt();
    await navigator.clipboard.writeText(text);
  }, { success: "llms.txt copied. Publish it at /llms.txt on your site.", failure: "Could not copy llms.txt. Try again." });

  return (
    <BywordCard>
      <SectionHeader icon={Layers} title="Profile shortcuts" description="Reuse what the product profile already knows." />
      {error && <div className="border-t border-byword-border px-4 py-3 sm:px-5"><InlineError message={error} /></div>}
      <div className="grid gap-x-8 gap-y-6 border-t border-byword-border p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-4">
        <section aria-labelledby="shortcut-cta" className="space-y-2">
          <h3 id="shortcut-cta" className="type-object-title flex items-center gap-1.5"><Megaphone className="h-4 w-4" aria-hidden="true" />Call to action</h3>
          {data.cta ? (
            <>
              <p className="type-body"><strong className="font-semibold text-foreground">{data.cta.label}</strong>: {data.cta.description}</p>
              <Button type="button" size="sm" variant="outline" disabled={applyCta.isPending} onClick={() => setConfirmCta(true)}>
                {applyCta.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Use as site CTA
              </Button>
            </>
          ) : <p className="type-body">No call to action was suggested. Re-read the site with an AI key to get one.</p>}
        </section>

        <section aria-labelledby="shortcut-pages" className="space-y-2">
          <h3 id="shortcut-pages" className="type-object-title flex items-center gap-1.5"><FileText className="h-4 w-4" aria-hidden="true" />Template pages</h3>
          <p className="type-body">Builds datasets for alternatives, versus and use-case pages from your rivals and problems.</p>
          <Button type="button" size="sm" variant="outline" disabled={buildDatasets.isPending} onClick={() => act(() => buildDatasets.mutateAsync(), { success: "Datasets saved", failure: "Could not build datasets. Try again." })}>
            {buildDatasets.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Build template datasets
          </Button>
          {buildDatasets.data && (
            <ul className="space-y-0.5 text-sm">
              {buildDatasets.data.datasets.map((dataset) => <li key={dataset.id}>{dataset.name} <span className="type-meta">{dataset.rows} rows</span></li>)}
              <li><Link className="font-medium text-primary underline underline-offset-2" to="/sources/campaigns">Open Campaigns and choose Programmatic</Link></li>
            </ul>
          )}
        </section>

        <section aria-labelledby="shortcut-weekly" className="space-y-2">
          <h3 id="shortcut-weekly" className="type-object-title flex items-center gap-1.5"><RefreshCw className="h-4 w-4" aria-hidden="true" />Weekly topic check</h3>
          <p className="type-body">
            {suggestions
              ? `Checked ${safeFormatDistanceToNow(suggestions.checkedAt)}. ${suggestions.newCount} new uncovered topic${suggestions.newCount === 1 ? "" : "s"}.`
              : "Runs every week in the background. Check now to see the first result."}
          </p>
          <Button type="button" size="sm" variant="outline" disabled={checkTopics.isPending} onClick={() => act(() => checkTopics.mutateAsync(), { success: "Topics checked", failure: "Could not check topics. Try again." })}>
            {checkTopics.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Check topics now
          </Button>
          {suggestions && suggestions.topics.length > 0 && (
            <ul className="divide-y divide-byword-border text-sm">
              {suggestions.topics.slice(0, 5).map((topic) => (
                <li key={topic.keyword} className="flex items-center justify-between gap-2 py-1">
                  <span className="min-w-0 break-words">{topic.keyword} <Badge variant="outline" className="ml-1 align-middle type-data">{topic.score}</Badge></span>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Add ${topic.keyword} to plan`} disabled={addToPlan.isPending} onClick={() => act(() => addToPlan.mutateAsync({ keywords: [topic.keyword] }), { success: "Added to the plan", failure: "Could not add the topic. Try again.", action: planAction })}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="shortcut-llms" className="space-y-2">
          <h3 id="shortcut-llms" className="type-object-title flex items-center gap-1.5"><Copy className="h-4 w-4" aria-hidden="true" />llms.txt</h3>
          <p className="type-body">A short index of your key pages and published articles for AI crawlers.</p>
          <Button type="button" size="sm" variant="outline" onClick={copyLlms}>Copy llms.txt</Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmCta}
        onOpenChange={setConfirmCta}
        title={`Use "${data.cta?.label ?? ""}" as the site CTA?`}
        description="It becomes the first call to action for this site, and published drafts end with it. You can change it later in Brand Voice settings."
        confirmLabel="Use this CTA"
        onConfirm={() => act(() => applyCta.mutateAsync(), { success: "CTA saved for this site", failure: "Could not save the CTA. Try again." })}
      />
    </BywordCard>
  );
}

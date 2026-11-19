import { ArrowRight, Lightbulb, PenLine } from "lucide-react";
import { Link } from "react-router-dom";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { useGrowthSignals } from "@/hooks/useGrowthSignals";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { formatDistanceToNowStrict } from "date-fns";

type PlanItem = NonNullable<NonNullable<WorkspaceDigest["search_growth"]["plan"]>["next_items"]>[number];

const createHref = (siteId: string, item: PlanItem) =>
  `/create?${new URLSearchParams({ seoPlanItemId: item.id, seoAction: item.action_type || "new_content", targetQuery: item.target_query || "", pageUrl: item.page_url || "", siteId }).toString()}`;

/**
 * One answer to "what should I do next?": planned items first, then topics found from the product, then the analysis step.
 * It reads the digest the page already loaded and the shared profile cache, so it adds no request of its own.
 */
export function WriteNextCard({ digest }: { digest: WorkspaceDigest }) {
  const { analyzed, suggestions, isLoading } = useGrowthSignals();
  const planned = (digest.search_growth.plan?.next_items || []).filter((item) => item.target_query).slice(0, 3);
  const topics = (suggestions?.topics || []).slice(0, 3);
  if (isLoading && !planned.length) return null;

  if (planned.length) {
    return <BywordCard>
      <SectionHeader icon={PenLine} title="What to write next" description="From your plan, ready to open as a draft." action={<Button asChild variant="outline" size="sm"><Link to="/overview/growth">Open plan<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>} />
      <ul className="divide-y divide-byword-border">
        {planned.map((item) => <li key={item.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.target_query}</p><p className="type-meta mt-0.5">{item.planned_for ? `Planned for ${item.planned_for}` : "Planned"}</p></div>
          <Button asChild size="sm" className="shrink-0"><Link to={createHref(digest.site.id, item)}>Write this<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
        </li>)}
      </ul>
    </BywordCard>;
  }

  if (topics.length) {
    return <BywordCard>
      <SectionHeader icon={Lightbulb} title="What to write next" description={suggestions?.checkedAt ? `Topics from your product, checked ${formatDistanceToNowStrict(new Date(suggestions.checkedAt), { addSuffix: true })}.` : "Topics from your product."} action={<Button asChild size="sm"><Link to="/overview/growth?view=topics">Plan these<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>} />
      <ul className="divide-y divide-byword-border">
        {topics.map((topic) => <li key={topic.keyword} className="px-5 py-3"><p className="truncate text-sm font-semibold">{topic.keyword}</p><p className="type-meta mt-0.5 capitalize">{topic.intent} · {topic.cluster}</p></li>)}
      </ul>
    </BywordCard>;
  }

  return <BywordCard>
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40 text-byword-blue"><Lightbulb className="h-5 w-5" /></span>
        <div><h2 className="text-base font-semibold">What to write next</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{analyzed ? "No topics yet. Find topics from your product to fill the plan." : "Read your product URL and get scored topics. No Search Console needed."}</p></div>
      </div>
      <Button asChild className="shrink-0"><Link to="/overview/growth?view=topics">{analyzed ? "Find topics" : "Analyze your product"}<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
    </div>
  </BywordCard>;
}

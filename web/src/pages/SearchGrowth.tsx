import { Link, useSearchParams } from "react-router-dom";
import { type LucideIcon, ArrowRight, BarChart3, Link as LinkIcon, SearchCheck, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIndexing } from "@/hooks/useIndexing";
import { useOptimize } from "@/hooks/useOptimize";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import { useSites } from "@/hooks/useSites";
import { InternalLinksPanel } from "@/components/search-growth/InternalLinksPanel";
import { IndexingPanel } from "@/pages/Indexing";
import { OptimizePanel } from "@/pages/Optimize";

const tabs = new Set(["overview", "optimize", "indexing", "internal-links"]);

export default function SearchGrowth() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.has(params.get("tab") || "") ? params.get("tab")! : "overview";
  const setTab = (value: string) => setParams(value === "overview" ? {} : { tab: value });

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Search Growth"
        description="Coordinate performance monitoring, indexing, and semantic internal links for the active site."
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="optimize">Optimize</TabsTrigger>
          <TabsTrigger value="indexing">Indexing</TabsTrigger>
          <TabsTrigger value="internal-links">Internal Links</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <SearchGrowthOverview onSelectTab={setTab} />
        </TabsContent>
        <TabsContent value="optimize" className="mt-0">
          <OptimizePanel />
        </TabsContent>
        <TabsContent value="indexing" className="mt-0">
          <IndexingPanel />
        </TabsContent>
        <TabsContent value="internal-links" className="mt-0">
          <InternalLinksPanel />
        </TabsContent>
      </Tabs>
    </BywordPageShell>
  );
}

function SearchGrowthOverview({ onSelectTab }: { onSelectTab: (tab: string) => void }) {
  const { activeSite } = useSites();
  const { integration: searchConsole, stats: gscStats } = useSearchConsole();
  const { integrations: indexingIntegrations, stats: indexingStats } = useIndexing();
  const { pages } = useOptimize("all");

  const needsAttention = pages.filter((page) => page.status === "needs_attention").length;
  const connectedIndexing = indexingIntegrations.filter((integration) => integration.status === "connected").length;

  return (
    <div className="space-y-8">
      <div className="grid overflow-hidden rounded-lg border border-byword-border bg-card md:grid-cols-4">
        {[
          ["Site", activeSite?.domain || "No site selected"],
          ["GSC pages", String(gscStats.pageCount)],
          ["Needs attention", String(needsAttention)],
          ["Indexed submissions", String(indexingStats.accepted)],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-byword-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <OverviewCard
          icon={BarChart3}
          title="Google Search Console"
          badge={searchConsole ? searchConsole.status : "Not connected"}
          description={searchConsole ? `${gscStats.clicks} clicks and ${gscStats.impressions} impressions synced.` : "Connect GSC before Optimize can detect ranking and click declines."}
          action="Open Optimize"
          onClick={() => onSelectTab("optimize")}
        />
        <OverviewCard
          icon={Send}
          title="URL Indexing"
          badge={connectedIndexing ? `${connectedIndexing} connected` : "Not connected"}
          description={connectedIndexing ? `${indexingStats.accepted} accepted, ${indexingStats.queued} queued, ${indexingStats.failed} failed.` : "Connect IndexNow for normal articles; Google URL submission is only for eligible structured-data pages."}
          action="Open Indexing"
          onClick={() => onSelectTab("indexing")}
        />
        <OverviewCard
          icon={LinkIcon}
          title="Internal Links"
          badge="Semantic index"
          description="Build a sitemap-based index so generated articles can link to relevant existing pages."
          action="Open Internal Links"
          onClick={() => onSelectTab("internal-links")}
        />
      </div>

      <BywordCard>
        <SectionHeader icon={SearchCheck} title="Search Growth Flow" description="Use the tabs left to right when setting up a new site." />
        <div className="grid gap-4 p-6 md:grid-cols-3">
          {[
            ["1", "Connect performance data", "GSC powers Optimize and tells you what already ranks."],
            ["2", "Keep URLs discoverable", "Indexing submits new or updated URLs after publishing."],
            ["3", "Strengthen site structure", "Internal links help new posts support the rest of the site."],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-lg border border-byword-border p-5">
              <Badge variant="secondary">{step}</Badge>
              <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </BywordCard>

      <div className="rounded-lg border border-byword-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Article Settings stays focused on content defaults.</h3>
            <p className="mt-1 text-sm text-muted-foreground">Internal Links now lives here; article length, images, models, and API keys stay in Article Settings.</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/settings">
              Article Settings <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverviewCard({
  icon,
  title,
  badge,
  description,
  action,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  badge: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <BywordCard>
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <IconTile icon={icon} />
          <Badge variant="secondary">{badge}</Badge>
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mt-2 min-h-[72px] text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" onClick={onClick} className="w-full">
          {action}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </BywordCard>
  );
}

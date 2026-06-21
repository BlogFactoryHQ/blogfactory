import { FormEvent, useState } from "react";
import { Check, Globe2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSites } from "@/hooks/useSites";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function Sites() {
  const { sites, activeSiteId, createSite, activateSite, refreshSite, deleteSite, isCreating, isRefreshing } = useSites();
  const [siteUrl, setSiteUrl] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!siteUrl.trim()) return;
    try {
      const site = await createSite({ url: siteUrl.trim() });
      setSiteUrl("");
      if (site.pageCount > 0) {
        const redirectMessage = site.internalLinkIndex?.sitemapMessages?.find((message) =>
          message.toLowerCase().includes("redirected")
        );
        toast.success(
          redirectMessage
            ? `Sitemap found: ${site.pageCount} pages indexed, ${redirectMessage.replace("Sitemap redirected to ", "redirected to ")}`
            : `Sitemap found: ${site.pageCount} pages indexed.`
        );
      } else {
        toast.success("Domain added. No sitemap pages were found yet; you can refresh it later.");
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to connect site"));
    }
  };

  const activeCount = sites.filter((site) => site.status === "active").length;

  return (
    <BywordPageShell className="max-w-6xl">
      <PageHeader title="Sites" description="Connect and manage every site in your BlogFactory account." />

      <div className="grid gap-8 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-lg border border-byword-border bg-card">
          <div className="flex w-full items-center gap-4 border-l-2 border-byword-blue bg-byword-blue-soft px-5 py-4 text-left text-byword-blue">
            <Globe2 className="h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Domains</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Manage sites</span>
            </span>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <BywordCard>
            <SectionHeader icon={Globe2} title="Domains" description="Unlimited sites are available for every beta account." />
            <div className="space-y-5 p-6">
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-byword-blue" style={{ width: sites.length ? "100%" : "10%" }} />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-semibold text-byword-blue">{activeCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sites.length === 1 ? "1 connected site" : `${sites.length} connected sites`}
                  </p>
                </div>
                <form onSubmit={submit} className="grid w-full gap-3 sm:w-auto sm:grid-cols-[260px_auto]">
                  <Input
                    value={siteUrl}
                    onChange={(event) => setSiteUrl(event.target.value)}
                    placeholder="newsite.com"
                    className="h-11"
                  />
                  <Button type="submit" disabled={isCreating || !siteUrl.trim()} className="h-11">
                    {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Create Domain
                  </Button>
                </form>
              </div>
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader icon={Globe2} title="Your Domains" description={`${sites.length} total`} />
            <div className="divide-y divide-byword-border">
              {sites.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">No sites connected yet.</div>
              ) : (
                sites.map((site) => {
                  const active = site.id === activeSiteId;
                  return (
                    <div key={site.id} className="flex flex-wrap items-center gap-4 p-6">
                      <IconTile icon={Globe2} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold">{site.name}</p>
                          {active && <Badge className="bg-byword-blue-soft text-byword-blue hover:bg-byword-blue-soft">Active</Badge>}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{site.domain}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {site.pageCount} pages, {site.vectorCount} vectors
                          {site.topics.length ? ` · ${site.topics.slice(0, 3).join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => activateSite(site.id)} disabled={active}>
                          <Check className="mr-2 h-4 w-4" />
                          {active ? "Current" : "Use"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => refreshSite(site.id)} disabled={isRefreshing}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Refresh
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteSite(site.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </BywordCard>
        </div>
      </div>
    </BywordPageShell>
  );
}

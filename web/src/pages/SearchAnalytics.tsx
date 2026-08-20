import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSearchConsole, useSearchConsoleToolkit } from "@/hooks/useSearchConsole";
import { useSites } from "@/hooks/useSites";
import { formatCompactNumber, formatDelta, formatPercent } from "@/lib/search-insights";
import { searchConsoleCountryLabel } from "@/lib/search-console";

type Range = 7 | 28 | 90;
type Group = "page" | "query" | "country" | "device";
type SearchType = "web" | "image" | "video" | "news";
type Device = "all" | "DESKTOP" | "MOBILE" | "TABLET";

export function SearchAnalyticsPanel() {
  const { activeSiteId } = useSites();
  const { integration } = useSearchConsole();
  const { analytics } = useSearchConsoleToolkit();
  const countryToolkit = useSearchConsoleToolkit();
  const [range, setRange] = useState<Range>(28);
  const [groupBy, setGroupBy] = useState<Group>("query");
  const [searchType, setSearchType] = useState<SearchType>("web");
  const [device, setDevice] = useState<Device>("all");
  const [country, setCountry] = useState("all");
  const [compare, setCompare] = useState(true);

  const run = () => analytics.mutate({
    range,
    compare,
    groupBy,
    searchType,
    country: country === "all" ? undefined : country,
    device: device === "all" ? undefined : device,
    limit: 50,
  });

  useEffect(() => {
    if (!activeSiteId || !integration || integration.status !== "connected") return;
    analytics.mutate({ range: 28, compare: true, groupBy: "query", searchType: "web", limit: 50 });
    countryToolkit.analytics.mutate({ range: 90, compare: false, groupBy: "country", searchType: "web", limit: 250 });
    // React Query mutation functions are stable; rerun only when the active connection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, integration?.id, integration?.status]);

  const countryNames = useMemo(() => {
    return (countryToolkit.analytics.data?.rows || []).map((row) => ({ code: row.label, label: searchConsoleCountryLabel(row.label) }));
  }, [countryToolkit.analytics.data?.rows]);

  if (!activeSiteId) return <AnalyticsState title="Select a site" description="Choose an active site to query Search Console." />;
  if (!integration) return <AnalyticsState title="Connect Search Console" description="Connect Search Console from Optimize before opening live analytics." />;
  if (integration.status === "property_selection_required") return <AnalyticsState title="Choose a property" description="Finish property selection in Optimize before querying analytics." />;

  const data = analytics.data;
  return (
    <div className="space-y-6">
      <BywordCard>
        <SectionHeader icon={BarChart3} title="Analytics Explorer" description="Compare search performance without expanding the long-term metrics table." />
        <div className="grid gap-4 border-t border-byword-border p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <Filter label="Range"><Select value={String(range)} onValueChange={(value) => setRange(Number(value) as Range)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[7, 28, 90].map((value) => <SelectItem key={value} value={String(value)}>{value} days</SelectItem>)}</SelectContent></Select></Filter>
          <Filter label="Group by"><Select value={groupBy} onValueChange={(value) => setGroupBy(value as Group)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["query", "page", "country", "device"].map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></Filter>
          <Filter label="Search type"><Select value={searchType} onValueChange={(value) => setSearchType(value as SearchType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["web", "image", "video", "news"].map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></Filter>
          <Filter label="Device"><Select value={device} onValueChange={(value) => setDevice(value as Device)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All devices</SelectItem>{["DESKTOP", "MOBILE", "TABLET"].map((value) => <SelectItem key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent></Select></Filter>
          <Filter label="Country"><Select value={country} onValueChange={setCountry}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All countries</SelectItem>{countryNames.map((item) => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent></Select></Filter>
          <div className="flex items-end gap-3"><div className="flex h-10 items-center gap-2"><Switch id="compare-period" checked={compare} onCheckedChange={setCompare} /><Label htmlFor="compare-period" className="text-xs">Compare</Label></div><Button className="ml-auto" onClick={run} disabled={analytics.isPending}>{analytics.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="ml-1.5">Apply</span></Button></div>
        </div>
      </BywordCard>

      {analytics.isError && <AnalyticsState title="Analytics query failed" description={analytics.error.message} />}
      {analytics.isPending && !data && <AnalyticsState title="Loading Search Console" description="Building the selected comparison." loading />}
      {data && <>
        <div className="grid overflow-hidden rounded-md border border-byword-border bg-card sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Clicks" value={formatCompactNumber(data.totals.clicks.value)} delta={formatDelta(data.totals.clicks.deltaPercent, { percent: true })} />
          <Metric label="Impressions" value={formatCompactNumber(data.totals.impressions.value)} delta={formatDelta(data.totals.impressions.deltaPercent, { percent: true })} />
          <Metric label="CTR" value={formatPercent(data.totals.ctr.value)} delta={formatDelta(data.totals.ctr.deltaPercent, { percent: true })} />
          <Metric label="Position" value={data.totals.position.value.toFixed(1)} delta={formatDelta(data.totals.position.delta, { lowerIsBetter: true })} />
        </div>

        <BywordCard>
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div><h3 className="font-semibold">Daily performance</h3><p className="text-sm text-muted-foreground">{data.range.startDate} — {data.range.endDate}</p></div>
            <div className="flex gap-2">{data.cached && <Badge variant="outline">Cached</Badge>}{data.metadata?.first_incomplete_date && <Badge variant="outline" className="border-amber-300 text-amber-700"><TriangleAlert className="mr-1 h-3 w-3" />Provisional from {data.metadata.first_incomplete_date}</Badge>}</div>
          </div>
          <div className="h-72 border-t border-byword-border p-4">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="clicks" stroke="hsl(var(--byword-blue))" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
          </div>
        </BywordCard>

        <BywordCard className="overflow-hidden">
          <div className="p-5"><h3 className="font-semibold">Results by {data.input.groupBy}</h3><p className="text-sm text-muted-foreground">Top {data.rows.length} rows by Google click order.</p></div>
          <div className="overflow-x-auto border-t border-byword-border"><Table><TableHeader><TableRow><TableHead>{data.input.groupBy}</TableHead><TableHead className="text-right">Clicks</TableHead><TableHead className="text-right">Impressions</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">Position</TableHead><TableHead className="text-right">Δ clicks</TableHead></TableRow></TableHeader><TableBody>{data.rows.map((row) => <TableRow key={row.label}><TableCell className="max-w-[420px] truncate font-medium" title={row.label}>{row.label}</TableCell><TableCell className="text-right">{formatCompactNumber(row.clicks)}</TableCell><TableCell className="text-right">{formatCompactNumber(row.impressions)}</TableCell><TableCell className="text-right">{formatPercent(row.ctr)}</TableCell><TableCell className="text-right">{row.position.toFixed(1)}</TableCell><TableCell className="text-right">{row.deltaClicks === null ? "—" : `${row.deltaClicks > 0 ? "+" : ""}${row.deltaClicks}`}</TableCell></TableRow>)}</TableBody></Table></div>
        </BywordCard>
      </>}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>; }
function Metric({ label, value, delta }: { label: string; value: string; delta: { label: string } }) { return <div className="border-b border-byword-border p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="font-mono text-[11px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{delta.label}</p></div>; }
function AnalyticsState({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) { return <BywordCard><div className="flex items-center gap-3 p-6">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <BarChart3 className="h-5 w-5 text-muted-foreground" />}<div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div></div></BywordCard>; }

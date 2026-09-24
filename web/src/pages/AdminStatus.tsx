import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock, Search } from "lucide-react";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/patterns/EmptyState";
import { StatRowSkeleton } from "@/components/patterns/PageSkeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { safeFormatDistanceToNow } from "@/lib/date-format";

interface AdminStatusResponse {
  status: "operational" | "needs_attention";
  checkedAt: string;
  jobs: Record<string, number>;
  staleRunningJobs: number;
  scheduler: { lastRunAt: string | null };
  searchConsole: Array<{
    propertyUrl: string;
    status: string;
    lastSyncAt: string | null;
    lastTestResult: string | null;
  }>;
}

function timeAgo(value: string | null) {
  return value ? safeFormatDistanceToNow(value) : "Never";
}

export default function AdminStatus() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => api.get<AdminStatusResponse>("/admin/status"),
    refetchInterval: 60_000,
  });

  return (
    <BywordPageShell>
      <PageHeader
        title="System status"
        description="Live operational signals from the API, job queue, scheduler, and Search Console connections."
      >
        {data && <StatusBadge status={data.status === "operational" ? "success" : "warning"} label={data.status === "operational" ? "Operational" : "Needs attention"} />}
      </PageHeader>

      {error ? (
        <BywordCard>
          <EmptyState
            tone="error"
            title="Status could not be loaded"
            description={`${error.message}. Nothing was changed; the check runs again every minute.`}
            primaryAction={{ label: "Try again", onClick: () => void refetch() }}
          />
        </BywordCard>
      ) : isLoading || !data ? (
        <StatRowSkeleton items={3} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <StatusCard icon={Activity} label="API and database" value="Operational" ok />
          <StatusCard icon={Clock} label="Last scheduler run" value={timeAgo(data.scheduler.lastRunAt)} ok={Boolean(data.scheduler.lastRunAt && Date.now() - new Date(data.scheduler.lastRunAt).getTime() <= 30 * 60 * 60 * 1000)} />
          <StatusCard icon={AlertTriangle} label="Stale running jobs" value={String(data.staleRunningJobs)} ok={data.staleRunningJobs === 0} />

          <BywordCard className="lg:col-span-3">
            <SectionHeader icon={Activity} title="Job queue" description="Jobs by state across every workspace." />
            <div className="flex flex-wrap gap-6 p-5">
              {Object.entries(data.jobs).map(([status, count]) => (
                <div key={status}><p className="type-kicker">{status.replace(/_/g, " ")}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p></div>
              ))}
            </div>
          </BywordCard>

          <BywordCard className="lg:col-span-3">
            <SectionHeader icon={Search} title="Search Console" description="Property connections and their last sync." />
            <div className="divide-y divide-border px-5 py-4">
              {data.searchConsole.map((integration) => {
                const ok = integration.status === "connected";
                return (
                  <div key={integration.propertyUrl} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div><p className="text-sm font-medium">{integration.propertyUrl}</p><p className="mt-1 text-xs text-muted-foreground">Last sync: {timeAgo(integration.lastSyncAt)}</p>{!ok && integration.lastTestResult && <p className="mt-1 text-xs text-status-error">{integration.lastTestResult}</p>}</div>
                    <StatusBadge status={ok ? "success" : "error"} label={ok ? "Connected" : "Error"} />
                  </div>
                );
              })}
            </div>
          </BywordCard>
        </div>
      )}
    </BywordPageShell>
  );
}

function StatusCard({ icon: Icon, label, value, ok }: { icon: typeof Activity; label: string; value: string; ok: boolean }) {
  return (
    <BywordCard className="p-5">
      <div className="flex items-center justify-between gap-3"><Icon className="h-4 w-4 text-muted-foreground" />{ok ? <CheckCircle2 className="h-4 w-4 text-status-success" /> : <AlertTriangle className="h-4 w-4 text-status-warning" />}</div>
      <p className="mt-4 type-meta">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p>
    </BywordCard>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { BywordCard, BywordPageShell } from "@/components/layout/BywordSurface";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/patterns/EmptyState";
import { StatRowSkeleton } from "@/components/patterns/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";
import { api } from "@/lib/api";

type OperationalState = "healthy" | "attention" | "unavailable";
type CloudStatus = {
  checkedAt: string;
  state: OperationalState;
  checks: Array<{ id: string; label: string; state: OperationalState; detail: string }>;
  snapshot: {
    billing: { lastProcessedAt: string | null };
    jobs: { completed24h: number };
  };
};

const badgeState: Record<OperationalState, StatusType> = {
  healthy: "success",
  attention: "warning",
  unavailable: "error",
};

const stateLabel: Record<OperationalState, string> = {
  healthy: "Healthy",
  attention: "Needs attention",
  unavailable: "Unavailable",
};

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export default function AdminStatus() {
  const status = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => api.get<CloudStatus>("/admin/status"),
    refetchInterval: 60_000,
  });

  return (
    <BywordPageShell>
      <PageHeader title="System status" description="Live application dependencies and database-backed operational signals.">
        <Button variant="outline" size="sm" asChild><Link to="/admin/customers"><Users className="mr-1.5 h-3.5 w-3.5" />Customers</Link></Button>
        <Button variant="outline" size="sm" onClick={() => status.refetch()} disabled={status.isFetching}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${status.isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
      </PageHeader>

      {status.error ? (
        <BywordCard>
          <EmptyState tone="error" title="Could not load system status" description={status.error.message} primaryAction={{ label: "Retry", onClick: () => status.refetch() }} />
        </BywordCard>
      ) : !status.data ? (
        <StatRowSkeleton items={2} />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-byword-blue" />
                <div><p className="font-semibold">Cloud operations</p><p className="text-xs text-muted-foreground">Checked {dateTime(status.data.checkedAt)}</p></div>
              </div>
              <StatusBadge status={badgeState[status.data.state]} label={stateLabel[status.data.state]} />
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {status.data.checks.map((check) => (
              <Card key={check.id}>
                <CardContent className="flex items-start justify-between gap-4 p-5">
                  <div><p className="font-medium">{check.label}</p><p className="mt-1 text-sm text-muted-foreground">{check.detail}</p></div>
                  <StatusBadge status={badgeState[check.state]} label={stateLabel[check.state]} />
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {status.data.snapshot.jobs.completed24h} runs completed in the last 24 hours. Last processed billing webhook: {dateTime(status.data.snapshot.billing.lastProcessedAt)}. Container, backup, and public uptime alerts still require an external monitor.
          </p>
        </>
      )}
    </BywordPageShell>
  );
}

import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { billingWebhookEvents, jobs, searchConsoleIntegrations } from "../db/schema.js";
import { readinessStatus } from "./readiness.js";

export type OperationalState = "healthy" | "attention" | "unavailable";

export type CloudStatusSnapshot = {
  dependenciesReady: boolean;
  billing: { pending: number; failed: number; oldestPendingAt: Date | string | null; lastProcessedAt: Date | string | null };
  jobs: { queued: number; running: number; stuck: number; failed24h: number; completed24h: number };
  searchConsole: { total: number; errors: number; stale: number; neverSynced: number };
  monitoring: { workerHeartbeatConfigured: boolean };
};

export function summarizeCloudStatus(snapshot: CloudStatusSnapshot) {
  const pendingSince = snapshot.billing.oldestPendingAt ? new Date(snapshot.billing.oldestPendingAt).getTime() : null;
  const webhookLate = pendingSince !== null && Date.now() - pendingSince > 15 * 60 * 1000;
  const checks = [
    {
      id: "dependencies",
      label: "Database and object storage",
      state: snapshot.dependenciesReady ? "healthy" as const : "unavailable" as const,
      detail: snapshot.dependenciesReady ? "Readiness checks passed." : "A required dependency is unavailable.",
    },
    {
      id: "billing",
      label: "Billing webhooks",
      state: snapshot.billing.failed > 0 ? "unavailable" as const : webhookLate ? "attention" as const : "healthy" as const,
      detail: `${snapshot.billing.pending} pending · ${snapshot.billing.failed} failed`,
    },
    {
      id: "jobs",
      label: "Background jobs",
      state: snapshot.jobs.stuck > 0 ? "unavailable" as const : snapshot.jobs.failed24h > 0 ? "attention" as const : "healthy" as const,
      detail: `${snapshot.jobs.queued} queued · ${snapshot.jobs.running} running · ${snapshot.jobs.failed24h} failed in 24h`,
    },
    {
      id: "search_console",
      label: "Search Console connections",
      state: snapshot.searchConsole.errors > 0 || snapshot.searchConsole.stale > 0 || snapshot.searchConsole.neverSynced > 0 ? "attention" as const : "healthy" as const,
      detail: `${snapshot.searchConsole.total} connected · ${snapshot.searchConsole.errors} errors · ${snapshot.searchConsole.stale + snapshot.searchConsole.neverSynced} stale or unsynced`,
    },
    {
      id: "monitoring",
      label: "External worker heartbeat",
      state: snapshot.monitoring.workerHeartbeatConfigured ? "healthy" as const : "attention" as const,
      detail: snapshot.monitoring.workerHeartbeatConfigured ? "Heartbeat endpoint configured." : "No external heartbeat endpoint configured.",
    },
  ];
  const state: OperationalState = checks.some((check) => check.state === "unavailable")
    ? "unavailable"
    : checks.some((check) => check.state === "attention") ? "attention" : "healthy";
  return { state, checks };
}

export async function getCloudStatus() {
  const [readiness, [billing], [jobStats], [searchConsole]] = await Promise.all([
    readinessStatus(),
    db.select({
      pending: sql<number>`count(*) filter (where ${billingWebhookEvents.status} in ('pending', 'processing'))::int`,
      failed: sql<number>`count(*) filter (where ${billingWebhookEvents.status} = 'failed')::int`,
      oldestPendingAt: sql<Date | null>`min(${billingWebhookEvents.receivedAt}) filter (where ${billingWebhookEvents.status} in ('pending', 'processing'))`,
      lastProcessedAt: sql<Date | null>`max(${billingWebhookEvents.processedAt})`,
    }).from(billingWebhookEvents),
    db.select({
      queued: sql<number>`count(*) filter (where ${jobs.status} in ('pending', 'queued'))::int`,
      running: sql<number>`count(*) filter (where ${jobs.status} = 'running')::int`,
      stuck: sql<number>`count(*) filter (where ${jobs.status} = 'running' and coalesce(${jobs.startedAt}, ${jobs.createdAt}) < now() - interval '30 minutes')::int`,
      failed24h: sql<number>`count(*) filter (where ${jobs.status} = 'failed' and ${jobs.createdAt} > now() - interval '24 hours')::int`,
      completed24h: sql<number>`count(*) filter (where ${jobs.status} = 'completed' and ${jobs.completedAt} > now() - interval '24 hours')::int`,
    }).from(jobs),
    db.select({
      total: sql<number>`count(*) filter (where ${searchConsoleIntegrations.status} = 'connected')::int`,
      errors: sql<number>`count(*) filter (where ${searchConsoleIntegrations.status} = 'error')::int`,
      stale: sql<number>`count(*) filter (where ${searchConsoleIntegrations.status} = 'connected' and ${searchConsoleIntegrations.lastSyncAt} < now() - interval '48 hours')::int`,
      neverSynced: sql<number>`count(*) filter (where ${searchConsoleIntegrations.status} = 'connected' and ${searchConsoleIntegrations.lastSyncAt} is null)::int`,
    }).from(searchConsoleIntegrations),
  ]);
  const snapshot: CloudStatusSnapshot = {
    dependenciesReady: readiness.ready,
    billing,
    jobs: jobStats,
    searchConsole,
    monitoring: { workerHeartbeatConfigured: Boolean(process.env.BACKGROUND_WORKER_HEARTBEAT_URL?.trim()) },
  };
  return { checkedAt: new Date().toISOString(), ...summarizeCloudStatus(snapshot), snapshot };
}

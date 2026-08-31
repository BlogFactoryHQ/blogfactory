import { writeFile } from "node:fs/promises";

export type BackgroundWorkerConfig = {
  pollMs: number;
  campaignItems: number;
  seoJobs: number;
  imageJobs: number;
  heartbeatFile: string;
  heartbeatUrl?: string;
};

type WorkerDrains = {
  campaigns(maxCampaigns: number, maxItemsPerCampaign: number): Promise<unknown>;
  seo(userId: undefined, limit: number): Promise<unknown>;
  images(userId?: string): Promise<unknown>;
};

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

export function readBackgroundWorkerConfig(env: Record<string, string | undefined> = process.env): BackgroundWorkerConfig {
  return {
    pollMs: boundedInt(env.BACKGROUND_WORKER_POLL_MS, 5_000, 1_000, 60_000),
    campaignItems: boundedInt(env.BACKGROUND_WORKER_CAMPAIGN_ITEMS, 1, 1, 10),
    seoJobs: boundedInt(env.BACKGROUND_WORKER_SEO_JOBS, 2, 1, 10),
    imageJobs: boundedInt(env.BACKGROUND_WORKER_IMAGE_JOBS, 1, 1, 4),
    heartbeatFile: env.BACKGROUND_WORKER_HEARTBEAT_FILE || "/tmp/blogfactory-worker-heartbeat",
    heartbeatUrl: env.BACKGROUND_WORKER_HEARTBEAT_URL?.trim() || undefined,
  };
}

async function loadDrains(): Promise<WorkerDrains> {
  const [{ drainCampaignQueue }, { drainSeoMetadata }, { drainDeferredImages }] = await Promise.all([
    import("./campaign-runner.js"),
    import("./seo-metadata.js"),
    import("./low-cost-images.js"),
  ]);
  return { campaigns: drainCampaignQueue, seo: drainSeoMetadata, images: drainDeferredImages };
}

export async function runBackgroundWorkerCycle(config: BackgroundWorkerConfig, drains?: WorkerDrains) {
  const activeDrains = drains || await loadDrains();
  const names = ["campaigns", "seo", "images"] as const;
  const results = await Promise.allSettled([
    activeDrains.campaigns(1, config.campaignItems),
    activeDrains.seo(undefined, config.seoJobs),
    Promise.all(Array.from({ length: config.imageJobs }, () => activeDrains.images())),
  ]);
  return {
    ok: results.every((result) => result.status === "fulfilled"),
    failed: results.flatMap((result, index) => result.status === "rejected" ? [names[index]] : []),
  };
}

async function pingHeartbeat(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function runBackgroundWorker(
  env: Record<string, string | undefined> = process.env,
  signal?: AbortSignal,
) {
  const config = readBackgroundWorkerConfig(env);
  console.info("[worker] Started", {
    pollMs: config.pollMs,
    campaignItems: config.campaignItems,
    seoJobs: config.seoJobs,
    imageJobs: config.imageJobs,
  });

  while (!signal?.aborted) {
    const cycle = await runBackgroundWorkerCycle(config);
    await writeFile(config.heartbeatFile, new Date().toISOString());
    if (!cycle.ok) console.error("[worker] Drain failed", { tasks: cycle.failed });
    else if (config.heartbeatUrl) {
      await pingHeartbeat(config.heartbeatUrl).catch(() => console.error("[worker] Heartbeat failed"));
    }
    if (!signal?.aborted) await Bun.sleep(config.pollMs);
  }

  console.info("[worker] Stopped");
}

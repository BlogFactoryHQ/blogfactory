import { writeFile } from "node:fs/promises";

export type BackgroundWorkerConfig = {
  pollMs: number;
  campaignItems: number;
  seoJobs: number;
  imageJobs: number;
  heartbeatFile: string;
  heartbeatUrl?: string;
};

// Feed ticks stay on the fixed six-hour cadence; retention and Search Console work is daily.
export const FEEDS_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type PeriodicTask = {
  name: string;
  intervalMs: number;
  run(): Promise<unknown>;
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

// Starts due periodic tasks without blocking the five-second drain cycle.
// Tasks are due on worker start; the backend's own due checks and claims keep that safe.
export function createPeriodicScheduler(tasks: PeriodicTask[], now: () => number = Date.now) {
  const state = tasks.map((task) => ({ task, lastStartedAt: Number.NEGATIVE_INFINITY, running: false }));
  return {
    tick() {
      const started: string[] = [];
      for (const entry of state) {
        if (entry.running || now() - entry.lastStartedAt < entry.task.intervalMs) continue;
        entry.running = true;
        entry.lastStartedAt = now();
        started.push(entry.task.name);
        void entry.task.run()
          .catch(() => console.error("[worker] Scheduled task failed", { task: entry.task.name }))
          .finally(() => { entry.running = false; });
      }
      return started;
    },
  };
}

async function loadPeriodicTasks(env: Record<string, string | undefined>): Promise<PeriodicTask[]> {
  const [
    { runScheduler },
    { drainQueuedGoogleIndexing },
    { drainSearchConsoleSync },
    { purgeExpiredOperationEvents },
    { readCronDrainConfig },
  ] = await Promise.all([
    import("./scheduler.js"),
    import("./indexing.js"),
    import("./search-console.js"),
    import("./operation-events.js"),
    import("../routes/cron.js"),
  ]);
  const config = readCronDrainConfig(() => undefined, env);
  const daily = async (name: string, run: () => Promise<unknown>) => {
    await run().catch((error) => {
      console.error("[worker] Daily drain failed", { task: name });
      throw error;
    });
  };
  return [
    {
      name: "feeds",
      intervalMs: FEEDS_INTERVAL_MS,
      run: () => runScheduler(undefined, {
        awaitGeneration: true,
        maxFeeds: config.feeds.maxFeeds,
        maxPostsPerFeed: config.feeds.maxPostsPerFeed,
      }),
    },
    {
      name: "daily",
      intervalMs: DAILY_INTERVAL_MS,
      run: async () => {
        const results = await Promise.allSettled([
          daily("indexing", () => drainQueuedGoogleIndexing(config.indexing.limit)),
          daily("search-console", () => drainSearchConsoleSync(config.searchConsole.limit)),
          daily("operation-events", () => purgeExpiredOperationEvents()),
        ]);
        if (results.some((result) => result.status === "rejected")) throw new Error("Daily drain failed");
      },
    },
  ];
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

  const periodic = createPeriodicScheduler(await loadPeriodicTasks(env));

  while (!signal?.aborted) {
    const started = periodic.tick();
    if (started.length) console.info("[worker] Scheduled tasks started", { tasks: started });
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

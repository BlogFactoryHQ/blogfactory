import { db } from "../db/index.js";
import { feeds, jobs, userSettings, schedulerLogs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

type SchedulerOptions = {
  maxFeeds?: number;
  maxPostsPerFeed?: number;
  awaitGeneration?: boolean;
};

function getIntervalMs(frequency: string): number {
  switch (frequency) {
    case "hourly": return 60 * 60 * 1000;
    case "every_4_hours": return 4 * 60 * 60 * 1000;
    case "every_12_hours": return 12 * 60 * 60 * 1000;
    case "daily": return 24 * 60 * 60 * 1000;
    case "weekly": return 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function positiveInt(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export async function runScheduler(userId?: string, options: SchedulerOptions = {}) {
  const now = new Date();
  const maxFeeds = positiveInt(options.maxFeeds, 25);
  const maxPostsPerFeed = options.maxPostsPerFeed ? positiveInt(options.maxPostsPerFeed, 1) : null;

  // Fetch active feeds (for a specific user or all users)
  const conditions = [eq(feeds.isActive, true)];
  if (userId) conditions.push(eq(feeds.userId, userId));

  const activeFeeds = await db
    .select()
    .from(feeds)
    .where(and(...conditions));

  if (!activeFeeds.length) {
    return { message: "No active feeds", triggered: 0 };
  }

  // Determine due feeds
  const dueFeeds = activeFeeds.filter((feed) => {
    const intervalMs = getIntervalMs(feed.frequency);
    if (!feed.lastRunAt) return true;
    const lastRun = new Date(feed.lastRunAt);
    return now >= new Date(lastRun.getTime() + intervalMs);
  }).slice(0, maxFeeds);

  if (!dueFeeds.length) {
    return { message: "No feeds due", triggered: 0 };
  }

  const results: Array<{ feedId: string; feedName: string; status: string; error?: string }> = [];

  for (const feed of dueFeeds) {
    try {
      // Check for already-running jobs
      const runningJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.sourceValue, feed.sourceUrl as string), eq(jobs.status, "running")))
        .limit(1);

      if (runningJobs.length > 0) {
        results.push({ feedId: feed.id, feedName: feed.name, status: "skipped", error: "Already running" });
        continue;
      }

      // Get user's image settings
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, feed.userId))
        .limit(1);

      const imageConfig: any = {};
      imageConfig.imagePlacement = settings?.imagePlacement ?? "auto";
      imageConfig.compressionEnabled = settings?.imageCompressionEnabled ?? true;
      if (settings?.coverEnabled) {
        imageConfig.cover = {
          count: settings.coverImageCount ?? 1,
          resolution: settings.coverResolution ?? "1K",
          aspectRatio: settings.coverAspectRatio ?? "16:9",
        };
      }
      if (settings?.inlineEnabled) {
        imageConfig.inline = {
          count: settings.inlineCount ?? 2,
          resolution: settings.inlineResolution ?? "1K",
          aspectRatio: settings.inlineAspectRatio ?? "3:2",
        };
      }

      const generateImages = !!(settings?.coverEnabled || settings?.inlineEnabled);

      // Call generate-content directly (no HTTP round-trip)
      const { generateContent } = await import("./generate-content.js");
      const generation = generateContent({
        userId: feed.userId,
        sourceType: "rss_feed",
        sourceValue: feed.sourceUrl || "",
        personaId: feed.personaId,
        modelId: feed.modelId,
        variations: maxPostsPerFeed ? Math.min(feed.postsPerRun ?? 5, maxPostsPerFeed) : feed.postsPerRun ?? 5,
        feedId: feed.id,
        extractFullContent: feed.extractFullContent,
        filterOldPostsDays: feed.filterOldPostsDays || undefined,
        platformConfig: feed.platformConfig || {},
        generateImages,
        imageConfig: Object.keys(imageConfig).length > 0 ? imageConfig : undefined,
      });

      if (options.awaitGeneration) await generation;
      else generation.catch((err) => console.error(`[scheduler] Feed "${feed.name}" error:`, err));

      results.push({ feedId: feed.id, feedName: feed.name, status: "triggered" });
    } catch (error: any) {
      results.push({ feedId: feed.id, feedName: feed.name, status: "error", error: error.message });
    }
  }

  const triggered = results.filter((r) => r.status === "triggered").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errored = results.filter((r) => r.status === "error").length;

  // Log scheduler run per user
  const userIds = [...new Set(dueFeeds.map((f) => f.userId))];
  for (const uid of userIds) {
    const userResults = results.filter((r) => {
      const feed = dueFeeds.find((f) => f.id === r.feedId);
      return feed?.userId === uid;
    });
    const userFeedsChecked = activeFeeds.filter((f) => f.userId === uid).length;

    try {
      await db.insert(schedulerLogs).values({
        userId: uid,
        feedsChecked: userFeedsChecked,
        feedsTriggered: userResults.filter((r) => r.status === "triggered").length,
        feedsSkipped: userResults.filter((r) => r.status === "skipped").length,
        feedsErrored: userResults.filter((r) => r.status === "error").length,
        results: userResults,
      });
    } catch (logError) {
      console.error(`[scheduler] Failed to log run for user ${uid}:`, logError);
    }
  }

  return { message: "Scheduler run complete", triggered, skipped, errored, results };
}

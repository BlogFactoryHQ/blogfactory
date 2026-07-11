import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { feeds } from "../db/schema.js";

const DEFAULT_LEASE_MINUTES = 15;
const MAX_LEASE_MINUTES = 120;

export type FeedRunClaim = {
  token: string;
  leaseUntil: Date;
  activeCount: number;
};

export function feedRunLeaseMs(value = process.env.RSS_FEED_RUN_LEASE_MINUTES) {
  const minutes = Number(value);
  const normalized = Number.isFinite(minutes) && minutes > 0
    ? Math.min(Math.floor(minutes), MAX_LEASE_MINUTES)
    : DEFAULT_LEASE_MINUTES;
  return normalized * 60 * 1000;
}

export function normalizeFeedRunSlots(value: unknown) {
  const slots = Math.floor(Number(value));
  return Number.isFinite(slots) && slots > 0 ? Math.min(slots, 20) : 1;
}

export function remainingFeedRunSlots(activeCount: number, releasedSlots: number) {
  return Math.max(0, activeCount - normalizeFeedRunSlots(releasedSlots));
}

export async function claimFeedRun(input: {
  feedId: string;
  userId: string;
  token?: string;
  slots?: number;
  now?: Date;
}): Promise<FeedRunClaim | null> {
  const token = input.token || randomUUID();
  const slots = normalizeFeedRunSlots(input.slots);
  const now = input.now || new Date();
  const leaseUntil = new Date(now.getTime() + feedRunLeaseMs());

  const [claimed] = await db
    .update(feeds)
    .set({
      runClaimToken: token,
      runLeaseUntil: leaseUntil,
      runActiveCount: sql<number>`CASE
        WHEN ${feeds.runClaimToken} = ${token} AND ${feeds.runLeaseUntil} >= ${now}
          THEN ${feeds.runActiveCount}
        ELSE ${slots}
      END`,
    })
    .where(and(
      eq(feeds.id, input.feedId),
      eq(feeds.userId, input.userId),
      or(
        isNull(feeds.runClaimToken),
        isNull(feeds.runLeaseUntil),
        lt(feeds.runLeaseUntil, now),
        eq(feeds.runClaimToken, token),
      ),
    ))
    .returning({ activeCount: feeds.runActiveCount });

  return claimed ? { token, leaseUntil, activeCount: claimed.activeCount } : null;
}

export async function releaseFeedRun(input: {
  feedId: string;
  userId: string;
  token: string;
  slots?: number;
}) {
  const slots = normalizeFeedRunSlots(input.slots);
  const [released] = await db
    .update(feeds)
    .set({
      runActiveCount: sql<number>`GREATEST(${feeds.runActiveCount} - ${slots}, 0)`,
      runClaimToken: sql<string | null>`CASE WHEN ${feeds.runActiveCount} <= ${slots} THEN NULL ELSE ${feeds.runClaimToken} END`,
      runLeaseUntil: sql<Date | null>`CASE WHEN ${feeds.runActiveCount} <= ${slots} THEN NULL ELSE ${feeds.runLeaseUntil} END`,
    })
    .where(and(
      eq(feeds.id, input.feedId),
      eq(feeds.userId, input.userId),
      eq(feeds.runClaimToken, input.token),
    ))
    .returning({ activeCount: feeds.runActiveCount });

  return released?.activeCount ?? null;
}

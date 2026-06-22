import { Hono } from "hono";
import { drainCampaignQueue } from "../services/campaign-runner.js";
import { drainQueuedGoogleIndexing } from "../services/indexing.js";

export const cronRoutes = new Hono();

export function isCronAuthorized(header: string | undefined, secret = process.env.CRON_SECRET) {
  return Boolean(secret) && header === `Bearer ${secret}`;
}

cronRoutes.get("/drain", async (c) => {
  if (!isCronAuthorized(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [campaigns, google] = await Promise.all([
    drainCampaignQueue(),
    drainQueuedGoogleIndexing(),
  ]);

  return c.json({ ok: true, campaigns, google });
});

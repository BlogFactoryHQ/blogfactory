import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { PLAN_LIMITS } from "../services/billing-config.js";

const launchAt = new Date(process.env.CLOUD_PUBLIC_LAUNCH_AT || "");
if (Number.isNaN(launchAt.getTime())) throw new Error("CLOUD_PUBLIC_LAUNCH_AT must be an ISO timestamp");
const expiresAt = new Date(launchAt.getTime() + 60 * 86_400_000);

const inserted = await db.execute(sql`
  INSERT INTO billing_entitlements (user_id, plan_code, source, status, effective_at, expires_at, limits)
  SELECT id, 'advanced', 'transition', 'active', ${launchAt}, ${expiresAt}, ${JSON.stringify(PLAN_LIMITS.advanced)}::jsonb
  FROM users
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id`);

console.log(JSON.stringify({ transition_entitlements_created: inserted.length, expires_at: expiresAt.toISOString() }));
process.exit(0);

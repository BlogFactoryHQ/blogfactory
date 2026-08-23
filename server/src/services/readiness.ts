import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkBucketAccess } from "./s3-client.js";

export async function readinessStatus(checks: Array<() => Promise<unknown>> = [
  () => db.execute(sql`select 1`),
  () => checkBucketAccess(),
]) {
  try {
    await Promise.all(checks.map((check) => check()));
    return { ready: true as const, status: 200 as const };
  } catch {
    return { ready: false as const, status: 503 as const };
  }
}

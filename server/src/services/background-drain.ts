type BackgroundDrainTask = "seo" | "images";

export function backgroundDrainUrl(task: BackgroundDrainTask, userId?: string, env: Record<string, string | undefined> = process.env) {
  const host = env.VERCEL_URL?.trim();
  if (!host || !env.CRON_SECRET) return null;
  const url = new URL(`${/^https?:\/\//.test(host) ? host : `https://${host}`}/api/cron/drain`);
  url.searchParams.set("task", `${task}-worker`);
  if (userId) url.searchParams.set("userId", userId);
  return url.toString();
}

export async function dispatchBackgroundDrain(task: BackgroundDrainTask, userId?: string) {
  const url = backgroundDrainUrl(task, userId);
  if (!url) return false;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (error) {
    console.warn(`[${task}] Background worker dispatch failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

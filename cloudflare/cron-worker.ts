type Env = {
  CRON_BASE_URL?: string;
  CRON_SECRET?: string;
};

const TASK_BY_CRON: Record<string, string> = {
  "*/5 * * * *": "images",
  "7 * * * *": "feeds",
  "23 3 * * *": "all",
};

function drainUrl(env: Env, task: string) {
  if (!env.CRON_BASE_URL) throw new Error("CRON_BASE_URL is not configured");
  const base = env.CRON_BASE_URL.replace(/\/+$/, "");
  return `${base}/api/cron/drain${task === "all" ? "" : `?task=${encodeURIComponent(task)}`}`;
}

async function drain(task: string, env: Env) {
  if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not configured");
  const response = await fetch(drainUrl(env, task), {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!response.ok) {
    throw new Error(`Cron drain ${task} failed with ${response.status}: ${await response.text()}`);
  }
}

export default {
  async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(drain(TASK_BY_CRON[controller.cron] || "all", env));
  },

  async fetch() {
    return new Response("BlogFactory Cloudflare cron worker");
  },
};

import assert from "node:assert/strict";

export function percentile(sorted: number[], ratio: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

async function replay() {
  const base = new URL(process.env.PILOT_BASE_URL || "");
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) {
    throw new Error("PILOT_BASE_URL must use HTTPS or HTTP loopback");
  }

  const requests = boundedInt(process.env.PILOT_REQUESTS, 2_000, 1, 100_000);
  const concurrency = boundedInt(process.env.PILOT_CONCURRENCY, 10, 1, 100);
  const path = process.env.PILOT_PATH || "/api/health";
  const token = process.env.PILOT_BEARER_TOKEN;
  const url = new URL(path, base);
  const latencies: number[] = [];
  const statuses = new Map<number, number>();
  let next = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = next++;
      if (index >= requests) return;
      const started = performance.now();
      const response = await fetch(url, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      await response.arrayBuffer();
      latencies.push(performance.now() - started);
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
    }
  }));

  latencies.sort((a, b) => a - b);
  const failures = [...statuses].filter(([status]) => status < 200 || status >= 300).reduce((sum, [, count]) => sum + count, 0);
  const summary = {
    url: url.toString(),
    requests,
    concurrency,
    statuses: Object.fromEntries(statuses),
    p50_ms: Number(percentile(latencies, 0.5).toFixed(1)),
    p95_ms: Number(percentile(latencies, 0.95).toFixed(1)),
    max_ms: Number((latencies.at(-1) || 0).toFixed(1)),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures || summary.p95_ms >= 500) process.exitCode = 1;
}

if (process.argv.includes("--self-test")) {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  console.log("cloud pilot replay self-test passed");
} else {
  await replay();
}

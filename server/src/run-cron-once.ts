export async function runCronOnce(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
) {
  const url = env.CRON_URL;
  const secret = env.CRON_SECRET;
  if (!url || !secret) throw new Error("CRON_URL and CRON_SECRET are required");

  const response = await request(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`Cron drain failed with status ${response.status}`);
}

if (import.meta.main) {
  await runCronOnce();
  console.log("Cron drain completed");
}

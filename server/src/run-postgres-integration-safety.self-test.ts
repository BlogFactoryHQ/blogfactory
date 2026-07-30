import assert from "node:assert/strict";

const { POSTGRES_INTEGRATION_ALLOW_WRITES: _ignored, ...safeEnv } = process.env;
const child = Bun.spawn([process.execPath, "run", "src/run-postgres-integration.ts"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: { ...safeEnv, DATABASE_URL: "postgres://unused" },
  stdout: "pipe",
  stderr: "pipe",
});
const stderr = await new Response(child.stderr).text();

assert.notEqual(await child.exited, 0);
assert.match(stderr, /POSTGRES_INTEGRATION_ALLOW_WRITES=1 is required/);
assert.doesNotMatch(stderr, /ECONNREFUSED|ENOTFOUND/);

console.log("PostgreSQL integration safety gate self-check passed");

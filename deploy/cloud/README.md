# BlogFactory Cloud shadow

This stack is isolated from production Vercel, the existing Neon project, the
production `blogfactory` R2 bucket, WorkOS, customer DNS, and current schedules.
It runs migrations once, then starts the API, a persistent heavy-queue worker,
and Nginx/web. PostgreSQL and R2 remain off-host.

## Manual provider gates

Do not deploy until all gates are true:

- Create a separate **BlogFactory Cloud** Neon organization and a Frankfurt
  project. The connected account currently exposes no BlogFactory organization;
  never create this project in the existing Ortak Alan organization.
- Create Hetzner CPX22 in Nuremberg with IPv4 and backups. Restrict SSH to the
  operator IP. Keep ports 80/443 closed in Phase A; in Phase B allow them only
  from Cloudflare proxy ranges. Do not expose the Dokploy management port.
- Create `blogfactory-cloud-phase-a-20260831` as an R2 **EU-jurisdiction** bucket.
  A Western Europe location hint is not an equivalent guarantee. Create one
  edit token restricted to this bucket and store its one-time secret directly
  in Dokploy/password-manager escrow.
- Create Better Stack uptime and heartbeat monitors only after Phase A passes.
  Put the heartbeat URL in Dokploy; never commit it.

Hetzner and Better Stack have no connected provider tools. The Cloudflare tool
cannot set the required jurisdiction header, and Neon cannot create an
organization. These account actions remain manual rather than falling back to
browser automation.

## Database roles

Use the Neon direct endpoint as `MIGRATION_DATABASE_URL`. Create a login role
named `blogfactory_runtime`, set its password interactively, then run the
following as the Neon owner after migrations. Use its pooled endpoint as
`DATABASE_URL` for API and worker.

```sql
GRANT CONNECT ON DATABASE neondb TO blogfactory_runtime;
GRANT USAGE ON SCHEMA public TO blogfactory_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blogfactory_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO blogfactory_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO blogfactory_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO blogfactory_runtime;
```

## Build and deploy

1. Run **Build Cloud shadow images** for the approved private commit. Copy the
   two `ghcr.io/...@sha256:...` values from its summary; tags alone are not an
   accepted deployment input.
2. Import `deploy/cloud/compose.yaml` into Dokploy and populate every value from
   `.env.example` in Dokploy secrets. Use a read-only GHCR package credential.
3. Keep `BLOGFACTORY_BIND_ADDRESS=127.0.0.1` and access port 8080 over SSH for
   Phase A. Temporarily enable signup only while bootstrapping the isolated test
   administrator, then disable it and redeploy.
4. Phase B may set the bind address to `0.0.0.0` only after the firewall accepts
   Cloudflare proxy ranges and `pilot-origin.blogfactory.io` is protected by
   Cloudflare Access. Production hostnames and origins do not change.

## Phase A evidence

Record the commit and image digests beside every result. Do not record URLs
containing tokens, environment values, prompts, content, or provider responses.

```bash
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'
docker inspect --format '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' blogfactory-cloud-shadow-api-1 blogfactory-cloud-shadow-worker-1
psql "$DATABASE_URL" -X -c "select usename,state,count(*) from pg_stat_activity where datname=current_database() group by 1,2 order by 1,2"
psql "$DATABASE_URL" -X -c "select pg_database_size(current_database()) as bytes,pg_size_pretty(pg_database_size(current_database())) as size"
PILOT_BASE_URL=http://127.0.0.1:8080 bun run scripts/cloud-pilot-replay.ts
docker restart blogfactory-cloud-shadow-api-1
docker kill blogfactory-cloud-shadow-worker-1
docker start blogfactory-cloud-shadow-worker-1
```

Run the replay once on the VM and once from Istanbul. Export Neon compute and
transfer plus R2 storage/Class A/Class B metrics before and after the fixed
replay. For recovery, write timestamped markers, create a PITR branch at a known
marker, and restore an encrypted custom-format `pg_dump` into a second empty
disposable database. Verify migration ledger, row counts, login, site access,
MCP's exact 22-tool catalog, an R2 upload/readback, and worker stale recovery.

Promote only when API p95 is below 500 ms, VM CPU/memory and pooled connections
remain below 70%, oldest runnable work drains below five minutes, full restore
is below eight hours, no secret/isolation failure occurs, and measured Phase A
spend is at most $35 pre-tax. Phase B remains isolated and must stay below $45
pre-tax monthly.

On failure, save only redacted evidence, stop the stack, and revoke/delete the
shadow DNS/Access entries, VM, Neon organization/project, R2 bucket/tokens,
GHCR credential, and monitoring URLs. Production Vercel remains the rollback.

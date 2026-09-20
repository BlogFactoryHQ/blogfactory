# BlogFactory Cloud on Hetzner

This runbook documents the production stack verified on 2026-09-20. It is the
source of truth for routine releases until the host topology changes.

## Active topology

The active Compose project is `blogfactory-cloud-shadow` in
`/home/deploy/blogfactory-cloud-shadow`. Its host-only `compose.cloud.yaml`
contains these production services:

- `postgres`: PostgreSQL 18 on a named local volume;
- `db-init`: one-shot least-privilege runtime-role initialization;
- `migrate`: one-shot migrations through the local owner role;
- `api`: Bun/Hono using the local runtime role;
- `worker`: the same API image running persistent background drains;
- `backup`: six-hour age-encrypted R2 backups and restore checks;
- `web`: Nginx on host loopback port `18080`, behind Caddy and Cloudflare.

Production data is in PostgreSQL 18 on the Hetzner host and encrypted backups
are off-host in a private EU Cloudflare R2 bucket. There is no MinIO, Redis, or
external queue. The tracked `compose.yaml`, PostgreSQL role initializer, and
backup image are the reference design; the production manifest remains the
host-only `compose.cloud.yaml` variant.

Do not copy the tracked Compose file over `compose.cloud.yaml` during a normal
release. Preserve the host-specific worker cadence, port, and service settings.

## Secrets and immutable images

`cloud.env` is the active deploy file. Keep it mode `0600`, never print it,
and save a timestamped operator-only copy before changing image references. It
contains both URLs required by the current topology:

- `DATABASE_URL`: local `blogfactory_runtime` endpoint;
- `MIGRATION_DATABASE_URL`: local `blogfactory_owner` endpoint.

It also pins the PostgreSQL and backup images and supplies the owner/runtime
role passwords, age recipient, R2 prefix, and root-only age identity path.

Run **Publish Cloud images** for the approved Cloud commit. Copy the immutable
API and web references from its summary:

```text
BLOGFACTORY_API_IMAGE=ghcr.io/...@sha256:...
BLOGFACTORY_WEB_IMAGE=ghcr.io/...@sha256:...
```

The worker uses the API image. CI also publishes a backup image, but publishing
it does not mean production backups are running. The VM needs a read-only GHCR
package credential for pulls.

## Routine application release

From `/home/deploy/blogfactory-cloud-shadow`:

1. Record the current container image references and restart counts.
2. Confirm the backup service is healthy and its latest encrypted R2 upload
   succeeded. For a database migration, also run a disposable restore check.
3. Copy `cloud.env` to a timestamped mode-`0600` rollback file.
4. Replace only `BLOGFACTORY_API_IMAGE` and `BLOGFACTORY_WEB_IMAGE` with the
   approved immutable digests.
5. Validate and deploy:

   ```bash
   docker compose --env-file cloud.env -f compose.cloud.yaml config --quiet
   docker compose --env-file cloud.env -f compose.cloud.yaml pull
   docker compose --env-file cloud.env -f compose.cloud.yaml run -T --rm migrate
   docker compose --env-file cloud.env -f compose.cloud.yaml up -d postgres api worker web backup
   docker compose --env-file cloud.env -f compose.cloud.yaml ps
   ```

6. Confirm PostgreSQL, API, worker, web, and backup are healthy, have zero
   unexpected restarts, and use the exact approved digest references.
7. Verify the public boundary:

   ```bash
   curl -i https://app.blogfactory.io/api/health
   curl -i https://app.blogfactory.io/api/ready
   curl -i https://blogfactory.io/api/health
   curl -i https://blogfactory.io/mcp
   curl -i https://blogfactory.io/.well-known/oauth-protected-resource
   ```

Expected results are health/readiness HTTP 200, unauthenticated MCP HTTP 401
with a Bearer challenge, OAuth metadata HTTP 200, and running digests matching
the approved Cloud commit. Verify the metadata body as well as its status; a
200 response alone does not prove that resource and scopes are correct.

## Backup status and verification

The repository contains an age-encrypted six-hour backup implementation with
R2 retention and disposable restore checks. It is active in the production
host project. During the 2026-09-20 cutover, both the rehearsal snapshot and
the final writer-frozen database produced encrypted R2 backups with full
SHA-256 readback. A disposable restore from R2 passed, and all 42 migrations
and all 42 public-table row counts matched the source.

Keep the following evidence healthy:

1. encrypted dump and manifest uploaded to R2;
2. object HEAD and full SHA-256 readback;
3. fresh `last-success` marker;
4. disposable restore from the R2 object;
5. matching migration fingerprint and all public-table row counts;
6. fresh `last-restore-success` marker;
7. alerting for stale success markers and restore failure.

The six-hour RPO is the configured schedule, not a substitute for monitoring.
Treat stale markers, a failed restore check, or an unhealthy backup container
as an incident.

## Rollback

- Application failure: restore the previous API/web digest lines from the
  timestamped `cloud.env` copy, run Compose `up -d`, and repeat acceptance.
- Migration failure before API/worker replacement: leave the old containers
  running and investigate; migrations must remain additive.
- Database incident: stop writers before any restore decision. Restore a
  verified encrypted R2 dump into a clean target; never restore over the live
  database without explicit approval. For the cutover rollback window only,
  the retained Neon snapshot is also available.
- Full-host failure: the last Ready Vercel deployment is the application
  routing rollback target; encrypted R2 backups are the durable database
  recovery source.

Do not delete Neon, old image digests, or host rollback dumps as part of a
routine application release.

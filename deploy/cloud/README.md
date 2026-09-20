# BlogFactory Cloud on Hetzner

This runbook documents the production stack verified on 2026-09-20. It is the
source of truth for routine releases until the host topology changes.

## Active topology

The active Compose project is `blogfactory-cloud-shadow` in
`/home/deploy/blogfactory-cloud-shadow`. Its host-only `compose.cloud.yaml`
contains four services:

- `migrate`: one-shot migrations through the direct Neon endpoint;
- `api`: Bun/Hono using the pooled Neon endpoint;
- `worker`: the same API image running persistent background drains;
- `web`: Nginx on host loopback port `18080`, behind Caddy and Cloudflare.

Production data is off-host in Neon PostgreSQL 18 in Frankfurt and a private
EU Cloudflare R2 bucket. There is no production PostgreSQL container, named
database volume, MinIO, Redis, external queue, backup container, or in-stack
scheduler. The tracked `compose.yaml`, PostgreSQL role initializer, and backup
image are tested infrastructure for a possible future local-database cutover;
they are not the active production manifest.

Do not copy the tracked Compose file over `compose.cloud.yaml` during a normal
release. Moving production data from Neon to local PostgreSQL is a separate
maintenance-window decision with its own rehearsal, freeze, restore, rollback,
and approval gates.

## Secrets and immutable images

`cloud.env` is the active deploy file. Keep it mode `0600`, never print it,
and save a timestamped root/operator-only copy before changing image
references. It contains both URLs required by the current topology:

- `DATABASE_URL`: pooled Neon runtime endpoint;
- `MIGRATION_DATABASE_URL`: direct Neon owner endpoint.

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
2. Take a read-only custom-format dump through `MIGRATION_DATABASE_URL`, store
   it mode `0600`, and verify it with a PostgreSQL 18 `pg_restore --list`.
   Do not write to Neon.
3. Copy `cloud.env` to a timestamped mode-`0600` rollback file.
4. Replace only `BLOGFACTORY_API_IMAGE` and `BLOGFACTORY_WEB_IMAGE` with the
   approved immutable digests.
5. Validate and deploy:

   ```bash
   docker compose --env-file cloud.env -f compose.cloud.yaml config --quiet
   docker compose --env-file cloud.env -f compose.cloud.yaml pull
   docker compose --env-file cloud.env -f compose.cloud.yaml run --rm migrate
   docker compose --env-file cloud.env -f compose.cloud.yaml up -d api worker web
   docker compose --env-file cloud.env -f compose.cloud.yaml ps
   ```

6. Confirm API, worker, and web are healthy, have zero unexpected restarts, and
   use the exact approved digest references.
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

## Backup status and required production gate

The repository contains an age-encrypted six-hour backup implementation with
R2 retention and disposable restore checks. It is not installed in the active
host project. The 2026-09-20 inspection found:

- no backup service or timer;
- no `BACKUP_*` configuration in `cloud.env`;
- no success, restore-success, failure, or manifest marker;
- no objects under the production R2 `database-backups/` prefix;
- only manual host dumps from the original cutover period.

A 2026-09-20 drill took a read-only custom dump from the direct production
Neon endpoint and restored it into an isolated disposable PostgreSQL 18
container. The migration count and checksum fingerprint plus every public
table row count matched. The result marker is stored under the host `backups/`
directory; the plaintext drill dump was deleted. This proves restore mechanics
for that snapshot only. It does not satisfy retention, off-host durability, or
the proposed six-hour RPO.

Before claiming backup coverage, deploy the backup service or an equivalent
Neon-native policy, configure an offline-escrowed age identity and a dedicated
R2 prefix, then obtain all of this evidence from production:

1. encrypted dump and manifest uploaded to R2;
2. object HEAD and full SHA-256 readback;
3. fresh `last-success` marker;
4. disposable restore from the R2 object;
5. matching migration fingerprint and all public-table row counts;
6. fresh `last-restore-success` marker;
7. alerting for stale success markers and restore failure.

Until those gates pass, do not state a six-hour RPO or four-hour RTO. Keep the
operational issue open.

## Rollback

- Application failure: restore the previous API/web digest lines from the
  timestamped `cloud.env` copy, run Compose `up -d`, and repeat acceptance.
- Migration failure before API/worker replacement: leave the old containers
  running and investigate; migrations must remain additive.
- Database incident: stop writers before any restore decision. Use Neon
  recovery controls or a verified dump in a new target; never restore over the
  live database without explicit approval.
- Full-host failure: the last Ready Vercel deployment is the application
  routing rollback target, while Neon and R2 remain the data systems.

Do not delete Neon, old image digests, or host rollback dumps as part of a
routine application release.

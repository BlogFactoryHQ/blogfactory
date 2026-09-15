# BlogFactory Cloud on Hetzner

Production runs as one digest-pinned Compose stack on the existing Hetzner
CX23. Cloudflare remains the front door and R2 remains object/backup storage.
Neon is retained for 14 days after cutover as a disconnected rollback copy.

```text
Cloudflare -> Caddy -> web/Nginx -> API
                         |          |
                         |          +-> PostgreSQL 18
                         +----------+-> worker, RSS scheduler, maintenance, backup
                                              |
                                              +-> R2 EU
```

Only the web port is published. PostgreSQL uses the private Compose network and
a named volume mounted at `/var/lib/postgresql`, the required persistent mount
for the official PostgreSQL 18 image.

## Manual gate: restore SSH access

The existing key is not accepted for `root`, `deploy`, or `ubuntu`. Before any
server change, open the Hetzner web console and add the contents of
`~/.ssh/blogfactory_cloud.pub` to `/home/deploy/.ssh/authorized_keys`:

```bash
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Paste the public key as one new line, then verify from the Mac:

```bash
ssh -i ~/.ssh/blogfactory_cloud deploy@188.245.220.143
```

Do not enable password authentication. Confirm Hetzner Backup is enabled and
restrict SSH to the operator IP before continuing.

## Secrets and immutable images

Generate URL-safe database passwords and a separate age identity. Put the
values in a root-only host Compose env file (or Dokploy's secret UI if it is
used to operate this Hetzner stack) and the password manager; never put them in
Git or shell history. Dokploy is optional deployment tooling here, not a
BlogFactory self-host requirement.

```bash
openssl rand -hex 32
openssl rand -hex 32
umask 077
mkdir -p /root/.config/blogfactory-backup
docker run --rm --entrypoint age-keygen \
  -v /root/.config/blogfactory-backup:/keys \
  "$BLOGFACTORY_BACKUP_IMAGE" -o /keys/age.key
docker run --rm --entrypoint age-keygen \
  -v /root/.config/blogfactory-backup:/keys:ro \
  "$BLOGFACTORY_BACKUP_IMAGE" -y /keys/age.key
```

Use the two random values as `POSTGRES_OWNER_PASSWORD` and
`POSTGRES_RUNTIME_PASSWORD`. Use the printed `age1...` value as
`BACKUP_AGE_RECIPIENT`; keep the private identity root-only at the path in
`BACKUP_AGE_IDENTITY_FILE` and escrow it offline.

Run **Publish Cloud images** for the approved commit. Copy all three immutable
references from its summary:

- `BLOGFACTORY_API_IMAGE=ghcr.io/...@sha256:...`
- `BLOGFACTORY_WEB_IMAGE=ghcr.io/...@sha256:...`
- `BLOGFACTORY_BACKUP_IMAGE=ghcr.io/...@sha256:...`

Also pin `POSTGRES_IMAGE` and `RSS_SCHEDULER_IMAGE` by digest. The VM needs only
a read-only GHCR package credential for pulls. Populate `.env.example` in the
host secret store. Keep the current EU R2 endpoint, bucket, access key,
and secret unchanged; do not print them during deployment.

`DATABASE_URL` and `MIGRATION_DATABASE_URL` are deliberately absent from the
host environment. Compose constructs an owner URL for one-shot migrations and
a runtime URL for API/worker. Passwords therefore must remain URL-safe hex.

Deploy billing first with `CLOUD_PUBLIC_SIGNUP`, `CLOUD_BILLING_ENFORCEMENT`, and `MANAGED_AI_ENABLED` false. Keep Polar, WorkOS, Turnstile, and the capped Managed OpenRouter key only in the host secret store. Configure the WorkOS callback as `https://app.blogfactory.io/api/auth/workos/callback`, migrate existing users, and follow [`docs/billing.md`](../../docs/billing.md) before enabling any launch flag.

## Rehearsal

Production stays on Neon throughout rehearsal.

1. Confirm at least 20 GB free and record the current image digests, queue
   counts, 31-table list, row counts, migration count/checksums, and R2 object
   baseline without logging secrets.
2. Take a read-only custom-format dump from the Neon direct endpoint:

   ```bash
   umask 077
   rehearsal_dir=$(mktemp -d)
   pg_dump "$NEON_DIRECT_URL" --format=custom --no-owner --no-acl \
     --file="$rehearsal_dir/neon.dump"
   ```

3. Use a separate Compose project and volume:

   ```bash
   export COMPOSE_PROJECT_NAME=blogfactory-rehearsal
   export BLOGFACTORY_SHADOW_PORT=18080
   export BACKUP_R2_PREFIX=database-backups/rehearsal
   docker compose up -d postgres
   docker compose run --rm db-init
   docker compose exec -T postgres pg_restore --exit-on-error --no-owner --no-acl \
     -U "$POSTGRES_OWNER_USER" -d "$POSTGRES_DB" < "$rehearsal_dir/neon.dump"
   docker compose run --rm db-init
   docker compose run --rm migrate
   docker compose up -d api worker web rss-scheduler maintenance-scheduler
   ```

4. Compare every public-table row count and `schema_migrations` checksum with
   the Neon snapshot. Verify `/api/health`, `/api/ready`, OAuth metadata,
   unauthenticated MCP 401/Bearer, authenticated 22-tool discovery, tenant/site
   isolation, R2 image readback, and stored credential decryption with the
   unchanged `API_KEY_ENCRYPTION_SECRET`.
5. Run the real backup and restore drill:

   ```bash
   docker compose run --rm --entrypoint /usr/local/bin/backup.sh backup
   docker compose run --rm --entrypoint /usr/local/bin/restore-check.sh backup
   ```

6. Recreate the PostgreSQL container and reboot the VM. The named volume must
   retain the database. Kill one claimed job; the worker must recover it within
   about one to two minutes. Trigger two RSS ticks and confirm the feed lease
   prevents parallel ownership.
7. Remove only the rehearsal project after all evidence is exported:

   ```bash
   docker compose down --volumes
   ```

Do not start cutover unless every rehearsal check passes.

## Production cutover

Target maintenance window: at most 30 minutes.

1. Confirm disk, Hetzner Backup, immutable digests, root-only age identity, and
   the latest successful rehearsal restore.
2. Record active campaign/job counts. Put the current app in maintenance mode,
   then stop API, worker, RSS, and every scheduler that can write.
3. Take the final Neon custom dump, encrypt it with the backup age recipient,
   upload it to the R2 backup prefix, and verify both HEAD and full SHA-256
   readback before proceeding.
4. Start local PostgreSQL and restore:

   ```bash
   export COMPOSE_PROJECT_NAME=blogfactory-cloud
   docker compose up -d postgres
   docker compose run --rm db-init
   docker compose exec -T postgres pg_restore --exit-on-error --no-owner --no-acl \
     -U "$POSTGRES_OWNER_USER" -d "$POSTGRES_DB" < "$cutover_dir/neon.dump"
   docker compose run --rm db-init
   docker compose run --rm migrate
   ```

5. Compare all public-table row counts and migration checksums with the frozen
   Neon snapshot. Confirm `pgcrypto` exists. Confirm `blogfactory_runtime` is
   login-only, cannot create a database/role/table, and has only connect, schema
   usage, table DML, and sequence usage.
6. Remove every Neon URL from runtime secrets, then start the stack:

   ```bash
   docker compose up -d
   docker compose ps
   ```

7. Complete public acceptance before leaving maintenance mode. The API is
   inline; the worker polls every 60 seconds with 1/2/1 bounds; RSS checks every
   1,800 seconds; billing/retention maintenance and backup run every six hours.
8. Remove runtime access to Neon and suspend its compute. Keep the project
   unchanged for 14 days. Deletion after the audit requires separate explicit
   approval.

## Backup behavior

The backup container writes no persistent plaintext dump. It creates a custom
dump in a temporary directory, encrypts it with age, records the dump size,
encrypted SHA-256, migration fingerprint, and all public table row counts, then
uploads and fully reads back the dump and manifest before touching its success
heartbeat.

One six-hour dump is copied, not regenerated, into these retention tiers:

```text
database-backups/six-hour/  28 copies
database-backups/daily/      7 copies
database-backups/weekly/     4 copies
database-backups/monthly/    3 copies
```

On the first Sunday of each month it restores the latest encrypted dump into a
temporary database and compares migration and row-count evidence. A failure is
recorded in `restore-failed`; the container healthcheck remains unhealthy while
scheduled backups continue.

## Rollback and acceptance

- Application failure: select the previous API/web/backup digests.
- Failure before local writes resume: point the stopped stack back to the frozen
  Neon snapshot.
- Failure after local writes resume: take a fresh local encrypted dump before
  restoring into any replacement target.
- Lost VM/disk: rebuild from GHCR and restore the latest R2 dump. RPO is six
  hours; host-loss recovery target is four hours.
- Vercel is not a database rollback target.

Acceptance requires public health/readiness, OAuth and MCP behavior, exact
22-tool discovery, role separation, R2 image and encrypted backup readback,
scratch restore with all row counts, job termination recovery, RSS lease
behavior, container/VM restart persistence, no OOM/restart in the first 24
hours, and disk below 70%. Add a second database server only at the thresholds
in the approved plan; do not add Redis, PgBouncer, WAL/PITR, Kubernetes, or a
new provider here.

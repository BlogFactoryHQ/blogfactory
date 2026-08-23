# Self-host BlogFactory

Docker Compose is the canonical v0.1 installation. It runs the web app, API and local MCP endpoint, PostgreSQL, MinIO, migrations, and a bounded six-hour scheduler entirely in your infrastructure.

```text
browser + MCP client -> your HTTPS domain -> Nginx web -> Hono API + /mcp
                                                        |-> PostgreSQL
                                                        |-> MinIO
                                          scheduler ----+
```

The running Community instance does not call `blogfactory.io`. Content and credentials go only to the AI, CMS, and Google integrations you configure. GitHub and GHCR are needed to install or update images; an already-running pinned version continues without them.

## Supported deployment targets

| Target | v0.1 status |
| --- | --- |
| Docker Compose | Canonical supported installation |
| Railway | Guided topology prepared; template badge waits for a real acceptance run |
| Render | Planned, unsupported until the same acceptance passes |
| Vercel | Expert topology requiring external database, storage, and cron; not guided self-hosting |
| Netlify | Unsupported because it does not provide the complete API, worker, and data topology |

## Docker Compose installation

Requirements: Docker Engine with Compose v2, at least 4 GB RAM for a small instance, and an HTTPS reverse proxy for an internet-facing domain.

```bash
cp .env.self-host.example .env
openssl rand -hex 32 # repeat independently for each blank password/secret
docker compose config --quiet
docker compose pull
docker compose up -d
```

Set `BLOGFACTORY_URL` to the public origin, `ADMIN_EMAILS` to the first administrator address, and fill every required blank. Keep PostgreSQL and MinIO private; Compose exposes only the web port and binds the MinIO console to localhost. To build the same images from the checkout instead of pulling GHCR:

```bash
docker compose build --pull api web
docker compose up -d
```

Wait for infrastructure readiness, then create the first account with an address in `ADMIN_EMAILS`:

```bash
curl --fail http://localhost:8080/api/ready
```

After the first administrator signs in, set `BLOGFACTORY_ALLOW_SIGNUP=false` and apply it:

```bash
docker compose up -d --no-deps --force-recreate api
curl --fail http://localhost:8080/api/auth/config
```

To add another isolated user, temporarily set signup to `true`, recreate `api`, let the user create a pending account, approve it in the admin UI, and set signup back to `false`. v0.1 does not provide a shared team workspace; each user's sites and content remain isolated.

## Acceptance

```bash
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8080/api/ready
curl -i http://localhost:8080/mcp
docker compose ps
docker compose logs --tail=100 api scheduler
```

`/api/health` is process liveness. `/api/ready` returns 200 only when PostgreSQL and the S3 bucket are reachable; failures return a generic 503. Unauthenticated `/mcp` returns 401 with a Bearer challenge. In **Control -> MCP Connections**, create a site-scoped personal token and connect the shown instance URL, such as `https://content.example.com/mcp`. The 22-tool catalog cannot read credentials, publish live, or delete content.

The repository's full disposable acceptance is:

```bash
bash scripts/self-host-smoke.sh
bash scripts/self-host-backup-restore-smoke.sh
```

## Docker Compose backup and restore

Back up both stores before every upgrade. The following creates a portable PostgreSQL dump and an S3-level MinIO copy without printing credentials:

```bash
backup="backups/$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$backup/minio"
docker compose stop api scheduler
docker compose exec -T postgres pg_dump -U blogfactory -d blogfactory -Fc > "$backup/postgres.dump"
docker compose run --rm --entrypoint /bin/sh -v "$PWD/$backup/minio:/backup" minio-init -c \
  'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mirror local/blogfactory /backup'
docker compose start api scheduler
```

Restore into a clean or deliberately replaced stack, then verify `/api/ready`, login, a recent content row, and an uploaded object:

```bash
docker compose stop api scheduler
docker compose exec -T postgres pg_restore -U blogfactory -d blogfactory --clean --if-exists < "$backup/postgres.dump"
docker compose run --rm --entrypoint /bin/sh -v "$PWD/$backup/minio:/backup:ro" minio-init -c \
  'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mirror /backup local/blogfactory'
docker compose start api scheduler
curl --fail http://localhost:8080/api/ready
```

## Upgrade and rollback

Images are pinned through `BLOGFACTORY_VERSION`. Read the release notes and take a verified backup first:

```bash
sed -i.bak 's/^BLOGFACTORY_VERSION=.*/BLOGFACTORY_VERSION=v0.1.1/' .env
docker compose pull api web
docker compose up -d
curl --fail http://localhost:8080/api/ready
```

The API runs checksummed additive migrations under a PostgreSQL advisory lock before serving. For an application rollback, restore the prior image version and recreate the services:

```bash
sed -i.bak 's/^BLOGFACTORY_VERSION=.*/BLOGFACTORY_VERSION=v0.1.0/' .env
docker compose pull api web
docker compose up -d
```

If the older application is incompatible with the migrated schema, restore the pre-upgrade PostgreSQL dump and matching MinIO copy instead of trying to reverse migrations.

## Railway runbook

The exact six-service mapping, generated variables, private URLs, health paths, restart policies, and cron command are in [`deploy/railway/README.md`](../deploy/railway/README.md). Only `web` receives a public domain. `api`, Postgres, MinIO, bucket initialization, and cron remain private. Railway injects `PORT`; the API listens on it, and web reaches it through `API_UPSTREAM` on the private network.

Before upgrades, create manual Railway volume backups for Postgres and MinIO and also keep portable copies. With a linked Railway project and a local PostgreSQL client:

```bash
railway connect Postgres --tunnel-only
pg_dump "postgresql://postgres:<password>@localhost:<port>/railway" --format=custom --no-owner --file=blogfactory.dump
railway volume files --volume <minio-volume-id> download / ./minio-backup
```

Run `pg_restore --no-owner --exit-on-error --dbname=<scratch-database-url> blogfactory.dump` as a restore drill. Restore the MinIO volume through Railway's Backups tab or upload the portable copy with `railway volume files --volume <minio-volume-id> upload ./minio-backup /`. For upgrades, change both BlogFactory image references to the same release tag and deploy; migrations remain automatic and locked. Railway rollback restores the previous deployment/image variables. If schema compatibility fails, restore the staged pre-upgrade Postgres and MinIO volume backups, review the staged changes, and deploy them together.

## Current ceiling

Generation continues inside the persistent API process. A restart can interrupt an in-flight generation; existing retry and stale-job behavior handles recovery. PostgreSQL-backed durable jobs, leases, retries, and worker heartbeats remain a BlogFactory Cloud phase, not a v0.1 guarantee.

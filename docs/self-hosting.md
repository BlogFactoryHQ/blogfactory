# Self-host BlogFactory

Docker Compose is the canonical v0.1 installation. It runs the web app, API and local MCP endpoint, PostgreSQL, MinIO, migrations, and a bounded six-hour scheduler entirely in your infrastructure.

```text
browser + MCP client -> your HTTPS domain -> Nginx web -> Hono API + /mcp
                                                        |-> PostgreSQL
                                                        |-> MinIO
                                          scheduler ----+
```

The running Community instance does not call `blogfactory.io`. Content and credentials go only to the AI, CMS, and Google integrations you configure. Until the first versioned GHCR release is published, install and update BlogFactory by building from the public source repository.

## Supported deployment targets

| Target | v0.1 status |
| --- | --- |
| Docker Compose | Canonical supported installation |
| Dokploy | RC acceptance passed; public catalog link waits for final-image acceptance and upstream merge |
| Railway | Guided topology prepared; deferred until a separate real-project acceptance run |
| Render | Planned, unsupported until the same acceptance passes |
| Vercel | Expert topology requiring external database, storage, and cron; not guided self-hosting |
| Netlify | Unsupported because it does not provide the complete API, worker, and data topology |

## Docker Compose installation

Requirements: Docker Engine with Compose v2, at least 4 GB RAM for a small instance, and an HTTPS reverse proxy for an internet-facing domain.

```bash
cp .env.self-host.example .env
openssl rand -hex 32 # repeat independently for each blank password/secret
docker compose config --quiet
docker compose build --pull api web
docker compose up -d
```

Set `BLOGFACTORY_URL` to the public origin, `ADMIN_EMAILS` to the first administrator address, and fill every required blank. Keep PostgreSQL and MinIO private; Compose exposes only the web port and binds the MinIO console to localhost.

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

## Complete application setup

The Overview setup card separates the two required workspace steps from optional capabilities. A connected site and a usable OpenRouter key are enough to generate content. CMS draft delivery, Search Console, and MCP can be connected only when that workspace needs them.

### AI generation

Each user brings their own OpenRouter key. Open **Control -> Article Settings -> Keys**, save and test the OpenRouter key, then choose text and image models under **Models**. The key is stored encrypted and is required for article generation.

**Manual Prompt** changes only image delivery: BlogFactory creates Midjourney-ready prompt slots instead of calling an image model. Article and prompt generation still use OpenRouter, so Manual Prompt does not remove the OpenRouter requirement.

### CMS draft delivery

Open **Control -> Integrations**, choose the active site, and follow the provider-specific guide for WordPress, Ghost, Wix, or Framer. Save and test the connection before selecting it as a destination. BlogFactory sends reviewed content as a CMS draft; it does not publish live or delete provider content.

### Google Search Console

Search Console supports either instance-wide Google OAuth or a per-site service account. OAuth is the simpler user flow after the instance administrator completes this one-time setup:

1. Create or select a Google Cloud project and enable the Search Console API.
2. Configure the OAuth consent screen and create a **Web application** OAuth client.
3. Add `https://<your-domain>/api/search-console/oauth/callback` as an authorized redirect URI.
4. Set `GOOGLE_SEARCH_CONSOLE_CLIENT_ID` and `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET` in `.env`. Set `GOOGLE_SEARCH_CONSOLE_REDIRECT_URI` to the same callback when the public request URL cannot be derived reliably.
5. Recreate the API service with `docker compose up -d --no-deps --force-recreate api`.
6. Open **Search Growth -> Optimize**, select **Connect Search Console**, and approve the read-only `webmasters.readonly` permission.

Google documents the OAuth registration, API activation, consent, and read-only scope in [Authorize Requests](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing). If OAuth is not configured, BlogFactory hides the Google button and keeps **Advanced: service account JSON** available. Create a service-account JSON key, then have a Search Console property owner add its `client_email` under **Settings -> Users and permissions** before saving the JSON in BlogFactory. Google documents the owner-only user-management path in [Managing owners, users, and permissions](https://support.google.com/webmasters/answer/7687615?hl=en).

### MCP clients

Open **Control -> MCP Connections**. A self-hosted instance works without WorkOS: create a site-scoped personal token, store the shown secret in the client environment, and use the instance endpoint such as `https://content.example.com/mcp`. Browser OAuth is optional and appears only when its WorkOS configuration is complete.

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

Before versioned GHCR images are available, update from a reviewed Git commit and rebuild both application images after taking a verified backup:

```bash
git fetch --tags origin
git checkout <reviewed-commit-or-tag>
docker compose build --pull api web
docker compose up -d
curl --fail http://localhost:8080/api/ready
```

After versioned images are published, `BLOGFACTORY_VERSION` will pin both application images. The release notes will identify the first supported tag and rollback procedure:

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

## Dokploy runbook

The upstream-compatible blueprint is in [`deploy/dokploy/blueprints/blogfactory`](../deploy/dokploy/blueprints/blogfactory). It creates web, API, scheduler, PostgreSQL, and MinIO services with persistent database and object-storage volumes. Only web receives a Dokploy domain. The API initializes the S3 bucket and runs locked additive migrations before serving.

Dokploy generates independent database, storage, JWT, encryption, cron, and administrator values during import. After deployment, copy `ADMIN_EMAILS` from the Compose environment, register the first administrator with that exact address, then set `BLOGFACTORY_ALLOW_SIGNUP=false` and redeploy. Add AI, CMS, and Google credentials later from the relevant BlogFactory control surfaces.

The repository validates the blueprint with Dokploy's own validators and preview build. Its real acceptance workflow installs pinned Dokploy `v0.30.2` on a disposable GitHub Actions Ubuntu runner, imports through the Dokploy API, and verifies readiness, private-service health, signup, storage, MCP, scheduler execution, restart persistence, and closed signup. Run it from **Actions -> Dokploy template acceptance** or by changing the blueprint. A green validator without the real deploy job is not acceptance.

Do not add a public Dokploy deploy link until the acceptance passes against final `v0.1.0` images and the upstream catalog PR is merged.

## Railway runbook

The exact five-service mapping, generated variables, private URLs, health paths, restart policies, and cron command are in [`deploy/railway/README.md`](../deploy/railway/README.md). Only `web` receives a public domain. `api`, Postgres, MinIO, and cron remain private; bucket initialization runs as the API's idempotent pre-deploy command so the topology fits Railway Hobby's five-service ceiling. Railway injects `PORT`; the API listens on it, and web reaches it through `API_UPSTREAM` on the private network.

Before upgrades, create manual Railway volume backups for Postgres and MinIO and also keep portable copies. With a linked Railway project and a local PostgreSQL client:

```bash
railway connect Postgres --tunnel-only
pg_dump "postgresql://postgres:<password>@localhost:<port>/railway" --format=custom --no-owner --file=blogfactory.dump
railway volume files --volume <minio-volume-id> download / ./minio-backup
```

Run `pg_restore --no-owner --exit-on-error --dbname=<scratch-database-url> blogfactory.dump` as a restore drill. Restore the MinIO volume through Railway's Backups tab or upload the portable copy with `railway volume files --volume <minio-volume-id> upload ./minio-backup /`. For upgrades, change both BlogFactory image references to the same release tag and deploy; migrations remain automatic and locked. Railway rollback restores the previous deployment/image variables. If schema compatibility fails, restore the staged pre-upgrade Postgres and MinIO volume backups, review the staged changes, and deploy them together.

## Current ceiling

Generation continues inside the persistent API process. A restart can interrupt an in-flight generation; existing retry and stale-job behavior handles recovery. PostgreSQL-backed durable jobs, leases, retries, and worker heartbeats remain a BlogFactory Cloud phase, not a v0.1 guarantee.

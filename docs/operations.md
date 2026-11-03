# Operations and deployment

## Environment

Copy `.env.example` to `.env` for local development. Set `DATABASE_URL`, `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, storage credentials, and only the integrations required for the workflow being tested. Do not commit populated environment files or expose secrets in shell output.

The Docker Compose self-host contract is documented separately in [self-hosting.md](self-hosting.md). Use `.env.self-host.example`; never reuse production hosted secrets in a community installation.

Self-hosted production sets `BLOGFACTORY_SELF_HOSTED=true`, which rejects missing and placeholder database, JWT, encryption, cron, administrator, origin, and S3 configuration before serving. `/api/health` remains liveness; `/api/ready` checks PostgreSQL plus S3 bucket access and redacts failure details.

OAuth is fail-closed: configure `WORKOS_AUTHKIT_ISSUER`, `MCP_RESOURCE_URL`, and `WORKOS_API_KEY` together or leave all three unset. `MCP_RESOURCE_URL` must be an HTTPS URL ending in `/mcp`. When MCP OAuth uses a different WorkOS environment than hosted browser sign-in, set `MCP_WORKOS_API_KEY` to that environment's key; MCP OAuth prefers it over `WORKOS_API_KEY`.

## Database migrations

Run `npm run db:migrate` against the target database before using code that requires a new schema. Migrations are additive, locked, checksummed, and recorded in `schema_migrations`.

For an existing database that predates the migration ledger, first confirm its schema contains every checked-in migration. Then use `MIGRATION_BASELINE_EXISTING=true` once to record the baseline without replaying historical SQL.

Never run PostgreSQL integration tests against shared production Neon. Use a disposable database.

## Production delivery

The private `BlogFactoryHQ/blogfactory-cloud` repository merges this public core
through a fail-closed sync workflow, validates it, and publishes API, web, and
backup images to GHCR. Production runs those images by immutable digest on the
Hetzner CX23 Compose stack. GitHub Actions does not SSH-deploy or automatically
deploy production to Vercel.

Caddy and Nginx route these backend surfaces to the private Hono container:

- `/api/*`
- `/mcp`
- `/.well-known/oauth-protected-resource`

The private `BlogFactoryHQ/blogfactory-marketing` repository owns the
Cloudflare-fronted public apex. This repository owns the open-source core, while
private `BlogFactoryHQ/blogfactory-cloud` owns the authenticated app/API
deployment on Hetzner. The production host split is:

- [blogfactory.io](https://blogfactory.io) serves the marketing one-pager; `www` redirects there.
- [app.blogfactory.io](https://app.blogfactory.io) serves the React application and same-origin `/api/*`.
- `blogfactory.io/mcp` and its OAuth protected-resource metadata remain on the root host.
- Root `/api/*` remains a temporary compatibility route during the callback and cron transition.

Release flow:

1. Preserve unrelated worktree changes and inspect the intended diff.
2. Run checks proportional to the change.
3. Commit and push `main` when shipping is authorized.
4. Verify that the private Cloud repository contains the public commit, then wait for its `Publish Cloud images` run.
5. Copy all three `ghcr.io/...@sha256:...` values from the workflow summary and update the host only through the private manual runbook.
6. Verify PostgreSQL migration/runtime role separation and the exact app/API/MCP routes affected by the change.

Application rollback selects the previous API, web, and backup digests. Database
rollback restores a verified encrypted R2 dump. Vercel is not a stateful
rollback target because its database view may be stale. Keep migrations additive
so image rollback remains possible.

## Background work

The Cloud API uses `BACKGROUND_EXECUTION_MODE=inline`; the persistent worker uses
`BACKGROUND_EXECUTION_MODE=worker` with a 60-second poll and the existing 1/2/1
campaign/SEO/image bounds. A local scheduler checks due RSS feeds every 30
minutes. A local maintenance scheduler runs the full protected drain every six
hours. Cloudflare and GitHub keep their existing six-hour protected drains as
external fallbacks. PostgreSQL atomic claims, stale recovery, retries, and feed
leases prevent duplicate ownership; see the [RSS scheduler guide](rss-scheduler.md).

Do not enable more than one persistent worker until the domain claim and
stale-recovery checks have passed for that topology.

The existing all-task drain also removes expired `operation_events`. Do not create a separate retention cron. Operation events expire after 30 days.

The all-task drain also runs a bounded weekly topic check (`task=topics`, default 2 sites per run, max 5 via `topicsLimit`): sites with a saved product profile get fresh uncovered topic suggestions stored in `sites.topic_suggestions` (migrations 0040 and 0041). It uses the cached autocomplete lookups and never writes to the SEO plan.

The drain also runs a bounded weekly rank pass (`task=rank`, default 10 keywords per run, max 25 via `rankLimit`) for tracked keywords in `rank_keywords` (migration 0042), one Brave Search call each; it does nothing without `BRAVE_SEARCH_API_KEY`. The site audit, rank check and AI visibility check are user-triggered only.

Product-led SEO changes have their own database integration check, `npm run test:postgres:product-seo`, which like `npm run test:postgres` needs a disposable database and `POSTGRES_INTEGRATION_ALLOW_WRITES=1`.

The same worker/drain processes the Polar webhook inbox, releases stale plan reservations, expires AI grants, and reconciles Polar customer state. Billing flags, sandbox evidence, refunds, and production gates are in [billing.md](billing.md).

Do not disable a failing scheduled workflow to make Actions appear clean. Confirm the affected task, timeout, and backend behavior before a narrow fix.

## Verification gates

Repository checks:

```bash
npm run typecheck
npm run lint --workspace=web
npm run test --workspace=web
npm run test:server
npm run build
git diff --check
```

Tagged releases additionally require both disposable container checks:

```bash
bash scripts/self-host-smoke.sh
bash scripts/self-host-backup-restore-smoke.sh
```

Use `npm run test:postgres` for schema, tenant isolation, operation ledger, and shared control-plane changes. Use `npm run test:mcp:pilot` only with a prepared live account.

Production boundary checks:

```bash
curl -i https://app.blogfactory.io/api/health
curl -i https://app.blogfactory.io/api/ready
curl -i https://blogfactory.io/
curl -i https://blogfactory.io/api/health
curl -i https://blogfactory.io/mcp
curl -i https://blogfactory.io/.well-known/oauth-protected-resource
```

Expected results:

- Public root: HTTP 200 with the current marketing marker and working waitlist destination.
- App `/api/health` and `/api/ready`: HTTP 200.
- Host port 5432 is not published or reachable externally.
- Unauthenticated `/mcp`: HTTP 401 with `WWW-Authenticate: Bearer`, never the React shell.
- OAuth protected-resource metadata: HTTP 200 with resource `https://blogfactory.io/mcp` and all three supported scopes.
- Authenticated capability response: exactly 26 tools from the server catalog.
- No live-publish or delete tool in discovery.
- Relevant production deployment SHA equals `origin/main`.

Full product acceptance also requires OAuth and tool discovery in Codex and ChatGPT plus the authenticated `generate_draft → get_job → review_post → push_to_cms_draft` workflow. A green build alone is not proof of that client flow.

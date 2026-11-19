# Operations and deployment

## Environment

Copy `.env.example` to `.env` for local development. Set `DATABASE_URL`, `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, storage credentials, and only the integrations required for the workflow being tested. Do not commit populated environment files or expose secrets in shell output.

The Docker Compose self-host contract is documented separately in [self-hosting.md](self-hosting.md). Use `.env.self-host.example`; never reuse production hosted secrets in a community installation.

Self-hosted production sets `BLOGFACTORY_SELF_HOSTED=true`, which rejects missing and placeholder database, JWT, encryption, cron, administrator, origin, and S3 configuration before serving. `/api/health` remains liveness; `/api/ready` checks PostgreSQL plus S3 bucket access and redacts failure details.

Cloud requires a dedicated `API_KEY_ENCRYPTION_SECRET` that differs from
`JWT_SECRET`. To rotate it, set the new active secret, put the old secret in
`API_KEY_ENCRYPTION_PREVIOUS_SECRETS`, deploy, and run the dry-run first:

```bash
npm run credentials:reencrypt --workspace=server
API_KEY_REENCRYPT_ALLOW_WRITES=1 npm run credentials:reencrypt --workspace=server -- --write
```

Run the dry-run again until it reports zero, verify stored connections, then
remove `API_KEY_ENCRYPTION_PREVIOUS_SECRETS`. The command reports counts only;
it never prints decrypted credentials.

OAuth is fail-closed: configure `WORKOS_AUTHKIT_ISSUER`, `MCP_RESOURCE_URL`, and `WORKOS_API_KEY` together or leave all three unset. `MCP_RESOURCE_URL` must be an HTTPS URL ending in `/mcp`. When MCP OAuth uses a different WorkOS environment than hosted browser sign-in, set `MCP_WORKOS_API_KEY` to that environment's key; MCP OAuth prefers it over `WORKOS_API_KEY`. `MCP_LEGACY_RESOURCE_URLS` is an optional, comma-separated transition-only allowlist of prior `/mcp` token audiences; it never changes advertised metadata and should be removed after clients reconnect and old tokens expire.

## Database migrations

Run `npm run db:migrate` against the target database before using code that requires a new schema. Migrations are additive, locked, checksummed, and recorded in `schema_migrations`.

For an existing database that predates the migration ledger, first confirm its schema contains every checked-in migration. Then use `MIGRATION_BASELINE_EXISTING=true` once to record the baseline without replaying historical SQL.

Never run PostgreSQL integration tests against the shared production database.
Use a disposable database.

## Production delivery

The private `BlogFactoryHQ/blogfactory-cloud` repository merges this public core through a fail-closed sync workflow, validates it, and builds API and web images in GHCR. Production pins those images by SHA-256 digest in a Docker Compose stack on the Hetzner Nuremberg host:

- PostgreSQL 18 on a named host volume, private to the Compose network;
- one-shot role initialization and migration using the local owner role;
- Bun/Hono API using the local least-privilege runtime role;
- persistent Bun worker for campaigns, SEO metadata, and deferred images;
- six-hour age-encrypted backup scheduler writing to private EU R2;
- Nginx web container, the only Compose service bound to the host loopback interface.

Caddy terminates origin TLS and forwards `app.blogfactory.io` to the loopback
web port. Cloudflare proxies the public hostname to Hetzner. Production data is
stored in the private PostgreSQL service; images and encrypted database backups
are stored in a private EU Cloudflare R2 bucket. No MinIO, Redis, or external
queue runs in the managed Cloud stack.

The private `BlogFactoryHQ/blogfactory-marketing` repository owns the Cloudflare Pages public apex. This repository owns the open-source core, while private `BlogFactoryHQ/blogfactory-cloud` owns the authenticated app/API deployment. The production host split is:

- [blogfactory.io](https://blogfactory.io) serves the marketing one-pager; `www` redirects there.
- [app.blogfactory.io](https://app.blogfactory.io) serves the React application and same-origin `/api/*`.
- `blogfactory.io/mcp` and its OAuth protected-resource metadata remain on the root host.
- Root `/api/*` remains a temporary compatibility route during the callback and cron transition.

Release flow:

1. Preserve unrelated worktree changes and inspect the intended diff.
2. Run checks proportional to the change.
3. Commit and push `main` when shipping is authorized.
4. Verify that the private Cloud repository contains the public commit and that its GHCR build completes.
5. Resolve the image tags to immutable digests, update the private Compose deployment, and let the one-shot migration finish before API startup.
6. Confirm PostgreSQL, API, worker, backup, and web are healthy with zero
   unexpected restarts, then verify the public one-pager and exact app/API/MCP
   routes affected by the change.

Application rollback is redeploying the previous approved image digests.
Full-host recovery points Cloudflare DNS to the last clean Ready Vercel
deployment and restores a verified encrypted R2 backup into a clean database
target. Keep database changes additive so either rollback remains possible.

## Background work

The persistent worker runs bounded campaign, SEO, and deferred-image drains every five seconds. The same worker starts the due-RSS-feed tick every six hours and the daily indexing, Search Console, and expired operation-event drain; both also run once when the worker starts, and the backend's due checks and claims keep that safe. The Cloudflare Worker remains a six-hour protected fallback trigger for campaign, SEO, and image drains through the existing cron endpoint and `CRON_SECRET`. The public repository has no scheduled production workflows. See the [RSS scheduler guide](rss-scheduler.md).

The API runs `BACKGROUND_EXECUTION_MODE=inline`; the persistent worker runs `BACKGROUND_EXECUTION_MODE=worker` (`server/src/worker.ts`). `BACKGROUND_WORKER_POLL_MS` and the `BACKGROUND_WORKER_CAMPAIGN_ITEMS`/`SEO_JOBS`/`IMAGE_JOBS` bounds default to the 5-second 1/2/1 cycle above. PostgreSQL atomic claims, stale recovery, retries, and feed leases prevent duplicate ownership. Do not run more than one persistent worker until claim and stale-recovery checks pass for that topology.

The worker's daily drain and the existing all-task drain remove expired `operation_events`. Do not create a separate retention cron. Operation events expire after 30 days.

The all-task drain also runs a bounded weekly topic check (`task=topics`, default 2 sites per run, max 5 via `topicsLimit`): sites with a saved product profile get fresh uncovered topic suggestions stored in `sites.topic_suggestions` (migrations 0040 and 0041). It uses the cached autocomplete lookups and never writes to the SEO plan.

The drain also runs a bounded weekly rank pass (`task=rank`, default 10 keywords per run, max 25 via `rankLimit`) for tracked keywords in `rank_keywords` (migration 0042), one Brave Search call each; each keyword uses its owner's saved Brave key, then the operator `BRAVE_SEARCH_API_KEY`; with no operator key only users who saved their own are due, so keyless users cannot starve the queue. The site audit, rank check and AI visibility check are user-triggered only.

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
- Running API and web image digests resolve to the intended private Cloud commit.

Full product acceptance also requires OAuth and tool discovery in Codex and ChatGPT plus the authenticated `generate_draft → get_job → review_post → push_to_cms_draft` workflow. A green build alone is not proof of that client flow.

## Bring-your-own SEO provider keys

Users can save their own Brave Search key and DataForSEO login/password in Article Settings (migration 0043, `user_api_keys`). They are encrypted like the other account keys, are part of `credentials:check` and secret rotation (`reencrypt-credentials`), and are never returned or logged: the API exposes only a saved flag and the last four characters. A saved key wins; the operator `BRAVE_SEARCH_API_KEY` and `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` remain the fallback for every workspace. Provider usage on a user key is billed to that user's provider account.

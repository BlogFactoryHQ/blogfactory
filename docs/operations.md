# Operations and deployment

## Environment

Copy `.env.example` to `.env` for local development. Set `DATABASE_URL`, `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, storage credentials, and only the integrations required for the workflow being tested. Do not commit populated environment files or expose secrets in shell output.

The Docker Compose self-host contract is documented separately in [self-hosting.md](self-hosting.md). Use `.env.self-host.example`; never reuse production hosted secrets in a community installation.

Self-hosted production sets `BLOGFACTORY_SELF_HOSTED=true`, which rejects missing and placeholder database, JWT, encryption, cron, administrator, origin, and S3 configuration before serving. `/api/health` remains liveness; `/api/ready` checks PostgreSQL plus S3 bucket access and redacts failure details.

OAuth is fail-closed: configure `WORKOS_AUTHKIT_ISSUER`, `MCP_RESOURCE_URL`, and `WORKOS_API_KEY` together or leave all three unset. `MCP_RESOURCE_URL` must be an HTTPS URL ending in `/mcp`. `MCP_LEGACY_RESOURCE_URLS` is an optional, comma-separated transition-only allowlist of prior `/mcp` token audiences; it never changes advertised metadata and should be removed after clients reconnect and old tokens expire.

## Database migrations

Run `npm run db:migrate` against the target database before using code that requires a new schema. Migrations are additive, locked, checksummed, and recorded in `schema_migrations`.

For an existing database that predates the migration ledger, first confirm its schema contains every checked-in migration. Then use `MIGRATION_BASELINE_EXISTING=true` once to record the baseline without replaying historical SQL.

Never run PostgreSQL integration tests against shared production Neon. Use a disposable database.

## Production delivery

The private `BlogFactoryHQ/blogfactory-cloud` repository merges this public core through a fail-closed sync workflow, validates it, and builds API and web images in GHCR. Production pins those images by SHA-256 digest in a Docker Compose stack on the Hetzner Nuremberg host:

- one-shot database migration using the direct Neon owner endpoint;
- Bun/Hono API using the pooled least-privilege runtime role;
- persistent Bun worker for campaigns, SEO metadata, and deferred images;
- Nginx web container, the only Compose service bound to the host loopback interface.

Caddy terminates origin TLS and forwards `app.blogfactory.io` to the loopback web port. Cloudflare proxies the public hostname to Hetzner. Production data remains off-host in Neon PostgreSQL 18 in Frankfurt and a private EU Cloudflare R2 bucket. No local PostgreSQL, MinIO, Redis, or external queue runs in the managed Cloud stack.

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
6. Confirm all three long-running containers are healthy with zero unexpected restarts, then verify the public one-pager and exact app/API/MCP routes affected by the change.

Application rollback is redeploying the previous approved image digests. Full-host rollback points Cloudflare DNS to the last clean Ready Vercel deployment, then stops the Hetzner worker after active claims settle. Keep database changes additive so either rollback remains possible.

## Background work

The persistent worker runs bounded campaign, SEO, and deferred-image drains every five seconds. GitHub Actions runs RSS every six hours, the full background matrix daily, and a campaign drain on manual dispatch; the Cloudflare Worker remains a six-hour protected fallback trigger. Search Console refresh is manual. Every external trigger calls the existing protected cron endpoint and shares `CRON_SECRET`; see the [RSS scheduler guide](rss-scheduler.md).

The existing all-task drain also removes expired `operation_events`. Do not create a separate retention cron. Operation events expire after 30 days.

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
curl -i https://blogfactory.io/
curl -i https://blogfactory.io/api/health
curl -i https://blogfactory.io/mcp
curl -i https://blogfactory.io/.well-known/oauth-protected-resource
```

Expected results:

- Public root: HTTP 200 with the current marketing marker and working waitlist destination.
- App and compatibility `/api/health`: HTTP 200.
- Unauthenticated `/mcp`: HTTP 401 with `WWW-Authenticate: Bearer`, never the React shell.
- OAuth protected-resource metadata: HTTP 200 with resource `https://blogfactory.io/mcp` and all three supported scopes.
- Authenticated capability response: exactly 22 tools from the server catalog.
- No live-publish or delete tool in discovery.
- Running API and web image digests resolve to the intended private Cloud commit.

Full product acceptance also requires OAuth and tool discovery in Codex and ChatGPT plus the authenticated `generate_draft → get_job → review_post → push_to_cms_draft` workflow. A green build alone is not proof of that client flow.

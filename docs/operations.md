# Operations and deployment

## Environment

Copy `.env.example` to `.env` for local development. Set `DATABASE_URL`, `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, storage credentials, and only the integrations required for the workflow being tested. Do not commit populated environment files or expose secrets in shell output.

Production web builds require `VITE_WAITLIST_URL` to be the real public HTTPS waitlist destination. The build fails closed when it is absent or invalid.

OAuth is fail-closed: configure `WORKOS_AUTHKIT_ISSUER`, `MCP_RESOURCE_URL`, and `WORKOS_API_KEY` together or leave all three unset. `MCP_RESOURCE_URL` must be an HTTPS URL ending in `/mcp`.

## Database migrations

Run `npm run db:migrate` against the target database before using code that requires a new schema. Migrations are additive, locked, checksummed, and recorded in `schema_migrations`.

For an existing database that predates the migration ledger, first confirm its schema contains every checked-in migration. Then use `MIGRATION_BASELINE_EXISTING=true` once to record the baseline without replaying historical SQL.

Never run PostgreSQL integration tests against shared production Neon. Use a disposable database.

## Production delivery

The Vercel project `editorial-flow-main` is Git-linked to `main`. `vercel.json` runs `npm run db:migrate` for production builds and then builds the server, authenticated app, marketing entry, and standalone MCP Review Card. Vercel serves `web/dist` and routes these backend surfaces through `api/index.js`:

- `/api/*`
- `/mcp`
- `/.well-known/oauth-protected-resource`

The public apex is Cloudflare-fronted while the authenticated app/API runs on Vercel. The production host split is:

- [blogfactory.io](https://blogfactory.io) serves the marketing one-pager; `www` redirects there.
- [app.blogfactory.io](https://app.blogfactory.io) serves the React application and same-origin `/api/*`.
- `blogfactory.io/mcp` and its OAuth protected-resource metadata remain on the root host.
- Root `/api/*` remains a temporary compatibility route during the callback and cron transition.

Release flow:

1. Preserve unrelated worktree changes and inspect the intended diff.
2. Run checks proportional to the change.
3. Commit and push `main` when shipping is authorized.
4. Wait for the Git-linked Vercel deployment with the same commit SHA to become Ready.
5. Confirm the production aliases are attached and `aliasError` is empty.
6. Verify both the public one-pager marker and the exact app/API/MCP routes affected by the change.

Rollback is promotion of the last Ready Vercel deployment. Keep database changes additive so application rollback remains possible.

## Background work

The Cloudflare Worker runs bounded campaign, SEO, and deferred-image drains every six hours. GitHub Actions runs RSS hourly, the full background matrix daily, and a campaign drain on manual dispatch. Every trigger calls the existing protected cron endpoint and shares `CRON_SECRET`; see the [RSS scheduler guide](rss-scheduler.md).

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
- Relevant production deployment SHA equals `origin/main`.

Full product acceptance also requires OAuth and tool discovery in Codex and ChatGPT plus the authenticated `generate_draft → get_job → review_post → push_to_cms_draft` workflow. A green build alone is not proof of that client flow.

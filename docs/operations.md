# Operations and deployment

## Environment

Copy `.env.example` to `.env` for local development. Set `DATABASE_URL`, `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, storage credentials, and any integrations required for the workflow being tested. Do not commit populated environment files.

## Database migrations

Run `npm run db:migrate` against the target database before using a deployment that requires new schema. Migrations are locked, checksummed, and recorded in `schema_migrations`.

For an existing database that predates the migration ledger, first confirm its schema already contains every checked-in migration. Then use `MIGRATION_BASELINE_EXISTING=true` once to record the baseline without replaying historical SQL.

## Vercel deployment

Vercel builds the web workspace, serves `web/dist`, and routes `/api/*` through `api/index.ts` into the Hono application. Production is available at [blogfactory.io](https://blogfactory.io).

Configure the production environment from `.env.example`, run the relevant migration, deploy, then verify `https://blogfactory.io/api/health` returns HTTP 200.

## Background work

Cloudflare handles frequent image ticks. GitHub Actions handles RSS and the daily full background drain. Both use the protected cron endpoint and must share the backend `CRON_SECRET`; see the [RSS scheduler guide](rss-scheduler.md) for its exact configuration.

Do not disable a failing scheduled workflow to make Actions appear clean. Confirm its affected task, timeout, and backend behavior before making a narrow operational fix.

# Blogfactory

AI-assisted content operations for generating, managing, scheduling, and publishing blog posts across sites.

## Product UI Direction

BlogFactory is styled as a white Device Console SaaS for content operations. The interface uses off-white workspaces, white hardware-like panels, graphite text, pale gray hairlines, orange primary action controls, blue links/navigation emphasis, black secondary controls, and restrained green/red/yellow status accents.

The app should feel like a dense blog factory control surface, not a landing page or decorative game UI. Shared UI decisions live in `UI_UX.md`; agents and contributors should read it before changing frontend styling.

## Stack

| Layer    | Tech                                         |
|----------|----------------------------------------------|
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui    |
| Backend  | Hono (TypeScript) with Bun for local dev     |
| Database | PostgreSQL via Drizzle ORM                   |
| Storage  | S3-compatible storage, such as Cloudflare R2 |
| Deploy   | Vercel app/API + Cloudflare/GitHub cron      |

## Project Structure

```text
/
├── api/                  # Vercel serverless entrypoint
│   └── index.ts          # Loads the Hono app from server/src/index.ts
│
├── server/               # Hono backend
│   └── src/
│       ├── db/           # Drizzle schema, migrations, and database client
│       ├── middleware/   # Auth middleware
│       ├── routes/       # API route handlers
│       └── services/     # Content, storage, publishing, and scheduler logic
│
├── web/                  # React + Vite frontend
│   └── src/
│       ├── lib/api.ts    # Calls /api/* relative URLs
│       ├── pages/        # App screens
│       └── ...
│
├── vercel.json           # Vercel build, functions, and routing config
├── wrangler.cron.jsonc   # Cloudflare Worker cron config
├── UI_UX.md              # Product UI direction and frontend UX rules
├── AGENTS.md             # Agent working context and implementation rules
├── package.json          # Root npm workspaces and scripts
└── .env.example          # Copy to .env and fill in local values
```

## Local Development

### Prerequisites

- [Node.js 22](https://nodejs.org)
- [Bun](https://bun.sh) for the backend dev server
- A PostgreSQL database, such as Neon
- S3-compatible object storage, such as Cloudflare R2 or local MinIO

### Setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/BoraGkc/blogfactory.git
cd blogfactory
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with DATABASE_URL, JWT_SECRET, storage credentials, and integrations.

# 3. Run database migrations
npm run db:migrate

# 4. Start the backend and frontend together
npm run dev
```

Local services:

| Service  | URL                   |
|----------|-----------------------|
| API      | http://localhost:3000 |
| Frontend | http://localhost:8080 |

The frontend calls `/api/*`. In local development, Vite proxies those requests to the backend.
The local `/mcp` endpoint is also proxied to the backend, so clients can use `http://localhost:8080/mcp`.
On the sign-in screen, use **Enter local workspace** to create an approved local admin, starter site, and default voice in your development database. This helper is disabled when `NODE_ENV=production`.

### Private MCP read-only pilot

1. Start BlogFactory and apply the current database migrations.
2. Open **Settings → MCP**.
3. Create a site-scoped connection token and save the secret when it is shown.
4. Put that secret in `BLOGFACTORY_MCP_TOKEN` in the environment that starts Codex.
5. Add the hosted server:

```bash
codex mcp add blogfactory \
  --url https://blogfactory.io/mcp \
  --bearer-token-env-var BLOGFACTORY_MCP_TOKEN
```

For local development, replace the URL with `http://localhost:8080/mcp`. Personal tokens currently expose read-only discovery for sites, personas, publish targets, posts, and jobs. Draft mutation, CMS delivery, live publishing, deletion, and bulk operations are not available in this pilot.

Run the bounded interoperability smoke check against a prepared pilot account:

```bash
MCP_PILOT_URL=https://blogfactory.io/mcp \
MCP_PILOT_TOKEN=bf_mcp_REPLACE_WITH_SECRET \
npm run test:mcp:pilot
```

The runner reads the secret only from the environment and prints only pass/fail labels, safe IDs, and item counts. It requires an active persona and an allowed site with a publish target plus a job-backed post among its first 250 posts.

Run the PostgreSQL integration matrix only against a disposable database:

```bash
DATABASE_URL=postgres://DISPOSABLE_DATABASE \
POSTGRES_INTEGRATION_ALLOW_WRITES=1 \
npm run test:postgres
```

The explicit write opt-in prevents the test from running migrations or creating fixtures against the database loaded from local environment files by accident. Test users and their dependent fixtures are removed even when an assertion fails.

### MCP OAuth with WorkOS AuthKit

BlogFactory uses WorkOS AuthKit Standalone Connect for MCP OAuth while keeping the existing BlogFactory sign-in as the source of truth. OAuth is disabled when all provider values are absent and fails closed when they are only partially configured; enable it by setting `WORKOS_AUTHKIT_ISSUER`, `MCP_RESOURCE_URL`, and `WORKOS_API_KEY` together.

Before enabling those values:

1. Apply migration `0028_mcp_oauth_connections.sql`.
2. In WorkOS Connect, set the resource indicator to `https://blogfactory.io/mcp`.
3. Set the standalone Login URI to `https://blogfactory.io/mcp/oauth`.
4. Enable Client ID Metadata Document and Dynamic Client Registration. Current Codex requires DCR unless a client ID is configured manually.
5. Configure authorization-server scopes to advertise `content:read` and `offline_access`, with no write scopes during the read-only phase.
6. Add `urn:blogfactory:user_id` to the WorkOS JWT template using `user.external_id`. BlogFactory supplies the selected site as `urn:blogfactory:site_id` through WorkOS consent.

Then connect Codex without copying a token:

```bash
codex mcp add blogfactory --url https://blogfactory.io/mcp
codex mcp login blogfactory
```

Do not add `--oauth-resource`; Codex obtains the canonical resource from BlogFactory metadata. OAuth access tokens are issuer-, audience-, user-, and site-validated on every request. A local connection record makes Settings revocation effective even for an already-issued JWT. WorkOS does not include granted scopes in its documented access-token claims, so every valid OAuth connection is fixed to `content:read`; do not enable OAuth write tools until scope binding is proven in a live tenant or enforced through provider management state.

### Workspace Commands

```bash
# Frontend only
npm run dev --workspace=web

# Backend only
npm run dev --workspace=server

# Build frontend
npm run build

# Run frontend tests
npm run test --workspace=web

# Generate a migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate
```

## Environment Variables

Copy `.env.example` to `.env` for local development. The main values are:

| Variable                    | Description                                      |
|-----------------------------|--------------------------------------------------|
| `DATABASE_URL`              | PostgreSQL connection string                     |
| `JWT_SECRET`                | Secret used for auth tokens                      |
| `ADMIN_EMAILS`              | Comma-separated admin email list                 |
| `API_KEY_ENCRYPTION_SECRET` | Secret used to encrypt stored API keys           |
| `MCP_ALLOWED_ORIGINS`        | Optional browser origins allowed to call `/mcp`  |
| `WORKOS_AUTHKIT_ISSUER`      | WorkOS AuthKit HTTPS origin for MCP OAuth         |
| `MCP_RESOURCE_URL`           | Canonical MCP resource URL, ending in `/mcp`      |
| `WORKOS_API_KEY`             | Server-only key for standalone OAuth completion   |
| `CRON_SECRET`               | Bearer token for protected cron drains           |
| `OPENROUTER_WEBHOOK_SECRET` | Bearer token configured in OpenRouter Broadcast headers |
| `S3_ENDPOINT`               | S3-compatible endpoint URL                       |
| `S3_ACCESS_KEY_ID`          | Storage access key                               |
| `S3_SECRET_ACCESS_KEY`      | Storage secret key                               |
| `S3_BUCKET`                 | Storage bucket name                              |
| `S3_REGION`                 | Storage region, or `auto` for Cloudflare R2      |
| `S3_PUBLIC_URL`             | Optional public CDN URL for stored assets        |
OpenRouter, Google Gemini, and publishing integration credentials are stored per user from the app's Settings and Integrations areas.
For OpenRouter Broadcast, use `/api/webhooks/openrouter` as the webhook URL and configure
`{"Authorization":"Bearer <OPENROUTER_WEBHOOK_SECRET>"}` as its custom headers.

## Deploying to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com), create a new project from `BoraGkc/blogfactory`.
3. Leave the root directory as `./`.
4. Add the required environment variables from `.env.example`.
5. Deploy.

Vercel builds `web/`, serves `web/dist`, and routes `/api/*` requests through the single serverless entrypoint at `api/index.ts`, which loads the Hono backend from `server/src/index.ts`.

Run `npm run db:migrate` with the production `DATABASE_URL` before or after the first deploy so the database schema is ready.
Migrations are locked, checksummed, and recorded in `schema_migrations`. For an existing database created before the ledger was introduced, verify that every checked-in migration is already present, then run once with `MIGRATION_BASELINE_EXISTING=true`; this records the baseline without replaying historical SQL.
Production Vercel builds run this migration step before compiling the application. Preview and local builds do not migrate databases.

To check saved credential decryptability without printing secret values, run `npm run credentials:check --workspace=server` with the target environment loaded. Keep `API_KEY_ENCRYPTION_SECRET` stable; changing it requires users to re-save every encrypted API key and integration credential.

## Contributor Notes

Run `npm run typecheck`, `npm run lint --workspace=web`, `npm run test --workspace=web`, and `npm run build` before publishing frontend changes. ESLint retains only Fast Refresh warnings for files that intentionally export shared helpers or component primitives alongside React components; these exports are consumed directly by tests or other modules.

Pull requests and pushes to `main` run independent GitHub checks for server/web builds, frontend typecheck/lint/tests, and every recursively discovered backend self-test. Run the backend suite locally with `npm run test:server`; newly added `*.self-test.ts` files are included automatically.

- Keep API shapes, route behavior, and database schema stable unless the change explicitly needs them.
- Prefer shared surfaces and shadcn-style primitives before adding page-specific UI.
- URL/domain inputs should use `InputAffordance` and helpers from `web/src/lib/url-validation.ts`.
- For frontend work, run `npm run build`, `npm run test --workspace=web`, and `git diff --check`.
- If local `/api/*` calls return `HTTP 500` because the backend environment is unavailable, do not block UI-only work on that.

## Background Cron

Vercel cron is not used. Cloudflare handles frequent image ticks; GitHub Actions handles slower drains.

```bash
npm run cron:dry-run
npm run cron:deploy
```

Set the Worker secret to the same value as the backend `CRON_SECRET`:

```bash
npx wrangler secret put CRON_SECRET --config wrangler.cron.jsonc
```

Cloudflare drains two images in parallel every 5 minutes. GitHub Actions drains feeds hourly and all background tasks daily. Set GitHub secret `BLOGFACTORY_CRON_SECRET` to the same backend `CRON_SECRET`; optional variable `BLOGFACTORY_BASE_URL` defaults to `https://blogfactory.io`.

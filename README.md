# BlogFactory

BlogFactory is an agent control plane for multi-site content operations. Agents do the production work through MCP; people use the web app to monitor runs, review revisions, resolve blockers, manage destinations, and approve CMS draft delivery.

[Public website](https://blogfactory.io) · [Self-hosting](docs/self-hosting.md) · [Release plan](FEATURE_PLAN.md) · [MCP guide](docs/mcp.md) · [Architecture](docs/architecture.md) · [AGPL-3.0-only](LICENSE)

## Current phase

BlogFactory is preparing an open-source, self-hosted release. BlogFactory Cloud is coming soon.

- The operational product, hosted MCP server, review workflow, Search Console tooling, and draft-only CMS delivery exist.
- Docker Compose is the verified release-candidate self-host topology; the remaining public-release gates stay open in `FEATURE_PLAN.md`.
- The public site remains a waitlist until the Railway acceptance passes and the repository is public and anonymously cloneable.
- Customer pricing, subscriptions, checkout, entitlements, and billing webhooks are not implemented.
- Hosted public account creation is disabled. Self-hosted operators may open signup temporarily for administrator bootstrap and approved additional users. Password recovery is not exposed until real email delivery exists.
- Users bring their own AI credentials; provider model-cost displays are not BlogFactory subscription pricing.

## Product model

```text
source evidence
  -> generation or caller-authored draft
  -> BlogFactory revision + SEO metadata
  -> review packet + preflight
  -> explicit human approval
  -> selected CMS destination as a draft
```

- **MCP is the work layer:** site-scoped reads, generation, draft creation and editing, Search Console diagnosis, review, and CMS draft delivery.
- **The web app is the control layer:** summaries, action queues, run diagnostics, content management, integrations, settings, and audit history.
- **The Review Card is the approval layer:** revision summary, preflight, destination selection, and explicit CMS draft confirmation inside supported MCP clients.
- **The authority ceiling is draft-only:** no MCP live publish, delete, credential access, arbitrary provider access, or admin tools.

## Production surfaces

| Surface | Host / endpoint | Responsibility |
| --- | --- | --- |
| Public marketing | `https://blogfactory.io` | Release-candidate one-pager and Cloud waitlist CTA |
| Authenticated app | `https://app.blogfactory.io` | React control and review application |
| Web API | `https://app.blogfactory.io/api/*` | Authenticated product API |
| MCP | `https://blogfactory.io/mcp` | Streamable HTTP agent work layer |
| OAuth metadata | `https://blogfactory.io/.well-known/oauth-protected-resource` | MCP protected-resource discovery |
| Root API compatibility | `https://blogfactory.io/api/*` | Temporary compatibility path during host transition |

The public apex is currently Cloudflare-fronted. The app/API is deployed from the Git-linked Vercel project `editorial-flow-main`. Root MCP, OAuth metadata, and compatibility API routes still reach the same backend boundary.

## Marketing one-pager

Marketing is a separate Vite entry, not a route inside the authenticated React application:

```text
web/marketing.html
  -> web/src/marketing-main.tsx
  -> web/src/Marketing.tsx
```

The same web build also produces the authenticated app from `web/index.html`. `VITE_WAITLIST_URL` is required for production builds and must be the real public HTTPS waitlist destination; the build fails closed when it is missing or invalid. The product workspace shown on the one-pager is an explicitly labelled product composite, not live customer data.

## Application surfaces

| Area | Route | Purpose |
| --- | --- | --- |
| Overview | `/` | Workspace digest and attention summary |
| Create Content | `/create` | Manual, campaign, and programmatic creation fallback |
| Review Queue | `/review` | Prioritized blockers, requested changes, approvals, and warnings |
| Runs | `/runs` | Generation queue, progress, errors, results, and retry controls |
| Search Growth | `/overview/growth` | Search Console, growth plans, optimization, indexing, and internal links |
| Sources | `/sources/*` | RSS, campaigns, and batch import |
| Content | `/library/*` | Content inventory and image gallery |
| Control | `/control/*` | MCP connections, integrations, sites, brand voice, settings, and usage |

`/library` remains the technical URL, but visible product wording is **Content**. The old News surface has been removed.

## Repository map

```text
api/index.js                 Vercel serverless adapter for the built Hono app
server/src/index.ts          API, MCP, OAuth metadata, middleware, and route registration
server/src/routes/           HTTP transport and request validation
server/src/services/         Shared product/business logic used by web and MCP
server/src/mcp/              Tool contracts, handlers, transport, OAuth, and Review Card resource
server/src/db/               Drizzle schema, migrations, and migration runner

web/index.html               Authenticated app HTML entry
web/marketing.html           Public one-pager HTML entry
web/src/App.tsx              Authenticated frontend route tree
web/src/Marketing.tsx        Public marketing page
web/src/pages/               Product pages
web/src/components/          Shared UI and workflow components
web/src/mcp-review/          Standalone MCP Review Card entry

cloudflare/cron-worker.ts    Six-hour campaign, SEO, and image fallback drain
.github/workflows/           Validation, hourly RSS, and daily background drains
middleware.ts                Vercel apex marketing fallback routing
vercel.json                  Build, redirects, headers, rewrites, and function configuration
```

See [docs/architecture.md](docs/architecture.md) for request flows, service ownership, background jobs, data boundaries, and a “where do I change this?” guide.

## Stack

- npm workspaces: `web` and `server`
- Frontend: React 18, Vite, Tailwind CSS, React Query, shadcn/ui-style primitives
- Backend: Hono and TypeScript; Bun for local development and backend self-tests
- Data: PostgreSQL and Drizzle ORM with additive SQL migrations
- Storage: S3-compatible object storage, commonly Cloudflare R2
- Authentication: application JWT plus WorkOS browser OAuth for MCP
- Delivery: Cloudflare at the public apex, Vercel for app/API, Cloudflare Worker and GitHub Actions for scheduled drains

## Local development

Requires Node.js 22, Bun, PostgreSQL, and S3-compatible storage.

```bash
git clone https://github.com/BoraGkc/blogfactory.git
cd blogfactory
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

The frontend runs at `http://localhost:8080`; Hono runs at `http://localhost:3000`. Vite proxies `/api/*` and `/mcp` to the backend.

Minimum local configuration is workflow-dependent. Start with `DATABASE_URL`, `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, and storage credentials. Add only the provider credentials needed for the flow under test. Production web builds also require a valid `VITE_WAITLIST_URL`.

## Self-host with Docker

```bash
cp .env.self-host.example .env
# Fill every required blank and set ADMIN_EMAILS.
docker compose pull
docker compose up -d
```

Open `http://localhost:8080` and create the first account with the configured administrator email. The stack includes the web app, API, PostgreSQL, MinIO, migrations, persistent volumes, and the bounded scheduler. Follow the complete [self-hosting guide](docs/self-hosting.md) before exposing it to the internet.

## Commands

```bash
npm run dev                     # server + web
npm run build                   # server + app + marketing + MCP Review Card
npm run typecheck               # web TypeScript
npm run test --workspace=web    # frontend tests
npm run test:server             # backend self-tests
npm run test:postgres           # disposable PostgreSQL integration suite
npm run test:mcp:pilot          # prepared authenticated live pilot only
npm run db:migrate              # apply additive migrations
```

Never point `npm run test:postgres` at shared production Neon.

## Verification

Before a normal pull request or release:

```bash
npm run typecheck
npm run lint --workspace=web
npm run test --workspace=web
npm run test:server
VITE_WAITLIST_URL=https://your-real-waitlist.example npm run build
npm audit --audit-level=high
git diff --check
```

Database, tenant-isolation, ledger, and shared control-plane changes also require `npm run test:postgres` against a disposable database. Production acceptance is documented in [docs/operations.md](docs/operations.md); a green build alone is not live verification.

## Documentation

- [Architecture and service ownership](docs/architecture.md)
- [MCP, OAuth, tool catalog, and Review Card](docs/mcp.md)
- [Operations, deployment, background work, and release acceptance](docs/operations.md)
- [Self-hosting with Docker Compose](docs/self-hosting.md)
- [Canonical release and Cloud roadmap](FEATURE_PLAN.md)
- [RSS scheduler](docs/rss-scheduler.md)
- [UI system and information architecture](UI_UX.md)
- [Repository rules for coding agents](AGENTS.md)
- [Documentation index and historical decision records](docs/README.md)

This checkout is licensed for the v0.1 release candidate, but it is not a public release until every remaining Phase 0 gate in [FEATURE_PLAN.md](FEATURE_PLAN.md) is complete.

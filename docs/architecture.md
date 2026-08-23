# Architecture and developer map

This document explains how the current BlogFactory system fits together. It describes shipped code, not future pricing or launch plans.

## System at a glance

```text
                         public visitors
                               |
                     blogfactory.io (Cloudflare)
                               |
                    marketing one-pager + waitlist

operators ------------------------------------------------ agents
    |                                                         |
app.blogfactory.io                                      blogfactory.io/mcp
    |                                                         |
React control app                                      MCP auth + tools
    |                                                         |
    +--------------------- Hono API ---------------------------+
                              |
                   shared tenant-scoped services
                              |
             PostgreSQL + S3-compatible object storage
                              |
       CMS drafts / Search Console / configured AI providers
```

The important architectural rule is that web and MCP are two transports over the same services. Queue classification, review preflight, revision logic, Search Console reads, permissions, and CMS draft delivery should not be reimplemented in a page or MCP handler.

## Runtime surfaces

### Public marketing

- HTML entry: `web/marketing.html`
- React entry: `web/src/marketing-main.tsx`
- Page: `web/src/Marketing.tsx`
- Build input: `web/vite.config.ts`
- Required production variable: `VITE_WAITLIST_URL`

The one-pager explains the evidence → agent work → human review → CMS draft loop. It has no authenticated product state and must not import the app Router, auth providers, or React Query application. Its workspace visuals are labelled composites. Pricing is intentionally absent because no customer billing model has been implemented.

### Authenticated web app

- HTML entry: `web/index.html`
- React entry: `web/src/main.tsx`
- Route tree: `web/src/App.tsx`
- API client: `web/src/lib/api.ts`
- Session and site context: `web/src/hooks/useAuth.tsx`, `web/src/hooks/useSites.tsx`

The app is the operator control plane. Pages should call typed hooks/API helpers and render state; shared product decisions belong in backend services.

### MCP server and Review Card

- Endpoint: `/mcp`
- Transport: `server/src/mcp/server.ts`
- Exact catalog/scopes/version: `server/src/mcp/contracts.ts`
- Schemas and handlers: `server/src/mcp/tools.ts`
- Authentication: `server/src/mcp/auth.ts`, `server/src/mcp/oauth.ts`
- Standalone app resource: `server/src/mcp/review-app.ts`
- Frontend card: `web/src/mcp-review/`

The MCP surface is site-scoped and draft-only. `generate_draft` is asynchronous. `update_draft` and `push_to_cms_draft` require the current version. Repeating the same CMS draft delivery is idempotent.

### HTTP API

`server/src/index.ts` assembles the Hono app. The order is deliberate:

```text
CORS -> request logger -> normalized errors -> auth -> operation ledger -> routes
```

`api/index.js` imports the compiled Hono app for Vercel. Route files own HTTP validation and response shape; business logic should live under `server/src/services/`.

## Service ownership

| Concern | Source of truth | Main consumers |
| --- | --- | --- |
| Workspace digest, action queue, review packet | `server/src/services/control-plane.ts` | Overview, Review Queue, MCP |
| Revisions and optimistic locking | `server/src/services/post-revisions.ts` | Post routes, review, MCP updates |
| CMS preflight and draft delivery | `server/src/services/publishing.ts` | Web approval and MCP Review Card |
| Content generation | `server/src/services/generate-content.ts` | Content routes, campaigns, MCP |
| Generation contracts and output cleanup | `generation-contracts.ts`, `generation-output.ts`, `post-cleanup.ts` | Generation and repair flows |
| Search Console | `server/src/services/search-console.ts` | Search Growth, digest, MCP |
| SEO growth plans | `server/src/services/seo-growth-plan.ts` | Search Growth and campaigns |
| Page optimization | `server/src/services/optimize.ts` | Search Growth Optimize surface |
| Internal links and indexing | `internal-linking.ts`, `indexing.ts` | Search Growth and post delivery |
| RSS routing and leases | `feed-routing.ts`, `feed-run-lease.ts` | Feed routes and schedulers |
| Campaign execution | `campaign-runner.ts`, `campaign-parser.ts`, `programmatic.ts` | Campaign and programmatic routes |
| Images | `image-slots.ts`, `low-cost-images.ts`, `ai-image-queue.ts`, `image-storage.ts` | Generation, gallery, background drains |
| Credentials | `api-keys.ts` and integration-specific services | Settings, generation, publishing |
| Audit history | `operation-events.ts`, `middleware/operation-ledger.ts` | Operations API and Overview |

## Data and tenancy

- Schema: `server/src/db/schema.ts`
- Database connection: `server/src/db/index.ts`
- Additive migrations: `server/src/db/migrations/`
- Migration runner: `server/src/db/migration-runner.ts`

Every authenticated query and mutation must remain user- and site-scoped. The main consistency guarantees are:

- post edits use optimistic locking;
- CMS draft delivery is idempotent;
- background feed work uses PostgreSQL leases;
- operation records are sanitized and retained for 30 days;
- secrets are encrypted at rest and never returned through MCP;
- integration tests use a disposable PostgreSQL database.

Object storage holds generated/imported image assets. Database rows retain ownership, attachment, source, status, and attribution metadata; the object key alone is not an authorization boundary.

## Background work

Background work is split across bounded triggers that all call the protected `/api/cron/drain` endpoint:

| Trigger | Schedule | Work |
| --- | --- | --- |
| Cloudflare Worker | Every 6 hours | Campaign fallback, SEO metadata, deferred images |
| GitHub `rss-cron.yml` | Hourly | Due RSS feeds |
| GitHub `full-cron.yml` | Daily | Campaigns, indexing, Search Console, feeds, images |
| GitHub `campaign-cron.yml` | Manual | Bounded campaign drain |

The backend decides eligibility and claims work. Schedulers must stay thin; do not create a second queue or duplicate job classification in a Worker or workflow.

## Hosting and routing

| Layer | Current responsibility |
| --- | --- |
| Cloudflare | Public apex/front door and six-hour cron Worker |
| Vercel project `editorial-flow-main` | Git-linked app/API build and serverless execution |
| `vercel.json` | Migration/build command, API/MCP rewrites, redirects, headers, SPA fallbacks |
| `middleware.ts` | Vercel fallback that maps the apex root to `marketing.html` |
| GitHub Actions | Validation plus hourly/daily protected background drains |

The repository builds both `index.html` and `marketing.html`. Current production uses the public apex and app subdomain as separate surfaces, but the Vercel configuration retains an apex marketing fallback. Verify the actual domain aliases and proxy behavior during every release; do not infer live routing from configuration alone.

## Authentication and authority

- Web sessions use application authentication and site membership.
- MCP accepts WorkOS browser OAuth or hashed personal `bf_mcp_` tokens.
- OAuth fails closed unless issuer, resource URL, and WorkOS key are configured together.
- MCP scopes are `content:read`, `drafts:write`, and `publish:draft`.
- `publish:draft` means CMS draft delivery, never live publication.
- Public signup is disabled.
- Password recovery UI is disabled until real email delivery is connected.

## Pricing boundary

There is no BlogFactory customer billing system in this codebase today. Existing “pricing” fields describe upstream AI model costs for bring-your-own-AI usage.

Before adding a pricing page or payment code, make an explicit product decision for plans, limits, trial behavior, entitlement ownership, and billing provider. Keep customer billing outside MCP tool authority, make billing webhooks idempotent, and do not treat model-cost analytics as subscription state.

## Where to make a change

| If you need to change… | Start here |
| --- | --- |
| Public one-pager copy or sections | `web/src/Marketing.tsx`, `web/marketing.html` |
| Waitlist destination validation | `web/src/lib/https-url.ts`, `web/vite.config.ts` |
| App navigation or route | `web/src/App.tsx`, `web/src/components/layout/AppSidebar.tsx` |
| Shared page chrome | `web/src/components/layout/BywordSurface.tsx`, `UI_UX.md` |
| API endpoint | matching file under `server/src/routes/`, then a shared service |
| Database field | `server/src/db/schema.ts` plus a new additive migration |
| MCP tool | `contracts.ts`, `tools.ts`, exact catalog assertions, `docs/mcp.md` |
| Review/preflight behavior | `server/src/services/control-plane.ts` or `publishing.ts` |
| Scheduled work | `server/src/routes/cron.ts`, existing drain service, current trigger config |
| Production routing | `vercel.json`, `middleware.ts`, hosting control plane, `docs/operations.md` |

## Developer reading order

1. `README.md`
2. This document
3. `AGENTS.md`
4. `docs/mcp.md` for MCP or agent work
5. `docs/operations.md` for database, jobs, or release work
6. `UI_UX.md` for frontend work

Historical plans preserve decisions but are not evidence of current behavior. When documentation disagrees, confirm the code and update the current document in the same change.

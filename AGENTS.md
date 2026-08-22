# BlogFactory Agent Context

BlogFactory is an agent control plane for multi-site content operations. MCP clients perform generation, reading, editing, diagnosis, and CMS draft delivery; the web app provides summaries, review, control, and audit. Preserve that split.

## Read First

- `README.md` describes the current product, architecture, setup, and acceptance checks.
- `docs/mcp.md` is the current MCP catalog, OAuth, Review Card, and safety boundary.
- `docs/operations.md` covers migrations, deployment, background work, and production verification.
- `UI_UX.md` defines the white Device Console system and current information architecture.
- Historical plans are decision records, not current requirements. Prefer code and current docs when they disagree.
- Prefer existing app patterns over new abstractions. Keep diffs small and preserve unrelated worktree changes.
- When the user asks to push, ship, merge, or finish GitHub work, complete that chain directly. Stop only for missing credentials, failing checks that need product judgment, or unrequested destructive operations.

## Product Boundary

- Primary users operate one or more connected sites.
- MCP is the work layer; web is the control and audit layer.
- The highest agent authority is CMS **draft** creation after explicit approval.
- Never add live publish, delete, bulk mutation, credential access, arbitrary provider access, or admin MCP tools without a separate product and security decision.
- Reuse BlogFactory's existing generation, Search Console, publishing, tenant authorization, and credentials. Do not create a second service or provider flow.
- Every database query and mutation must remain user- and site-scoped.
- Optimistic locking and publishing idempotency are product guarantees, not optional implementation details.

## Current Information Architecture

Sidebar:

- Operate: Overview `/`, Create Content `/create`, Review Queue `/review`, Runs `/runs`, Search Growth `/overview/growth`.
- Manage: Sources `/sources`, Content `/library`, Control `/control`.

Grouped surfaces:

- Sources: RSS `/sources/rss`, Campaigns `/sources/campaigns`, Batch Import `/sources/batch-import`.
- Content: Content `/library/content`, Image Gallery `/library/images`.
- Control: MCP Connections, Integrations, Sites, Brand Voice, Article Settings, Usage.
- Post edit and preview remain `/library/posts/:id/edit` and `/library/posts/:id/preview`.
- Auth, onboarding, MCP OAuth, and admin routes remain separate.

`/library` is a stable technical URL, but visible product wording is **Content**. The News surface is removed. Do not restore old routes, labels, redirects, or navigation without an explicit request.

## Stack

- npm workspaces: `web` and `server`.
- Frontend: React 18, Vite, Tailwind CSS, React Query, shadcn/ui-style components.
- Backend: Hono TypeScript app; Bun for local backend development and self-tests.
- Database: PostgreSQL with Drizzle ORM and additive SQL migrations.
- Storage: S3-compatible storage, commonly Cloudflare R2.
- Deploy: Vercel runs production migrations, builds both workspaces, serves `web/dist`, and routes `/api/*`, `/mcp`, and OAuth metadata to `api/index.ts`.

## Project Map

```text
api/index.ts                         Vercel serverless entrypoint
server/src/index.ts                  Hono app and route registration
server/src/routes/control-plane.ts   Shared Overview and Review Queue HTTP endpoints
server/src/routes/operations.ts      Tenant-scoped operation ledger reads
server/src/mcp/contracts.ts          Protocol version, scopes, and exact tool catalog
server/src/mcp/tools.ts              MCP schemas and handlers
server/src/mcp/server.ts             Streamable HTTP server and call lifecycle
server/src/mcp/oauth.ts              OAuth protected-resource behavior
server/src/mcp/review-app.ts         Review Card resource registration
server/src/services/control-plane.ts Shared digest, queue, review packet, and preflight logic
server/src/services/operation-events.ts Sanitized 30-day operation ledger
server/src/db/schema.ts              Drizzle schema
server/src/db/migrations/            Additive SQL migrations
web/src/App.tsx                      Current frontend routes
web/src/pages/Overview.tsx           Workspace digest
web/src/pages/ReviewQueue.tsx        Prioritized action queue
web/src/pages/Posts.tsx              Content inventory
web/src/pages/SearchGrowth.tsx       Search operations cockpit
web/src/mcp-review/                  Standalone MCP Review Card
web/src/components/layout/           Sidebar, shells, tabs, and shared surfaces
web/src/lib/api.ts                   Frontend API client
web/src/lib/control-plane.ts         Shared frontend control-plane types
```

## Control Plane Contracts

Authenticated public interfaces:

- `GET /api/control-plane/overview`
- `GET /api/control-plane/action-items`
- `GET /api/posts/:id/review`
- `GET /api/operations`
- `GET /api/mcp/capabilities`

Shared concepts are `WorkspaceDigest`, `ActionItem`, `ReviewPacket`, and `OperationEvent`. Web and MCP must call the same services; do not duplicate queue classification, stale-draft rules, revision summaries, preflight, permission, or destination logic in a page or tool handler.

The action queue contains only real work: editorial review states, requested changes, stale approvals, missing revision/SEO/destination blockers, image/metadata warnings, and untouched drafts older than 14 days. Priority is blocker → changes requested → in review → stale approval → warning → last update.

## MCP Status — 2026-08-22

- Production endpoint: `https://blogfactory.io/mcp`.
- Transport: Streamable HTTP; protocol `2025-11-25`; server `0.4.3`.
- Authentication: WorkOS browser OAuth or site-scoped personal `bf_mcp_` tokens. Tokens are hashed and shown once.
- Scopes remain `content:read`, `drafts:write`, and `publish:draft`.
- The exact active catalog has 22 tools. Control-plane additions are `get_workspace_digest`, `list_action_items`, and `review_post`.
- `review_post` links the standalone `ui://blogfactory/review-post.html` MCP App resource. Unsupported clients receive the same structured result as text.
- `generate_draft` is asynchronous; `update_draft` requires `expected_updated_at`; `push_to_cms_draft` requires current version, explicit destination, valid preflight, and remains idempotent/draft-only.
- Connections UI reads scope/tool counts from `/api/mcp/capabilities`; never hardcode catalog counts in product UI.
- Every authenticated MCP call writes a sanitized operation event. Web GET requests are not logged; mutations and important job transitions are. Bodies, prompts, source values, provider responses, tokens, keys, and credentials must never enter the ledger.
- Operation records expire after 30 days and are purged by the existing all-task scheduler drain.

## UI Rules

- Use `BywordPageShell`, `BywordCard`, `SectionHeader`, `SectionTabs`, and existing shadcn-style primitives before adding surfaces.
- Keep the white BlogFactory Device Console: off-white workspace, white panels, graphite text, pale hairlines, blue navigation, orange primary actions, black secondary controls, and restrained status colors.
- Keep operational pages dense, calm, and task-focused. Overview owns summaries; Content owns filtering and inventory. Do not repeat large analytics panels above operational tables.
- Use `InputAffordance` and `web/src/lib/url-validation.ts` for URL/domain inputs.
- Prefer short affordance copy. Do not add fake controls.
- Maintain compact radii, crisp borders, visible focus states, keyboard access, responsive wrapping, and contained horizontal table scrolling.
- The MCP Review Card stays a small standalone entry. Do not embed the main Router, AuthProvider, or React Query application into it.

## Commands

```bash
npm run dev
npm run dev --workspace=web
npm run dev --workspace=server
npm run build
npm run typecheck
npm run test --workspace=web
npm run test:server
npm run test:postgres
npm run test:mcp:pilot
npm run db:migrate
npm run db:generate
```

## Verification and Release

- Frontend changes: targeted lint, `npm run typecheck`, web tests, and production build.
- Backend/MCP changes: server self-tests, exact catalog assertions, PostgreSQL integration, and production build.
- Database integration writes must use a disposable PostgreSQL database, never shared production Neon.
- Full web lint has known unrelated debt; separate changed-file errors from existing warnings.
- A local missing backend or environment may return `/api/*` 500; do not misattribute that to UI-only work.
- Before release: `git diff --check`, clean intended diff, commit, push, and wait for the Git-linked Vercel deployment to become Ready.
- Production acceptance: `/api/health` 200; unauthenticated `/mcp` 401 with Bearer challenge; OAuth metadata 200; commit SHA matches deployment; `blogfactory.io` alias is attached; relevant live asset/API markers are present.
- Rollback uses the last Ready Vercel deployment. Keep schema changes additive so rollback stays possible.

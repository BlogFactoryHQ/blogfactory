# BlogFactory Agent Context

This repo is BlogFactory: an AI-assisted content operations platform for generating, managing, scheduling, and publishing blog posts across connected sites.

## Read First

- `README.md` has setup, stack, environment variables, and deployment notes.
- `UI_UX.md` has the current product UX rules, white device-console direction, and input-affordance rules.
- Prefer the existing app patterns over new abstractions. Keep diffs small.
- When the user asks to push, ship, merge, or otherwise finish GitHub work, do it directly instead of asking whether to open a PR, push a branch, or merge. Only stop for missing credentials, failing checks that need product judgment, or destructive operations that were not requested.

## Stack

- Root uses npm workspaces: `web` and `server`.
- Frontend: React 18, Vite, TailwindCSS, shadcn/ui-style components.
- Backend: Hono TypeScript app, Bun for local backend dev.
- Database: PostgreSQL with Drizzle ORM migrations.
- Storage: S3-compatible storage, commonly Cloudflare R2.
- Deploy: Vercel serves `web/dist` and routes `/api/*` to `api/index.ts`.

## Project Map

```text
api/index.ts                 Vercel serverless entrypoint into server/src/index.ts
server/src/index.ts          Hono backend app
server/src/routes/           API routes: auth, posts, feeds, sites, settings, jobs, etc.
server/src/services/         Content generation, publishing, storage, scheduler, indexing
server/src/db/schema.ts      Drizzle schema
server/src/db/migrations/    SQL migrations
web/src/App.tsx              Frontend routes
web/src/pages/               Main app screens
web/src/components/          Reusable UI and feature components
web/src/hooks/               React Query hooks and app state hooks
web/src/lib/api.ts           Frontend API client
web/src/lib/url-validation.ts URL helpers and source validation
```

## Product Model

- Users connect one or more sites/domains.
- Users create content from URLs, PDFs, raw text, YouTube videos, or scheduled sources.
- Content sources include RSS, YouTube channels, Reddit, Hacker News, GitHub, Lemmy, and Lobsters.
- Personas/brand voice control writing style.
- Jobs track async generation progress.
- Posts can be edited, bulk-managed, and pushed to publishing integrations.
- Settings hold article defaults, internal linking, image generation, models, API keys, and brand context.

## MCP Status — 2026-08-20

- The deployed `/mcp` endpoint is protected and site-scoped. Personal `bf_mcp_` tokens are hashed, shown once, and limited to the creating user's selected sites.
- Production OAuth is live through WorkOS AuthKit Standalone Connect. The resource is `https://blogfactory.io/mcp`, CIMD and DCR are enabled, and consent binds one active site into `urn:blogfactory:site_id`. New connections can receive `content:read`, `drafts:write`, and `publish:draft` after issuer, audience, signature, user, site, approval, ownership, and revocation checks pass.
- The active catalog has 16 tools: 13 readers plus `generate_draft`, `update_draft`, and `push_to_cms_draft`. The readers include compact Search Console dashboard, insights, URL inspection, sitemap health, and analytics tools. CMS delivery is hardcoded to draft mode. Do not add live publish, delete, bulk, credential, or admin MCP tools without a separate product and security decision. Start MCP work with `docs/mcp.md`, then trace `server/src/mcp/`, `server/src/services/mcp-*`, and the related migrations.

## UI Rules

- Use `BywordPageShell`, `BywordCard`, `SectionHeader`, and existing shadcn-style primitives before adding new surfaces.
- The default app theme is white BlogFactory Device Console: off-white workspace, white panels, graphite text, pale gray hairlines, TE-style blue links, orange primary actions, black secondary controls, and green/red/yellow status accents.
- Keep the factory identity subtle through assembly labels, rails, panel dividers, status language, dense tables, and technical drawing textures. Do not bring back the dark retro/pixel theme unless explicitly requested.
- URL/domain fields should use `InputAffordance` and helpers from `web/src/lib/url-validation.ts`.
- Prefer affordance and short helper text over long instructions.
- Do not add fake controls. If a search/command/control is visible, it must work.
- Keep operational screens dense, calm, and task-focused. No landing-page treatment inside the app.
- UI-only theme work should stay mostly in `web/src/index.css`, Tailwind tokens, shadcn-style primitives, and `web/src/components/layout/BywordSurface.tsx`; touch page-specific classes only when they bypass the shared system.
- Maintain compact radii, crisp borders, readable focus states, and responsive long-text wrapping.

## Commands

```bash
npm run dev                 # backend + frontend
npm run dev --workspace=web # frontend only
npm run dev --workspace=server
npm run build               # frontend production build
npm run test --workspace=web
npm run db:migrate --workspace=server
npm run db:generate --workspace=server
```

## Known Check Notes

- `npm run build` is the primary production check.
- `npm run test --workspace=web` runs the frontend test suite.
- Full `npm run lint --workspace=web` currently has existing repo-wide debt, mostly `no-explicit-any` and hook dependency warnings. Do not treat unrelated lint failures as caused by your change without checking the diff.

## Implementation Defaults

- Keep backend API shapes and database schema stable unless the task explicitly requires a migration.
- Do not add dependencies for small UI/helpers.
- Use existing routes, hooks, and API client patterns.
- For frontend changes, verify `npm run build` and the smallest relevant test command.
- For non-trivial helper logic, leave a focused test.
- If local API proxy calls return `HTTP 500` because the backend or environment is unavailable, do not block UI-only work on that. Verify build/tests and note backend-dependent routes separately.

# BlogFactory Agent Context

This repo is BlogFactory: an AI-assisted content operations platform for generating, managing, scheduling, and publishing blog posts across connected sites.

## Read First

- `README.md` has setup, stack, environment variables, and deployment notes.
- `UI_UX.md` has the current product UX rules and the input-affordance direction.
- Prefer the existing app patterns over new abstractions. Keep diffs small.

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

## UI Rules

- Use `BywordPageShell`, `BywordCard`, `SectionHeader`, and existing shadcn-style primitives before adding new surfaces.
- URL/domain fields should use `InputAffordance` and helpers from `web/src/lib/url-validation.ts`.
- Prefer affordance and short helper text over long instructions.
- Do not add fake controls. If a search/command/control is visible, it must work.
- Keep operational screens dense, calm, and task-focused. No landing-page treatment inside the app.

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

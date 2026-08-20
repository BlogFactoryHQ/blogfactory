# BlogFactory

AI-assisted content operations for generating, reviewing, scheduling, and publishing blog posts across connected sites.

[Open BlogFactory](https://blogfactory.io) · [Documentation](docs/README.md)

## What it does

- Creates article drafts from URLs, documents, raw text, YouTube, and editorial feeds.
- Keeps writing style, site settings, SEO review, images, and publishing destinations in one workspace.
- Schedules feeds and background work while keeping publication under editorial control.
- Provides site-scoped MCP access for editorial inspection, draft generation/editing, and CMS draft delivery.

## Architecture

| Layer | Technology |
| --- | --- |
| Web app | React, Vite, Tailwind CSS |
| API | Hono and TypeScript |
| Data | PostgreSQL with Drizzle ORM |
| Storage | S3-compatible storage, including Cloudflare R2 |
| Delivery | Vercel with Cloudflare and GitHub Actions background ticks |

```text
web/       React application
server/    API, content services, jobs, and database access
api/       Vercel serverless entrypoint
docs/      Operational guides and historical decision records
```

## Local setup

Requires Node.js 22, Bun, PostgreSQL, and S3-compatible storage.

```bash
git clone https://github.com/BoraGkc/blogfactory.git
cd blogfactory
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

The frontend runs at `http://localhost:8080` and proxies `/api/*` and `/mcp` to the local backend.

## Verify a change

```bash
npm run build
npm run test --workspace=web
npm run test:server
git diff --check
```

## Repository guide

- [Operations and deployment](docs/operations.md)
- [MCP pilot and OAuth](docs/mcp.md)
- [RSS scheduler](docs/rss-scheduler.md)
- [Documentation index](docs/README.md)
- [UI system](UI_UX.md)
- [Agent and implementation rules](AGENTS.md)

This is a private product repository. No open-source license or public contribution policy is implied.

# BlogFactory

BlogFactory is an agent control plane for multi-site content operations. Codex, ChatGPT, and other MCP clients can generate and inspect work; the web app remains the place to monitor runs, review revisions, resolve blockers, manage destinations, and approve CMS draft delivery.

[Website](https://blogfactory.io) · [Open BlogFactory](https://app.blogfactory.io) · [Documentation](docs/README.md) · [MCP guide](docs/mcp.md)

## Product model

```text
source -> generation job -> BlogFactory draft -> review/preflight -> CMS draft
```

- **MCP is the work layer:** site-scoped reads, draft generation and editing, Search Console analysis, review packets, and CMS draft delivery.
- **Web is the control layer:** operational digest, action queue, run diagnostics, content management, sources, integrations, settings, and an audit trail.
- **The MCP Review Card is the approval layer:** revision summary, preflight checks, destination selection, explicit confirmation, and conflict-safe CMS draft delivery inside supported clients.
- **The safety boundary is draft-only:** there is no MCP live-publish, delete, bulk-mutation, credential, or admin tool.

## Web surfaces

| Area | Route | Purpose |
| --- | --- | --- |
| Overview | `https://app.blogfactory.io/` | Attention counts, runs, 30-day outcomes, Search Growth, connections, and agent activity |
| Create Content | `/create` | Manual article, campaign, and programmatic generation fallback |
| Review Queue | `/review` | Prioritized blockers, requested changes, stale approvals, warnings, and draft review |
| Runs | `/runs` | Generation queue, progress, errors, results, and retry controls |
| Search Growth | `/overview/growth` | Search Console monitoring, optimization, indexing, and internal links |
| Sources | `/sources/*` | RSS, campaigns, and batch import |
| Content | `/library/*` | Content inventory and image gallery; `/library` is retained as the technical URL |
| Control | `/control/*` | MCP connections, integrations, sites, brand voice, article settings, and usage |

The removed News surface and legacy operation routes are not part of the current navigation.

## MCP

The hosted Streamable HTTP endpoint is `https://blogfactory.io/mcp`. It supports WorkOS browser OAuth and site-scoped personal connection tokens with three scopes: `content:read`, `drafts:write`, and `publish:draft`.

The server publishes an exact 21-tool catalog. The control-plane tools are:

- `get_workspace_digest` — the same operational summary used by Overview.
- `list_action_items` — the same classification and priority order used by Review Queue.
- `review_post` — the shared revision/preflight packet and MCP Review Card resource.

See [docs/mcp.md](docs/mcp.md) for the complete catalog, connection commands, OAuth boundary, and review workflow.

## Architecture

| Layer | Technology |
| --- | --- |
| Web app | React 18, Vite, Tailwind CSS, React Query |
| MCP App | `@modelcontextprotocol/ext-apps`, built as a separate inline Vite entry |
| API and MCP | Hono and TypeScript |
| Data | PostgreSQL with Drizzle ORM and additive migrations |
| Storage | S3-compatible storage, commonly Cloudflare R2 |
| Delivery | Vercel with Cloudflare and GitHub Actions background drains |

```text
web/                         React application and MCP Review Card
server/src/routes/           Web API routes
server/src/mcp/              MCP transport, contracts, tools, OAuth, and app resource
server/src/services/         Shared content, control-plane, publishing, and ledger services
server/src/db/migrations/    Additive PostgreSQL migrations
api/                         Vercel serverless entrypoint
docs/                        Current operations plus historical decision records
```

Web and MCP share the control-plane services and contracts. They do not maintain separate action-item classification, review preflight, or publishing implementations. Authenticated MCP calls and important web mutations write sanitized `operation_events` records; the existing scheduler removes them after 30 days.

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

The frontend runs at `http://localhost:8080`; Hono runs at `http://localhost:3000`. Vite proxies `/api/*` and `/mcp` to the backend.

## Verification

```bash
npm run build
npm run typecheck
npm run test --workspace=web
npm run test:server
npm run test:postgres
git diff --check
```

Production acceptance also checks `/api/health` = 200, unauthenticated `/mcp` = 401 Bearer, OAuth protected-resource metadata = 200, the exact 21-tool catalog, and the authenticated generate → job → review → CMS draft workflow.

## Repository guide

- [Operations and deployment](docs/operations.md)
- [MCP and OAuth](docs/mcp.md)
- [RSS scheduler](docs/rss-scheduler.md)
- [Documentation index](docs/README.md)
- [UI system](UI_UX.md)
- [Agent and implementation rules](AGENTS.md)

This is a private product repository. No open-source license or public contribution policy is implied.

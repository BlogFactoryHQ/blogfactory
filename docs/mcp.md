# MCP and OAuth

BlogFactory exposes a site-scoped Streamable HTTP endpoint at `https://blogfactory.io/mcp`. It is the work layer for approved editorial operations: reading, generation, revision-aware editing, Search Console diagnosis, review, and CMS draft delivery. It cannot publish live, delete, bulk-mutate, administer accounts, or expose credentials.

## Current production status

Verified on 2026-08-22:

- `GET /mcp` without authentication returns HTTP 401 and a Bearer challenge.
- `GET /.well-known/oauth-protected-resource` returns HTTP 200 and advertises `https://blogfactory.io/mcp`.
- WorkOS browser OAuth and personal `bf_mcp_` connection tokens are supported.
- Scopes are `content:read`, `drafts:write`, and `publish:draft`.
- Protocol version is `2025-11-25`; BlogFactory MCP server version is `0.4.0`.
- The exact active catalog contains 19 tools and is asserted by server tests.

## Tool catalog

| Tool | Scope | Purpose |
| --- | --- | --- |
| `whoami` | `content:read` | Return the authenticated connection identity and allowed sites |
| `list_sites` | `content:read` | List allowed BlogFactory sites |
| `list_personas` | `content:read` | List safe persona metadata |
| `list_publish_targets` | `content:read` | List non-secret CMS draft destinations |
| `list_posts` | `content:read` | Find site-scoped content |
| `get_post` | `content:read` | Read one compact post projection |
| `generate_draft` | `drafts:write` | Start asynchronous draft generation |
| `get_job` | `content:read` | Read safe generation progress and result IDs |
| `get_workspace_digest` | `content:read` | Return the same operational digest used by Overview |
| `list_action_items` | `content:read` | Return the same prioritized work queue used by Review Queue |
| `review_post` | `content:read` | Return the shared revision, preflight, destination, and permission packet |
| `get_search_console_dashboard` | `content:read` | Read synchronized Search Console status and totals |
| `get_search_console_insights` | `content:read` | Read trends, opportunities, pages, and queries |
| `update_draft` | `drafts:write` | Update title/content with optimistic locking |
| `push_to_cms_draft` | `publish:draft` | Deliver one reviewed version to a CMS as a draft |
| `inspect_search_console_url` | `content:read` | Inspect one URL using the connected Search Console service |
| `batch_inspect_search_console_urls` | `content:read` | Inspect a bounded URL batch |
| `list_search_console_sitemaps` | `content:read` | Read Search Console sitemap health |
| `query_search_console_analytics` | `content:read` | Query bounded synchronized analytics |

The web Connections surface reads this catalog from authenticated `GET /api/mcp/capabilities`; tool counts and scope lists must not be hardcoded in UI code.

## Recommended workflow

```text
generate_draft
  -> get_job
  -> review_post
  -> explicit destination and user approval
  -> push_to_cms_draft
```

- Generation returns a job ID and does not wait for provider completion.
- `review_post` uses the same `ReviewPacket` service as the web review panel.
- `update_draft` and `push_to_cms_draft` require the current `expected_updated_at` value. A version conflict writes nothing and requires a refresh.
- Revision, SEO, and destination failures block CMS draft delivery. Cover-image and publishing-metadata warnings do not.
- Multiple destinations require explicit selection.
- Repeating the same post/version/destination delivery is deduplicated and does not create a second external draft.

## Review Card MCP App

`review_post` links the `ui://blogfactory/review-post.html` resource built from the standalone `web/src/mcp-review/` Vite entry with `@modelcontextprotocol/ext-apps`.

The card displays title and summary, provenance, editorial state, revision and change summary, preflight checks, BlogFactory link, destination selection, and the explicit CMS draft action. It is read-only without `publish:draft`, disables delivery for blockers, sends the current version, and shows external edit URLs or provider errors after delivery.

The card does not embed the main BlogFactory Router/Auth/React Query app and does not edit content, restore revisions, or change editorial state. MCP clients without Apps support receive the same structured `review_post` output as text.

## Personal connection token

1. Open **Control → MCP Connections** in BlogFactory.
2. Create a site-scoped connection token and save it when shown; it is stored hashed and cannot be displayed again.
3. Store it as `BLOGFACTORY_MCP_TOKEN` in the client environment.
4. Add the server:

```bash
codex mcp add blogfactory \
  --url https://blogfactory.io/mcp \
  --bearer-token-env-var BLOGFACTORY_MCP_TOKEN
```

Use `http://localhost:8080/mcp` for local development.

## OAuth

OAuth fails closed unless `WORKOS_AUTHKIT_ISSUER`, `MCP_RESOURCE_URL`, and `WORKOS_API_KEY` are configured together. Production uses `https://blogfactory.io/mcp` as the resource indicator and `https://blogfactory.io/mcp/oauth` as the login URI.

Consent lists only the authenticated user's sites and binds the selected site to `urn:blogfactory:site_id`. The server verifies signature, issuer, `/mcp` audience, user and site claims, approval, ownership, and connection revocation before granting scopes.

```bash
codex mcp add blogfactory --url https://blogfactory.io/mcp
codex mcp login blogfactory
```

## Shared control plane and audit

MCP and web use `server/src/services/control-plane.ts` for `WorkspaceDigest`, `ActionItem`, and `ReviewPacket`. Do not reimplement classification or preflight inside a tool.

Every authenticated tool call writes a sanitized `operation_events` lifecycle record. The ledger may keep origin, safe client name, action, object reference, status, duration, stable error code, and a small allowlisted metadata object. It must never store article bodies, prompt/source values, provider response bodies, tokens, keys, or credentials. Records expire after 30 days and the existing all-task cron drain purges them.

## Verification

Use a disposable PostgreSQL database for integration tests:

```bash
npm run test:server
npm run test:postgres
```

Run the live workflow only against a prepared account:

```bash
MCP_PILOT_URL=https://blogfactory.io/mcp \
MCP_PILOT_TOKEN=bf_mcp_REPLACE_WITH_SECRET \
npm run test:mcp:pilot
```

Required client acceptance covers OAuth, discovery of exactly 19 tools, `review_post` rendering, version conflict handling, explicit approval, and idempotent CMS draft delivery in Codex and ChatGPT.

The original research and implementation sequence remains in the [historical MCP roadmap](../BLOGFACTORY_MCP_ROADMAP.md).

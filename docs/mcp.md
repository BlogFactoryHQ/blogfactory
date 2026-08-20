# MCP pilot and OAuth

BlogFactory exposes a site-scoped MCP endpoint at `https://blogfactory.io/mcp` for approved editorial work. It can inspect content, generate and edit BlogFactory drafts, and send reviewed posts to a connected CMS as drafts. It cannot publish live, delete, bulk-mutate, administer accounts, or expose credentials.

## Current deployment status

Verified on 2026-08-20: the production endpoint is live and rejects unauthenticated requests with `401 Bearer`. Personal connection tokens and WorkOS browser OAuth are both supported. The protected-resource metadata endpoint advertises `https://blogfactory.io/mcp` with `content:read`, `drafts:write`, and `publish:draft`; CIMD and DCR are enabled for client compatibility.

The active catalog contains ten tools: `whoami`, `list_sites`, `list_personas`, `list_publish_targets`, `list_posts`, `get_post`, `generate_draft`, `get_job`, `update_draft`, and `push_to_cms_draft`. Generation is asynchronous and can consume the user's configured provider budget. Draft updates require `expected_updated_at`; CMS delivery is hardcoded to draft mode and preserves publishing idempotency.

## Personal connection token

1. In BlogFactory, open **Settings → MCP**.
2. Create a site-scoped connection token and save it when shown.
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

Consent lists only the authenticated user's active sites and binds the selected site to `urn:blogfactory:site_id`. The server verifies the WorkOS signature, issuer, `/mcp` audience, user and site claims, account approval, site ownership, and connection revocation before granting `content:read`, `drafts:write`, and `publish:draft`.

```bash
codex mcp add blogfactory --url https://blogfactory.io/mcp
codex mcp login blogfactory
```

## Verification

Run the pilot smoke check only against a prepared pilot account:

```bash
MCP_PILOT_URL=https://blogfactory.io/mcp \
MCP_PILOT_TOKEN=bf_mcp_REPLACE_WITH_SECRET \
npm run test:mcp:pilot
```

The full research and implementation history is retained in the [MCP roadmap](../BLOGFACTORY_MCP_ROADMAP.md).

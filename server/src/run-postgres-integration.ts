import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.POSTGRES_INTEGRATION_ALLOW_WRITES !== "1") {
  throw new Error("POSTGRES_INTEGRATION_ALLOW_WRITES=1 is required; use a disposable database because this test runs migrations and writes fixtures");
}

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationFiles = readdirSync(new URL("./db/migrations", import.meta.url)).filter((name) => name.endsWith(".sql"));
const userId = randomUUID();
const otherUserId = randomUUID();

async function migrate() {
  const child = Bun.spawn([process.execPath, "run", "src/db/migrate.ts"], {
    cwd: serverRoot,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await child.exited, 0, "database migration failed");
}

await migrate();
const sql = postgres(databaseUrl, { max: 4 });

try {
  const before = await sql<{ filename: string; applied_at: Date }[]>`
    SELECT filename, applied_at FROM schema_migrations ORDER BY filename
  `;
  assert.equal(before.length, migrationFiles.length, "migration ledger is incomplete");

  await migrate();
  const after = await sql<{ filename: string; applied_at: Date }[]>`
    SELECT filename, applied_at FROM schema_migrations ORDER BY filename
  `;
  assert.deepEqual(after, before, "repeat migration changed the ledger");

  const columns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'feeds' AND column_name IN ('run_claim_token', 'run_lease_until', 'run_active_count')
  `;
  assert.equal(columns.length, 3, "feed lease columns are missing");

  const feedId = randomUUID();
  const siteId = randomUUID();
  const restrictedSiteId = randomUUID();
  const otherSiteId = randomUUID();
  await sql`INSERT INTO users (id, email, password_hash, approval_status) VALUES (${userId}, ${`lease-${userId}@example.com`}, 'test', 'approved')`;
  await sql`INSERT INTO users (id, email, password_hash, approval_status) VALUES (${otherUserId}, ${`other-${otherUserId}@example.com`}, 'test', 'approved')`;
  await sql`INSERT INTO feeds (id, user_id, name, source_url) VALUES (${feedId}, ${userId}, 'Lease test', 'https://example.com/feed.xml')`;
  await sql`INSERT INTO sites (id, user_id, name, domain) VALUES (${siteId}, ${userId}, 'MCP test', 'mcp-test.example.com')`;
  await sql`INSERT INTO sites (id, user_id, name, domain) VALUES (${restrictedSiteId}, ${userId}, 'Restricted MCP test', 'restricted-mcp-test.example.com')`;
  await sql`INSERT INTO sites (id, user_id, name, domain) VALUES (${otherSiteId}, ${otherUserId}, 'Other user MCP test', 'other-mcp-test.example.com')`;

  const revisionPostId = randomUUID();
  await sql`
    INSERT INTO posts (id, user_id, site_id, title, content, status, source_type, model_id)
    VALUES (${revisionPostId}, ${userId}, ${siteId}, 'Revision one', '# Revision one', 'draft', 'raw_text', 'integration/model')
  `;
  const initialRevisions = await sql<{ id: string; revision_number: number }[]>`
    SELECT id, revision_number FROM post_revisions WHERE post_id = ${revisionPostId} ORDER BY revision_number
  `;
  assert.equal(initialRevisions.length, 1, "post insert did not create an initial revision");
  const [{ updated_at: revisionUpdatedAt }] = await sql<{ updated_at: Date }[]>`SELECT updated_at FROM posts WHERE id = ${revisionPostId}`;
  const {
    listPostRevisions,
    restorePostRevision,
    setPostEditorialState,
    updatePostWithRevision,
  } = await import("./services/post-revisions.js");
  const second = await updatePostWithRevision({
    userId,
    postId: revisionPostId,
    expectedUpdatedAt: revisionUpdatedAt,
    source: "save",
    changes: { title: "Revision two", content: "# Revision two" },
  });
  assert.equal(second.revision?.revisionNumber, 2, "post update did not create revision two");
  const unchanged = await updatePostWithRevision({
    userId,
    postId: revisionPostId,
    expectedUpdatedAt: second.post.updatedAt,
    source: "save",
    changes: { title: "Revision two", content: "# Revision two" },
  });
  assert.equal(unchanged.changed, false, "unchanged save was treated as a new revision");
  assert.equal((await listPostRevisions(userId, revisionPostId)).length, 2, "unchanged save created a duplicate revision");
  const approved = await setPostEditorialState({
    userId,
    postId: revisionPostId,
    state: "approved",
    expectedRevisionId: second.revision!.id,
  });
  assert.equal(approved.post.approvedRevisionId, second.revision!.id, "approval was not bound to the current revision");
  const third = await updatePostWithRevision({
    userId,
    postId: revisionPostId,
    expectedUpdatedAt: approved.post.updatedAt,
    source: "mcp",
    changes: { content: "# Revision three" },
  });
  assert.equal(third.post.editorialState, "draft", "editing an approved revision did not reset editorial state");
  const restored = await restorePostRevision({
    userId,
    postId: revisionPostId,
    revisionId: initialRevisions[0].id,
    expectedUpdatedAt: third.post.updatedAt,
  });
  assert.equal(restored.revision?.revisionNumber, 4, "restore did not create a new revision");
  assert.equal(restored.post.title, "Revision one", "restore did not recover the selected snapshot");
  await assert.rejects(() => listPostRevisions(otherUserId, revisionPostId), /not found/i, "cross-user revision history leaked");

  const {
    createMcpAccessToken,
    listMcpAccessTokens,
    markMcpAccessTokenUsed,
    revokeMcpAccessToken,
  } = await import("./services/mcp-access-tokens.js");
  const { authenticateMcpBearer } = await import("./mcp/auth.js");
  await assert.rejects(() => createMcpAccessToken(userId, {
    name: "Wrong site",
    scopes: ["content:read"],
    siteIds: [otherSiteId],
    expiresAt: null,
  }), /not found/i, "cross-site MCP token creation succeeded");

  const createdToken = await createMcpAccessToken(userId, {
    name: "Integration token",
    scopes: ["content:read"],
    siteIds: [siteId],
    expiresAt: null,
  });
  assert.ok(createdToken.secret.startsWith("bf_mcp_"));
  assert.equal(JSON.stringify(await listMcpAccessTokens(userId)).includes(createdToken.secret), false, "token secret leaked from list");
  const [storedToken] = await sql<{ token_hash: string; last_used_at: Date | null }[]>`
    SELECT token_hash, last_used_at FROM mcp_access_tokens WHERE id = ${createdToken.token.id}
  `;
  assert.notEqual(storedToken.token_hash, createdToken.secret, "raw MCP token was stored");
  assert.equal(storedToken.last_used_at, null);

  const principal = await authenticateMcpBearer(`Bearer ${createdToken.secret}`);
  assert.equal(principal?.userId, userId);
  assert.deepEqual([...principal!.siteIds], [siteId]);
  assert.ok((await sql<{ last_used_at: Date | null }[]>`
    SELECT last_used_at FROM mcp_access_tokens WHERE id = ${createdToken.token.id}
  `)[0]?.last_used_at, "MCP token last_used_at was not updated");

  const {
    authorizeMcpOAuthConnection,
    listMcpOAuthConnections,
    revokeMcpOAuthConnection,
  } = await import("./services/mcp-oauth-connections.js");
  const oauthIdentity = {
    connectionId: `app_consent_${randomUUID()}`,
    userId,
    siteId,
  };
  const oauthConnection = await authorizeMcpOAuthConnection(oauthIdentity, new Date());
  assert.ok(oauthConnection?.id, "OAuth connection was not persisted");
  assert.deepEqual(
    (await listMcpOAuthConnections(userId)).map((connection) => connection.site_id),
    [siteId],
    "OAuth connection site grant was not listed",
  );
  await revokeMcpOAuthConnection(userId, oauthConnection!.id);
  assert.equal(
    await authorizeMcpOAuthConnection(oauthIdentity, new Date()),
    undefined,
    "revoked OAuth connection was reactivated",
  );

  process.env.API_KEY_ENCRYPTION_SECRET ||= "postgres-integration-mcp-secret";
  const { encryptSecret } = await import("./services/api-keys.js");
  const { listDueSearchConsoleIntegrations, replaceSearchConsoleSnapshot } = await import("./services/search-console.js");
  const searchConsoleIntegrationId = randomUUID();
  const otherSearchConsoleIntegrationId = randomUUID();
  await sql`
    INSERT INTO search_console_integrations (id, user_id, site_id, property_url, credentials_encrypted)
    VALUES
      (${searchConsoleIntegrationId}, ${userId}, ${siteId}, 'sc-domain:mcp-test.example.com', ${encryptSecret('{"test":true}')}),
      (${otherSearchConsoleIntegrationId}, ${otherUserId}, ${otherSiteId}, 'sc-domain:other-mcp-test.example.com', ${encryptSecret('{"test":true}')})
  `;
  await sql`
    INSERT INTO search_console_metrics (user_id, site_id, date, page_url, query, clicks, impressions, ctr, position)
    VALUES
      (${userId}, ${siteId}, '2026-07-10', 'https://mcp-test.example.com/stale', 'stale', 10, 100, 0.1, 5),
      (${otherUserId}, ${otherSiteId}, '2026-07-10', 'https://other-mcp-test.example.com/private', 'private', 20, 200, 0.1, 4)
  `;
  const searchConsoleSyncedAt = new Date("2026-08-22T12:00:00.000Z");
  await replaceSearchConsoleSnapshot({
    userId,
    siteId,
    integrationId: searchConsoleIntegrationId,
    startDate: "2026-07-01",
    endDate: "2026-08-20",
    syncedAt: searchConsoleSyncedAt,
    syncMetadata: { complete_through: "2026-08-20" },
    metrics: [{
      date: "2026-08-20",
      pageUrl: "https://mcp-test.example.com/current",
      query: "current",
      clicks: 3,
      impressions: 30,
      ctr: 0.1,
      position: 3,
    }],
  });
  const refreshedSearchRows = await sql<{ date: string; query: string }[]>`
    SELECT date, query FROM search_console_metrics WHERE user_id = ${userId} AND site_id = ${siteId} ORDER BY date
  `;
  assert.deepEqual(refreshedSearchRows, [{ date: "2026-08-20", query: "current" }], "Search Console refresh retained stale opportunity rows");
  assert.equal((await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM search_console_metrics WHERE user_id = ${otherUserId} AND site_id = ${otherSiteId}`)[0]?.count, 1, "Search Console refresh crossed the tenant boundary");
  const [searchConsoleSyncState] = await sql<{ last_sync_at: Date; sync_metadata: { complete_through?: string } }[]>`
    SELECT last_sync_at, sync_metadata FROM search_console_integrations WHERE id = ${searchConsoleIntegrationId}
  `;
  assert.equal(searchConsoleSyncState.last_sync_at.toISOString(), searchConsoleSyncedAt.toISOString(), "Search Console last_sync_at was not updated");
  assert.equal(searchConsoleSyncState.sync_metadata.complete_through, "2026-08-20", "Search Console provenance was not persisted");
  assert.equal((await listDueSearchConsoleIntegrations(1, new Date("2026-08-22T13:00:00.000Z")))[0]?.id, otherSearchConsoleIntegrationId, "never-synced Search Console integration was not prioritized");
  const asOfParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const asOf = `${asOfParts.year}-${asOfParts.month}-${asOfParts.day}`;
  const canonicalParams = {
    propertyUrl: "sc-domain:mcp-test.example.com",
    asOf,
    range: 28,
    compare: true,
    searchType: "web",
    includePreliminary: false,
  };
  const canonicalCacheKey = createHash("sha256").update(`performance:${JSON.stringify(canonicalParams)}`).digest("hex");
  await sql`
    INSERT INTO search_console_query_cache (user_id, site_id, cache_key, kind, params, result, expires_at)
    VALUES (${userId}, ${siteId}, ${canonicalCacheKey}, 'performance', ${sql.json(canonicalParams)}, ${sql.json({
      range: { startDate: "2026-07-24", endDate: "2026-08-20", baselineStart: "2026-06-26", baselineEnd: "2026-07-23" },
      totals: {
        clicks: { value: 3, previous: 0, change: 3, changePercent: null },
        impressions: { value: 30, previous: 0, change: 30, changePercent: null },
        ctr: { value: 0.1, previous: 0, change: 0.1, changePercent: null },
        position: { value: 3, previous: 0, change: 3, changePercent: null },
      },
      daily: [{ date: "2026-08-20", clicks: 3, impressions: 30, ctr: 0.1, position: 3 }],
      metadata: { first_incomplete_date: "2026-08-21" },
      provenance: {
        source: "google_search_console_api", property: "sc-domain:mcp-test.example.com", scope: "site_total",
        fetched_at: "", complete_through: "2026-08-20", first_incomplete_date: "2026-08-21", data_status: "complete", cache: "live",
      },
    })}, now() + interval '1 hour')
  `;
  await assert.rejects(() => replaceSearchConsoleSnapshot({
    userId: otherUserId,
    siteId,
    integrationId: searchConsoleIntegrationId,
    startDate: "2026-07-01",
    endDate: "2026-08-20",
    syncedAt: searchConsoleSyncedAt,
    syncMetadata: {},
    metrics: [],
  }), /not found/i, "cross-user Search Console refresh succeeded");
  const { seoSourceHash } = await import("./services/seo-metadata.js");
  const { MCP_PROTOCOL_VERSION } = await import("./mcp/contracts.js");
  const { handleMcpHttpRequest } = await import("./mcp/server.js");
  const personaId = randomUUID();
  const integrationId = randomUUID();
  const restrictedIntegrationId = randomUUID();
  const postId = randomUUID();
  const jobId = randomUUID();
  const otherPostId = randomUUID();
  const otherJobId = randomUUID();
  const otherPersonaId = randomUUID();
  const otherIntegrationId = randomUUID();
  const restrictedPostId = randomUUID();
  const restrictedJobId = randomUUID();
  const poisonedPostId = randomUUID();
  const content = "# MCP integration article\n\nVisible article content.";
  const secretMarker = "MCP_SECRET_MARKER";
  const rawProviderMarker = "MCP_RAW_PROVIDER_MARKER";
  const sourceMarker = "MCP_JOB_SOURCE_MARKER";
  const crossSitePublicationMarker = "https://restricted.example.com/private-draft";
  await sql`
    INSERT INTO personas (id, user_id, name, system_prompt, language, category)
    VALUES (${personaId}, ${userId}, 'MCP Persona', ${secretMarker}, 'en', 'editorial')
  `;
  await sql`
    INSERT INTO personas (id, user_id, name, system_prompt, language, category)
    VALUES (${otherPersonaId}, ${otherUserId}, 'Other Persona', ${secretMarker}, 'en', 'editorial')
  `;
  await sql`
    INSERT INTO site_integrations (
      id, user_id, site_id, provider, display_name, credentials_encrypted, credential_hint, config, last_tested_at
    ) VALUES (
      ${integrationId}, ${userId}, ${siteId}, 'wordpress', 'MCP WordPress',
      ${encryptSecret(secretMarker)}, ${secretMarker}, ${sql.json({ secret: secretMarker })}, now()
    )
  `;
  await sql`
    INSERT INTO site_integrations (
      id, user_id, site_id, provider, display_name, credentials_encrypted
    ) VALUES (
      ${restrictedIntegrationId}, ${userId}, ${restrictedSiteId}, 'ghost', 'Restricted Ghost',
      ${encryptSecret(secretMarker)}
    )
  `;
  await sql`
    INSERT INTO site_integrations (
      id, user_id, site_id, provider, display_name, credentials_encrypted, credential_hint
    ) VALUES (
      ${otherIntegrationId}, ${otherUserId}, ${siteId}, 'ghost', 'Foreign integration',
      ${encryptSecret(secretMarker)}, ${secretMarker}
    )
  `;
  await sql`
    INSERT INTO jobs (
      id, user_id, site_id, source_type, source_value, model_id, status, current_step,
      generation_plan, result_post_ids, completed_at
    ) VALUES (
      ${jobId}, ${userId}, ${siteId}, 'url', ${sourceMarker}, 'integration/model', 'completed', 'done',
      ${sql.json({ totalDrafts: 3, prompt: secretMarker })}, ${[postId, otherPostId, restrictedPostId]}, now()
    )
  `;
  await sql`
    INSERT INTO posts (
      id, user_id, site_id, preferred_integration_id, title, content, summary, status,
      source_type, persona_id, job_id, model_id, seo_metadata
    ) VALUES (
      ${postId}, ${userId}, ${siteId}, ${integrationId}, 'MCP article', ${content}, 'Compact summary',
      'draft', 'url', ${personaId}, ${jobId}, 'integration/model',
      ${sql.json({
        version: 1,
        status: "ready",
        sourceHash: seoSourceHash("MCP article", content),
        slug: "mcp-integration-article",
        metaTitle: "MCP integration article metadata title for testing",
        metaDescription: "A sufficiently descriptive integration-test summary for the MCP read tool that remains safe and useful to connected clients.",
        primaryQuery: "mcp integration article",
        searchIntent: "informational",
        language: "en",
        provenance: {
          slug: "manual",
          metaTitle: "manual",
          metaDescription: "manual",
          primaryQuery: "manual",
          searchIntent: "manual",
          language: "manual",
        },
        manualReviewRequired: false,
        modelId: null,
        generatedAt: null,
        validationErrors: [],
        error: null,
      })}
    )
  `;
  await sql`
    INSERT INTO post_publications (
      user_id, post_id, site_id, integration_id, provider, status, response_data
    ) VALUES (
      ${userId}, ${postId}, ${siteId}, ${integrationId}, 'wordpress', 'completed',
      ${sql.json({ raw: rawProviderMarker })}
    )
  `;
  await sql`
    INSERT INTO post_publications (
      user_id, post_id, site_id, integration_id, provider, status, external_url
    ) VALUES (
      ${userId}, ${postId}, ${restrictedSiteId}, ${restrictedIntegrationId}, 'ghost', 'completed',
      ${crossSitePublicationMarker}
    )
  `;
  await sql`
    INSERT INTO posts (id, user_id, site_id, title, content, status, source_type, model_id)
    VALUES (${otherPostId}, ${otherUserId}, ${otherSiteId}, 'Other post', 'Private', 'draft', 'url', 'integration/model')
  `;
  await sql`
    INSERT INTO jobs (id, user_id, site_id, source_type, source_value, model_id)
    VALUES (${otherJobId}, ${otherUserId}, ${otherSiteId}, 'url', 'Private source', 'integration/model')
  `;
  await sql`
    INSERT INTO jobs (id, user_id, site_id, source_type, source_value, model_id)
    VALUES (${restrictedJobId}, ${userId}, ${restrictedSiteId}, 'url', 'Restricted source', 'integration/model')
  `;
  await sql`
    INSERT INTO posts (id, user_id, site_id, title, content, status, source_type, job_id, model_id)
    VALUES (
      ${restrictedPostId}, ${userId}, ${restrictedSiteId}, 'Restricted post', 'Restricted',
      'draft', 'url', ${restrictedJobId}, 'integration/model'
    )
  `;
  await sql`
    INSERT INTO posts (
      id, user_id, site_id, preferred_integration_id, title, content, status,
      source_type, persona_id, job_id, model_id
    ) VALUES (
      ${poisonedPostId}, ${userId}, ${siteId}, ${restrictedIntegrationId}, 'Poisoned references',
      'Safe owned content', 'draft', 'url', ${otherPersonaId}, ${otherJobId}, 'integration/model'
    )
  `;

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const response = await handleMcpHttpRequest(new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${createdToken.secret}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }));
    assert.equal(response.status, 200);
    return (await response.json() as any).result;
  };

  const listedSites = await callTool("list_sites", {});
  assert.deepEqual(listedSites.structuredContent.data.items.map((site: any) => site.id), [siteId], "MCP site boundary failed");
  const listedPersonas = await callTool("list_personas", {});
  assert.equal(JSON.stringify(listedPersonas).includes(secretMarker), false, "persona prompt leaked");
  const listedTargets = await callTool("list_publish_targets", { site_id: siteId });
  assert.equal(JSON.stringify(listedTargets).includes(secretMarker), false, "integration secret metadata leaked");
  assert.deepEqual(listedTargets.structuredContent.data.items.map((target: any) => target.id), [integrationId], "foreign integration leaked");
  const listedPosts = await callTool("list_posts", { site_id: siteId });
  assert.equal(JSON.stringify(listedPosts).includes("Visible article content"), false, "post list leaked content");
  const poisonedListItem = listedPosts.structuredContent.data.items.find((post: any) => post.id === poisonedPostId);
  assert.equal(poisonedListItem.persona_id, null, "foreign persona id leaked");
  assert.equal(poisonedListItem.job_id, null, "foreign job id leaked");
  const readPost = await callTool("get_post", { post_id: postId });
  assert.equal(JSON.stringify(readPost).includes(rawProviderMarker), false, "publication provider response leaked");
  assert.equal(JSON.stringify(readPost).includes(crossSitePublicationMarker), false, "cross-site publication leaked");
  const seoReadyPosts = await callTool("list_posts", { site_id: siteId, seo_status: "ready" });
  assert.deepEqual(seoReadyPosts.structuredContent.data.items.map((post: any) => post.id), [postId], "SEO filtering diverged from get_post");
  assert.equal(readPost.structuredContent.data.seo.status, "ready");
  const digest = await callTool("get_workspace_digest", { site_id: siteId });
  assert.equal(digest.structuredContent.data.workspace.site.id, siteId, "workspace digest crossed the site boundary");
  assert.equal(digest.structuredContent.data.workspace.search_growth.totals.clicks.value, 3, "workspace digest did not use canonical Search Console totals");
  assert.equal(digest.structuredContent.data.workspace.connections.cms.connected, 1, "workspace digest missed the usable CMS destination");
  assert.ok(digest.structuredContent.data.workspace.recent_outputs.some((post: any) => post.id === postId), "workspace digest missed a recent output");
  const actionQueue = await callTool("list_action_items", { site_id: siteId, limit: 50, page: 1 });
  const postAction = actionQueue.structuredContent.data.items.find((item: any) => item.id === postId);
  assert.ok(postAction, "action queue missed a draft warning");
  assert.equal(postAction.severity, "warning", "non-blocking draft checks became blockers");
  assert.equal(postAction.destination_name, "MCP WordPress", "action queue omitted CMS routing details");
  const review = await callTool("review_post", { post_id: postId });
  assert.equal(review.structuredContent.data.review.permissions.can_push_cms_draft, false, "read-only MCP token received CMS draft permission");
  assert.equal(review.structuredContent.data.review.destinations[0].credential_status, "usable", "review packet missed credential readiness");
  assert.equal(review.structuredContent.data.review.preflight.has_blockers, false, "review packet blocked warning-only delivery");
  const readPoisonedPost = await callTool("get_post", { post_id: poisonedPostId });
  assert.equal(readPoisonedPost.structuredContent.data.persona, null, "foreign persona leaked from post");
  assert.equal(readPoisonedPost.structuredContent.data.publishing.preferred_integration_id, null, "foreign integration id leaked");
  const readJob = await callTool("get_job", { job_id: jobId });
  assert.equal(JSON.stringify(readJob).includes(sourceMarker), false, "job source leaked");
  assert.equal(JSON.stringify(readJob).includes(secretMarker), false, "job generation plan leaked");
  assert.deepEqual(readJob.structuredContent.data.result_post_ids, [postId], "foreign or restricted result post ids leaked");
  for (const [name, args] of [
    ["list_publish_targets", { site_id: restrictedSiteId }],
    ["get_workspace_digest", { site_id: restrictedSiteId }],
    ["list_action_items", { site_id: restrictedSiteId, limit: 20, page: 1 }],
    ["get_post", { post_id: restrictedPostId }],
    ["review_post", { post_id: restrictedPostId }],
    ["get_job", { job_id: restrictedJobId }],
    ["get_post", { post_id: otherPostId }],
    ["get_job", { job_id: otherJobId }],
  ] as const) {
    const denied = await callTool(name, args);
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.error.code, "not_found");
  }

  const systemJobEvents = await sql<{ action: string; status: string }[]>`
    SELECT action, status FROM operation_events WHERE user_id = ${userId} AND object_id = ${jobId} AND origin = 'system'
  `;
  assert.deepEqual(systemJobEvents, [{ action: "job.completed", status: "succeeded" }], "job completion was not recorded in the operation ledger");
  const mcpEvents = await sql<{ site_id: string | null; metadata: unknown }[]>`
    SELECT site_id, metadata FROM operation_events WHERE user_id = ${userId} AND origin = 'mcp'
  `;
  assert.ok(mcpEvents.length >= 10, "authenticated MCP calls were not recorded");
  assert.equal(mcpEvents.some((event) => event.site_id === otherSiteId), false, "MCP ledger crossed the user boundary");
  assert.equal(JSON.stringify(mcpEvents).includes(secretMarker), false, "operation ledger stored sensitive data");
  await sql`
    INSERT INTO operation_events (user_id, site_id, origin, action, status, expires_at)
    VALUES (${userId}, ${siteId}, 'system', 'retention.test', 'succeeded', now() - interval '1 minute')
  `;
  const { purgeExpiredOperationEvents } = await import("./services/operation-events.js");
  assert.ok(await purgeExpiredOperationEvents() >= 1, "expired operation events were not purged");

  await revokeMcpAccessToken(userId, createdToken.token.id);
  assert.equal(
    await markMcpAccessTokenUsed(createdToken.token.id, new Date()),
    false,
    "revoked MCP token usage update succeeded",
  );
  assert.equal(await authenticateMcpBearer(`Bearer ${createdToken.secret}`), null, "revoked MCP token authenticated");

  const expiry = new Date(Date.now() + 60_000);
  const expiringToken = await createMcpAccessToken(userId, {
    name: "Expiring integration token",
    scopes: ["content:read"],
    siteIds: [siteId],
    expiresAt: expiry,
  });
  assert.equal(
    await authenticateMcpBearer(`Bearer ${expiringToken.secret}`, undefined, new Date(expiry.getTime() + 1)),
    null,
    "expired MCP token authenticated",
  );

  process.env.OPENROUTER_WEBHOOK_SECRET = "integration-secret";
  const { webhooksRoutes } = await import("./routes/webhooks.js");
  const webhook = await webhooksRoutes.request("/openrouter", {
    method: "POST",
    headers: { authorization: "Bearer integration-secret", "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId, model: "integration/model", prompt_tokens: 1, completion_tokens: 2 }),
  });
  assert.equal(webhook.status, 200, "database-backed webhook persistence failed");
  assert.equal((await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM generation_logs WHERE user_id = ${userId}`)[0]?.count, 1);

  const { claimFeedRun, releaseFeedRun } = await import("./services/feed-run-lease.js");
  const now = new Date("2026-07-12T12:00:00.000Z");
  const claims = await Promise.all([
    claimFeedRun({ feedId, userId, token: randomUUID(), slots: 3, now }),
    claimFeedRun({ feedId, userId, token: randomUUID(), slots: 3, now }),
  ]);
  const winner = claims.find((claim) => claim !== null);
  assert.ok(winner, "no feed lease was claimed");
  assert.equal(claims.filter(Boolean).length, 1, "concurrent feed lease was claimed more than once");
  assert.equal(winner.activeCount, 3);

  const repeated = await claimFeedRun({ feedId, userId, token: winner.token, slots: 7, now: new Date(now.getTime() + 1000) });
  assert.equal(repeated?.activeCount, 3, "idempotent claim changed its active slot count");
  assert.equal(await releaseFeedRun({ feedId, userId, token: winner.token, slots: 3 }), 0);

  const expiredToken = randomUUID();
  await sql`
    UPDATE feeds
    SET run_claim_token = ${expiredToken}, run_lease_until = ${new Date(now.getTime() - 1000)}, run_active_count = 1
    WHERE id = ${feedId}
  `;
  const reclaimed = await claimFeedRun({ feedId, userId, token: randomUUID(), slots: 2, now });
  assert.equal(reclaimed?.activeCount, 2, "expired feed lease was not reclaimed");
  assert.equal(await releaseFeedRun({ feedId, userId, token: reclaimed!.token, slots: 2 }), 0);

  const [released] = await sql<{ run_claim_token: string | null; run_lease_until: Date | null; run_active_count: number }[]>`
    SELECT run_claim_token, run_lease_until, run_active_count FROM feeds WHERE id = ${feedId}
  `;
  assert.deepEqual(released, { run_claim_token: null, run_lease_until: null, run_active_count: 0 });
} finally {
  try {
    await sql`DELETE FROM users WHERE id IN (${userId}, ${otherUserId})`;
  } finally {
    await sql.end();
  }
}

console.log("PostgreSQL migration and feed lease integration check passed");
process.exit(0);

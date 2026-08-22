import { Hono } from "hono";
import { waitUntil } from "@vercel/functions";
import { db } from "../db/index.js";
import { posts, personas, imageAssets, imageGenerationRequests, campaigns, jobs, sites, feeds, siteIntegrations } from "../db/schema.js";
import { eq, and, inArray, desc, asc, sql, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteFile } from "../services/image-storage.js";
import { ExpectedPostVersionError, getPostPublications, publishPost, ReviewRequiredError, SavedRevisionRequiredError, SeoMetadataNotReadyError } from "../services/publishing.js";
import { confirmManualSeoMetadata, drainSeoMetadata, duplicateSeoSlugs, enqueueSeoMetadata, readySeoMetadataForArticle, saveManualSeoMetadata, seoMetadata, seoSourceHashMatches, seoStatusForArticle, SEO_LIMITS } from "../services/seo-metadata.js";
import { cleanGeneratedPostContent, cleanPostTitle } from "../services/post-cleanup.js";
import { reflowInlineImages } from "../services/image-placement.js";
import { attachPostImage } from "../services/image-post-attachments.js";
import { normalizeFeedEditorialDefaults } from "../services/feed-routing.js";
import { optionalEnum, readJsonObject, requiredString, requiredStringArray } from "../http/error-contract.js";
import { pagination, parsePostListQuery } from "./list-query.js";
import {
  EDITORIAL_STATES,
  PostNotEditableError,
  PostRevisionNotFoundError,
  PostVersionConflictError,
  currentPostRevision,
  listPostRevisions,
  restorePostRevision,
  serializePostRevision,
  setPostEditorialState,
  updatePostWithRevision,
  type EditorialState,
} from "../services/post-revisions.js";
import { getReviewPacket } from "../services/control-plane.js";

export const postsRoutes = new Hono();

postsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const ids = c.req.query("ids")?.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100) || [];
  const query = parsePostListQuery(c.req.query());
  const conditions: SQL[] = [eq(posts.userId, userId)];
  if (ids.length) conditions.push(inArray(posts.id, ids));
  else {
    if (query.search) conditions.push(ilike(posts.title, `%${query.search}%`));
    if (query.status) conditions.push(eq(posts.status, query.status));
    if (query.sourceType) conditions.push(eq(posts.sourceType, query.sourceType));
    if (query.modelId) conditions.push(eq(posts.modelId, query.modelId));
    if (query.personaId === null) conditions.push(isNull(posts.personaId));
    else if (query.personaId) conditions.push(eq(posts.personaId, query.personaId));
    if (query.campaignId === null) conditions.push(isNull(posts.campaignId));
    else if (query.campaignId) conditions.push(eq(posts.campaignId, query.campaignId));
    if (query.siteId) conditions.push(eq(posts.siteId, query.siteId));
    if (query.feedId) conditions.push(eq(posts.feedId, query.feedId));
  }
  const sortColumn = query.sort === "title" ? posts.title : posts.createdAt;
  const sortDirection = query.direction === "asc" ? asc : desc;
  const rowsQuery = db
    .select({
      id: posts.id,
      site_id: posts.siteId,
      feed_id: posts.feedId,
      preferred_integration_id: posts.preferredIntegrationId,
      title: posts.title,
      seo_source_content: posts.content,
      status: posts.status,
      source_type: posts.sourceType,
      source_ref_id: posts.sourceRefId,
      source_content_hash: posts.sourceContentHash,
      job_id: posts.jobId,
      campaign_id: posts.campaignId,
      campaign_item_id: posts.campaignItemId,
      persona_id: posts.personaId,
      model_id: posts.modelId,
      cover_image_url: posts.coverImageUrl,
      inline_images: posts.inlineImages,
      seo_metadata: posts.seoMetadata,
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
      generation_plan: sql<Record<string, unknown> | null>`case when ${jobs.generationPlan} is null then null else jsonb_build_object(
        'totalDrafts', ${jobs.generationPlan}->'totalDrafts',
        'failedDrafts', ${jobs.generationPlan}->'failedDrafts',
        'batchId', ${jobs.generationPlan}->'batchId',
        'variationCount', ${jobs.generationPlan}->'variationCount',
        'imagesEnabled', ${jobs.generationPlan}->'imagesEnabled',
        'imageDeliveryMode', ${jobs.generationPlan}->'imageDeliveryMode'
      ) end`,
      persona_name: personas.name,
      campaign_name: campaigns.name,
      site_name: sites.name,
      feed_name: feeds.name,
      integration_name: siteIntegrations.displayName,
      integration_provider: siteIntegrations.provider,
      integration_status: siteIntegrations.status,
      integration_site_id: siteIntegrations.siteId,
    })
    .from(posts)
    .leftJoin(personas, eq(posts.personaId, personas.id))
    .leftJoin(campaigns, eq(posts.campaignId, campaigns.id))
    .leftJoin(jobs, eq(posts.jobId, jobs.id))
    .leftJoin(sites, and(eq(posts.siteId, sites.id), eq(sites.userId, userId)))
    .leftJoin(feeds, and(eq(posts.feedId, feeds.id), eq(feeds.userId, userId)))
    .leftJoin(siteIntegrations, and(eq(posts.preferredIntegrationId, siteIntegrations.id), eq(siteIntegrations.userId, userId)))
    .where(and(...conditions))
    .orderBy(sortDirection(sortColumn), sortDirection(posts.id));
  const rows = ids.length
    ? await rowsQuery
    : await rowsQuery.limit(query.limit).offset((query.page - 1) * query.limit);

  const postIds = rows.map((row) => row.id);
  const promptCounts = new Map<string, number>();
  const imageCounts = new Map<string, number>();

  if (postIds.length) {
    const promptRows = await db
      .select({
        postId: imageGenerationRequests.postId,
        count: sql<number>`count(*)`,
      })
      .from(imageGenerationRequests)
      .where(and(
        eq(imageGenerationRequests.userId, userId),
        inArray(imageGenerationRequests.postId, postIds),
        inArray(imageGenerationRequests.status, ["pending", "queued", "processing", "failed", "done"]),
      ))
      .groupBy(imageGenerationRequests.postId);
    for (const row of promptRows) {
      if (row.postId) promptCounts.set(row.postId, Number(row.count) || 0);
    }

    const imageRows = await db
      .select({
        postId: imageAssets.postId,
        count: sql<number>`count(*)`,
      })
      .from(imageAssets)
      .where(and(eq(imageAssets.userId, userId), inArray(imageAssets.postId, postIds)))
      .groupBy(imageAssets.postId);
    for (const row of imageRows) {
      if (row.postId) imageCounts.set(row.postId, Number(row.count) || 0);
    }
  }

  const items = rows.map(({ persona_name, campaign_name, integration_site_id, seo_source_content, ...post }) => {
    const storedSeo = seoMetadata(post.seo_metadata);
    const seoStatus = storedSeo?.status === "ready" && !seoSourceHashMatches(storedSeo.sourceHash, post.title, seo_source_content || "") ? "needs_review" : storedSeo?.status || "missing";
    return {
      ...post,
      seo_status: seoStatus,
      routing_status: post.site_id && post.preferred_integration_id && integration_site_id === post.site_id && post.integration_status === "connected" ? "ready" : "needs_routing",
      image_asset_count: imageCounts.get(post.id) || 0,
      image_prompt_count: promptCounts.get(post.id) || 0,
      personas: persona_name ? { name: persona_name } : null,
      campaigns: campaign_name ? { name: campaign_name } : null,
    };
  });
  if (items.some((item) => item.seo_status === "pending")) waitUntil(drainSeoMetadata(userId, 1));
  if (ids.length) return c.json(items);

  const [[countRow], [statusRow], sourceRows, modelRows, personaRows, campaignRows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(posts).where(and(...conditions)),
    db.select({
      draft: sql<number>`count(*) filter (where ${posts.status} = 'draft')::int`,
      published: sql<number>`count(*) filter (where ${posts.status} = 'published')::int`,
      total: sql<number>`count(*)::int`,
    }).from(posts).where(eq(posts.userId, userId)),
    db.select({ value: posts.sourceType }).from(posts).where(eq(posts.userId, userId)).groupBy(posts.sourceType).orderBy(posts.sourceType),
    db.select({ value: posts.modelId }).from(posts).where(eq(posts.userId, userId)).groupBy(posts.modelId).orderBy(posts.modelId),
    db.select({ id: personas.id, name: personas.name }).from(personas).where(eq(personas.userId, userId)).orderBy(personas.name),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.userId, userId)).orderBy(campaigns.name),
  ]);
  const total = Number(countRow?.total || 0);
  return c.json({
    items,
    pagination: pagination(query.page, query.limit, total),
    facets: {
      statusCounts: { total: Number(statusRow?.total || 0), draft: Number(statusRow?.draft || 0), published: Number(statusRow?.published || 0) },
      sourceTypes: sourceRows.map((row) => row.value).filter(Boolean),
      models: modelRows.map((row) => row.value).filter(Boolean),
      personas: personaRows,
      campaigns: campaignRows,
    },
  });
});

postsRoutes.get("/:id/publications", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  return c.json({ publications: await getPostPublications(userId, id) });
});

postsRoutes.get("/:id/review", async (c) => {
  const packet = await getReviewPacket({
    userId: getUserId(c),
    postId: c.req.param("id"),
    canPushCmsDraft: true,
  });
  if (!packet) return c.json({ error: "Post not found" }, 404);
  return c.json(packet);
});

postsRoutes.get("/:id/revisions", async (c) => {
  const userId = getUserId(c);
  try {
    const rows = await listPostRevisions(userId, c.req.param("id"), Number(c.req.query("limit") || 50));
    return c.json({ revisions: rows.map(serializePostRevision) });
  } catch (error) {
    if (error instanceof PostRevisionNotFoundError) return c.json({ error: error.message }, 404);
    throw error;
  }
});

postsRoutes.post("/:id/revisions/:revisionId/restore", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const expectedUpdatedAt = new Date(requiredString(body, "expected_updated_at", ["expectedUpdatedAt"]));
  if (Number.isNaN(expectedUpdatedAt.getTime())) return c.json({ error: "expected_updated_at must be an ISO timestamp" }, 400);
  try {
    const result = await restorePostRevision({
      userId,
      postId: c.req.param("id"),
      revisionId: c.req.param("revisionId"),
      expectedUpdatedAt,
    });
    const seoJob = await enqueueSeoMetadata({ userId, postId: result.post.id, trigger: "revision_restore" });
    if (seoJob.queued) waitUntil(drainSeoMetadata(userId, 1));
    return c.json({
      post: result.post,
      revision: result.revision ? serializePostRevision(result.revision) : null,
      seo_job_id: seoJob.jobId,
    });
  } catch (error) {
    if (error instanceof PostVersionConflictError) return c.json({ error: error.message, code: "POST_VERSION_CONFLICT" }, 409);
    if (error instanceof PostRevisionNotFoundError) return c.json({ error: error.message }, 404);
    throw error;
  }
});

postsRoutes.patch("/:id/editorial-state", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const state = requiredString(body, "state") as EditorialState;
  if (!EDITORIAL_STATES.includes(state)) return c.json({ error: "Invalid editorial state" }, 400);
  try {
    const result = await setPostEditorialState({
      userId,
      postId: c.req.param("id"),
      state,
      expectedRevisionId: requiredString(body, "expected_revision_id", ["expectedRevisionId"]),
    });
    return c.json({
      editorial_state: result.post.editorialState,
      approved_revision_id: result.post.approvedRevisionId,
      current_revision: serializePostRevision(result.revision),
      updated_at: result.post.updatedAt,
    });
  } catch (error) {
    if (error instanceof PostVersionConflictError) return c.json({ error: error.message, code: "POST_VERSION_CONFLICT" }, 409);
    if (error instanceof PostRevisionNotFoundError) return c.json({ error: error.message }, 404);
    throw error;
  }
});

postsRoutes.get("/:id/preflight", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const requestedIntegrationId = c.req.query("integration_id") || c.req.query("integrationId") || "";
  const mode = c.req.query("mode") === "publish" ? "publish" : "draft";
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.userId, userId))).limit(1);
  if (!post) return c.json({ error: "Post not found" }, 404);
  const revision = await currentPostRevision(userId, id);
  const integrationId = requestedIntegrationId || post.preferredIntegrationId || "";
  const [integration] = integrationId
    ? await db.select({ id: siteIntegrations.id, status: siteIntegrations.status, siteId: siteIntegrations.siteId, provider: siteIntegrations.provider })
      .from(siteIntegrations)
      .where(and(eq(siteIntegrations.id, integrationId), eq(siteIntegrations.userId, userId)))
      .limit(1)
    : [];
  const seoReady = Boolean(readySeoMetadataForArticle(post.seoMetadata, post.title, post.content));
  const destinationReady = Boolean(integration && integration.status === "connected" && (!post.siteId || integration.siteId === post.siteId));
  const approved = Boolean(revision && post.editorialState === "approved" && post.approvedRevisionId === revision.id);
  const routingWarnings = post.publishingMetadata && typeof post.publishingMetadata === "object" && Array.isArray((post.publishingMetadata as Record<string, unknown>).routingWarnings)
    ? (post.publishingMetadata as Record<string, unknown>).routingWarnings as unknown[]
    : [];
  const checks = [
    { id: "saved_revision", label: "Saved revision", status: revision ? "pass" : "blocker", message: revision ? `Revision ${revision.revisionNumber}` : "No saved revision exists" },
    { id: "seo", label: "Canonical SEO", status: seoReady ? "pass" : "blocker", message: seoReady ? "Current and valid" : "SEO metadata is missing, stale, or invalid" },
    { id: "destination", label: "CMS destination", status: destinationReady ? "pass" : "blocker", message: destinationReady ? `${integration?.provider} is connected` : "Choose a connected destination for this site" },
    { id: "cover_image", label: "Cover image", status: post.coverImageUrl ? "pass" : "warning", message: post.coverImageUrl ? "Attached to the saved revision" : "No cover image is attached" },
    { id: "publishing_metadata", label: "Publishing metadata", status: post.publishingMetadata ? "pass" : "warning", message: post.publishingMetadata ? "Saved for this revision" : "Tags, categories, or provider metadata have not been saved yet" },
    { id: "review", label: "Editorial review", status: approved ? "pass" : mode === "publish" ? "warning" : "pass", message: approved ? "Current revision is approved" : mode === "publish" ? "Live publishing requires explicit review override" : "Approval is optional for CMS drafts" },
    ...routingWarnings.filter((warning): warning is string => typeof warning === "string").map((warning, index) => ({ id: `routing_${index}`, label: "Publishing metadata", status: "warning", message: warning })),
  ];
  return c.json({
    mode,
    revision: revision ? serializePostRevision(revision) : null,
    editorial_state: post.editorialState,
    approved_revision_id: post.approvedRevisionId,
    can_send: !checks.some((check) => check.status === "blocker"),
    requires_review_override: mode === "publish" && !approved,
    checks,
  });
});

postsRoutes.post("/duplicate-check", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const titles = Array.isArray(body.titles)
    ? body.titles.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim().toLowerCase()).slice(0, 50)
    : [];
  const hashes = Array.isArray(body.hashes)
    ? body.hashes.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()).slice(0, 50)
    : [];
  if (!titles.length && !hashes.length) return c.json({ titles: [], hashes: [] });
  const matches = await db.select({ title: posts.title, hash: posts.sourceContentHash }).from(posts).where(and(
    eq(posts.userId, userId),
    or(
      titles.length ? inArray(sql`lower(${posts.title})`, titles) : undefined,
      hashes.length ? inArray(posts.sourceContentHash, hashes) : undefined,
    ),
  ));
  return c.json({
    titles: matches.map((match) => match.title.toLowerCase()),
    hashes: matches.map((match) => match.hash).filter(Boolean),
  });
});

postsRoutes.post("/import-md", async (c) => {
  const userId = getUserId(c);
  const formData = await c.req.formData();
  const markdownFile = formData.get("markdown") as File | null;
  if (!markdownFile) return c.json({ error: "Markdown file is required" }, 400);

  const content = cleanGeneratedPostContent(await markdownFile.text());
  const meta = parseMarkdownMeta(content);
  const body = articleBody(content);
  const folder = String(formData.get("folder") || markdownFile.name.replace(/\.md$/i, ""));
  const title = cleanPostTitle(extractMarkdownTitle(body) || meta.metaTitle || folder.replace(/[-_]+/g, " "));
  const summary = (meta.metaDescription || plainText(body)).slice(0, 220);

  const [post] = await db
    .insert(posts)
    .values({
      userId,
      title,
      content,
      summary,
      status: "draft",
      sourceType: "batch_import",
      sourceRefId: folder,
      modelId: "manual/import",
    } as any)
    .returning();

  if (meta.slug || meta.metaTitle || meta.metaDescription) {
    const manual = await saveManualSeoMetadata(userId, post.id, {
      slug: meta.slug,
      metaTitle: meta.metaTitle,
      metaDescription: meta.metaDescription,
      primaryQuery: meta.metaTitle || title,
      searchIntent: "informational",
      language: /[çğıöşüİÇĞÖŞÜ]/.test(`${title} ${body}`) ? "tr" : "en",
    });
    if (!manual.saved) {
      await db.update(posts).set({ seoMetadata: {
        version: 1,
        status: "needs_review",
        sourceHash: "",
        slug: meta.slug,
        metaTitle: meta.metaTitle,
        metaDescription: meta.metaDescription,
        primaryQuery: meta.metaTitle || title,
        searchIntent: "informational",
        language: /[çğıöşüİÇĞÖŞÜ]/.test(`${title} ${body}`) ? "tr" : "en",
        provenance: { slug: "manual", metaTitle: "manual", metaDescription: "manual", primaryQuery: "manual", searchIntent: "manual", language: "manual" },
        manualReviewRequired: true,
        modelId: null,
        generatedAt: null,
        validationErrors: manual.errors,
        error: null,
      } }).where(and(eq(posts.id, post.id), eq(posts.userId, userId)));
    }
  } else {
    const seoJob = await enqueueSeoMetadata({ userId, postId: post.id, trigger: "batch_import" });
    if (seoJob.queued) waitUntil(drainSeoMetadata(userId, 1));
  }

  const images = formData.getAll("images").filter((value): value is File => value instanceof File);
  const inlineImages: string[] = [];
  let coverImageUrl: string | null = null;

  for (const [position, image] of images.entries()) {
    const { uploadFile } = await import("../services/image-storage.js");
    const asset = await uploadFile(image, userId);
    await db
      .update(imageAssets)
      .set({
        postId: post.id,
        status: "used",
        type: position === 0 ? "cover" : "inline",
        position,
      } as any)
      .where(eq(imageAssets.id, asset.id));

    if (position === 0) coverImageUrl = asset.storagePath;
    else inlineImages.push(asset.storagePath);
  }

  const update: Record<string, any> = {};
  if (coverImageUrl) update.coverImageUrl = coverImageUrl;
  if (inlineImages.length) update.inlineImages = inlineImages;
  if (Object.keys(update).length) await db.update(posts).set(update).where(eq(posts.id, post.id));

  return c.json({
    post: {
      id: post.id,
      title,
      image_count: images.length,
      cover_image_url: coverImageUrl,
      inline_images: inlineImages,
    },
  }, 201);
});

postsRoutes.post("/:id/publish", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  const integrationId = requiredString(body, "integrationId", ["integration_id"]);
  const mode = optionalEnum(body, "mode", ["draft", "publish"] as const, "draft");
  const postType = optionalEnum(body, "postType", ["post", "page"] as const, "post");
  const expectedValue = body.expected_updated_at ?? body.expectedUpdatedAt;
  const expectedUpdatedAt = typeof expectedValue === "string" ? new Date(expectedValue) : undefined;
  if (expectedUpdatedAt && Number.isNaN(expectedUpdatedAt.getTime())) return c.json({ error: "expected_updated_at must be an ISO timestamp" }, 400);
  let result;
  try {
    result = await publishPost(userId, id, integrationId, {
      mode,
      postType,
      tags: parseList(body.tags),
      categories: parseList(body.categories),
      excerpt: typeof body.excerpt === "string" ? body.excerpt : undefined,
      publishingMetadata: body.publishingMetadata || body.publishing_metadata,
      expectedUpdatedAt,
      reviewOverride: body.review_override === true || body.reviewOverride === true,
    });
  } catch (error) {
    if (error instanceof SeoMetadataNotReadyError) return c.json({ error: error.message, code: "SEO_METADATA_NOT_READY" }, 409);
    if (error instanceof ExpectedPostVersionError || error instanceof PostVersionConflictError) return c.json({ error: error.message, code: "POST_VERSION_CONFLICT" }, 409);
    if (error instanceof ReviewRequiredError) return c.json({ error: error.message, code: "REVIEW_REQUIRED" }, 409);
    if (error instanceof SavedRevisionRequiredError) return c.json({ error: error.message, code: "SAVED_REVISION_REQUIRED" }, 409);
    throw error;
  }
  return c.json(result, result.success ? 200 : result.validationFailed ? 400 : 502);
});

postsRoutes.post("/bulk-cms-publish", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const ids = [...new Set(requiredStringArray(body, "ids"))];
  if (ids.length > 500) return c.json({ error: "A maximum of 500 posts can be pushed at once" }, 400);
  const integrationId = requiredString(body, "integrationId", ["integration_id"]);
  const mode = optionalEnum(body, "mode", ["draft", "publish"] as const, "draft");
  const postType = optionalEnum(body, "postType", ["post", "page"] as const, "post");
  const candidates = await db.select({ id: posts.id, title: posts.title, content: posts.content, seoMetadata: posts.seoMetadata, editorialState: posts.editorialState }).from(posts).where(and(
    eq(posts.userId, userId),
    inArray(posts.id, ids),
  ));
  const foundIds = new Set(candidates.map((post) => post.id));
  const notReadyIds = ids.filter((id) => !foundIds.has(id));
  const readyEntries: Array<{ id: string; slug: string }> = [];
  for (const post of candidates) {
    const metadata = readySeoMetadataForArticle(post.seoMetadata, post.title, post.content);
    if (!metadata) notReadyIds.push(post.id);
    else readyEntries.push({ id: post.id, slug: metadata.slug });
  }
  if (notReadyIds.length) {
    return c.json({
      error: "All posts must have current, valid SEO metadata before CMS publishing starts",
      code: "SEO_METADATA_NOT_READY",
      postIds: notReadyIds,
    }, 409);
  }
  const slugConflicts = duplicateSeoSlugs(readyEntries);
  if (slugConflicts.length) {
    return c.json({
      error: "Every post in a CMS batch must have a unique URL slug",
      code: "SEO_SLUG_CONFLICT",
      postIds: slugConflicts,
    }, 409);
  }
  const reviewOverride = body.review_override === true || body.reviewOverride === true;
  if (mode === "publish" && !reviewOverride) {
    const unapprovedIds = candidates.filter((post) => post.editorialState !== "approved").map((post) => post.id);
    if (unapprovedIds.length) return c.json({
      error: "Some posts have not been approved",
      code: "REVIEW_REQUIRED",
      postIds: unapprovedIds,
    }, 409);
  }
  if (body.preflightOnly === true) return c.json({ total: candidates.length, failures: [] });

  const failures: Array<{ id: string; title: string; error: string }> = [];
  for (const post of candidates) {
    try {
      const result = await publishPost(userId, post.id, integrationId, { mode, postType, reviewOverride });
      if (!result.success) failures.push({ id: post.id, title: post.title, error: result.error || "CMS publish failed" });
    } catch (error) {
      failures.push({ id: post.id, title: post.title, error: error instanceof Error ? error.message : "CMS publish failed" });
    }
  }
  return c.json({ total: candidates.length, failures });
});

postsRoutes.post("/:id/images", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const formData = await c.req.formData();
  const file = formData.get("image") as File | null;
  if (!file) return c.json({ error: "Image file is required" }, 400);

  const [post] = await db
    .select({ id: posts.id, inlineImages: posts.inlineImages })
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
    .limit(1);
  if (!post) return c.json({ error: "Post not found" }, 404);

  const { uploadFile } = await import("../services/image-storage.js");
  const asset = await uploadFile(file, userId);
  const type = String(formData.get("type") || "inline") === "cover" ? "cover" : "inline";
  const position = Number(formData.get("position") || 0);

  await db
    .update(imageAssets)
    .set({
      postId: id,
      status: "used",
      type,
      position: Number.isFinite(position) ? position : 0,
    } as any)
    .where(eq(imageAssets.id, asset.id));

  if (type === "cover") {
    await attachPostImage(id, {
      type: "cover",
      position: Number.isFinite(position) ? position : 0,
      aspectRatio: "16:9",
      resolution: "1K",
      prompt: "",
      altText: "",
    }, asset.storagePath, "auto", userId);
  } else {
    await db.update(posts).set({ inlineImages: [...(post.inlineImages || []), asset.storagePath] }).where(and(eq(posts.id, id), eq(posts.userId, userId)));
  }

  return c.json({
    asset: {
      id: asset.id,
      storage_path: asset.storagePath,
      type,
      position: Number.isFinite(position) ? position : 0,
    },
  }, 201);
});

postsRoutes.get("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [post] = await db
    .select({
      id: posts.id,
      site_id: posts.siteId,
      feed_id: posts.feedId,
      preferred_integration_id: posts.preferredIntegrationId,
      title: posts.title,
      content: posts.content,
      summary: posts.summary,
      status: posts.status,
      source_type: posts.sourceType,
      source_ref_id: posts.sourceRefId,
      source_content_hash: posts.sourceContentHash,
      job_id: posts.jobId,
      campaign_id: posts.campaignId,
      campaign_item_id: posts.campaignItemId,
      persona_id: posts.personaId,
      model_id: posts.modelId,
      cover_image_url: posts.coverImageUrl,
      inline_images: posts.inlineImages,
      seo_metadata: posts.seoMetadata,
      publishing_metadata: posts.publishingMetadata,
      editorialState: posts.editorialState,
      approvedRevisionId: posts.approvedRevisionId,
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
      persona_name: personas.name,
      campaign_name: campaigns.name,
      site_name: sites.name,
      feed_name: feeds.name,
      feed_editorial_defaults: feeds.editorialDefaults,
      integration_name: siteIntegrations.displayName,
      integration_provider: siteIntegrations.provider,
      integration_status: siteIntegrations.status,
      integration_site_id: siteIntegrations.siteId,
    })
    .from(posts)
    .leftJoin(personas, eq(posts.personaId, personas.id))
    .leftJoin(campaigns, eq(posts.campaignId, campaigns.id))
    .leftJoin(sites, and(eq(posts.siteId, sites.id), eq(sites.userId, userId)))
    .leftJoin(feeds, and(eq(posts.feedId, feeds.id), eq(feeds.userId, userId)))
    .leftJoin(siteIntegrations, and(eq(posts.preferredIntegrationId, siteIntegrations.id), eq(siteIntegrations.userId, userId)))
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
    .limit(1);

  if (!post) return c.json({ error: "Post not found" }, 404);
  const { persona_name, campaign_name, integration_site_id, feed_editorial_defaults, ...result } = post;
  const defaults = feed_editorial_defaults && typeof feed_editorial_defaults === "object" ? feed_editorial_defaults as Record<string, unknown> : {};
  const ortakAlan = defaults.profile === "ortak_alan_news";
  const storedInlineImages = normalizeInlineImages(result.inline_images, result.cover_image_url);
  const postImageAssets = await db
    .select({
      storage_path: imageAssets.storagePath,
      alt_text: imageAssets.altText,
      type: imageAssets.type,
      provider: imageAssets.provider,
      model_id: imageAssets.modelId,
      source_kind: imageAssets.sourceKind,
      source_url: imageAssets.sourceUrl,
      credit: imageAssets.credit,
      license_label: imageAssets.licenseLabel,
      attribution_url: imageAssets.attributionUrl,
      position: imageAssets.position,
      created_at: imageAssets.createdAt,
    })
    .from(imageAssets)
    .where(and(eq(imageAssets.userId, userId), eq(imageAssets.postId, id)))
    .orderBy(asc(imageAssets.type), asc(imageAssets.position), asc(imageAssets.createdAt));
  const inlineAssetPaths = postImageAssets
    .filter((asset) => asset.type === "inline" && asset.storage_path !== result.cover_image_url)
    .map((asset) => asset.storage_path);
  const inlineImages = Array.from(new Set([
    ...inlineAssetPaths,
    ...storedInlineImages.filter((path) => !inlineAssetPaths.includes(path)),
  ]));
  const attachedPaths = [result.cover_image_url, ...inlineImages]
    .filter((path): path is string => Boolean(path));
  const attachedAssets = postImageAssets.length
    ? postImageAssets.filter((asset) => attachedPaths.includes(asset.storage_path))
    : attachedPaths.length
    ? await db
      .select({
        storage_path: imageAssets.storagePath,
        alt_text: imageAssets.altText,
        type: imageAssets.type,
        provider: imageAssets.provider,
        model_id: imageAssets.modelId,
        source_kind: imageAssets.sourceKind,
        source_url: imageAssets.sourceUrl,
        credit: imageAssets.credit,
        license_label: imageAssets.licenseLabel,
        attribution_url: imageAssets.attributionUrl,
      })
      .from(imageAssets)
      .where(and(eq(imageAssets.userId, userId), inArray(imageAssets.storagePath, attachedPaths)))
    : [];
  const storedSeo = seoMetadata(result.seo_metadata);
  const seoStatus = seoStatusForArticle(storedSeo, result.title, result.content || "");
  if (seoStatus === "pending") waitUntil(drainSeoMetadata(userId, 1));
  const presentedSeo = storedSeo && seoStatus !== "missing" && storedSeo.status !== seoStatus
    ? { ...storedSeo, status: seoStatus }
    : storedSeo;
  const currentRevision = await currentPostRevision(userId, id);
  return c.json({
    ...result,
    seo_metadata: presentedSeo,
    seo_status: seoStatus,
    seo_limits: SEO_LIMITS,
    feed_editorial_defaults: normalizeFeedEditorialDefaults(feed_editorial_defaults, ortakAlan),
    routing_status: result.site_id && result.preferred_integration_id && integration_site_id === result.site_id && result.integration_status === "connected" ? "ready" : "needs_routing",
    content: inlineImages.length > 1
      ? reflowInlineImages(result.content || "", inlineImages.map((url) => ({ url })), "auto")
      : result.content,
    inline_images: inlineImages,
    image_assets: attachedAssets,
    personas: persona_name ? { name: persona_name } : null,
    campaigns: campaign_name ? { name: campaign_name } : null,
    editorial_state: result.editorialState,
    approved_revision_id: result.approvedRevisionId,
    current_revision: currentRevision ? serializePostRevision(currentRevision) : null,
  });
});

function parseList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeInlineImages(value: unknown, coverImageUrl?: string | null) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((image): image is string => typeof image === "string" && image !== coverImageUrl)))
    : [];
}

function extractMarkdownTitle(content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
}

function markdownSection(content: string, heading: string) {
  const pattern = new RegExp(`^##\\s+(?:${heading})\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`, "im");
  return (content.match(pattern)?.[1] || "").replace(/^`|`$/g, "").trim();
}

function parseMarkdownMeta(content: string) {
  return {
    slug: markdownSection(content, "Slug"),
    metaTitle: markdownSection(content, "Meta Title"),
    metaDescription: markdownSection(content, "Meta Description"),
  };
}

function articleBody(content: string) {
  const index = content.search(/^#\s+/m);
  return (index >= 0 ? content.slice(index) : content).trim();
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

postsRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  const update: Record<string, any> = {};
  if (typeof body.title === "string") update.title = cleanPostTitle(body.title);
  if (typeof body.content === "string") update.content = cleanGeneratedPostContent(body.content);
  const coverImageUrl = body.cover_image_url ?? body.coverImageUrl;
  const inlineImages = body.inline_images ?? body.inlineImages;
  if (typeof coverImageUrl === "string" || coverImageUrl === null) update.coverImageUrl = coverImageUrl;
  if (Array.isArray(inlineImages)) update.inlineImages = normalizeInlineImages(inlineImages, update.coverImageUrl);
  if (!Object.keys(update).length) return c.json({ error: "No valid fields to update" }, 400);
  const expectedUpdatedAt = new Date(requiredString(body, "expected_updated_at", ["expectedUpdatedAt"]));
  if (Number.isNaN(expectedUpdatedAt.getTime())) return c.json({ error: "expected_updated_at must be an ISO timestamp" }, 400);
  let updateResult;
  try {
    updateResult = await updatePostWithRevision({ userId, postId: id, expectedUpdatedAt, source: "save", changes: update });
  } catch (error) {
    if (error instanceof PostVersionConflictError) return c.json({ error: error.message, code: "POST_VERSION_CONFLICT" }, 409);
    if (error instanceof PostNotEditableError) return c.json({ error: error.message }, 409);
    if (error instanceof PostRevisionNotFoundError) return c.json({ error: error.message }, 404);
    throw error;
  }
  const updated = updateResult.post;
  let seoJob: Awaited<ReturnType<typeof enqueueSeoMetadata>> | null = null;
  if (typeof body.title === "string" || typeof body.content === "string") {
    seoJob = await enqueueSeoMetadata({ userId, postId: id, trigger: "save" });
    if (seoJob.queued) waitUntil(drainSeoMetadata(userId, 1));
  }
  const [fresh] = await db.select({ seoMetadata: posts.seoMetadata }).from(posts).where(and(eq(posts.id, id), eq(posts.userId, userId))).limit(1);
  return c.json({
    ...updated,
    seo_metadata: fresh?.seoMetadata || null,
    seo_job_id: seoJob?.jobId || null,
    current_revision: updateResult.revision ? serializePostRevision(updateResult.revision) : null,
  });
});

postsRoutes.put("/:id/seo", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const stringValue = (value: unknown) => typeof value === "string" ? value : "";
  const metadataText = `${stringValue(body.metaTitle || body.meta_title)} ${stringValue(body.metaDescription || body.meta_description)}`;
  const result = await saveManualSeoMetadata(userId, c.req.param("id"), {
    slug: stringValue(body.slug),
    metaTitle: stringValue(body.metaTitle || body.meta_title),
    metaDescription: stringValue(body.metaDescription || body.meta_description),
    primaryQuery: stringValue(body.primaryQuery || body.primary_query || body.metaTitle || body.meta_title),
    searchIntent: stringValue(body.searchIntent || body.search_intent) || "informational",
    language: stringValue(body.language) || (/[çğıöşüİÇĞÖŞÜ]/.test(metadataText) ? "tr" : "en"),
  });
  if (!result.saved) return c.json({ error: "SEO metadata is invalid", code: "SEO_METADATA_INVALID", errors: result.errors }, 400);
  return c.json({ seo_metadata: result.metadata });
});

postsRoutes.post("/:id/seo/confirm", async (c) => {
  const result = await confirmManualSeoMetadata(getUserId(c), c.req.param("id"));
  if (!result.saved) return c.json({ error: "SEO metadata is invalid", code: "SEO_METADATA_INVALID", errors: result.errors }, 400);
  return c.json({ seo_metadata: result.metadata });
});

postsRoutes.post("/:id/seo/regenerate", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const result = await enqueueSeoMetadata({ userId, postId: c.req.param("id"), trigger: "manual_retry", overwriteManual: body.overwriteManual === true });
  if (result.queued) waitUntil(drainSeoMetadata(userId, 1));
  return c.json(result, result.queued ? 202 : 200);
});

postsRoutes.post("/seo/regenerate", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === "string").slice(0, 500) : [];
  const targetRows = ids.length
    ? await db.select({ id: posts.id }).from(posts).where(and(eq(posts.userId, userId), inArray(posts.id, ids)))
    : body.scope === "all_drafts"
      ? await db.select({ id: posts.id }).from(posts).where(and(eq(posts.userId, userId), eq(posts.status, "draft")))
      : [];
  if (!targetRows.length) return c.json({ error: "Provide post ids or scope=all_drafts" }, 400);
  const results = [];
  for (const row of targetRows) results.push(await enqueueSeoMetadata({ userId, postId: row.id, trigger: "backfill", overwriteManual: body.overwriteManual === true }));
  const queued = results.filter((result) => result.queued).length;
  if (queued) waitUntil(drainSeoMetadata(userId, 2));
  return c.json({ queued, skipped: results.length - queued }, 202);
});

postsRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  await cleanupPostFiles([id], userId);

  const [deleted] = await db
    .delete(posts)
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
    .returning({ id: posts.id });

  if (!deleted) return c.json({ error: "Post not found" }, 404);
  return c.json({ success: true });
});

postsRoutes.post("/bulk-delete", async (c) => {
  const userId = getUserId(c);
  const ids = requiredStringArray(await readJsonObject(c), "ids");

  await cleanupPostFiles(ids, userId);
  await db.delete(posts).where(and(inArray(posts.id, ids), eq(posts.userId, userId)));
  return c.json({ success: true, deleted: ids.length });
});

postsRoutes.post("/bulk-publish", async (c) => {
  const userId = getUserId(c);
  const ids = requiredStringArray(await readJsonObject(c), "ids");

  await db
    .update(posts)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(inArray(posts.id, ids), eq(posts.userId, userId)));
  return c.json({ success: true });
});

async function cleanupPostFiles(postIds: string[], userId: string) {
  const postRows = await db
    .select({ id: posts.id, coverImageUrl: posts.coverImageUrl, inlineImages: posts.inlineImages })
    .from(posts)
    .where(and(inArray(posts.id, postIds), eq(posts.userId, userId)));

  const pathsToDelete: string[] = [];
  for (const post of postRows) {
    if (post.coverImageUrl && !post.coverImageUrl.startsWith("http")) {
      pathsToDelete.push(post.coverImageUrl);
    }
    if (post.inlineImages) {
      for (const img of post.inlineImages) {
        if (img && !img.startsWith("http")) pathsToDelete.push(img);
      }
    }
  }

  await Promise.all(pathsToDelete.map(deleteFile));

  // Mark image_assets as orphaned
  await db
    .update(imageAssets)
    .set({ status: "orphaned", postId: null } as any)
    .where(inArray(imageAssets.postId, postIds));
}

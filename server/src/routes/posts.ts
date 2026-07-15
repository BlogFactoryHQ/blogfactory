import { Hono } from "hono";
import { db } from "../db/index.js";
import { posts, personas, imageAssets, imageGenerationRequests, campaigns, jobs, sites, feeds, siteIntegrations } from "../db/schema.js";
import { eq, and, inArray, desc, asc, sql, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteFile } from "../services/image-storage.js";
import { getPostPublications, publishPost } from "../services/publishing.js";
import { cleanGeneratedPostContent, cleanPostTitle } from "../services/post-cleanup.js";
import { reflowInlineImages } from "../services/image-placement.js";
import { attachPostImage } from "../services/image-post-attachments.js";
import { normalizeFeedEditorialDefaults } from "../services/feed-routing.js";
import { optionalEnum, readJsonObject, requiredString, requiredStringArray } from "../http/error-contract.js";
import { pagination, parsePostListQuery } from "./list-query.js";

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

  const items = rows.map(({ persona_name, campaign_name, integration_site_id, ...post }) => ({
    ...post,
    routing_status: post.site_id && post.preferred_integration_id && integration_site_id === post.site_id && post.integration_status === "connected" ? "ready" : "needs_routing",
    image_asset_count: imageCounts.get(post.id) || 0,
    image_prompt_count: promptCounts.get(post.id) || 0,
    personas: persona_name ? { name: persona_name } : null,
    campaigns: campaign_name ? { name: campaign_name } : null,
  }));
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
  const result = await publishPost(userId, id, integrationId, {
    mode,
    postType,
    slug: typeof body.slug === "string" ? body.slug : undefined,
    tags: parseList(body.tags),
    categories: parseList(body.categories),
    metaTitle: typeof (body.metaTitle || body.meta_title) === "string" ? String(body.metaTitle || body.meta_title) : undefined,
    metaDescription: typeof (body.metaDescription || body.meta_description) === "string" ? String(body.metaDescription || body.meta_description) : undefined,
    excerpt: typeof body.excerpt === "string" ? body.excerpt : undefined,
    publishingMetadata: body.publishingMetadata || body.publishing_metadata,
  });
  return c.json(result, result.success ? 200 : result.validationFailed ? 400 : 502);
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
      publishing_metadata: posts.publishingMetadata,
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
  return c.json({
    ...result,
    feed_editorial_defaults: normalizeFeedEditorialDefaults(feed_editorial_defaults, ortakAlan),
    routing_status: result.site_id && result.preferred_integration_id && integration_site_id === result.site_id && result.integration_status === "connected" ? "ready" : "needs_routing",
    content: inlineImages.length > 1
      ? reflowInlineImages(result.content || "", inlineImages.map((url) => ({ url })), "auto")
      : result.content,
    inline_images: inlineImages,
    image_assets: attachedAssets,
    personas: persona_name ? { name: persona_name } : null,
    campaigns: campaign_name ? { name: campaign_name } : null,
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
  if (typeof body.status === "string") {
    if (!["draft", "published"].includes(body.status)) return c.json({ error: "Invalid status" }, 400);
    update.status = body.status;
  }
  const coverImageUrl = body.cover_image_url ?? body.coverImageUrl;
  const inlineImages = body.inline_images ?? body.inlineImages;
  if (typeof coverImageUrl === "string" || coverImageUrl === null) update.coverImageUrl = coverImageUrl;
  if (Array.isArray(inlineImages)) update.inlineImages = normalizeInlineImages(inlineImages, update.coverImageUrl);
  if (!Object.keys(update).length) return c.json({ error: "No valid fields to update" }, 400);

  const [updated] = await db
    .update(posts)
    .set(update)
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Post not found" }, 404);
  return c.json(updated);
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
    .set({ status: "published" } as any)
    .where(and(inArray(posts.id, ids), eq(posts.userId, userId)));
  return c.json({ success: true });
});

postsRoutes.post("/bulk-draft", async (c) => {
  const userId = getUserId(c);
  const ids = requiredStringArray(await readJsonObject(c), "ids");

  await db
    .update(posts)
    .set({ status: "draft" } as any)
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

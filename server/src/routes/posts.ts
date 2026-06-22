import { Hono } from "hono";
import { db } from "../db/index.js";
import { posts, personas, imageAssets, campaigns } from "../db/schema.js";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteFile } from "../services/image-storage.js";
import { getPostPublications, publishPost } from "../services/publishing.js";
import { cleanGeneratedPostContent, cleanPostTitle } from "../services/post-cleanup.js";

export const postsRoutes = new Hono();

postsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select({
      id: posts.id,
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
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
      persona_name: personas.name,
      campaign_name: campaigns.name,
    })
    .from(posts)
    .leftJoin(personas, eq(posts.personaId, personas.id))
    .leftJoin(campaigns, eq(posts.campaignId, campaigns.id))
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt));

  return c.json(rows.map(({ persona_name, campaign_name, ...post }) => ({
    ...post,
    personas: persona_name ? { name: persona_name } : null,
    campaigns: campaign_name ? { name: campaign_name } : null,
  })));
});

postsRoutes.get("/:id/publications", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  return c.json({ publications: await getPostPublications(userId, id) });
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
    })
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
      })
      .where(eq(imageAssets.id, asset.id));

    if (position === 0) coverImageUrl = asset.storagePath;
    else inlineImages.push(asset.storagePath);
  }

  const update: Partial<typeof posts.$inferInsert> = {};
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
  const body = await c.req.json();
  const integrationId = String(body.integrationId || body.integration_id || "");
  if (!integrationId) return c.json({ error: "Integration is required" }, 400);
  const result = await publishPost(userId, id, integrationId, {
    mode: body.mode === "publish" ? "publish" : "draft",
    postType: body.postType === "page" ? "page" : "post",
    slug: body.slug,
    tags: Array.isArray(body.tags) ? body.tags : parseList(body.tags),
    categories: Array.isArray(body.categories) ? body.categories : parseList(body.categories),
    metaTitle: body.metaTitle || body.meta_title,
    metaDescription: body.metaDescription || body.meta_description,
    excerpt: body.excerpt,
  });
  return c.json(result, result.success ? 200 : 502);
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
    })
    .where(eq(imageAssets.id, asset.id));

  const update: Partial<typeof posts.$inferInsert> = {};
  if (type === "cover") update.coverImageUrl = asset.storagePath;
  else update.inlineImages = [...(post.inlineImages || []), asset.storagePath];
  await db.update(posts).set(update).where(and(eq(posts.id, id), eq(posts.userId, userId)));

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
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
      persona_name: personas.name,
      campaign_name: campaigns.name,
    })
    .from(posts)
    .leftJoin(personas, eq(posts.personaId, personas.id))
    .leftJoin(campaigns, eq(posts.campaignId, campaigns.id))
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
    .limit(1);

  if (!post) return c.json({ error: "Post not found" }, 404);
  const { persona_name, campaign_name, ...result } = post;
  return c.json({
    ...result,
    personas: persona_name ? { name: persona_name } : null,
    campaigns: campaign_name ? { name: campaign_name } : null,
  });
});

function parseList(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
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
  const body = await c.req.json();
  const update: Partial<typeof posts.$inferInsert> = {};
  if (typeof body.title === "string") update.title = cleanPostTitle(body.title);
  if (typeof body.content === "string") update.content = cleanGeneratedPostContent(body.content);
  if (typeof body.status === "string") {
    if (!["draft", "published"].includes(body.status)) return c.json({ error: "Invalid status" }, 400);
    update.status = body.status;
  }
  const coverImageUrl = body.cover_image_url ?? body.coverImageUrl;
  const inlineImages = body.inline_images ?? body.inlineImages;
  if (typeof coverImageUrl === "string" || coverImageUrl === null) update.coverImageUrl = coverImageUrl;
  if (Array.isArray(inlineImages)) update.inlineImages = inlineImages.filter((value): value is string => typeof value === "string");
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
  const { ids } = await c.req.json();
  if (!ids?.length) return c.json({ error: "No ids provided" }, 400);

  await cleanupPostFiles(ids, userId);
  await db.delete(posts).where(and(inArray(posts.id, ids), eq(posts.userId, userId)));
  return c.json({ success: true, deleted: ids.length });
});

postsRoutes.post("/bulk-publish", async (c) => {
  const userId = getUserId(c);
  const { ids } = await c.req.json();
  if (!ids?.length) return c.json({ error: "No ids provided" }, 400);

  await db
    .update(posts)
    .set({ status: "published" })
    .where(and(inArray(posts.id, ids), eq(posts.userId, userId)));
  return c.json({ success: true });
});

postsRoutes.post("/bulk-draft", async (c) => {
  const userId = getUserId(c);
  const { ids } = await c.req.json();
  if (!ids?.length) return c.json({ error: "No ids provided" }, 400);

  await db
    .update(posts)
    .set({ status: "draft" })
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
    .set({ status: "orphaned", postId: null })
    .where(inArray(imageAssets.postId, postIds));
}

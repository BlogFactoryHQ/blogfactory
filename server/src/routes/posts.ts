import { Hono } from "hono";
import { db } from "../db/index.js";
import { posts, personas, imageAssets } from "../db/schema.js";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteFile } from "../services/image-storage.js";
import { getPostPublications, publishPost } from "../services/publishing.js";

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
      persona_id: posts.personaId,
      model_id: posts.modelId,
      cover_image_url: posts.coverImageUrl,
      inline_images: posts.inlineImages,
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
      persona_name: personas.name,
    })
    .from(posts)
    .leftJoin(personas, eq(posts.personaId, personas.id))
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt));

  return c.json(rows.map(({ persona_name, ...post }) => ({
    ...post,
    personas: persona_name ? { name: persona_name } : null,
  })));
});

postsRoutes.get("/:id/publications", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  return c.json({ publications: await getPostPublications(userId, id) });
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
      persona_id: posts.personaId,
      model_id: posts.modelId,
      cover_image_url: posts.coverImageUrl,
      inline_images: posts.inlineImages,
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
      persona_name: personas.name,
    })
    .from(posts)
    .leftJoin(personas, eq(posts.personaId, personas.id))
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
    .limit(1);

  if (!post) return c.json({ error: "Post not found" }, 404);
  const { persona_name, ...result } = post;
  return c.json({
    ...result,
    personas: persona_name ? { name: persona_name } : null,
  });
});

function parseList(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

postsRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  const [updated] = await db
    .update(posts)
    .set(body)
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

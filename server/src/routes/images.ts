import { Hono } from "hono";
import { db } from "../db/index.js";
import { imageAssets, posts } from "../db/schema.js";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteFile } from "../services/image-storage.js";

export const imagesRoutes = new Hono();

imagesRoutes.get("/", async (c) => {
  const userId = getUserId(c);

  const rows = await db
    .select({
      id: imageAssets.id,
      storagePath: imageAssets.storagePath,
      type: imageAssets.type,
      status: imageAssets.status,
      prompt: imageAssets.prompt,
      modelId: imageAssets.modelId,
      provider: imageAssets.provider,
      aspectRatio: imageAssets.aspectRatio,
      resolution: imageAssets.resolution,
      position: imageAssets.position,
      cost: imageAssets.cost,
      fileSizeBytes: imageAssets.fileSizeBytes,
      jobId: imageAssets.jobId,
      postId: imageAssets.postId,
      createdAt: imageAssets.createdAt,
      postTitle: posts.title,
      postStatus: posts.status,
    })
    .from(imageAssets)
    .leftJoin(posts, eq(imageAssets.postId, posts.id))
    .where(eq(imageAssets.userId, userId))
    .orderBy(desc(imageAssets.createdAt));

  return c.json(rows);
});

imagesRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [asset] = await db
    .select({ storagePath: imageAssets.storagePath })
    .from(imageAssets)
    .where(and(eq(imageAssets.id, id), eq(imageAssets.userId, userId)))
    .limit(1);

  if (!asset) return c.json({ error: "Image not found" }, 404);

  await deleteFile(asset.storagePath);
  await db.delete(imageAssets).where(eq(imageAssets.id, id));
  return c.json({ success: true });
});

imagesRoutes.post("/bulk-delete", async (c) => {
  const userId = getUserId(c);
  const { ids } = await c.req.json();
  if (!ids?.length) return c.json({ error: "No ids" }, 400);

  const assets = await db
    .select({ id: imageAssets.id, storagePath: imageAssets.storagePath })
    .from(imageAssets)
    .where(and(inArray(imageAssets.id, ids), eq(imageAssets.userId, userId)));

  await Promise.all(assets.map((a) => deleteFile(a.storagePath)));

  await db.delete(imageAssets).where(and(inArray(imageAssets.id, ids), eq(imageAssets.userId, userId)));
  return c.json({ success: true, deleted: assets.length });
});

imagesRoutes.post("/:id/detach", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [updated] = await db
    .update(imageAssets)
    .set({ postId: null, status: "unused" })
    .where(and(eq(imageAssets.id, id), eq(imageAssets.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Image not found" }, 404);
  return c.json(updated);
});

imagesRoutes.post("/upload", async (c) => {
  const userId = getUserId(c);
  const { uploadFile } = await import("../services/image-storage.js");
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) return c.json({ error: "No file provided" }, 400);

  const result = await uploadFile(file, userId);
  return c.json(result, 201);
});

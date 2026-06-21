import { Hono } from "hono";
import { db } from "../db/index.js";
import { imageAssets, imageGenerationRequests, posts } from "../db/schema.js";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteFile, saveImageBuffer } from "../services/image-storage.js";

export const imagesRoutes = new Hono();

function serializeAsset(row: any) {
  return {
    ...row,
    storage_path: row.storagePath,
    model_id: row.modelId,
    aspect_ratio: row.aspectRatio,
    file_size_bytes: row.fileSizeBytes,
    job_id: row.jobId,
    post_id: row.postId,
    created_at: row.createdAt,
    post_title: row.postTitle,
    post_status: row.postStatus,
  };
}

function serializeRequest(row: any) {
  return {
    ...row,
    post_id: row.postId,
    job_id: row.jobId,
    aspect_ratio: row.aspectRatio,
    imported_asset_id: row.importedAssetId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    post_title: row.postTitle,
  };
}

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

  return c.json(rows.map(serializeAsset));
});

imagesRoutes.get("/requests", async (c) => {
  const userId = getUserId(c);
  const status = c.req.query("status");
  const conditions = [eq(imageGenerationRequests.userId, userId)];
  if (status) conditions.push(eq(imageGenerationRequests.status, status));

  const rows = await db
    .select({
      id: imageGenerationRequests.id,
      postId: imageGenerationRequests.postId,
      jobId: imageGenerationRequests.jobId,
      provider: imageGenerationRequests.provider,
      prompt: imageGenerationRequests.prompt,
      type: imageGenerationRequests.type,
      position: imageGenerationRequests.position,
      aspectRatio: imageGenerationRequests.aspectRatio,
      resolution: imageGenerationRequests.resolution,
      status: imageGenerationRequests.status,
      importedAssetId: imageGenerationRequests.importedAssetId,
      createdAt: imageGenerationRequests.createdAt,
      updatedAt: imageGenerationRequests.updatedAt,
      postTitle: posts.title,
    })
    .from(imageGenerationRequests)
    .leftJoin(posts, eq(imageGenerationRequests.postId, posts.id))
    .where(and(...conditions))
    .orderBy(desc(imageGenerationRequests.createdAt));

  return c.json(rows.map(serializeRequest));
});

imagesRoutes.patch("/requests/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { status } = await c.req.json();
  if (!["cancelled", "done"].includes(status)) return c.json({ error: "Invalid status" }, 400);

  const [updated] = await db
    .update(imageGenerationRequests)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(imageGenerationRequests.id, id), eq(imageGenerationRequests.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Image request not found" }, 404);
  return c.json(serializeRequest(updated));
});

imagesRoutes.post("/requests/:id/import", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) return c.json({ error: "No file provided" }, 400);

  const [request] = await db
    .select()
    .from(imageGenerationRequests)
    .where(and(eq(imageGenerationRequests.id, id), eq(imageGenerationRequests.userId, userId)))
    .limit(1);

  if (!request) return c.json({ error: "Image request not found" }, 404);
  if (request.status === "cancelled") return c.json({ error: "Cancelled requests cannot be imported" }, 400);
  if (request.status === "done") return c.json({ error: "Image request was already imported" }, 400);

  let buffer: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer());
  try {
    const sharp = (await import("sharp")).default;
    buffer = await sharp(buffer).webp({ quality: 85 }).toBuffer();
  } catch {}

  const { asset, storagePath } = await saveImageBuffer(buffer, userId, {
    type: request.type,
    prompt: request.prompt,
    modelId: `manual/${request.provider}`,
    provider: request.provider,
    aspectRatio: request.aspectRatio || undefined,
    resolution: request.resolution || undefined,
    position: request.position ?? undefined,
    cost: 0,
    jobId: request.jobId || undefined,
    postId: request.postId || undefined,
  });

  if (request.postId) {
    if (request.type === "cover") {
      await db.update(posts).set({ coverImageUrl: storagePath }).where(and(eq(posts.id, request.postId), eq(posts.userId, userId)));
    } else {
      const doneInline = await db
        .select({
          storagePath: imageAssets.storagePath,
          position: imageGenerationRequests.position,
          createdAt: imageGenerationRequests.createdAt,
        })
        .from(imageGenerationRequests)
        .innerJoin(imageAssets, eq(imageGenerationRequests.importedAssetId, imageAssets.id))
        .where(and(
          eq(imageGenerationRequests.userId, userId),
          eq(imageGenerationRequests.postId, request.postId),
          eq(imageGenerationRequests.type, "inline"),
          eq(imageGenerationRequests.status, "done")
        ));
      const inlineImages = [...doneInline, { storagePath, position: request.position, createdAt: request.createdAt }]
        .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999) || Number(a.createdAt) - Number(b.createdAt))
        .map((row) => row.storagePath);
      await db.update(posts).set({ inlineImages }).where(and(eq(posts.id, request.postId), eq(posts.userId, userId)));
    }
  }

  const [updated] = await db
    .update(imageGenerationRequests)
    .set({ status: "done", importedAssetId: asset.id, updatedAt: new Date() })
    .where(and(eq(imageGenerationRequests.id, id), eq(imageGenerationRequests.userId, userId)))
    .returning();

  return c.json({ request: serializeRequest(updated), asset: serializeAsset(asset) }, 201);
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

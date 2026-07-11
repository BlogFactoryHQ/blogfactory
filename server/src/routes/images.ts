import { Hono } from "hono";
import { db, type Database } from "../db/index.js";
import { imageAssets, imageGenerationRequests, posts } from "../db/schema.js";
import { eq, and, inArray, desc, or, lt, ne } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteFile, imageAssetValues, storeImageBuffer } from "../services/image-storage.js";
import { attachImageRequestToPost, drainDeferredImages, kickDeferredImageWorker } from "../services/low-cost-images.js";
import { canRestartImageRequest } from "./image-request-controls.js";
import { createManualImagePromptRequestsForPost } from "../services/generate-content.js";
import { removeInlineImagePath } from "../services/image-placement.js";
import { partitionSettled } from "../services/atomic-state.js";

export const imagesRoutes = new Hono();

type ImageMutationDatabase = Pick<Database, "select" | "update">;

async function detachDeletedAsset(executor: ImageMutationDatabase, asset: typeof imageAssets.$inferSelect, userId: string) {
  if (!asset.postId) return;
  const [post] = await executor.select({
    coverImageUrl: posts.coverImageUrl,
    inlineImages: posts.inlineImages,
    content: posts.content,
  }).from(posts).where(and(eq(posts.id, asset.postId), eq(posts.userId, userId))).limit(1);
  if (!post) return;

  const changes: Partial<typeof posts.$inferInsert> = {};
  if (post.coverImageUrl === asset.storagePath) changes.coverImageUrl = null;
  if ((post.inlineImages || []).includes(asset.storagePath)) {
    changes.inlineImages = (post.inlineImages || []).filter((path) => path !== asset.storagePath);
  }
  if ((post.content || "").includes(asset.storagePath)) {
    changes.content = removeInlineImagePath(post.content || "", asset.storagePath);
  }
  if (Object.keys(changes).length) {
    await executor.update(posts).set(changes).where(and(eq(posts.id, asset.postId), eq(posts.userId, userId)));
  }
}

function serializeAsset(row: any) {
  return {
    ...row,
    storage_path: row.storagePath,
    alt_text: row.altText,
    model_id: row.modelId,
    aspect_ratio: row.aspectRatio,
    file_size_bytes: row.fileSizeBytes,
    source_url: row.sourceUrl,
    license_label: row.licenseLabel,
    attribution_url: row.attributionUrl,
    source_kind: row.sourceKind,
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
    alt_text: row.altText,
    aspect_ratio: row.aspectRatio,
    model_id: row.modelId,
    retry_count: row.retryCount,
    available_at: row.availableAt,
    source_url: row.sourceUrl,
    license_label: row.licenseLabel,
    attribution_url: row.attributionUrl,
    imported_asset_id: row.importedAssetId,
    last_error: row.lastError,
    completed_via: row.completedVia,
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
      altText: imageAssets.altText,
      modelId: imageAssets.modelId,
      provider: imageAssets.provider,
      aspectRatio: imageAssets.aspectRatio,
      resolution: imageAssets.resolution,
      position: imageAssets.position,
      cost: imageAssets.cost,
      fileSizeBytes: imageAssets.fileSizeBytes,
      sourceUrl: imageAssets.sourceUrl,
      credit: imageAssets.credit,
      licenseLabel: imageAssets.licenseLabel,
      attributionUrl: imageAssets.attributionUrl,
      sourceKind: imageAssets.sourceKind,
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
  if (status === "active") {
    conditions.push(inArray(imageGenerationRequests.status, ["pending", "queued", "processing"]));
  } else if (status === "all") {
    conditions.push(inArray(imageGenerationRequests.status, ["pending", "queued", "processing", "failed", "done"]));
  } else if (status) {
    conditions.push(eq(imageGenerationRequests.status, status));
  }

  const rows = await db
    .select({
      id: imageGenerationRequests.id,
      postId: imageGenerationRequests.postId,
      jobId: imageGenerationRequests.jobId,
      provider: imageGenerationRequests.provider,
      prompt: imageGenerationRequests.prompt,
      altText: imageGenerationRequests.altText,
      modelId: imageGenerationRequests.modelId,
      type: imageGenerationRequests.type,
      position: imageGenerationRequests.position,
      aspectRatio: imageGenerationRequests.aspectRatio,
      resolution: imageGenerationRequests.resolution,
      status: imageGenerationRequests.status,
      retryCount: imageGenerationRequests.retryCount,
      availableAt: imageGenerationRequests.availableAt,
      sourceUrl: imageGenerationRequests.sourceUrl,
      credit: imageGenerationRequests.credit,
      licenseLabel: imageGenerationRequests.licenseLabel,
      attributionUrl: imageGenerationRequests.attributionUrl,
      importedAssetId: imageGenerationRequests.importedAssetId,
      lastError: imageGenerationRequests.lastError,
      completedVia: imageGenerationRequests.completedVia,
      createdAt: imageGenerationRequests.createdAt,
      updatedAt: imageGenerationRequests.updatedAt,
      postTitle: posts.title,
    })
    .from(imageGenerationRequests)
    .leftJoin(posts, eq(imageGenerationRequests.postId, posts.id))
    .where(and(...conditions))
    .orderBy(desc(imageGenerationRequests.createdAt));

  if ((status === "active" || status === "all") && rows.some((row) => row.provider === "ai-deferred" && row.status === "queued")) {
    kickDeferredImageWorker(userId);
  }

  return c.json(rows.map(serializeRequest));
});

imagesRoutes.post("/queue/process", async (c) => {
  const userId = getUserId(c);
  const results = await drainDeferredImages(userId);
  return c.json({
    processed: results.some((result) => result.processed),
    results,
    ...results.find((result) => result.processed),
    error: results.find((result) => result.error)?.error,
  });
});

imagesRoutes.post("/posts/:postId/manual-prompts", async (c) => {
  const userId = getUserId(c);
  const postId = c.req.param("postId");

  try {
    const result = await createManualImagePromptRequestsForPost(userId, postId);
    return c.json(result, result.created > 0 ? 201 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create image prompts";
    const status = message === "Post not found" ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

imagesRoutes.post("/requests/:id/retry", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [request] = await db
    .select()
    .from(imageGenerationRequests)
    .where(and(eq(imageGenerationRequests.id, id), eq(imageGenerationRequests.userId, userId)))
    .limit(1);

  if (!request) return c.json({ error: "Image request not found" }, 404);
  if (!canRestartImageRequest(request.provider, request.status)) {
    return c.json({ error: "Only active or failed AI image requests can be restarted" }, 400);
  }

  const [updated] = await db
    .update(imageGenerationRequests)
    .set({
      status: "queued",
      retryCount: request.status === "processing" ? (request.retryCount || 0) + 1 : 0,
      lastError: null,
      completedVia: null,
      availableAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(imageGenerationRequests.id, id), eq(imageGenerationRequests.userId, userId)))
    .returning();

  kickDeferredImageWorker(userId);
  return c.json(serializeRequest(updated));
});

imagesRoutes.patch("/requests/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { status } = await c.req.json();
  if (!["cancelled", "done"].includes(status)) return c.json({ error: "Invalid status" }, 400);

  const [updated] = await db
    .update(imageGenerationRequests)
    .set({ status, updatedAt: new Date() } as any)
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
  if (request.status === "done" && request.importedAssetId) {
    const [asset] = await db.select().from(imageAssets).where(and(
      eq(imageAssets.id, request.importedAssetId),
      eq(imageAssets.userId, userId),
    )).limit(1);
    if (asset) return c.json({ request: serializeRequest(request), asset: serializeAsset(asset), idempotent: true });
  }

  const staleImport = new Date(Date.now() - 15 * 60 * 1000);
  const [claimedRequest] = await db
    .update(imageGenerationRequests)
    .set({ status: "importing", lastError: null, updatedAt: new Date() })
    .where(and(
      eq(imageGenerationRequests.id, id),
      eq(imageGenerationRequests.userId, userId),
      or(
        inArray(imageGenerationRequests.status, ["pending", "queued", "processing", "failed"]),
        and(eq(imageGenerationRequests.status, "importing"), lt(imageGenerationRequests.updatedAt, staleImport)),
      ),
    ))
    .returning();

  if (!claimedRequest) {
    return c.json({ error: request.status === "done" ? "Imported image metadata is incomplete" : "This image request is already being imported" }, 409);
  }

  let buffer: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer());
  try {
    const sharp = (await import("sharp")).default;
    buffer = await sharp(buffer).webp({ quality: 85 }).toBuffer();
  } catch {}

  const assetOptions = {
    type: request.type,
    prompt: request.prompt,
    altText: request.altText || undefined,
    modelId: `manual/${request.provider}`,
    provider: request.provider,
    aspectRatio: request.aspectRatio || undefined,
    resolution: request.resolution || undefined,
    position: request.position ?? undefined,
    cost: 0,
    sourceUrl: request.sourceUrl || undefined,
    credit: request.credit || undefined,
    licenseLabel: request.licenseLabel || "Manual/local",
    attributionUrl: request.attributionUrl || undefined,
    sourceKind: "manual",
    jobId: request.jobId || undefined,
    postId: request.postId || undefined,
  };

  let storagePath: string | null = null;
  try {
    storagePath = await storeImageBuffer(buffer, userId, `${userId}/manual-imports/${id}.webp`);
    const result = await db.transaction(async (tx) => {
      const [asset] = await tx.insert(imageAssets).values(imageAssetValues(buffer, userId, storagePath!, assetOptions)).returning();
      await attachImageRequestToPost(claimedRequest, storagePath!, "auto", userId, tx);
      const [updated] = await tx
        .update(imageGenerationRequests)
        .set({ status: "done", importedAssetId: asset.id, completedVia: "manual", lastError: null, updatedAt: new Date() })
        .where(and(
          eq(imageGenerationRequests.id, id),
          eq(imageGenerationRequests.userId, userId),
          eq(imageGenerationRequests.status, "importing"),
        ))
        .returning();
      if (!updated) throw new Error("Image import claim expired before completion");
      return { asset, updated };
    });
    return c.json({ request: serializeRequest(result.updated), asset: serializeAsset(result.asset) }, 201);
  } catch (error) {
    let message = error instanceof Error ? error.message : "Image import failed";
    if (storagePath) {
      try {
        await deleteFile(storagePath);
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        message = `${message}; storage cleanup failed: ${cleanupMessage}`;
      }
    }
    await db.update(imageGenerationRequests).set({ status: "failed", lastError: message, updatedAt: new Date() }).where(and(
      eq(imageGenerationRequests.id, id),
      eq(imageGenerationRequests.userId, userId),
      eq(imageGenerationRequests.status, "importing"),
    ));
    return c.json({ error: message }, 500);
  }
});

imagesRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [asset] = await db.update(imageAssets).set({ status: "deleting" }).where(and(
    eq(imageAssets.id, id),
    eq(imageAssets.userId, userId),
    ne(imageAssets.status, "deleting"),
  )).returning();

  if (!asset) return c.json({ error: "Image not found" }, 404);

  try {
    await deleteFile(asset.storagePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage deletion failed";
    await db.update(imageAssets).set({ status: "delete_failed" }).where(and(eq(imageAssets.id, id), eq(imageAssets.userId, userId)));
    return c.json({ error: message, failed: [id] }, 502);
  }

  try {
    await db.transaction(async (tx) => {
      await detachDeletedAsset(tx, asset, userId);
      await tx.delete(imageAssets).where(and(eq(imageAssets.id, id), eq(imageAssets.userId, userId)));
    });
  } catch (error) {
    await db.update(imageAssets).set({ status: "delete_failed" }).where(and(eq(imageAssets.id, id), eq(imageAssets.userId, userId)));
    return c.json({ error: error instanceof Error ? error.message : "Image metadata deletion failed", failed: [id] }, 500);
  }
  return c.json({ success: true });
});

imagesRoutes.post("/bulk-delete", async (c) => {
  const userId = getUserId(c);
  const { ids } = await c.req.json();
  if (!ids?.length) return c.json({ error: "No ids" }, 400);

  const assets = await db.update(imageAssets).set({ status: "deleting" }).where(and(
    inArray(imageAssets.id, ids),
    eq(imageAssets.userId, userId),
    ne(imageAssets.status, "deleting"),
  )).returning();

  const deletionResults = await Promise.allSettled(assets.map((asset) => deleteFile(asset.storagePath)));
  const partition = partitionSettled(assets, deletionResults);
  const deletedAssets = partition.completed;
  const failedAssets = partition.failed.map(({ item }) => item);

  if (failedAssets.length) {
    await db.update(imageAssets).set({ status: "delete_failed" }).where(and(
      inArray(imageAssets.id, failedAssets.map((asset) => asset.id)),
      eq(imageAssets.userId, userId),
    ));
  }

  try {
    if (deletedAssets.length) {
      await db.transaction(async (tx) => {
        for (const asset of deletedAssets) await detachDeletedAsset(tx, asset, userId);
        await tx.delete(imageAssets).where(and(
          inArray(imageAssets.id, deletedAssets.map((asset) => asset.id)),
          eq(imageAssets.userId, userId),
        ));
      });
    }
  } catch (error) {
    await db.update(imageAssets).set({ status: "delete_failed" }).where(and(
      inArray(imageAssets.id, deletedAssets.map((asset) => asset.id)),
      eq(imageAssets.userId, userId),
    ));
    return c.json({ error: error instanceof Error ? error.message : "Image metadata deletion failed", deleted: 0, failed: assets.map((asset) => asset.id) }, 500);
  }

  const failed = partition.failed.map(({ item, error }) => ({ id: item.id, error }));
  return c.json({ success: failed.length === 0, deleted: deletedAssets.length, failed }, failed.length ? 207 : 200);
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

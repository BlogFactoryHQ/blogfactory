import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { imageGenerationRequests } from "../db/schema.js";
import { attachPostImage } from "./image-post-attachments.js";
import { imageSlotFromRequest, type ImageSlot } from "./image-slots.js";

export type ImageProcessResult = {
  processed: boolean;
  status?: "done" | "queued" | "failed" | "cancelled";
  storagePath?: string;
  error?: string;
};

export async function queueDeferredImageRequest(opts: {
  userId: string;
  postId: string;
  jobId: string;
  imageModel: string;
  slot: ImageSlot;
}) {
  const [existing] = await db
    .select({
      id: imageGenerationRequests.id,
      status: imageGenerationRequests.status,
      prompt: imageGenerationRequests.prompt,
      modelId: imageGenerationRequests.modelId,
    })
    .from(imageGenerationRequests)
    .where(and(
      eq(imageGenerationRequests.userId, opts.userId),
      eq(imageGenerationRequests.postId, opts.postId),
      eq(imageGenerationRequests.provider, "ai-deferred"),
      eq(imageGenerationRequests.type, opts.slot.type),
      eq(imageGenerationRequests.position, opts.slot.position),
      inArray(imageGenerationRequests.status, ["queued", "processing", "done"])
    ))
    .orderBy(desc(imageGenerationRequests.createdAt))
    .limit(1);

  if (existing?.status === "queued") {
    await db.update(imageGenerationRequests).set({
      modelId: opts.imageModel,
      prompt: opts.slot.prompt,
      altText: opts.slot.altText,
      aspectRatio: opts.slot.aspectRatio,
      resolution: opts.slot.resolution,
      retryCount: 0,
      availableAt: new Date(),
      lastError: null,
      completedVia: null,
      updatedAt: new Date(),
    }).where(eq(imageGenerationRequests.id, existing.id));
    return { id: existing.id, created: false, status: "queued" };
  }

  if (existing?.status === "processing" || (existing && existing.prompt === opts.slot.prompt && existing.modelId === opts.imageModel)) {
    return { id: existing.id, created: false, status: existing.status };
  }

  const [request] = await db.insert(imageGenerationRequests).values({
    userId: opts.userId,
    postId: opts.postId,
    jobId: opts.jobId,
    provider: "ai-deferred",
    modelId: opts.imageModel,
    prompt: opts.slot.prompt,
    altText: opts.slot.altText,
    type: opts.slot.type,
    position: opts.slot.position,
    aspectRatio: opts.slot.aspectRatio,
    resolution: opts.slot.resolution,
    status: "queued",
  }).returning({ id: imageGenerationRequests.id });
  return { id: request?.id || null, created: true, status: "queued" };
}

async function claimNextDeferredImageRequest(userId?: string) {
  const userFilter = userId ? sql`and user_id = ${userId}` : sql``;
  const claimed = await db.execute(sql`
    with next_request as (
      select id
      from image_generation_requests
      where provider = 'ai-deferred'
        and status = 'queued'
        and available_at <= now()
        and post_id is not null
        and job_id is not null
        and model_id is not null
        ${userFilter}
      order by created_at
      for update skip locked
      limit 1
    )
    update image_generation_requests
    set status = 'processing', updated_at = now()
    from next_request
    where image_generation_requests.id = next_request.id
    returning
      image_generation_requests.id,
      image_generation_requests.user_id as "userId",
      image_generation_requests.post_id as "postId",
      image_generation_requests.job_id as "jobId",
      image_generation_requests.provider,
      image_generation_requests.prompt,
      image_generation_requests.alt_text as "altText",
      image_generation_requests.model_id as "modelId",
      image_generation_requests.type,
      image_generation_requests.position,
      image_generation_requests.aspect_ratio as "aspectRatio",
      image_generation_requests.resolution,
      image_generation_requests.status,
      image_generation_requests.retry_count as "retryCount",
      image_generation_requests.available_at as "availableAt",
      image_generation_requests.source_url as "sourceUrl",
      image_generation_requests.credit,
      image_generation_requests.license_label as "licenseLabel",
      image_generation_requests.attribution_url as "attributionUrl",
      image_generation_requests.imported_asset_id as "importedAssetId",
      image_generation_requests.last_error as "lastError",
      image_generation_requests.completed_via as "completedVia",
      image_generation_requests.created_at as "createdAt",
      image_generation_requests.updated_at as "updatedAt"
  `);
  return ((claimed as any)[0] || (claimed as any).rows?.[0] || null) as typeof imageGenerationRequests.$inferSelect | null;
}

async function processClaimedDeferredImage(request: typeof imageGenerationRequests.$inferSelect): Promise<ImageProcessResult> {
  if (!request.postId || !request.jobId || !request.modelId) return { processed: false };
  const attemptRetryCount = request.retryCount || 0;
  try {
    const { generateQueuedImageRequest } = await import("./generate-content.js");
    const result = await generateQueuedImageRequest(request);
    if (!result?.storagePath) throw new Error("Provider did not return an image");

    const [current] = await db
      .select({ status: imageGenerationRequests.status, retryCount: imageGenerationRequests.retryCount })
      .from(imageGenerationRequests)
      .where(eq(imageGenerationRequests.id, request.id))
      .limit(1);
    if (current?.status !== "processing" || (current.retryCount || 0) !== attemptRetryCount) {
      return { processed: false, status: "cancelled" };
    }

    await attachPostImage(request.postId, imageSlotFromRequest(request), result.storagePath, "auto");
    await db.update(imageGenerationRequests).set({ status: "done", completedVia: "ai", lastError: null, updatedAt: new Date() }).where(eq(imageGenerationRequests.id, request.id));
    return { processed: true, status: "done", storagePath: result.storagePath };
  } catch (err: any) {
    const retryCount = (request.retryCount || 0) + 1;
    if (retryCount >= 3) {
      await db.update(imageGenerationRequests).set({
        status: "failed",
        lastError: err?.message || "Image generation failed",
        retryCount,
        updatedAt: new Date(),
      }).where(and(
        eq(imageGenerationRequests.id, request.id),
        eq(imageGenerationRequests.status, "processing"),
        eq(imageGenerationRequests.retryCount, attemptRetryCount)
      ));
      return { processed: false, status: "failed", error: err?.message || "Image generation failed" };
    }
    const backoffMinutes = Math.min(120, 10 * retryCount);
    await db.update(imageGenerationRequests).set({
      status: "queued",
      retryCount,
      lastError: err?.message || "Image generation failed",
      availableAt: new Date(Date.now() + backoffMinutes * 60_000),
      updatedAt: new Date(),
    }).where(and(
      eq(imageGenerationRequests.id, request.id),
      eq(imageGenerationRequests.status, "processing"),
      eq(imageGenerationRequests.retryCount, attemptRetryCount)
    ));
    return { processed: false, status: "queued", error: err?.message || "Image generation failed" };
  }
}

async function resetStaleImageProcessing() {
  await db.update(imageGenerationRequests).set({
    status: "queued",
    retryCount: sql`coalesce(${imageGenerationRequests.retryCount}, 0) + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(imageGenerationRequests.provider, "ai-deferred"),
    eq(imageGenerationRequests.status, "processing"),
    lte(imageGenerationRequests.updatedAt, new Date(Date.now() - 20 * 60_000))
  ));
}

async function claimDeferredImageRequestById(id: string, userId?: string) {
  const conditions = [
    eq(imageGenerationRequests.id, id),
    eq(imageGenerationRequests.provider, "ai-deferred"),
    eq(imageGenerationRequests.status, "queued"),
    lte(imageGenerationRequests.availableAt, new Date()),
  ];
  if (userId) conditions.push(eq(imageGenerationRequests.userId, userId));
  const [request] = await db.update(imageGenerationRequests)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return request || null;
}

export async function processDeferredImageRequest(id: string, userId?: string) {
  const request = await claimDeferredImageRequestById(id, userId);
  if (!request || !request.postId || !request.jobId || !request.modelId) return { processed: false };
  return processClaimedDeferredImage(request);
}

export async function processNextDeferredImage(userId?: string) {
  await resetStaleImageProcessing();

  const request = await claimNextDeferredImageRequest(userId);
  if (!request || !request.postId || !request.jobId || !request.modelId) return { processed: false };
  return processClaimedDeferredImage(request);
}

export async function drainDeferredImages(userId?: string) {
  return [await processNextDeferredImage(userId)];
}

export function kickDeferredImageWorker(userId?: string) {
  setTimeout(() => {
    // ponytail: best-effort local wake; cron is the durable worker on deploy.
    (async () => {
      await drainDeferredImages(userId);
    })().catch((err) => console.warn("[images] Deferred worker kick failed:", err instanceof Error ? err.message : err));
  }, 0);
}

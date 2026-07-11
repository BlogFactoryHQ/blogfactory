import { db } from "../db/index.js";
import { imageAssets } from "../db/schema.js";
import { randomUUID } from "crypto";
import { putObject, deleteObject } from "./s3-client.js";
import { compensateAfterLocalFailure } from "./atomic-state.js";

export async function uploadFile(file: File, userId: string) {
  const ext = file.name.split(".").pop() || "webp";
  const folder = `${userId}/${new Date().toISOString().slice(0, 7)}`;
  const filename = `${randomUUID()}.${ext}`;
  const storagePath = `${folder}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await putObject(storagePath, buffer, file.type || "image/webp");

  let asset: typeof imageAssets.$inferSelect;
  try {
    [asset] = await db
      .insert(imageAssets)
      .values({
        userId,
        storagePath,
        type: "cover",
        status: "unused",
        fileSizeBytes: buffer.length,
      })
      .returning();
  } catch (error) {
    await compensateStoredFile(storagePath, error);
  }

  return asset!;
}

export interface ImageBufferOptions {
  type?: string;
  prompt?: string;
  altText?: string;
  modelId?: string;
  provider?: string;
  aspectRatio?: string;
  resolution?: string;
  position?: number;
  cost?: number;
  sourceUrl?: string;
  credit?: string;
  licenseLabel?: string;
  attributionUrl?: string;
  sourceKind?: string;
  jobId?: string;
  postId?: string;
}

export async function storeImageBuffer(buffer: Buffer, userId: string, requestedPath?: string) {
  const folder = `${userId}/${new Date().toISOString().slice(0, 7)}`;
  const storagePath = requestedPath || `${folder}/${randomUUID()}.webp`;
  await putObject(storagePath, buffer, "image/webp");
  return storagePath;
}

export function imageAssetValues(buffer: Buffer, userId: string, storagePath: string, opts: ImageBufferOptions = {}) {
  return {
    userId,
    storagePath,
    type: opts.type || "cover",
    status: opts.postId ? "used" : "unused",
    prompt: opts.prompt,
    altText: opts.altText,
    modelId: opts.modelId,
    provider: opts.provider,
    aspectRatio: opts.aspectRatio,
    resolution: opts.resolution,
    position: opts.position,
    cost: opts.cost,
    sourceUrl: opts.sourceUrl,
    credit: opts.credit,
    licenseLabel: opts.licenseLabel,
    attributionUrl: opts.attributionUrl,
    sourceKind: opts.sourceKind,
    fileSizeBytes: buffer.length,
    jobId: opts.jobId,
    postId: opts.postId,
  } satisfies typeof imageAssets.$inferInsert;
}

export async function saveImageBuffer(
  buffer: Buffer,
  userId: string,
  opts: ImageBufferOptions = {}
): Promise<{ storagePath: string; asset: typeof imageAssets.$inferSelect }> {
  const storagePath = await storeImageBuffer(buffer, userId);
  let asset: typeof imageAssets.$inferSelect;
  try {
    [asset] = await db.insert(imageAssets).values(imageAssetValues(buffer, userId, storagePath, opts)).returning();
  } catch (error) {
    await compensateStoredFile(storagePath, error);
  }

  return { storagePath, asset: asset! };
}

export async function deleteFile(storagePath: string) {
  await deleteObject(storagePath);
}

async function compensateStoredFile(storagePath: string, originalError: unknown): Promise<never> {
  return compensateAfterLocalFailure(originalError, () => deleteObject(storagePath), "Image metadata could not be saved");
}

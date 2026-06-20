import { db } from "../db/index.js";
import { imageAssets } from "../db/schema.js";
import { randomUUID } from "crypto";
import { putObject, deleteObject } from "./s3-client.js";

export async function uploadFile(file: File, userId: string) {
  const ext = file.name.split(".").pop() || "webp";
  const folder = `${userId}/${new Date().toISOString().slice(0, 7)}`;
  const filename = `${randomUUID()}.${ext}`;
  const storagePath = `${folder}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await putObject(storagePath, buffer, file.type || "image/webp");

  const [asset] = await db
    .insert(imageAssets)
    .values({
      userId,
      storagePath,
      type: "cover",
      status: "unused",
      fileSizeBytes: buffer.length,
    })
    .returning();

  return asset;
}

export async function saveImageBuffer(
  buffer: Buffer,
  userId: string,
  opts: {
    type?: string;
    prompt?: string;
    modelId?: string;
    provider?: string;
    aspectRatio?: string;
    resolution?: string;
    position?: number;
    cost?: number;
    jobId?: string;
    postId?: string;
  } = {}
): Promise<{ storagePath: string; asset: any }> {
  const folder = `${userId}/${new Date().toISOString().slice(0, 7)}`;
  const filename = `${randomUUID()}.webp`;
  const storagePath = `${folder}/${filename}`;

  await putObject(storagePath, buffer, "image/webp");

  const [asset] = await db
    .insert(imageAssets)
    .values({
      userId,
      storagePath,
      type: opts.type || "cover",
      status: opts.postId ? "used" : "unused",
      prompt: opts.prompt,
      modelId: opts.modelId,
      provider: opts.provider,
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
      position: opts.position,
      cost: opts.cost,
      fileSizeBytes: buffer.length,
      jobId: opts.jobId,
      postId: opts.postId,
    })
    .returning();

  return { storagePath, asset };
}

export async function deleteFile(storagePath: string) {
  try {
    await deleteObject(storagePath);
  } catch {}
}

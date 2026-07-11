import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { imageAssets, imageGenerationRequests, posts } from "../db/schema.js";
import { normalizeImagePlacement, reflowInlineImages, removeInlineImagePath } from "./image-placement.js";
import { imageSlotFromRequest, type ImageSlot } from "./image-slots.js";

async function attachInlineImage(postId: string, path: string, placement: unknown, altText?: string | null, position?: number | null, userId?: string) {
  const conditions = [eq(posts.id, postId)];
  if (userId) conditions.push(eq(posts.userId, userId));
  const [post] = await db.select({ content: posts.content, coverImageUrl: posts.coverImageUrl, inlineImages: posts.inlineImages }).from(posts).where(and(...conditions)).limit(1);
  if (!post) return;
  const inlineImages = [...(post.inlineImages || [])];
  if (path === post.coverImageUrl) {
    await db.update(posts).set({
      inlineImages: inlineImages.filter((image) => image !== path),
      content: removeInlineImagePath(post.content || "", path),
    }).where(and(...conditions));
    return;
  }
  const nextInlineImages = inlineImages.filter(Boolean);
  if (!inlineImages.includes(path)) {
    const insertAt = typeof position === "number" && position >= 0
      ? Math.min(position, nextInlineImages.length)
      : nextInlineImages.length;
    nextInlineImages.splice(insertAt, 0, path);
  }
  const previousContent = post.content || "";
  const placementMode = normalizeImagePlacement(placement);
  const uniqueInlineImages = Array.from(new Set(nextInlineImages));
  const content = placementMode === "featured_only"
    ? previousContent
    : reflowInlineImages(
      previousContent,
      uniqueInlineImages.map((url) => ({ url, altText: url === path ? altText : undefined })),
      placementMode
    );
  await db.update(posts).set({
    inlineImages: uniqueInlineImages,
    content,
  }).where(and(...conditions));
}

export async function attachPostImage(postId: string, slot: ImageSlot, path: string, placement: unknown, userId?: string) {
  const conditions = [eq(posts.id, postId)];
  if (userId) conditions.push(eq(posts.userId, userId));
  if (slot.type === "cover") {
    const [post] = await db.select({ content: posts.content, inlineImages: posts.inlineImages, publishingMetadata: posts.publishingMetadata }).from(posts).where(and(...conditions)).limit(1);
    const [asset] = await db.select().from(imageAssets).where(eq(imageAssets.storagePath, path)).limit(1);
    const metadata = post?.publishingMetadata && typeof post.publishingMetadata === "object" ? post.publishingMetadata as Record<string, unknown> : null;
    const image = metadata?.image && typeof metadata.image === "object" ? metadata.image as Record<string, unknown> : {};
    const routingWarnings = Array.isArray(metadata?.routingWarnings)
      ? metadata.routingWarnings.filter((warning) => typeof warning !== "string" || !warning.includes("Cover image metadata"))
      : [];
    const nextMetadata = metadata?.profile === "ortak_alan_news"
      ? {
          ...metadata,
          image: {
            ...image,
            alt: asset?.altText || slot.altText || image.alt || "",
            source: asset?.credit || asset?.sourceUrl || asset?.provider || image.source || "",
            license: asset?.licenseLabel || image.license || "",
            aiGenerated: asset?.sourceKind === "ai",
          },
          routingWarnings,
        }
      : metadata;
    await db.update(posts).set({
      coverImageUrl: path,
      inlineImages: (post?.inlineImages || []).filter((image) => image !== path),
      content: removeInlineImagePath(post?.content || "", path),
      ...(nextMetadata ? { publishingMetadata: nextMetadata } : {}),
    }).where(and(...conditions));
  } else {
    await attachInlineImage(postId, path, placement, slot.altText, slot.position, userId);
  }
}

export async function attachImageRequestToPost(request: typeof imageGenerationRequests.$inferSelect, path: string, placement?: unknown, userId?: string) {
  if (!request.postId) return;
  await attachPostImage(request.postId, imageSlotFromRequest(request), path, placement, userId);
}

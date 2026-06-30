import { queueDeferredImageRequest, drainDeferredImages, kickDeferredImageWorker, processNextDeferredImage } from "./ai-image-queue.js";
import { attachImageRequestToPost, attachPostImage } from "./image-post-attachments.js";
import {
  buildImagePrompt,
  buildImageSlots,
  imageModelForTarget,
  imageRouteForSlot,
  normalizeInlineImageSource,
  type ImageResolutionResult,
  type ImageSlotResult,
  type InlineImageSource,
} from "./image-slots.js";
import { stockOrientation, stockQueries, stockQuery, stockSourceKey, stockSourceUrlKey, tryStockImage, usableStockCandidate } from "./stock-images.js";

export {
  attachImageRequestToPost,
  buildImagePrompt,
  buildImageSlots,
  drainDeferredImages,
  imageModelForTarget,
  imageRouteForSlot,
  kickDeferredImageWorker,
  normalizeInlineImageSource,
  processNextDeferredImage,
  stockOrientation,
  stockQueries,
  stockQuery,
  stockSourceKey,
  stockSourceUrlKey,
  usableStockCandidate,
};
export type { ImageResolutionResult, InlineImageSource };

export interface LowCostImageSettings {
  inlineImageSource?: InlineImageSource | null;
}

export async function resolvePostImages(opts: {
  content: string;
  title: string;
  userId: string;
  postId: string;
  jobId: string;
  imageConfig: any;
  imageModel?: string | null;
  inlineImageModel?: string | null;
  stylePrompt?: string | null;
  settings?: LowCostImageSettings | null;
}): Promise<ImageResolutionResult> {
  const settings = opts.settings || {};
  const imageModel = opts.imageModel || "openrouter/auto";
  const inlineImageModel = opts.inlineImageModel || "openrouter/auto";
  const inlineSource = normalizeInlineImageSource(settings.inlineImageSource);
  const slots = buildImageSlots({ imageConfig: opts.imageConfig, content: opts.content, title: opts.title, stylePrompt: opts.stylePrompt });
  const usedSourceUrls = new Set<string>();
  let coverPath: string | null = null;
  const inlinePaths: string[] = [];
  const results: ImageSlotResult[] = [];
  let queued = 0;
  let failed = 0;

  for (const slot of slots) {
    try {
      if (imageRouteForSlot(slot.type, inlineSource) === "ai") {
        const queuedRequest = await queueDeferredImageRequest({ ...opts, imageModel: imageModelForTarget(imageModel, slot.type, inlineImageModel), slot });
        if (queuedRequest.created) queued += 1;
        results.push({ slot, status: "queued", queuedRequestId: queuedRequest.id || undefined, provider: "ai-deferred" });
        console.info("[images] queued", { jobId: opts.jobId, type: slot.type, position: slot.position, requestId: queuedRequest.id });
        continue;
      }

      const stock = await tryStockImage({ ...opts, slot, usedSourceUrls });
      if (!stock?.storagePath) {
        failed += 1;
        results.push({ slot, status: "failed", error: "No stock image found" });
        continue;
      }

      await attachPostImage(opts.postId, slot, stock.storagePath, "auto");
      if (slot.type === "cover") coverPath ||= stock.storagePath;
      else inlinePaths[slot.position] = stock.storagePath;
      results.push(stock);
      console.info("[images] attached", { jobId: opts.jobId, type: slot.type, position: slot.position, provider: stock.provider, query: stock.query });
    } catch (err) {
      failed += 1;
      const error = err instanceof Error ? err.message : "Image slot failed";
      results.push({ slot, status: "failed", error });
      console.warn("[images] slot failed", { jobId: opts.jobId, type: slot.type, position: slot.position, error });
    }
  }

  return { coverPath, inlinePaths: inlinePaths.filter(Boolean), queued, failed, cost: 0, results };
}

export async function resolveLowCostImages(opts: Parameters<typeof resolvePostImages>[0]) {
  return resolvePostImages(opts);
}

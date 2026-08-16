import { queueDeferredImageRequest, drainDeferredImages, kickDeferredImageWorker, processDeferredImageRequest, processNextDeferredImage, staleImageRequestShouldFail } from "./ai-image-queue.js";
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
  processDeferredImageRequest,
  processNextDeferredImage,
  stockOrientation,
  stockQueries,
  stockQuery,
  stockSourceKey,
  stockSourceUrlKey,
  staleImageRequestShouldFail,
  usableStockCandidate,
};
export type { ImageResolutionResult, InlineImageSource };

export interface LowCostImageSettings {
  inlineImageSource?: InlineImageSource | null;
}

export function shouldProcessAiImagesNow(count: number, immediateAi = true) {
  return immediateAi && count > 0 && count <= 2;
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
  immediateAi?: boolean;
}): Promise<ImageResolutionResult> {
  const settings = opts.settings || {};
  const imageModel = opts.imageModel || "";
  const inlineImageModel = opts.inlineImageModel || "";
  const inlineSource = normalizeInlineImageSource(settings.inlineImageSource);
  const slots = buildImageSlots({ imageConfig: opts.imageConfig, content: opts.content, title: opts.title, stylePrompt: opts.stylePrompt });
  const usedSourceUrls = new Set<string>();
  let coverPath: string | null = null;
  const inlinePaths: string[] = [];
  const results: ImageSlotResult[] = [];
  const aiRequests: Array<{ requestId: string; resultIndex: number; slot: (typeof slots)[number] }> = [];

  for (const slot of slots) {
    try {
      if (imageRouteForSlot(slot.type, inlineSource) === "ai") {
        const queuedRequest = await queueDeferredImageRequest({ ...opts, imageModel: imageModelForTarget(imageModel, slot.type, inlineImageModel), slot });
        const resultIndex = results.push({ slot, status: "queued", queuedRequestId: queuedRequest.id || undefined, provider: "ai-deferred" }) - 1;
        if (queuedRequest.id && queuedRequest.status === "queued") aiRequests.push({ requestId: queuedRequest.id, resultIndex, slot });
        console.info("[images] queued", { jobId: opts.jobId, type: slot.type, position: slot.position, requestId: queuedRequest.id });
        continue;
      }

      const stock = await tryStockImage({ ...opts, slot, usedSourceUrls });
      if (!stock?.storagePath) {
        results.push({ slot, status: "failed", error: "No stock image found" });
        continue;
      }

      await attachPostImage(opts.postId, slot, stock.storagePath, "auto");
      if (slot.type === "cover") coverPath ||= stock.storagePath;
      else inlinePaths[slot.position] = stock.storagePath;
      results.push(stock);
      console.info("[images] attached", { jobId: opts.jobId, type: slot.type, position: slot.position, provider: stock.provider, query: stock.query });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Image slot failed";
      results.push({ slot, status: "failed", error });
      console.warn("[images] slot failed", { jobId: opts.jobId, type: slot.type, position: slot.position, error });
    }
  }

  if (shouldProcessAiImagesNow(aiRequests.length, opts.immediateAi !== false)) {
    const processed = await Promise.all(aiRequests.map((request) => processDeferredImageRequest(request.requestId, opts.userId)));
    processed.forEach((processedResult, index) => {
      const request = aiRequests[index];
      const result = results[request.resultIndex];
      if (processedResult.processed && processedResult.storagePath) {
        result.status = "attached";
        result.storagePath = processedResult.storagePath;
        result.provider = "openrouter-image";
        if (request.slot.type === "cover") coverPath ||= processedResult.storagePath;
        else inlinePaths[request.slot.position] = processedResult.storagePath;
        return;
      }
      if (processedResult.status === "failed") result.status = "failed";
      if (processedResult.error) result.error = processedResult.error;
    });
  }

  const queued = results.filter((result) => result.status === "queued").length;
  const failed = results.filter((result) => result.status === "failed").length;
  return { coverPath, inlinePaths: inlinePaths.filter(Boolean), queued, failed, cost: 0, results };
}

export async function resolveLowCostImages(opts: Parameters<typeof resolvePostImages>[0]) {
  return resolvePostImages(opts);
}

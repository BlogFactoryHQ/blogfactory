import { buildImagePrompt, buildImageSlots, imageModelForTarget, imageRouteForSlot, normalizeInlineImageSource, shouldProcessAiImagesNow, stockOrientation, stockQueries, stockQuery, stockSourceKey, stockSourceUrlKey, usableStockCandidate } from "./low-cost-images.js";
import { imageTargets } from "./image-slots.js";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

assertEqual(normalizeInlineImageSource("stock"), "stock", "stock source is preserved");
assertEqual(normalizeInlineImageSource("ai"), "ai", "ai source is preserved");
assertEqual(normalizeInlineImageSource(undefined), "ai", "inline defaults to AI");

assertEqual(imageRouteForSlot("cover", "stock"), "ai", "cover always queues AI");
assertEqual(imageRouteForSlot("inline", "ai"), "ai", "inline AI queues AI");
assertEqual(imageRouteForSlot("inline", "stock"), "stock", "inline stock skips AI queue");
assertEqual(shouldProcessAiImagesNow(2), true, "one or two AI images process immediately");
assertEqual(shouldProcessAiImagesNow(3), false, "more than two AI images stay queued");
assertEqual(shouldProcessAiImagesNow(1, false), false, "low function budget keeps AI images queued");

assertEqual(
  imageModelForTarget("x-ai/grok-imagine-image-quality", "cover", "x-ai/grok-imagine-image-quality"),
  "x-ai/grok-imagine-image-quality",
  "cover uses selected cover model"
);

assertEqual(
  imageModelForTarget("x-ai/grok-imagine-image-quality", "inline", "x-ai/grok-imagine-image-quality"),
  "x-ai/grok-imagine-image-quality",
  "inline AI uses selected inline model"
);

assertEqual(
  imageTargets({ inline: { count: 1, resolution: "1K", aspectRatio: "3:2" } }).length,
  1,
  "inline config without enabled flag still creates targets"
);

assertEqual(
  imageTargets({ cover: { resolution: "512", aspectRatio: "16:9" }, inline: { count: 1, resolution: "512", aspectRatio: "3:2" } })[0].resolution,
  "512",
  "slot builder keeps 512 resolution"
);

assertEqual(
  imageTargets({ inline: { count: 0, resolution: "1K", aspectRatio: "3:2" } }).length,
  0,
  "inline count 0 creates no inline slots"
);

assertEqual(
  buildImageSlots({
    imageConfig: { cover: { resolution: "1K", aspectRatio: "16:9" }, inline: { count: 2, resolution: "1K", aspectRatio: "3:2" } },
    content: "Intro\n\n## First\n\nBody",
    title: "Test Article",
  }).length,
  3,
  "slot builder creates cover and inline slots"
);

assertEqual(
  buildImagePrompt({ content: "Article context", title: "Test", type: "cover", stylePrompt: "hand drawn only" }).startsWith("Shared visual style for every image in this article: hand drawn only"),
  true,
  "shared style prompt is first"
);

assertEqual(
  buildImagePrompt({ content: "This body should not be sent", title: "Test", type: "cover", stylePrompt: "hand drawn only" }).includes("This body should not be sent"),
  false,
  "image prompt does not include article body"
);

assertEqual(
  buildImagePrompt({ content: "Intro\n\n## Market impact\n\nBody", title: "Test", type: "inline", stylePrompt: "hand drawn only" }).includes("Inline focus: Market impact"),
  true,
  "inline prompt includes section focus"
);

assertEqual(
  stockQuery({ title: "Meta, yeni yapay zeka destekli akıllı gözlük serisini tanıttı", type: "cover" }),
  "smart glasses wearable technology",
  "smart glasses titles search wearable tech"
);

assertEqual(
  stockQuery({ title: "Meta Ray-Ban smart glasses", type: "inline" }),
  "smart glasses close up wearable device",
  "inline stock query differs from cover"
);

assertEqual(
  stockQueries({ title: "Cyera raises 600 million for data security", type: "inline" }).includes("cybersecurity data protection"),
  true,
  "stock query fallback includes category query"
);

assertEqual(
  stockQueries({ title: "Cyera raises 600 million for data security", type: "inline" })[0].includes("landscape editorial photo"),
  true,
  "stock search starts with editorial landscape query"
);

assertEqual(stockOrientation("16:9", "pexels"), "landscape", "wide Pexels image uses landscape");
assertEqual(stockOrientation("9:16", "pexels"), "portrait", "tall Pexels image uses portrait");
assertEqual(stockOrientation("1:1", "pexels"), "square", "square Pexels image uses square");
assertEqual(stockOrientation("1:1", "pixabay"), "", "square Pixabay image omits unsupported orientation");
assertEqual(stockSourceKey("pixabay", "https://pixabay.com/photos/example/", "51581"), "pixabay:https://pixabay.com/photos/example", "stock source keys normalize trailing slash");
assertEqual(stockSourceUrlKey("https://example.com/photo?id=1#crop"), "url:https://example.com/photo", "stock URL keys dedupe across providers");
assertEqual(usableStockCandidate("company logo typography poster"), false, "stock filter rejects logo/text-heavy metadata");
assertEqual(usableStockCandidate("editorial photo of business meeting"), true, "stock filter allows editorial photos");

console.log("low-cost-images self-check passed");

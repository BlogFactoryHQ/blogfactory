import { aiDailyLimitReached, buildImagePrompt, buildImageSlots, chooseImageResolution, countsTowardAiDailyLimit, imageModelForTarget, imageTargets, nextAiAvailableAt, shouldAttachStockWhileAiQueued, shouldFallbackRequestToStock, shouldQueueAiBeforeStock, shouldQueueAiUpgrade, sourceCandidateForSlot, stockOrientation, stockQueries, stockQuery, stockSourceKey } from "./low-cost-images.js";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

assertEqual(
  chooseImageResolution({ existingAsset: true, stockAsset: true, aiFallbackEnabled: true }),
  "existing",
  "existing asset beats stock"
);

assertEqual(
  chooseImageResolution({ stockAsset: true, aiFallbackEnabled: true }),
  "stock",
  "stock beats AI"
);

assertEqual(
  chooseImageResolution({ sourceCandidate: { allowed: false }, aiFallbackEnabled: true }),
  "queue_ai",
  "source image is rejected unless allowed"
);

assertEqual(
  chooseImageResolution({ aiFallbackEnabled: true }),
  "queue_ai",
  "AI fallback queues instead of generating inline"
);

assertEqual(
  chooseImageResolution({ aiFallbackEnabled: false }),
  "none",
  "disabled AI fallback returns none"
);

assertEqual(
  shouldQueueAiBeforeStock("cover", true),
  true,
  "cover queues selected AI before stock"
);

assertEqual(
  shouldQueueAiBeforeStock("inline", true),
  true,
  "inline queues free AI before stock"
);

assertEqual(
  shouldQueueAiUpgrade("cover", true),
  false,
  "cover no longer queues an upgrade after stock because AI is first"
);

assertEqual(
  shouldQueueAiUpgrade("inline", true),
  false,
  "inline does not queue a second AI upgrade"
);

assertEqual(
  shouldAttachStockWhileAiQueued("cover"),
  false,
  "cover does not attach stock while AI is queued"
);

assertEqual(
  shouldAttachStockWhileAiQueued("inline"),
  false,
  "inline does not attach stock while AI is queued"
);

assertEqual(
  imageModelForTarget("openai/gpt-image-1", "cover"),
  "openai/gpt-image-1",
  "cover uses selected model"
);

assertEqual(
  imageModelForTarget("openai/gpt-image-1", "inline"),
  "openrouter/free",
  "inline defaults to OpenRouter free"
);

assertEqual(
  imageModelForTarget("openai/gpt-image-1", "inline", "openai/gpt-image-1-mini"),
  "openai/gpt-image-1-mini",
  "inline can use its own selected model"
);

assertEqual(
  imageTargets({ inline: { count: 1, resolution: "1K", aspectRatio: "3:2" } }).length,
  1,
  "inline config without enabled flag still creates targets"
);

assertEqual(
  imageTargets({ inline: { count: 0, resolution: "Web", aspectRatio: "3:2" } }).length,
  0,
  "inline count 0 creates no inline slots"
);

assertEqual(
  buildImageSlots({
    imageConfig: { cover: { resolution: "1K", aspectRatio: "16:9" }, inline: { count: 2, resolution: "Web", aspectRatio: "3:2" } },
    content: "Intro\n\n## First\n\nBody",
    title: "Test Article",
  }).length,
  3,
  "slot builder creates cover and inline slots"
);

assertEqual(
  buildImagePrompt({ content: "Article context", title: "Test", type: "cover", stylePrompt: "hand drawn only" }).startsWith("Mandatory visual style: hand drawn only"),
  true,
  "style prompt is first and mandatory"
);

assertEqual(
  stockQuery({ title: "Meta, yeni yapay zeka destekli akıllı gözlük serisini tanıttı", type: "cover" }),
  "smart glasses wearable technology",
  "smart glasses titles search wearable tech stock"
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

const sourceCandidates = [{ url: "cover.webp" }, { url: "inline.webp" }];
assertEqual(
  sourceCandidateForSlot({ type: "inline", position: 0 }, sourceCandidates, new Set(["cover.webp"]), true)?.url,
  "inline.webp",
  "inline source selection skips the cover source image"
);

assertEqual(stockOrientation("16:9", "pexels"), "landscape", "wide Pexels image uses landscape");
assertEqual(stockOrientation("9:16", "pexels"), "portrait", "tall Pexels image uses portrait");
assertEqual(stockOrientation("1:1", "pexels"), "square", "square Pexels image uses square");
assertEqual(stockOrientation("1:1", "pixabay"), "", "square Pixabay image omits unsupported orientation");
assertEqual(stockSourceKey("pixabay", "https://pixabay.com/photos/example/", "51581"), "pixabay:https://pixabay.com/photos/example", "stock source keys normalize trailing slash");

assertEqual(aiDailyLimitReached(100, 0), false, "AI/day 0 means no daily cap");
assertEqual(aiDailyLimitReached(30, 30), true, "AI/day positive cap is enforced");
assertEqual(countsTowardAiDailyLimit("ai-deferred"), true, "AI-deferred completions count toward AI/day");
assertEqual(countsTowardAiDailyLimit("stock-fallback"), false, "stock fallback does not count toward AI/day");

assertEqual(shouldFallbackRequestToStock("cover"), false, "cover AI failure does not fall back to stock");
assertEqual(shouldFallbackRequestToStock("inline"), true, "inline AI failure can fall back to stock");
assertEqual(nextAiAvailableAt(new Date(Date.now() - 60_000), 5) instanceof Date, true, "recent AI completion gets a future availability time");
assertEqual(nextAiAvailableAt("2000-01-01T00:00:00Z", 5), null, "old AI completion does not delay the queue");

console.log("low-cost-images self-check passed");

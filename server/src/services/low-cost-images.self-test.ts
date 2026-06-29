import { chooseImageResolution, imageModelForTarget, imageTargets, shouldAttachStockWhileAiQueued, shouldQueueAiBeforeStock, stockQuery } from "./low-cost-images.js";

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
  shouldAttachStockWhileAiQueued("cover"),
  true,
  "cover gets an immediate stock placeholder while AI is queued"
);

assertEqual(
  shouldAttachStockWhileAiQueued("inline"),
  false,
  "inline avoids duplicate stock placeholders while AI is queued"
);

assertEqual(
  imageModelForTarget("google-ai-studio/gemini-3.1-flash-image", "cover"),
  "google-ai-studio/gemini-3.1-flash-image",
  "cover uses selected model"
);

assertEqual(
  imageModelForTarget("google-ai-studio/gemini-3.1-flash-image", "inline"),
  "openrouter/free",
  "inline uses free OpenRouter first"
);

assertEqual(
  imageTargets({ inline: { count: 1, resolution: "1K", aspectRatio: "3:2" } }).length,
  1,
  "inline config without enabled flag still creates targets"
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

console.log("low-cost-images self-check passed");

import { chooseImageResolution, shouldQueueAiBeforeStock } from "./low-cost-images.js";

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
  shouldQueueAiBeforeStock("ai_first", "cover", true, false),
  true,
  "AI first queues cover AI before stock"
);

assertEqual(
  shouldQueueAiBeforeStock("ai_first", "inline", true, false),
  false,
  "AI first only forces covers"
);

console.log("low-cost-images self-check passed");

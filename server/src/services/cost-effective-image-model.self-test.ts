import { costEffectiveImageModel, inlineImageModel } from "./generate-content.js";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

assertEqual(
  costEffectiveImageModel({ modelId: "auto/consistent-cover", openRouterKey: "o" }),
  "openrouter/free",
  "legacy consistent-cover alias maps to OpenRouter free"
);

assertEqual(
  costEffectiveImageModel({ modelId: "auto/consistent-cover", openRouterKey: "o" }),
  "openrouter/free",
  "legacy consistent-cover alias does not pick paid fallbacks"
);

assertEqual(
  costEffectiveImageModel({ modelId: "auto/cost-effective", openRouterKey: "o" }),
  "openrouter/free",
  "cheapest available uses OpenRouter free before paid fallbacks"
);

assertEqual(
  costEffectiveImageModel({ modelId: "google-ai-studio/gemini-3.1-flash-image", openRouterKey: "o" }),
  "openrouter/free",
  "legacy Google image provider maps to OpenRouter free"
);

assertEqual(
  costEffectiveImageModel({ modelId: "google/gemini-3.1-flash-image-preview", openRouterKey: "o" }),
  "openrouter/free",
  "Google-branded OpenRouter image models are hidden from image generation"
);

assertEqual(
  costEffectiveImageModel({ modelId: "replicate/black-forest-labs/flux-schnell", openRouterKey: "o" }),
  "openrouter/free",
  "legacy Replicate image provider maps to OpenRouter free"
);

assertEqual(
  costEffectiveImageModel({ modelId: "openai/gpt-image-2", openRouterKey: "o" }),
  "openai/gpt-image-2",
  "Explicit OpenRouter model id is preserved"
);

assertEqual(
  inlineImageModel({ imageAdvancedOptions: { inlineImageModel: "openai/gpt-image-1-mini" } }),
  "openai/gpt-image-1-mini",
  "inline model loads from stored advanced settings"
);

assertEqual(
  inlineImageModel({ image_advanced_options: { inline_image_model: "replicate/black-forest-labs/flux-schnell" } }),
  "openrouter/free",
  "legacy direct inline providers normalize to OpenRouter free"
);

assertEqual(
  inlineImageModel({ inline_image_model: "openrouter/free" }),
  "openrouter/free",
  "inline model loads from direct API alias"
);

assertEqual(
  inlineImageModel({}),
  "openrouter/free",
  "inline model defaults to OpenRouter free"
);

console.log("cost-effective-image-model self-check passed");

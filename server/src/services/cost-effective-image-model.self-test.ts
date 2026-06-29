import { costEffectiveImageModel, inlineImageModel } from "./generate-content.js";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

assertEqual(
  costEffectiveImageModel({ modelId: "auto/consistent-cover", googleAiKey: "g", openRouterKey: "o", openAiKey: "a", replicateKey: "r" }),
  "openrouter/free",
  "legacy consistent-cover alias maps to OpenRouter free"
);

assertEqual(
  costEffectiveImageModel({ modelId: "auto/consistent-cover", googleAiKey: null, openRouterKey: "o", openAiKey: "a", replicateKey: "r" }),
  "openrouter/free",
  "legacy consistent-cover alias does not pick paid fallbacks"
);

assertEqual(
  costEffectiveImageModel({ modelId: "auto/cost-effective", googleAiKey: null, openRouterKey: "o", openAiKey: "a", replicateKey: "r" }),
  "openrouter/free",
  "cheapest available uses OpenRouter free before paid fallbacks"
);

assertEqual(
  costEffectiveImageModel({ modelId: "openai/gpt-image-2", googleAiKey: "g", openRouterKey: "o", openAiKey: "a", replicateKey: "r" }),
  "openai/gpt-image-2",
  "Explicit model is preserved"
);

assertEqual(
  inlineImageModel({ imageAdvancedOptions: { inlineImageModel: "openai/gpt-image-1-mini" } }),
  "openai/gpt-image-1-mini",
  "inline model loads from stored advanced settings"
);

assertEqual(
  inlineImageModel({ image_advanced_options: { inline_image_model: "replicate/black-forest-labs/flux-schnell" } }),
  "replicate/black-forest-labs/flux-schnell",
  "inline model loads from snake-case advanced settings"
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

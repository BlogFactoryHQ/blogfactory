import { costEffectiveImageModel } from "./generate-content.js";

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

console.log("cost-effective-image-model self-check passed");

import {
  inlineImageModel,
  inlineImageSource,
  openRouterImageBase64,
  openRouterImageModelId,
  openRouterImageRequestPayload,
  openRouterImageTimeoutMessage,
} from "./generate-content.js";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

assertEqual(openRouterImageModelId(""), "", "blank image model uses the live 1K fallback");
assertEqual(openRouterImageModelId("openrouter/free"), "", "legacy free alias uses the live 1K fallback");
assertEqual(openRouterImageModelId("openrouter/auto"), "", "legacy auto alias uses the live 1K fallback");
assertEqual(openRouterImageModelId("google/gemini-3.1-flash-image"), "google/gemini-3.1-flash-image", "official OpenRouter image ids are preserved");
assertEqual(inlineImageModel({ imageAdvancedOptions: { inlineImageModel: "openai/gpt-image-1-mini" } }), "openai/gpt-image-1-mini", "inline model loads from settings");
assertEqual(inlineImageModel({}), "", "inline model defaults to the live 1K fallback");
assertEqual(inlineImageSource({}), "ai", "inline source defaults to AI");
assertEqual(inlineImageSource({ imageAdvancedOptions: { inlineImageSource: "stock" } }), "stock", "inline source loads from settings");
const payload = openRouterImageRequestPayload("x-ai/grok-imagine-image-quality", "draw a chart", "Web", "16:9");
assertEqual(payload.resolution, "1K", "Web maps to a broadly supported OpenRouter image resolution");
assertEqual(openRouterImageRequestPayload("x-ai/grok-imagine-image-quality", "draw a chart", "2K", "16:9").resolution, "1K", "all image requests stay at 1K");
assertEqual((payload as any).n, undefined, "image generation does not send optional provider-specific count");
assertEqual((payload as any).messages, undefined, "image generation does not use chat messages");
assertEqual(openRouterImageBase64({ data: [{ b64_json: "data:image/png;base64,abcd" }] }), "abcd", "image response base64 is extracted");
assertEqual(openRouterImageTimeoutMessage(), "OpenRouter image timed out after 45s. Retry or choose a faster image model.", "image timeout error is explicit");

console.log("openrouter-image-routing self-check passed");

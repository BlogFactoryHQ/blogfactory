import {
  inlineImageModel,
  inlineImageSource,
  openRouterImageBase64,
  openRouterImageModelId,
  openRouterImageRequestPayload,
} from "./generate-content.js";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

assertEqual(openRouterImageModelId(""), "openrouter/auto", "blank image model defaults to OpenRouter auto");
assertEqual(openRouterImageModelId("openrouter/free"), "openrouter/auto", "legacy free alias normalizes to OpenRouter auto");
assertEqual(openRouterImageModelId("google/gemini-3.1-flash-image"), "google/gemini-3.1-flash-image", "official OpenRouter image ids are preserved");
assertEqual(inlineImageModel({ imageAdvancedOptions: { inlineImageModel: "openai/gpt-image-1-mini" } }), "openai/gpt-image-1-mini", "inline model loads from settings");
assertEqual(inlineImageModel({}), "openrouter/auto", "inline model defaults to OpenRouter auto");
assertEqual(inlineImageSource({}), "ai", "inline source defaults to AI");
assertEqual(inlineImageSource({ imageAdvancedOptions: { inlineImageSource: "stock" } }), "stock", "inline source loads from settings");
const payload = openRouterImageRequestPayload("x-ai/grok-imagine-image-quality", "draw a chart", "Web", "16:9");
assertEqual(payload.resolution, "512", "Web maps to OpenRouter image resolution");
assertEqual((payload as any).messages, undefined, "image generation does not use chat messages");
assertEqual(openRouterImageBase64({ data: [{ b64_json: "data:image/png;base64,abcd" }] }), "abcd", "image response base64 is extracted");

console.log("openrouter-image-routing self-check passed");

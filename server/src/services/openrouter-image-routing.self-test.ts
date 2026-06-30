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

assertEqual(openRouterImageModelId(""), "", "blank image model uses the live fallback");
assertEqual(openRouterImageModelId("bad"), "", "unsupported image ids use the live fallback");
assertEqual(openRouterImageModelId("x-ai/grok-imagine-image-quality"), "x-ai/grok-imagine-image-quality", "the supported OpenRouter image id is preserved");
assertEqual(openRouterImageModelId("google/gemini-3.1-flash-image"), "google/gemini-3.1-flash-image", "Google image ids are preserved");
assertEqual(inlineImageModel({ imageAdvancedOptions: { inlineImageModel: "bad" } }), "", "unsupported inline image ids use the live fallback");
assertEqual(inlineImageModel({}), "", "inline model defaults to the live fallback");
assertEqual(inlineImageSource({}), "ai", "inline source defaults to AI");
assertEqual(inlineImageSource({ imageAdvancedOptions: { inlineImageSource: "stock" } }), "stock", "inline source loads from settings");
const payload = openRouterImageRequestPayload("x-ai/grok-imagine-image-quality", "draw a chart", "Web", "16:9");
assertEqual(payload.resolution, "1K", "Web maps to a broadly supported OpenRouter image resolution");
assertEqual(openRouterImageRequestPayload("google/gemini-3.1-flash-image", "draw a chart", "512", "16:9").resolution, "512", "512 is kept for supported Google models");
assertEqual(openRouterImageRequestPayload("x-ai/grok-imagine-image-quality", "draw a chart", "512", "16:9").resolution, "1K", "512 falls back to 1K for Grok");
assertEqual(openRouterImageRequestPayload("google/gemini-3.1-flash-image", "draw a chart", "2K", "16:9").resolution, "1K", "2K is not sent from app image requests");
assertEqual((payload as any).n, undefined, "image generation does not send optional provider-specific count");
assertEqual((payload as any).messages, undefined, "image generation does not use chat messages");
assertEqual(openRouterImageBase64({ data: [{ b64_json: "data:image/png;base64,abcd" }] }), "abcd", "image response base64 is extracted");
assertEqual(openRouterImageTimeoutMessage(), "OpenRouter image timed out after 45s. Retry later or use stock for inline images.", "image timeout error is explicit");

console.log("openrouter-image-routing self-check passed");

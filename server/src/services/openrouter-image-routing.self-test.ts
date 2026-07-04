import {
  buildManualImagePromptMessages,
  imageDeliveryMode,
  inlineImageModel,
  inlineImageSource,
  manualPromptImageResolutionSummary,
  manualImageProvider,
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
assertEqual(imageDeliveryMode({}), "generate", "image delivery defaults to generated images");
assertEqual(imageDeliveryMode({ imageAdvancedOptions: { imageDeliveryMode: "manual_prompt" } }), "manual_prompt", "manual prompt mode loads from settings");
assertEqual(manualImageProvider({}), "midjourney", "manual provider defaults to Midjourney");
const payload = openRouterImageRequestPayload("x-ai/grok-imagine-image-quality", "draw a chart", "Web", "16:9");
assertEqual(payload.resolution, "1K", "Web maps to a broadly supported OpenRouter image resolution");
assertEqual(openRouterImageRequestPayload("google/gemini-3.1-flash-image", "draw a chart", "512", "16:9").resolution, "512", "512 is kept for supported Google models");
assertEqual(openRouterImageRequestPayload("x-ai/grok-imagine-image-quality", "draw a chart", "512", "16:9").resolution, "1K", "512 falls back to 1K for Grok");
assertEqual(openRouterImageRequestPayload("google/gemini-3.1-flash-image", "draw a chart", "2K", "16:9").resolution, "1K", "2K is not sent from app image requests");
assertEqual((payload as any).n, undefined, "image generation does not send optional provider-specific count");
assertEqual((payload as any).messages, undefined, "image generation does not use chat messages");
assertEqual(openRouterImageBase64({ data: [{ b64_json: "data:image/png;base64,abcd" }] }), "abcd", "image response base64 is extracted");
assertEqual(openRouterImageTimeoutMessage(), "OpenRouter image timed out after 45s. Retry later or use stock for inline images.", "image timeout error is explicit");

const manualMessages = buildManualImagePromptMessages({
  title: "Community-Led Growth",
  content: "# Community-Led Growth\n\nFounders and users build product momentum together.",
  stylePrompt: "A colorful editorial illustration, risograph print look, no text, no letters, no numbers, no typography --ar 16:9 --profile 376a42y g7qoxps",
});
assertEqual(manualMessages.user.includes("--ar 16:9 --profile 376a42y g7qoxps"), true, "manual prompt instructions preserve Midjourney suffix");
assertEqual(manualMessages.system.includes("Return only the final prompt"), true, "manual prompt asks for prompt-only output");
assertEqual(manualMessages.user.includes("Community-Led Growth"), true, "manual prompt includes article context");
const manualSummary = manualPromptImageResolutionSummary("request-1");
assertEqual(manualSummary.results.length, 1, "manual mode reports one request");
assertEqual(manualSummary.results[0].type, "cover", "manual mode uses a cover-style request");
assertEqual(manualSummary.inlinePaths.length, 0, "manual mode does not attach inline images");

console.log("openrouter-image-routing self-check passed");

import assert from "node:assert/strict";
import { catalogFromOpenRouterPayload, OPENROUTER_MODEL_UNAVAILABLE_MESSAGE } from "./openrouter-models.js";

const payload = {
  data: [
    { id: "openai/gpt-4o-mini", architecture: { output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "openrouter/auto", architecture: { output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "live/image", architecture: { output_modalities: ["image"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "google/gemini-image", architecture: { output_modalities: ["image"] }, pricing: { prompt: "0", completion: "0" } },
  ],
};

const text = catalogFromOpenRouterPayload(payload, "text");
const image = catalogFromOpenRouterPayload(payload, "image");

assert.deepEqual(text.map((model: { id: string }) => model.id), ["openai/gpt-4o-mini", "openrouter/auto"]);
assert.deepEqual(image.map((model: { id: string }) => model.id), ["live/image"]);
assert.match(OPENROUTER_MODEL_UNAVAILABLE_MESSAGE, /no longer available on OpenRouter/);

console.log("openrouter-models self-check passed");

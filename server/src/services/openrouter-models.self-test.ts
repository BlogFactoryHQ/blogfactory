import assert from "node:assert/strict";
import { catalogFromOpenRouterPayload, OPENROUTER_MODEL_UNAVAILABLE_MESSAGE } from "./openrouter-models.js";

const payload = {
  data: [
    { id: "openai/gpt-4o-mini", architecture: { output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "openrouter/auto", architecture: { output_modalities: ["text"] }, pricing: { prompt: "-1", completion: "-1" } },
    { id: "live/image", architecture: { output_modalities: ["image"] }, pricing: { prompt: "0", completion: "0" } },
    {
      id: "google/gemini-image",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["1K", "2K"] },
        aspect_ratio: { type: "enum", values: ["1:1", "16:9", "auto"] },
      },
    },
  ],
};

const text = catalogFromOpenRouterPayload(payload, "text");
const image = catalogFromOpenRouterPayload(payload, "image");

assert.deepEqual(text.map((model: { id: string }) => model.id), ["openai/gpt-4o-mini", "openrouter/auto"]);
assert.equal(text.find((model: { id: string }) => model.id === "openrouter/auto")?.costInfo, "Dynamic pricing");
assert.equal(text.find((model: { id: string }) => model.id === "openrouter/auto")?.isFree, false);
assert.deepEqual(image.map((model: { id: string }) => model.id), ["live/image", "google/gemini-image"]);
assert.deepEqual(image.find((model: { id: string }) => model.id === "google/gemini-image")?.constraints.resolutions, ["1K", "2K"]);
assert.deepEqual(image.find((model: { id: string }) => model.id === "google/gemini-image")?.supportedParameters, ["resolution", "aspect_ratio"]);
assert.match(OPENROUTER_MODEL_UNAVAILABLE_MESSAGE, /no longer available on OpenRouter/);

console.log("openrouter-models self-check passed");

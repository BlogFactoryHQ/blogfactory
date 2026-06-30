import assert from "node:assert/strict";
import { catalogFromOpenRouterPayload, OPENROUTER_MODEL_UNAVAILABLE_MESSAGE } from "./openrouter-models.js";

const payload = {
  data: [
    { id: "openai/gpt-4o-mini", architecture: { output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "openrouter/auto", architecture: { output_modalities: ["text"] }, pricing: { prompt: "-1", completion: "-1" } },
    {
      id: "live/no-1k-image",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["2K"] },
      },
    },
    {
      id: "google/gemini-image",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["1K", "2K"] },
        aspect_ratio: { type: "enum", values: ["1:1", "16:9", "auto"] },
      },
    },
    {
      id: "x-ai/grok-imagine-image-quality",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["1K", "2K"] },
        aspect_ratio: { type: "enum", values: ["1:1", "16:9", "3:2"] },
      },
    },
    {
      id: "bytedance-seed/seedream-4.5",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["1K", "2K", "4K"] },
        aspect_ratio: { type: "enum", values: ["16:9", "3:2"] },
      },
    },
    {
      id: "google/gemini-web-image-preview",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["1K", "2K"] },
        aspect_ratio: { type: "enum", values: ["16:9", "3:2"] },
      },
    },
  ],
};

const text = catalogFromOpenRouterPayload(payload, "text");
const image = catalogFromOpenRouterPayload(payload, "image");

assert.deepEqual(text.map((model: { id: string }) => model.id), ["openai/gpt-4o-mini", "openrouter/auto"]);
assert.equal(text.find((model: { id: string }) => model.id === "openrouter/auto")?.costInfo, "Dynamic pricing");
assert.equal(text.find((model: { id: string }) => model.id === "openrouter/auto")?.isFree, false);
assert.deepEqual(image.map((model: { id: string }) => model.id), ["x-ai/grok-imagine-image-quality"]);
assert.deepEqual(image.find((model: { id: string }) => model.id === "x-ai/grok-imagine-image-quality")?.constraints.resolutions, ["1K"]);
assert.deepEqual(image.find((model: { id: string }) => model.id === "x-ai/grok-imagine-image-quality")?.supportedParameters, ["resolution", "aspect_ratio"]);
assert.match(OPENROUTER_MODEL_UNAVAILABLE_MESSAGE, /no longer available on OpenRouter/);

console.log("openrouter-models self-check passed");

import assert from "node:assert/strict";
import { catalogFromOpenRouterPayload, OPENROUTER_AUTO_MODEL_MESSAGE, OPENROUTER_MODEL_UNAVAILABLE_MESSAGE, preferredTextModelId } from "./openrouter-models.js";

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
      id: "bad",
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
      image_endpoints: [{
        pricing: [
          { billable: "output_image", unit: "image", variant: "1k", cost_usd: 0.05 },
          { billable: "output_image", unit: "image", variant: "2k", cost_usd: 0.07 },
        ],
      }],
    },
    {
      id: "other",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["1K", "2K", "4K"] },
        aspect_ratio: { type: "enum", values: ["16:9", "3:2"] },
      },
    },
    {
      id: "google/gemini-3.1-flash-image-preview",
      architecture: { output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: {
        resolution: { type: "enum", values: ["512", "1K", "2K", "4K"] },
        aspect_ratio: { type: "enum", values: ["1:1", "16:9", "3:2"] },
      },
    },
  ],
};

const text = catalogFromOpenRouterPayload(payload, "text");
const image = catalogFromOpenRouterPayload(payload, "image");

assert.deepEqual(text.map((model: { id: string }) => model.id), ["openai/gpt-4o-mini"]);
assert.equal(preferredTextModelId(text), "openai/gpt-4o-mini");
assert.match(OPENROUTER_AUTO_MODEL_MESSAGE, /Auto is disabled/);
assert.deepEqual(image.map((model: { id: string }) => model.id), ["x-ai/grok-imagine-image-quality", "google/gemini-3.1-flash-image-preview"]);
assert.deepEqual(image.find((model: { id: string }) => model.id === "x-ai/grok-imagine-image-quality")?.constraints.resolutions, ["1K"]);
assert.equal(image.find((model: { id: string }) => model.id === "x-ai/grok-imagine-image-quality")?.rawPricing.imageByResolution["1K"], 0.05);
assert.deepEqual(image.find((model: { id: string }) => model.id === "google/gemini-3.1-flash-image-preview")?.constraints.resolutions, ["512", "1K"]);
assert.deepEqual(image.find((model: { id: string }) => model.id === "x-ai/grok-imagine-image-quality")?.supportedParameters, ["resolution", "aspect_ratio"]);
assert.match(OPENROUTER_MODEL_UNAVAILABLE_MESSAGE, /no longer available on OpenRouter/);

console.log("openrouter-models self-check passed");

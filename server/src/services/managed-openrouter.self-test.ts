import assert from "node:assert/strict";
import { managedCatalogHealthy } from "./managed-openrouter.js";

assert.equal(managedCatalogHealthy([
  { id: "google/gemini-3.5-flash", rawPricing: { prompt: 1, completion: 1 } },
  { id: "openai/gpt-5.4", rawPricing: { prompt: 1, completion: 1 } },
  { id: "anthropic/claude-sonnet-5", rawPricing: { prompt: 1, completion: 1 } },
]), true);
assert.equal(managedCatalogHealthy([]), false);
console.log("managed OpenRouter catalog self-test passed");

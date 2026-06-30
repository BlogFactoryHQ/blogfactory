import { buildCostAnalytics } from "./cost-analytics.js";

const report = buildCostAnalytics({
  logs: [
    { id: "t1", usageType: "text", postId: "p1", provider: "openai", modelId: "openai/test", status: "success", cost: 0.02, totalTokens: 1000, createdAt: "2026-01-01T00:00:00Z" },
    { id: "i1", usageType: "image", postId: "p1", provider: "openrouter-image", modelId: "x-ai/grok-imagine-image-quality", status: "success", cost: 0, createdAt: "2026-01-01T00:01:00Z" },
    { id: "i2", usageType: "image", postId: "p2", provider: "openrouter-image", modelId: "google/gemini-3.1-flash-image", status: "success", cost: 0.04, createdAt: "2026-01-02T00:00:00Z" },
    { id: "f1", usageType: "image", provider: "openrouter-image", modelId: "x-ai/grok-imagine-image-quality", status: "failed", cost: 0, createdAt: "2026-01-02T00:01:00Z" },
  ],
  imageAssets: [
    { type: "cover", sourceKind: "stock", cost: 0 },
    { type: "inline", provider: "openrouter-image", cost: 0.04 },
  ],
  imageRequests: [{ status: "failed", retryCount: 2 }],
});

console.assert(report.summary.totalCost === 0.06, "sums text + image logs once");
console.assert(report.imageSummary.stock === 1, "counts stock images without adding cost");
console.assert(report.summary.failedCalls === 1, "keeps failed calls visible");
console.assert(report.imageSummary.retries === 2, "counts queue retries");

console.log("cost-analytics self-check passed");

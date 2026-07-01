import { describe, expect, it } from "vitest";
import { imageProviderName, imageSourceLabel, isStockProvider } from "./image-labels";

describe("image labels", () => {
  it("formats stock and AI image sources consistently", () => {
    expect(imageSourceLabel({ provider: "pexels", source_kind: "stock", license_label: "Pexels License" })).toBe("Stock: Pexels · Pexels License");
    expect(imageSourceLabel({ provider: "openrouter-image", model_id: "x-ai/grok-imagine-image-quality" })).toBe("AI model: x-ai/grok-imagine-image-quality");
    expect(imageProviderName("stock-fallback")).toBe("Historical stock");
    expect(isStockProvider("openverse")).toBe(true);
  });
});

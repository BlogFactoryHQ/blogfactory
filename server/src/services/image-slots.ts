import type { imageGenerationRequests } from "../db/schema.js";

export type ImageTargetType = "cover" | "inline";
export type InlineImageSource = "ai" | "stock";

export interface ImageSlot {
  type: ImageTargetType;
  position: number;
  aspectRatio: string;
  resolution: string;
  prompt: string;
  altText: string;
}

export interface ImageSlotResult {
  slot: ImageSlot;
  status: "attached" | "queued" | "failed";
  storagePath?: string;
  assetId?: string;
  provider?: string;
  queuedRequestId?: string;
  query?: string;
  error?: string;
}

export interface ImageResolutionResult {
  coverPath: string | null;
  inlinePaths: string[];
  queued: number;
  failed: number;
  cost: number;
  results: ImageSlotResult[];
}

export function clampInt(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeInlineImageSource(value: unknown): InlineImageSource {
  return value === "stock" ? "stock" : "ai";
}

export function imageRouteForSlot(type: ImageTargetType, inlineSource: InlineImageSource) {
  return type === "inline" && inlineSource === "stock" ? "stock" : "ai";
}

export function imageModelForTarget(selectedModel: string, type: ImageTargetType, inlineModel = "") {
  return type === "inline" ? inlineModel : selectedModel;
}

function normalizeImageResolution(value: unknown) {
  return value === "512" ? "512" : "1K";
}

function sectionCue(content: string, index: number) {
  const headings = Array.from(content.matchAll(/^#{2,3}\s+(.+)$/gm)).map((match) => match[1].trim());
  return headings[index] || headings[0] || "";
}

export function buildImagePrompt(opts: {
  content: string;
  title: string;
  type: ImageTargetType;
  index?: number;
  stylePrompt?: string | null;
}) {
  const style = opts.stylePrompt?.trim() || "Modern, clean, professional editorial image style. No text overlays.";
  const section = opts.type === "inline" ? sectionCue(opts.content, opts.index || 0) : "";
  return [
    `Shared visual style for every image in this article: ${style}`,
    opts.type === "cover"
      ? `Image role: cover for "${opts.title}". Show the article's main idea.`
      : `Image role: inline for "${opts.title}".`,
    opts.type === "inline" && section ? `Inline focus: ${section}` : "",
    "Avoid text, logos, UI screenshots, watermarks, and unreadable typography unless explicitly requested in the style direction.",
  ].filter(Boolean).join("\n\n");
}

export function buildImageAltText(opts: {
  title: string;
  type: ImageTargetType;
  index?: number;
  content: string;
}) {
  const section = opts.type === "inline" ? sectionCue(opts.content, opts.index || 0) : "";
  const detail = section ? `: ${section}` : "";
  return `${opts.type === "cover" ? "Featured image" : "Article image"} for ${opts.title}${detail}`.slice(0, 180);
}

export function imageTargets(imageConfig: any) {
  const targets: Array<{ type: ImageTargetType; position: number; aspectRatio: string; resolution: string }> = [];
  if (imageConfig?.cover && imageConfig.cover.enabled !== false) {
    targets.push({
      type: "cover",
      position: 0,
      aspectRatio: imageConfig.cover?.aspectRatio || "16:9",
      resolution: normalizeImageResolution(imageConfig.cover?.resolution),
    });
  }
  if (imageConfig?.inline && imageConfig.inline.enabled !== false) {
    const count = clampInt(imageConfig.inline?.count, 2, 0, 10);
    for (let i = 0; i < count; i += 1) {
      targets.push({
        type: "inline",
        position: i,
        aspectRatio: imageConfig.inline?.aspectRatio || "3:2",
        resolution: normalizeImageResolution(imageConfig.inline?.resolution),
      });
    }
  }
  return targets;
}

export function buildImageSlots(opts: {
  imageConfig: any;
  content: string;
  title: string;
  stylePrompt?: string | null;
}) {
  return imageTargets(opts.imageConfig).map((target): ImageSlot => ({
    ...target,
    prompt: buildImagePrompt({ content: opts.content, title: opts.title, type: target.type, index: target.position, stylePrompt: opts.stylePrompt }),
    altText: buildImageAltText({ content: opts.content, title: opts.title, type: target.type, index: target.position }),
  }));
}

export function imageSlotFromRequest(request: typeof imageGenerationRequests.$inferSelect, fallbackTitle = "article"): ImageSlot {
  return {
    type: request.type as ImageTargetType,
    position: request.position || 0,
    aspectRatio: request.aspectRatio || "16:9",
    resolution: request.resolution || "1K",
    prompt: request.prompt,
    altText: request.altText || `Image for ${fallbackTitle}`,
  };
}

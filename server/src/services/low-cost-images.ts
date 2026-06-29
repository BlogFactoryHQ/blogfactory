import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { imageAssets, imageGenerationRequests, posts, userSettings } from "../db/schema.js";
import { getPexelsKey, getPixabayKey } from "./api-keys.js";
import { saveImageBuffer } from "./image-storage.js";
import { normalizeImagePlacement, placeInlineImages, removeInlineImagePath, replaceInlineImagePath } from "./image-placement.js";

export type ImageTargetType = "cover" | "inline";
const AI_DEFERRED_PROVIDER = "ai-deferred";

export interface SourceImageCandidate {
  url: string;
  credit?: string;
  licenseLabel?: string;
  attributionUrl?: string;
}

export interface LowCostImageSettings {
  sourceImageAllowed?: boolean | null;
  aiFallbackEnabled?: boolean | null;
  maxAiImagesPerDay?: number | null;
  minMinutesBetweenAiImages?: number | null;
  imageCompressionEnabled?: boolean | null;
}

export interface ResolvePriorityInput {
  existingAsset?: boolean;
  stockAsset?: boolean;
  sourceCandidate?: { allowed: boolean };
  aiFallbackEnabled?: boolean;
}

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
  upgradeQueuedRequestId?: string;
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

export function chooseImageResolution(input: ResolvePriorityInput) {
  if (input.existingAsset) return "existing";
  if (input.stockAsset) return "stock";
  if (input.sourceCandidate?.allowed) return "source";
  if (input.aiFallbackEnabled !== false) return "queue_ai";
  return "none";
}

export function shouldQueueAiBeforeStock(_type: ImageTargetType, aiAllowed: boolean) {
  return aiAllowed;
}

export function shouldQueueAiUpgrade(_type: ImageTargetType, _aiAllowed: boolean) {
  return false;
}

export function shouldAttachStockWhileAiQueued(_type: ImageTargetType) {
  return false;
}

export function imageModelForTarget(selectedModel: string, type: ImageTargetType, inlineModel = "openrouter/free") {
  return type === "inline" ? inlineModel : selectedModel;
}

async function attachInlineImage(postId: string, path: string, placement: unknown, altText?: string | null, position?: number | null, userId?: string) {
  const conditions = [eq(posts.id, postId)];
  if (userId) conditions.push(eq(posts.userId, userId));
  const [post] = await db.select({ content: posts.content, coverImageUrl: posts.coverImageUrl, inlineImages: posts.inlineImages }).from(posts).where(and(...conditions)).limit(1);
  if (!post) return;
  const inlineImages = [...(post.inlineImages || [])];
  if (path === post.coverImageUrl) {
    await db.update(posts).set({
      inlineImages: inlineImages.filter((image) => image !== path),
      content: removeInlineImagePath(post.content || "", path),
    }).where(and(...conditions));
    return;
  }
  const alreadyTracked = inlineImages.includes(path);
  const existing = typeof position === "number" && position >= 0 ? inlineImages[position] : null;
  if (existing) inlineImages[position!] = path;
  else if (!alreadyTracked) inlineImages.push(path);
  const previousContent = post.content || "";
  const content = existing && existing !== path
    ? replaceInlineImagePath(previousContent, existing, path)
    : existing === path || alreadyTracked || previousContent.includes(path)
      ? previousContent
      : placeInlineImages(previousContent, [{ url: path, altText }], normalizeImagePlacement(placement));
  await db.update(posts).set({
    inlineImages: Array.from(new Set(inlineImages.filter(Boolean))),
    content,
  }).where(and(...conditions));
}

async function attachPostImage(postId: string, slot: ImageSlot, path: string, placement: unknown, userId?: string) {
  const conditions = [eq(posts.id, postId)];
  if (userId) conditions.push(eq(posts.userId, userId));
  if (slot.type === "cover") {
    const [post] = await db.select({ content: posts.content, inlineImages: posts.inlineImages }).from(posts).where(and(...conditions)).limit(1);
    await db.update(posts).set({
      coverImageUrl: path,
      inlineImages: (post?.inlineImages || []).filter((image) => image !== path),
      content: removeInlineImagePath(post?.content || "", path),
    }).where(and(...conditions));
  } else {
    await attachInlineImage(postId, path, placement, slot.altText, slot.position, userId);
  }
}

export async function attachImageRequestToPost(request: typeof imageGenerationRequests.$inferSelect, path: string, placement?: unknown, userId?: string) {
  if (!request.postId) return;
  await attachPostImage(request.postId, imageSlotFromRequest(request), path, placement, userId);
}

function imageSlotFromRequest(request: typeof imageGenerationRequests.$inferSelect, fallbackTitle = "article"): ImageSlot {
  return {
    type: request.type as ImageTargetType,
    position: request.position || 0,
    aspectRatio: request.aspectRatio || "16:9",
    resolution: request.resolution || "Web",
    prompt: request.prompt,
    altText: request.altText || `Image for ${fallbackTitle}`,
  };
}

function clampInt(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

type SavedImage = { storagePath: string; assetId?: string; sourceUrl?: string };

function aspectRatioNumber(value: string) {
  const [width, height] = value.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

export function stockOrientation(aspectRatio: string, provider: "pexels" | "pixabay") {
  const ratio = aspectRatioNumber(aspectRatio);
  if (ratio > 1.2) return provider === "pexels" ? "landscape" : "horizontal";
  if (ratio < 0.8) return provider === "pexels" ? "portrait" : "vertical";
  return provider === "pexels" ? "square" : "";
}

function plainText(value: string, maxChars = 700) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
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
  const subject = opts.type === "cover"
    ? `Create a blog cover image for "${opts.title}".`
    : `Create an inline blog image for "${opts.title}"${section ? `, focused on the section "${section}"` : ""}.`;
  const context = plainText(opts.content);
  return [
    `Mandatory visual style: ${style}`,
    subject,
    context ? `Article context: ${context}` : "",
    "Use the article context only for subject matter; do not override the mandatory visual style.",
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

function normalizedQueryText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function stockQuery(opts: { title: string; content?: string; type?: ImageTargetType }) {
  const haystack = normalizedQueryText(`${opts.title} ${opts.content || ""}`);
  if (/ray[\s-]?ban|smart glasses|meta glasses|akilli gozluk|akıllı gözlük|gozluk|gözlük|eyewear/.test(haystack)) {
    return opts.type === "inline"
      ? "smart glasses close up wearable device"
      : "smart glasses wearable technology";
  }
  if (/artificial intelligence|\bai\b|yapay zeka/.test(haystack)) {
    return "artificial intelligence technology";
  }
  return opts.title
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 7)
    .join(" ") || "business technology";
}

export function stockQueries(opts: { title: string; content?: string; type?: ImageTargetType }) {
  const primary = stockQuery(opts);
  const titleWords = opts.title
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 2)
    .slice(0, 4)
    .join(" ");
  const haystack = normalizedQueryText(`${opts.title} ${opts.content || ""}`);
  const category = /cyber|security|güvenlik|guvenlik|veri/.test(haystack)
    ? "cybersecurity data protection"
    : /funding|investment|yatirim|yatırım|startup/.test(haystack)
      ? "startup business technology"
      : "technology business";
  return Array.from(new Set([primary, titleWords, category, "technology business", "digital innovation"].filter(Boolean)));
}

async function downloadImage(url: string) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!resp.ok) return null;
  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  return Buffer.from(await resp.arrayBuffer());
}

async function maybeWebp(buffer: Buffer, compressionEnabled: boolean) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer).webp({ quality: compressionEnabled ? 85 : 100 }).toBuffer();
  } catch {
    return buffer;
  }
}

async function saveExternalImage(opts: {
  imageUrl: string;
  userId: string;
  postId: string;
  jobId: string;
  type: ImageTargetType;
  position: number;
  prompt: string;
  altText: string;
  provider: string;
  aspectRatio: string;
  resolution: string;
  sourceUrl?: string;
  credit?: string;
  licenseLabel?: string;
  attributionUrl?: string;
  sourceKind: string;
  compressionEnabled: boolean;
}) {
  const downloaded = await downloadImage(opts.imageUrl);
  if (!downloaded) return null;
  const buffer = await maybeWebp(downloaded, opts.compressionEnabled);
  const { storagePath, asset } = await saveImageBuffer(buffer, opts.userId, {
    type: opts.type,
    prompt: opts.prompt,
    altText: opts.altText,
    modelId: opts.provider,
    provider: opts.provider,
    aspectRatio: opts.aspectRatio,
    resolution: opts.resolution,
    position: opts.position,
    cost: 0,
    sourceUrl: opts.sourceUrl || opts.imageUrl,
    credit: opts.credit,
    licenseLabel: opts.licenseLabel,
    attributionUrl: opts.attributionUrl,
    sourceKind: opts.sourceKind,
    jobId: opts.jobId,
    postId: opts.postId,
  });
  return { storagePath, assetId: asset?.id, sourceUrl: opts.sourceUrl || opts.imageUrl };
}

async function searchPexels(opts: { userId: string; query: string; prompt: string; altText: string; postId: string; jobId: string; type: ImageTargetType; position: number; aspectRatio: string; resolution: string; compressionEnabled: boolean; usedSourceUrls?: Set<string> }) {
  const key = await getPexelsKey(opts.userId);
  if (!key) return null;
  const params = new URLSearchParams({ query: opts.query, per_page: "3" });
  const orientation = stockOrientation(opts.aspectRatio, "pexels");
  if (orientation) params.set("orientation", orientation);
  const resp = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  for (const photo of data.photos || []) {
    const url = photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
    const sourceUrl = photo?.url || url;
    if (!url || (sourceUrl && opts.usedSourceUrls?.has(sourceUrl))) continue;
    return saveExternalImage({
      imageUrl: url,
      userId: opts.userId,
      postId: opts.postId,
      jobId: opts.jobId,
      type: opts.type,
      position: opts.position,
      prompt: opts.prompt,
      altText: opts.altText,
      provider: "pexels",
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
      sourceUrl,
      credit: photo.photographer,
      licenseLabel: "Pexels License",
      attributionUrl: photo.photographer_url || sourceUrl,
      sourceKind: "stock",
      compressionEnabled: opts.compressionEnabled,
    });
  }
  return null;
}

async function searchPixabay(opts: { userId: string; query: string; prompt: string; altText: string; postId: string; jobId: string; type: ImageTargetType; position: number; aspectRatio: string; resolution: string; compressionEnabled: boolean; usedSourceUrls?: Set<string> }) {
  const key = await getPixabayKey(opts.userId);
  if (!key) return null;
  const params = new URLSearchParams({ key, q: opts.query, image_type: "photo", per_page: "3", safesearch: "true" });
  const orientation = stockOrientation(opts.aspectRatio, "pixabay");
  if (orientation) params.set("orientation", orientation);
  const resp = await fetch(`https://pixabay.com/api/?${params.toString()}`, {
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  for (const photo of data.hits || []) {
    const url = photo?.largeImageURL || photo?.webformatURL;
    const sourceUrl = photo?.pageURL || url;
    if (!url || (sourceUrl && opts.usedSourceUrls?.has(sourceUrl))) continue;
    return saveExternalImage({
      imageUrl: url,
      userId: opts.userId,
      postId: opts.postId,
      jobId: opts.jobId,
      type: opts.type,
      position: opts.position,
      prompt: opts.prompt,
      altText: opts.altText,
      provider: "pixabay",
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
      sourceUrl,
      credit: photo.user,
      licenseLabel: "Pixabay Content License",
      attributionUrl: sourceUrl,
      sourceKind: "stock",
      compressionEnabled: opts.compressionEnabled,
    });
  }
  return null;
}

async function searchOpenverse(opts: { userId: string; query: string; prompt: string; altText: string; postId: string; jobId: string; type: ImageTargetType; position: number; aspectRatio: string; resolution: string; compressionEnabled: boolean; usedSourceUrls?: Set<string> }) {
  const resp = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(opts.query)}&page_size=3&license_type=commercial`, {
    headers: { "User-Agent": "BlogFactory/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  for (const photo of data.results || []) {
    const url = photo?.url || photo?.thumbnail;
    const sourceUrl = photo?.foreign_landing_url || photo?.url || url;
    if (!url || (sourceUrl && opts.usedSourceUrls?.has(sourceUrl))) continue;
    const license = [photo.license, photo.license_version].filter(Boolean).join(" ").toUpperCase();
    return saveExternalImage({
      imageUrl: url,
      userId: opts.userId,
      postId: opts.postId,
      jobId: opts.jobId,
      type: opts.type,
      position: opts.position,
      prompt: opts.prompt,
      altText: opts.altText,
      provider: "openverse",
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
      sourceUrl,
      credit: photo.creator,
      licenseLabel: license ? `Openverse ${license}` : "Openverse license",
      attributionUrl: sourceUrl,
      sourceKind: "stock",
      compressionEnabled: opts.compressionEnabled,
    });
  }
  return null;
}

function sourceCandidateAllowed(candidate: SourceImageCandidate, settings: LowCostImageSettings) {
  if (!settings.sourceImageAllowed) return false;
  const allowlist = (process.env.SOURCE_IMAGE_ALLOWLIST || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length) {
    try {
      const host = new URL(candidate.url).hostname.replace(/^www\./, "").toLowerCase();
      if (allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return true;
    } catch {}
  }
  const license = candidate.licenseLabel || "";
  return /creative commons|public domain|cc0|pexels|pixabay|unsplash/i.test(license);
}

export function sourceCandidateForSlot(slot: Pick<ImageSlot, "type" | "position">, candidates: SourceImageCandidate[], usedUrls: Set<string>, coverEnabled: boolean) {
  const start = slot.type === "inline" && coverEnabled ? slot.position + 1 : slot.position;
  return candidates.slice(start).find((candidate) => !usedUrls.has(candidate.url))
    || candidates.find((candidate) => !usedUrls.has(candidate.url))
    || null;
}

export function imageTargets(imageConfig: any) {
  const targets: Array<{ type: ImageTargetType; position: number; aspectRatio: string; resolution: string }> = [];
  if (imageConfig?.cover && imageConfig.cover.enabled !== false) {
    targets.push({
      type: "cover",
      position: 0,
      aspectRatio: imageConfig.cover?.aspectRatio || "16:9",
      resolution: imageConfig.cover?.resolution || "1K",
    });
  }
  if (imageConfig?.inline && imageConfig.inline.enabled !== false) {
    const count = clampInt(imageConfig.inline?.count, 2, 0, 10);
    for (let i = 0; i < count; i++) {
      targets.push({
        type: "inline",
        position: i,
        aspectRatio: imageConfig.inline?.aspectRatio || "3:2",
        resolution: imageConfig.inline?.resolution || "Web",
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

async function tryStockSearch(search: () => Promise<SavedImage | null>) {
  try {
    return await search();
  } catch (err) {
    console.warn("[images] Stock provider failed:", err);
    return null;
  }
}

async function queueFallback(opts: {
  userId: string;
  postId: string;
  jobId: string;
  imageModel: string;
  slot: ImageSlot;
}) {
  const [existing] = await db
    .select({
      id: imageGenerationRequests.id,
      status: imageGenerationRequests.status,
      prompt: imageGenerationRequests.prompt,
      modelId: imageGenerationRequests.modelId,
    })
    .from(imageGenerationRequests)
    .where(and(
      eq(imageGenerationRequests.userId, opts.userId),
      eq(imageGenerationRequests.postId, opts.postId),
      eq(imageGenerationRequests.provider, "ai-deferred"),
      eq(imageGenerationRequests.type, opts.slot.type),
      eq(imageGenerationRequests.position, opts.slot.position),
      inArray(imageGenerationRequests.status, ["queued", "processing", "done"])
    ))
    .orderBy(desc(imageGenerationRequests.createdAt))
    .limit(1);
  if (existing?.status === "queued") {
    await db.update(imageGenerationRequests).set({
      modelId: opts.imageModel,
      prompt: opts.slot.prompt,
      altText: opts.slot.altText,
      aspectRatio: opts.slot.aspectRatio,
      resolution: opts.slot.resolution,
      retryCount: 0,
      availableAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(imageGenerationRequests.id, existing.id));
    return { id: existing.id, created: false };
  }
  if (existing?.status === "processing" || (existing && existing.prompt === opts.slot.prompt && existing.modelId === opts.imageModel)) {
    return { id: existing.id, created: false };
  }

  const [request] = await db.insert(imageGenerationRequests).values({
    userId: opts.userId,
    postId: opts.postId,
    jobId: opts.jobId,
    provider: "ai-deferred",
    modelId: opts.imageModel,
    prompt: opts.slot.prompt,
    altText: opts.slot.altText,
    type: opts.slot.type,
    position: opts.slot.position,
    aspectRatio: opts.slot.aspectRatio,
    resolution: opts.slot.resolution,
    status: "queued",
  }).returning({ id: imageGenerationRequests.id });
  return { id: request?.id || null, created: true };
}

async function trySourceImage(opts: {
  slot: ImageSlot;
  userId: string;
  postId: string;
  jobId: string;
  settings: LowCostImageSettings;
  sourceImages?: SourceImageCandidate[];
  usedSourceUrls: Set<string>;
  coverEnabled: boolean;
  compressionEnabled: boolean;
}): Promise<ImageSlotResult | null> {
  const candidates = (opts.sourceImages || []).filter((item) => sourceCandidateAllowed(item, opts.settings));
  const candidate = sourceCandidateForSlot(opts.slot, candidates, opts.usedSourceUrls, opts.coverEnabled);
  if (!candidate) return null;
  try {
    const saved = await saveExternalImage({
      imageUrl: candidate.url,
      userId: opts.userId,
      postId: opts.postId,
      jobId: opts.jobId,
      type: opts.slot.type,
      position: opts.slot.position,
      prompt: opts.slot.prompt,
      altText: opts.slot.altText,
      provider: "source-image",
      aspectRatio: opts.slot.aspectRatio,
      resolution: opts.slot.resolution,
      sourceUrl: candidate.url,
      credit: candidate.credit,
      licenseLabel: candidate.licenseLabel,
      attributionUrl: candidate.attributionUrl || candidate.url,
      sourceKind: "source",
      compressionEnabled: opts.compressionEnabled,
    });
    if (!saved) return null;
    opts.usedSourceUrls.add(candidate.url);
    return { slot: opts.slot, status: "attached", storagePath: saved.storagePath, assetId: saved.assetId, provider: "source-image" };
  } catch (err) {
    console.warn("[images] source image failed", {
      jobId: opts.jobId,
      type: opts.slot.type,
      position: opts.slot.position,
      error: err instanceof Error ? err.message : "Source image failed",
    });
    return null;
  }
}

async function tryStockImage(opts: {
  slot: ImageSlot;
  title: string;
  content: string;
  userId: string;
  postId: string;
  jobId: string;
  compressionEnabled: boolean;
  usedSourceUrls?: Set<string>;
}): Promise<ImageSlotResult | null> {
  for (const query of stockQueries({ title: opts.title, content: opts.content, type: opts.slot.type })) {
    const providers: Array<[string, () => Promise<SavedImage | null>]> = [
      ["pixabay", () => searchPixabay({ ...opts, ...opts.slot, query, prompt: opts.slot.prompt, altText: opts.slot.altText })],
      ["pexels", () => searchPexels({ ...opts, ...opts.slot, query, prompt: opts.slot.prompt, altText: opts.slot.altText })],
      ["openverse", () => searchOpenverse({ ...opts, ...opts.slot, query, prompt: opts.slot.prompt, altText: opts.slot.altText })],
    ];
    for (const [provider, search] of providers) {
      const storagePath = await tryStockSearch(search);
      if (storagePath) {
        if (storagePath.sourceUrl) opts.usedSourceUrls?.add(storagePath.sourceUrl);
        return { slot: opts.slot, status: "attached", storagePath: storagePath.storagePath, assetId: storagePath.assetId, provider, query };
      }
    }
  }
  return null;
}

export function aiDailyLimitReached(doneCount: number, configuredMax: number | null | undefined) {
  const dailyMax = clampInt(configuredMax, 30, 0, 100);
  return dailyMax > 0 && doneCount >= dailyMax;
}

export function countsTowardAiDailyLimit(provider: string) {
  return provider === AI_DEFERRED_PROVIDER;
}

export function nextAiAvailableAt(latestDoneAt: Date | string | null | undefined, minMinutes: number) {
  if (!latestDoneAt || minMinutes <= 0) return null;
  const next = new Date(new Date(latestDoneAt).getTime() + minMinutes * 60_000);
  return next.getTime() > Date.now() ? next : null;
}

export async function resolvePostImages(opts: {
  content: string;
  title: string;
  userId: string;
  postId: string;
  jobId: string;
  imageConfig: any;
  imageModel?: string | null;
  inlineImageModel?: string | null;
  stylePrompt?: string | null;
  settings?: LowCostImageSettings | null;
  sourceImages?: SourceImageCandidate[];
}): Promise<ImageResolutionResult> {
  const settings = opts.settings || {};
  const imageModel = opts.imageModel || "openrouter/free";
  const inlineImageModel = opts.inlineImageModel || "openrouter/free";
  const aiAllowed = settings.aiFallbackEnabled !== false;
  const compressionEnabled = settings.imageCompressionEnabled ?? true;
  const slots = buildImageSlots({ imageConfig: opts.imageConfig, content: opts.content, title: opts.title, stylePrompt: opts.stylePrompt });
  const coverEnabled = slots.some((slot) => slot.type === "cover");
  const usedSourceUrls = new Set<string>();
  let coverPath: string | null = null;
  const inlinePaths: string[] = [];
  const results: ImageSlotResult[] = [];
  let queued = 0;
  let failed = 0;

  for (const slot of slots) {
    try {
      if (shouldQueueAiBeforeStock(slot.type, aiAllowed)) {
        const queuedRequest = await queueFallback({ ...opts, imageModel: imageModelForTarget(imageModel, slot.type, inlineImageModel), slot });
        if (queuedRequest.created) queued += 1;
        results.push({ slot, status: "queued", queuedRequestId: queuedRequest.id || undefined, provider: "ai-deferred" });
        console.info("[images] queued", { jobId: opts.jobId, type: slot.type, position: slot.position, requestId: queuedRequest.id });
        continue;
      }

      const immediate = await trySourceImage({ ...opts, slot, settings, usedSourceUrls, coverEnabled, compressionEnabled })
        || await tryStockImage({ ...opts, slot, compressionEnabled, usedSourceUrls });
      if (immediate?.storagePath) {
        await attachPostImage(opts.postId, slot, immediate.storagePath, opts.imageConfig?.imagePlacement);
        if (slot.type === "cover") coverPath ||= immediate.storagePath;
        else inlinePaths[slot.position] = immediate.storagePath;
        if (shouldQueueAiUpgrade(slot.type, aiAllowed)) {
          const upgrade = await queueFallback({ ...opts, imageModel: imageModelForTarget(imageModel, slot.type, inlineImageModel), slot });
          if (upgrade.created) queued += 1;
          immediate.upgradeQueuedRequestId = upgrade.id || undefined;
        }
        results.push(immediate);
        console.info("[images] attached", { jobId: opts.jobId, type: slot.type, position: slot.position, provider: immediate.provider, query: immediate.query });
        continue;
      }
      if (aiAllowed) {
        const queuedRequest = await queueFallback({ ...opts, imageModel: imageModelForTarget(imageModel, slot.type, inlineImageModel), slot });
        if (queuedRequest.created) queued += 1;
        results.push({ slot, status: "queued", queuedRequestId: queuedRequest.id || undefined, provider: "ai-deferred" });
        console.info("[images] queued", { jobId: opts.jobId, type: slot.type, position: slot.position, requestId: queuedRequest.id });
      } else {
        failed += 1;
        results.push({ slot, status: "failed", error: "No source or stock image found and AI fallback is disabled" });
      }
    } catch (err) {
      failed += 1;
      const error = err instanceof Error ? err.message : "Image slot failed";
      results.push({ slot, status: "failed", error });
      console.warn("[images] slot failed", { jobId: opts.jobId, type: slot.type, position: slot.position, error });
    }
  }

  return { coverPath, inlinePaths: inlinePaths.filter(Boolean), queued, failed, cost: 0, results };
}

export async function resolveLowCostImages(opts: Parameters<typeof resolvePostImages>[0]) {
  return resolvePostImages(opts);
}

async function fallbackRequestToStock(request: typeof imageGenerationRequests.$inferSelect, placement?: unknown) {
  if (!request.postId || !request.jobId) return null;
  const [post] = await db.select({ title: posts.title, content: posts.content }).from(posts).where(eq(posts.id, request.postId)).limit(1);
  if (!post) return null;
  const slot = imageSlotFromRequest(request, post.title);
  const result = await tryStockImage({
    slot,
    title: post.title,
    content: post.content || "",
    userId: request.userId,
    postId: request.postId,
    jobId: request.jobId,
    compressionEnabled: true,
  });
  if (!result?.storagePath) return null;
  await attachPostImage(request.postId, slot, result.storagePath, placement);
  return result;
}

async function claimNextDeferredImageRequest(userId?: string) {
  const userFilter = userId ? sql`and user_id = ${userId}` : sql``;
  const claimed = await db.execute(sql`
    with next_request as (
      select id
      from image_generation_requests
      where provider = 'ai-deferred'
        and status = 'queued'
        and available_at <= now()
        and post_id is not null
        and job_id is not null
        and model_id is not null
        ${userFilter}
      order by created_at
      for update skip locked
      limit 1
    )
    update image_generation_requests
    set status = 'processing', updated_at = now()
    from next_request
    where image_generation_requests.id = next_request.id
    returning
      image_generation_requests.id,
      image_generation_requests.user_id as "userId",
      image_generation_requests.post_id as "postId",
      image_generation_requests.job_id as "jobId",
      image_generation_requests.provider,
      image_generation_requests.prompt,
      image_generation_requests.alt_text as "altText",
      image_generation_requests.model_id as "modelId",
      image_generation_requests.type,
      image_generation_requests.position,
      image_generation_requests.aspect_ratio as "aspectRatio",
      image_generation_requests.resolution,
      image_generation_requests.status,
      image_generation_requests.retry_count as "retryCount",
      image_generation_requests.available_at as "availableAt",
      image_generation_requests.source_url as "sourceUrl",
      image_generation_requests.credit,
      image_generation_requests.license_label as "licenseLabel",
      image_generation_requests.attribution_url as "attributionUrl",
      image_generation_requests.imported_asset_id as "importedAssetId",
      image_generation_requests.created_at as "createdAt",
      image_generation_requests.updated_at as "updatedAt"
  `);
  return ((claimed as any)[0] || (claimed as any).rows?.[0] || null) as typeof imageGenerationRequests.$inferSelect | null;
}

async function requeueDeferredImageRequest(id: string, availableAt?: Date | null) {
  await db.update(imageGenerationRequests).set({
    status: "queued",
    availableAt: availableAt || new Date(),
    updatedAt: new Date(),
  }).where(eq(imageGenerationRequests.id, id));
}

export async function processNextDeferredImage(userId?: string) {
  await db.update(imageGenerationRequests).set({ status: "queued", updatedAt: new Date() }).where(and(
    eq(imageGenerationRequests.provider, "ai-deferred"),
    eq(imageGenerationRequests.status, "processing"),
    lte(imageGenerationRequests.updatedAt, new Date(Date.now() - 20 * 60_000))
  ));

  const request = await claimNextDeferredImageRequest(userId);
  if (!request || !request.postId || !request.jobId || !request.modelId) return { processed: false };

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, request.userId))
    .limit(1);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(imageGenerationRequests)
    .where(and(
      eq(imageGenerationRequests.userId, request.userId),
      eq(imageGenerationRequests.provider, "ai-deferred"),
      eq(imageGenerationRequests.status, "done"),
      sql`${imageGenerationRequests.updatedAt} >= now() - interval '1 day'`
    ));
  if (aiDailyLimitReached(count, settings?.maxAiImagesPerDay)) {
    await requeueDeferredImageRequest(request.id);
    return { processed: false, reason: "daily_limit" };
  }

  const minMinutes = clampInt(settings?.minMinutesBetweenAiImages, 5, 0, 240);
  const [latestDone] = await db
    .select({ updatedAt: imageGenerationRequests.updatedAt })
    .from(imageGenerationRequests)
    .where(and(
      eq(imageGenerationRequests.userId, request.userId),
      eq(imageGenerationRequests.provider, "ai-deferred"),
      eq(imageGenerationRequests.status, "done")
    ))
    .orderBy(desc(imageGenerationRequests.updatedAt))
    .limit(1);
  const nextAvailableAt = nextAiAvailableAt(latestDone?.updatedAt, minMinutes);
  if (nextAvailableAt) {
    await requeueDeferredImageRequest(request.id, nextAvailableAt);
    return { processed: false, reason: "too_soon" };
  }

  try {
    const { generateQueuedImageRequest } = await import("./generate-content.js");
    const result = await generateQueuedImageRequest(request);
    if (!result?.storagePath) throw new Error("Provider did not return an image");

    await attachPostImage(request.postId, imageSlotFromRequest(request), result.storagePath, settings?.imagePlacement);
    await db.update(imageGenerationRequests).set({ status: "done", updatedAt: new Date() }).where(eq(imageGenerationRequests.id, request.id));
    return { processed: true, storagePath: result.storagePath };
  } catch (err: any) {
    const retryCount = (request.retryCount || 0) + 1;
    if (retryCount === 1) {
      const stockResult = await fallbackRequestToStock(request, settings?.imagePlacement);
      if (stockResult) {
        await db.update(imageGenerationRequests).set({
          provider: "stock-fallback",
          status: "done",
          importedAssetId: stockResult.assetId || request.importedAssetId || null,
          retryCount,
          updatedAt: new Date(),
        }).where(eq(imageGenerationRequests.id, request.id));
        return { processed: true, storagePath: stockResult.storagePath, fallback: "stock" };
      }
    }
    if (retryCount >= 3) {
      await db.update(imageGenerationRequests).set({
        status: "failed",
        retryCount,
        updatedAt: new Date(),
      }).where(eq(imageGenerationRequests.id, request.id));
      return { processed: false, error: err?.message || "Image generation failed" };
    }
    const backoffMinutes = Math.min(120, 10 * retryCount);
    await db.update(imageGenerationRequests).set({
      status: "queued",
      retryCount,
      availableAt: new Date(Date.now() + backoffMinutes * 60_000),
      updatedAt: new Date(),
    }).where(eq(imageGenerationRequests.id, request.id));
    return { processed: false, error: err?.message || "Image generation failed" };
  }
}

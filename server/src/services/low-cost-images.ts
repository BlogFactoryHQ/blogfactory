import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { imageAssets, imageGenerationRequests, posts, userSettings } from "../db/schema.js";
import { getPexelsKey, getPixabayKey } from "./api-keys.js";
import { saveImageBuffer } from "./image-storage.js";

export type ImageTargetType = "cover" | "inline";

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

export function chooseImageResolution(input: ResolvePriorityInput) {
  if (input.existingAsset) return "existing";
  if (input.stockAsset) return "stock";
  if (input.sourceCandidate?.allowed) return "source";
  if (input.aiFallbackEnabled !== false) return "queue_ai";
  return "none";
}

export function shouldQueueAiBeforeStock(type: ImageTargetType, aiAllowed: boolean) {
  return (type === "cover" || type === "inline") && aiAllowed;
}

export function shouldAttachStockWhileAiQueued(type: ImageTargetType) {
  return type === "cover";
}

export function imageModelForTarget(selectedModel: string, type: ImageTargetType) {
  return type === "inline" ? "openrouter/free" : selectedModel;
}

function clampInt(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
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
    subject,
    context ? `Article context: ${context}` : "",
    `Style direction: ${style}`,
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

function stockQuery(title: string) {
  return title
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 7)
    .join(" ") || "business technology";
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
  const { storagePath } = await saveImageBuffer(buffer, opts.userId, {
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
  return storagePath;
}

async function findCachedAsset(userId: string, prompt: string, sourceKind?: string) {
  const conditions = [eq(imageAssets.userId, userId), eq(imageAssets.prompt, prompt)];
  if (sourceKind) conditions.push(eq(imageAssets.sourceKind, sourceKind));
  const [asset] = await db
    .select()
    .from(imageAssets)
    .where(and(...conditions))
    .orderBy(desc(imageAssets.createdAt))
    .limit(1);
  return asset || null;
}

async function searchPexels(opts: { userId: string; query: string; prompt: string; altText: string; postId: string; jobId: string; type: ImageTargetType; position: number; aspectRatio: string; resolution: string; compressionEnabled: boolean }) {
  const key = await getPexelsKey(opts.userId);
  if (!key) return null;
  const resp = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(opts.query)}&per_page=1&orientation=landscape`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  const photo = data.photos?.[0];
  const url = photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
  if (!url) return null;
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
    sourceUrl: photo.url,
    credit: photo.photographer,
    licenseLabel: "Pexels License",
    attributionUrl: photo.photographer_url || photo.url,
    sourceKind: "stock",
    compressionEnabled: opts.compressionEnabled,
  });
}

async function searchPixabay(opts: { userId: string; query: string; prompt: string; altText: string; postId: string; jobId: string; type: ImageTargetType; position: number; aspectRatio: string; resolution: string; compressionEnabled: boolean }) {
  const key = await getPixabayKey(opts.userId);
  if (!key) return null;
  const resp = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(opts.query)}&image_type=photo&per_page=3&safesearch=true`, {
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  const photo = data.hits?.[0];
  const url = photo?.largeImageURL || photo?.webformatURL;
  if (!url) return null;
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
    sourceUrl: photo.pageURL,
    credit: photo.user,
    licenseLabel: "Pixabay Content License",
    attributionUrl: photo.pageURL,
    sourceKind: "stock",
    compressionEnabled: opts.compressionEnabled,
  });
}

async function searchOpenverse(opts: { userId: string; query: string; prompt: string; altText: string; postId: string; jobId: string; type: ImageTargetType; position: number; aspectRatio: string; resolution: string; compressionEnabled: boolean }) {
  const resp = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(opts.query)}&page_size=1&license_type=commercial`, {
    headers: { "User-Agent": "BlogFactory/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  const photo = data.results?.[0];
  const url = photo?.url || photo?.thumbnail;
  if (!url) return null;
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
    sourceUrl: photo.foreign_landing_url || photo.url,
    credit: photo.creator,
    licenseLabel: license ? `Openverse ${license}` : "Openverse license",
    attributionUrl: photo.foreign_landing_url || photo.url,
    sourceKind: "stock",
    compressionEnabled: opts.compressionEnabled,
  });
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

function imageTargets(imageConfig: any) {
  const targets: Array<{ type: ImageTargetType; position: number; aspectRatio: string; resolution: string }> = [];
  if (imageConfig?.cover && imageConfig.cover.enabled !== false) {
    targets.push({
      type: "cover",
      position: 0,
      aspectRatio: imageConfig.cover?.aspectRatio || "16:9",
      resolution: imageConfig.cover?.resolution || "1K",
    });
  }
  if (imageConfig?.inline?.enabled) {
    const count = imageConfig.inline?.count || 2;
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

async function queueFallback(opts: {
  userId: string;
  postId: string;
  jobId: string;
  imageModel: string;
  prompt: string;
  altText: string;
  type: ImageTargetType;
  position: number;
  aspectRatio: string;
  resolution: string;
}) {
  await db.insert(imageGenerationRequests).values({
    userId: opts.userId,
    postId: opts.postId,
    jobId: opts.jobId,
    provider: "ai-deferred",
    modelId: opts.imageModel,
    prompt: opts.prompt,
    altText: opts.altText,
    type: opts.type,
    position: opts.position,
    aspectRatio: opts.aspectRatio,
    resolution: opts.resolution,
    status: "queued",
  });
}

export async function resolveLowCostImages(opts: {
  content: string;
  title: string;
  userId: string;
  postId: string;
  jobId: string;
  imageConfig: any;
  imageModel?: string | null;
  stylePrompt?: string | null;
  settings?: LowCostImageSettings | null;
  sourceImages?: SourceImageCandidate[];
}): Promise<{ coverPath: string | null; inlinePaths: string[]; queued: number; cost: number }> {
  const settings = opts.settings || {};

  const imageModel = opts.imageModel || "auto/consistent-cover";
  const aiAllowed = settings.aiFallbackEnabled !== false;
  const compressionEnabled = settings.imageCompressionEnabled ?? true;
  const targets = imageTargets(opts.imageConfig);
  let coverPath: string | null = null;
  const inlinePaths: string[] = [];
  let queued = 0;

  for (const target of targets) {
    const prompt = buildImagePrompt({ content: opts.content, title: opts.title, type: target.type, index: target.position, stylePrompt: opts.stylePrompt });
    const altText = buildImageAltText({ content: opts.content, title: opts.title, type: target.type, index: target.position });

    const cached = await findCachedAsset(opts.userId, prompt);
    let path = cached?.storagePath || null;
    if (!path && shouldQueueAiBeforeStock(target.type, aiAllowed)) {
      await queueFallback({ ...opts, ...target, imageModel: imageModelForTarget(imageModel, target.type), prompt, altText });
      queued += 1;
      if (!shouldAttachStockWhileAiQueued(target.type)) continue;
    }

    if (!path) {
      const cachedStock = await findCachedAsset(opts.userId, prompt, "stock");
      path = cachedStock?.storagePath || null;
      if (!path) {
        const query = stockQuery(opts.title);
        path = await searchPixabay({ ...opts, ...target, query, prompt, altText, compressionEnabled })
          || await searchPexels({ ...opts, ...target, query, prompt, altText, compressionEnabled })
          || await searchOpenverse({ ...opts, ...target, query, prompt, altText, compressionEnabled });
      }
    }

    if (!path) {
      const candidate = opts.sourceImages?.find((item) => sourceCandidateAllowed(item, settings));
      if (candidate) {
        path = await saveExternalImage({
          imageUrl: candidate.url,
          userId: opts.userId,
          postId: opts.postId,
          jobId: opts.jobId,
          type: target.type,
          position: target.position,
          prompt,
          altText,
          provider: "source-image",
          aspectRatio: target.aspectRatio,
          resolution: target.resolution,
          sourceUrl: candidate.url,
          credit: candidate.credit,
          licenseLabel: candidate.licenseLabel,
          attributionUrl: candidate.attributionUrl || candidate.url,
          sourceKind: "source",
          compressionEnabled,
        });
      }
    }

    if (path) {
      if (target.type === "cover" && !coverPath) coverPath = path;
      if (target.type === "inline") inlinePaths.push(path);
    }
  }

  const update: Partial<typeof posts.$inferInsert> = {};
  if (coverPath) update.coverImageUrl = coverPath;
  if (inlinePaths.length) update.inlineImages = inlinePaths;
  if (Object.keys(update).length) await db.update(posts).set(update).where(eq(posts.id, opts.postId));

  return { coverPath, inlinePaths, queued, cost: 0 };
}

async function fallbackRequestToStock(request: typeof imageGenerationRequests.$inferSelect) {
  if (!request.postId || !request.jobId) return null;
  const [post] = await db.select({ title: posts.title }).from(posts).where(eq(posts.id, request.postId)).limit(1);
  if (!post) return null;
  const query = stockQuery(post.title);
  const path = await searchPixabay({
    userId: request.userId,
    postId: request.postId,
    jobId: request.jobId,
    type: request.type as ImageTargetType,
    position: request.position || 0,
    aspectRatio: request.aspectRatio || "16:9",
    resolution: request.resolution || "Web",
    query,
    prompt: request.prompt,
    altText: request.altText || `Image for ${post.title}`,
    compressionEnabled: true,
  }) || await searchPexels({
    userId: request.userId,
    postId: request.postId,
    jobId: request.jobId,
    type: request.type as ImageTargetType,
    position: request.position || 0,
    aspectRatio: request.aspectRatio || "16:9",
    resolution: request.resolution || "Web",
    query,
    prompt: request.prompt,
    altText: request.altText || `Image for ${post.title}`,
    compressionEnabled: true,
  }) || await searchOpenverse({
    userId: request.userId,
    postId: request.postId,
    jobId: request.jobId,
    type: request.type as ImageTargetType,
    position: request.position || 0,
    aspectRatio: request.aspectRatio || "16:9",
    resolution: request.resolution || "Web",
    query,
    prompt: request.prompt,
    altText: request.altText || `Image for ${post.title}`,
    compressionEnabled: true,
  });
  if (!path) return null;
  if (request.type === "cover") {
    await db.update(posts).set({ coverImageUrl: path }).where(eq(posts.id, request.postId));
  } else {
    const [fullPost] = await db.select({ inlineImages: posts.inlineImages }).from(posts).where(eq(posts.id, request.postId)).limit(1);
    await db.update(posts).set({ inlineImages: [...(fullPost?.inlineImages || []), path] }).where(eq(posts.id, request.postId));
  }
  return path;
}

export async function processNextDeferredImage(userId?: string) {
  await db.update(imageGenerationRequests).set({ status: "queued", updatedAt: new Date() }).where(and(
    eq(imageGenerationRequests.provider, "ai-deferred"),
    eq(imageGenerationRequests.status, "processing"),
    lte(imageGenerationRequests.updatedAt, new Date(Date.now() - 20 * 60_000))
  ));

  const conditions = [
    eq(imageGenerationRequests.provider, "ai-deferred"),
    eq(imageGenerationRequests.status, "queued"),
    lte(imageGenerationRequests.availableAt, new Date()),
  ];
  if (userId) conditions.push(eq(imageGenerationRequests.userId, userId));

  const [request] = await db
    .select()
    .from(imageGenerationRequests)
    .where(and(...conditions))
    .orderBy(imageGenerationRequests.createdAt)
    .limit(1);

  if (!request || !request.postId || !request.jobId || !request.modelId) return { processed: false };

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, request.userId))
    .limit(1);

  const dailyMax = clampInt(settings?.maxAiImagesPerDay, 30, 0, 100);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(imageGenerationRequests)
    .where(and(
      eq(imageGenerationRequests.userId, request.userId),
      eq(imageGenerationRequests.provider, "ai-deferred"),
      eq(imageGenerationRequests.status, "done"),
      sql`${imageGenerationRequests.updatedAt} >= now() - interval '1 day'`
    ));
  if (count >= dailyMax) return { processed: false, reason: "daily_limit" };

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
  if (latestDone && Date.now() - new Date(latestDone.updatedAt).getTime() < minMinutes * 60_000) {
    return { processed: false, reason: "too_soon" };
  }

  await db.update(imageGenerationRequests).set({ status: "processing", updatedAt: new Date() }).where(eq(imageGenerationRequests.id, request.id));

  try {
    const { generateQueuedImageRequest } = await import("./generate-content.js");
    const result = await generateQueuedImageRequest(request);
    if (!result?.storagePath) throw new Error("Provider did not return an image");

    const [post] = await db.select().from(posts).where(eq(posts.id, request.postId)).limit(1);
    if (post) {
      if (request.type === "cover") {
        await db.update(posts).set({ coverImageUrl: result.storagePath }).where(eq(posts.id, request.postId));
      } else {
        await db.update(posts).set({ inlineImages: [...(post.inlineImages || []), result.storagePath] }).where(eq(posts.id, request.postId));
      }
    }
    await db.update(imageGenerationRequests).set({ status: "done", updatedAt: new Date() }).where(eq(imageGenerationRequests.id, request.id));
    return { processed: true, storagePath: result.storagePath };
  } catch (err: any) {
    const retryCount = (request.retryCount || 0) + 1;
    if (retryCount >= 3) {
      const stockPath = await fallbackRequestToStock(request);
      await db.update(imageGenerationRequests).set({
        status: stockPath ? "done" : "failed",
        retryCount,
        updatedAt: new Date(),
      }).where(eq(imageGenerationRequests.id, request.id));
      return stockPath
        ? { processed: true, storagePath: stockPath, fallback: "stock" }
        : { processed: false, error: err?.message || "Image generation failed" };
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

import { getPexelsKey, getPixabayKey } from "./api-keys.js";
import { saveImageBuffer } from "./image-storage.js";
import type { ImageSlot, ImageTargetType } from "./image-slots.js";

type SavedImage = { storagePath: string; assetId?: string; sourceUrl?: string; sourceKey?: string };

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

export function stockSourceKey(provider: string, sourceUrl?: string | null, credit?: string | null) {
  if (sourceUrl) return `${provider}:${normalizeStockUrl(sourceUrl)}`;
  if (credit) return `${provider}:credit:${credit}`;
  return "";
}

export function stockSourceUrlKey(sourceUrl?: string | null) {
  return sourceUrl ? `url:${normalizeStockUrl(sourceUrl)}` : "";
}

function normalizeStockUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, "").toLowerCase();
  }
}

function normalizedQueryText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function metadataText(...parts: unknown[]) {
  return parts.flatMap((part): string[] => {
    if (!part) return [];
    if (Array.isArray(part)) return part.flatMap((item) => metadataText(item));
    if (typeof part === "object") return [String((part as any).name || (part as any).title || "")].filter(Boolean);
    return [String(part)];
  }).join(" ");
}

export function usableStockCandidate(...parts: unknown[]) {
  const text = normalizedQueryText(metadataText(...parts));
  return !/\b(logo|wordmark|icon|icons|vector|illustration|clipart|typography|text|lettering|poster|banner|signage|sign|sticker|label|infographic|template|mockup|screenshot|watermark)\b/.test(text);
}

function usedStockSource(opts: SearchOpts, provider: string, sourceUrl?: string | null, credit?: string | null) {
  if (!sourceUrl && !credit) return false;
  const providerKey = stockSourceKey(provider, sourceUrl, credit);
  const urlKey = stockSourceUrlKey(sourceUrl);
  return Boolean((providerKey && opts.usedSourceUrls?.has(providerKey)) || (urlKey && opts.usedSourceUrls?.has(urlKey)));
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
  const base = [primary, titleWords, category, "technology business", "digital innovation"].filter(Boolean);
  return Array.from(new Set(base.flatMap((query, index) => [
    index === 0 ? `${query} landscape editorial photo` : `${query} editorial photo`,
    query,
  ])));
}

async function downloadImage(url: string) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!resp.ok) return null;
  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  return Buffer.from(await resp.arrayBuffer());
}

async function maybeWebp(buffer: Buffer) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer).webp({ quality: 85 }).toBuffer();
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
}) {
  const downloaded = await downloadImage(opts.imageUrl);
  if (!downloaded) return null;
  const buffer = await maybeWebp(downloaded);
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
    sourceKind: "stock",
    jobId: opts.jobId,
    postId: opts.postId,
  });
  const sourceUrl = opts.sourceUrl || opts.imageUrl;
  return { storagePath, assetId: asset?.id, sourceUrl, sourceKey: stockSourceKey(opts.provider, sourceUrl, opts.credit) };
}

async function searchPexels(opts: SearchOpts) {
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
    if (!url || usedStockSource(opts, "pexels", sourceUrl, photo.photographer)) continue;
    if (!usableStockCandidate(photo.alt, photo.photographer, sourceUrl)) continue;
    return saveExternalImage({
      ...opts,
      imageUrl: url,
      provider: "pexels",
      sourceUrl,
      credit: photo.photographer,
      licenseLabel: "Pexels License",
      attributionUrl: photo.photographer_url || sourceUrl,
    });
  }
  return null;
}

async function searchPixabay(opts: SearchOpts) {
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
    if (!url || usedStockSource(opts, "pixabay", sourceUrl, photo.user)) continue;
    if (!usableStockCandidate(photo.tags, photo.user, sourceUrl)) continue;
    return saveExternalImage({
      ...opts,
      imageUrl: url,
      provider: "pixabay",
      sourceUrl,
      credit: photo.user,
      licenseLabel: "Pixabay Content License",
      attributionUrl: sourceUrl,
    });
  }
  return null;
}

async function searchOpenverse(opts: SearchOpts) {
  const resp = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(opts.query)}&page_size=3&license_type=commercial`, {
    headers: { "User-Agent": "BlogFactory/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  for (const photo of data.results || []) {
    const url = photo?.url || photo?.thumbnail;
    const sourceUrl = photo?.foreign_landing_url || photo?.url || url;
    if (!url || usedStockSource(opts, "openverse", sourceUrl, photo.creator)) continue;
    if (!usableStockCandidate(photo.title, photo.tags, photo.creator, sourceUrl)) continue;
    const license = [photo.license, photo.license_version].filter(Boolean).join(" ").toUpperCase();
    return saveExternalImage({
      ...opts,
      imageUrl: url,
      provider: "openverse",
      sourceUrl,
      credit: photo.creator,
      licenseLabel: license ? `Openverse ${license}` : "Openverse license",
      attributionUrl: sourceUrl,
    });
  }
  return null;
}

type SearchOpts = {
  userId: string;
  query: string;
  prompt: string;
  altText: string;
  postId: string;
  jobId: string;
  type: ImageTargetType;
  position: number;
  aspectRatio: string;
  resolution: string;
  usedSourceUrls?: Set<string>;
};

async function tryStockSearch(search: () => Promise<SavedImage | null>) {
  try {
    return await search();
  } catch (err) {
    console.warn("[images] Stock provider failed:", err);
    return null;
  }
}

export async function tryStockImage(opts: {
  slot: ImageSlot;
  title: string;
  content: string;
  userId: string;
  postId: string;
  jobId: string;
  usedSourceUrls?: Set<string>;
}) {
  for (const query of stockQueries({ title: opts.title, content: opts.content, type: opts.slot.type })) {
    const providers: Array<[string, () => Promise<SavedImage | null>]> = [
      ["pexels", () => searchPexels({ ...opts, ...opts.slot, query, prompt: opts.slot.prompt, altText: opts.slot.altText })],
      ["pixabay", () => searchPixabay({ ...opts, ...opts.slot, query, prompt: opts.slot.prompt, altText: opts.slot.altText })],
      ["openverse", () => searchOpenverse({ ...opts, ...opts.slot, query, prompt: opts.slot.prompt, altText: opts.slot.altText })],
    ];
    for (const [provider, search] of providers) {
      const storagePath = await tryStockSearch(search);
      if (storagePath) {
        if (storagePath.sourceKey) opts.usedSourceUrls?.add(storagePath.sourceKey);
        const urlKey = stockSourceUrlKey(storagePath.sourceUrl);
        if (urlKey) opts.usedSourceUrls?.add(urlKey);
        return { slot: opts.slot, status: "attached" as const, storagePath: storagePath.storagePath, assetId: storagePath.assetId, provider, query };
      }
    }
  }
  return null;
}

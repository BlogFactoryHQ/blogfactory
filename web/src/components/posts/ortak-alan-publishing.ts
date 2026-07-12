import { normalizeHttpUrl, validateSourceUrl } from "@/lib/url-validation";
import type { GhostAuthor } from "@/hooks/useIntegrations";
import { asArray, asRecord, asStringArray } from "@/lib/api-shape";

export const ORTAK_ALAN_CONTENT_TYPES = ["Haber", "Analiz", "Rehber", "Liste", "Röportaj", "Duyuru", "Sponsorlu İçerik"];
export const ORTAK_ALAN_SOURCE_TYPES = ["Resmi açıklama", "Haber kaynağı", "Rapor", "Veri seti", "Sosyal medya paylaşımı", "Basın bülteni", "Röportaj", "Diğer"];

export interface OrtakAlanSource {
  name: string;
  url: string;
  type: string;
  publishedAt: string;
  note: string;
}

export interface OrtakAlanMetadata {
  contentType: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  topicTags: string[];
  sources: OrtakAlanSource[];
  inlineImages: Array<{ url: string; alt: string }>;
  author: GhostAuthor | null;
  editorialOwner: string;
  aiAssisted: boolean;
  aiUsageNote: string;
  sponsored: boolean;
  image: { alt: string; source: string; license: string; aiGenerated: boolean };
}

export interface PublishingImageMetadata {
  storage_path: string;
  alt_text?: string | null;
  provider: string | null;
  source_kind: string | null;
  source_url: string | null;
  credit: string | null;
  license_label: string | null;
  type?: string | null;
  position?: number | null;
}

export const emptyOrtakAlanSource = (): OrtakAlanSource => ({ name: "", url: "", type: "", publishedAt: "", note: "" });

export function buildOrtakAlanMetadata(input: {
  stored?: Partial<OrtakAlanMetadata> | null;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  editorialOwner?: string;
  defaultAuthor?: GhostAuthor | null;
  coverImageUrl?: string | null;
  imageAssets?: PublishingImageMetadata[];
  inlineImageUrls?: string[];
}): OrtakAlanMetadata {
  const stored = asRecord(input.stored);
  const storedImage = asRecord(stored.image);
  const storedSources = asArray<Partial<OrtakAlanSource>>(stored.sources);
  const coverAsset = asArray<PublishingImageMetadata>(input.imageAssets).find((asset) => asset.storage_path === input.coverImageUrl);
  const storedInlineImages = asArray<{ url?: string; alt?: string }>(stored.inlineImages);
  const assetsByPath = new Map(asArray<PublishingImageMetadata>(input.imageAssets).map((asset) => [asset.storage_path, asset]));
  const inlineImages = asStringArray(input.inlineImageUrls).map((url) => ({
    url,
    alt: storedInlineImages.find((image) => image.url === url)?.alt || assetsByPath.get(url)?.alt_text || "",
  }));
  return {
    contentType: typeof stored.contentType === "string" && stored.contentType ? stored.contentType : "Haber",
    slug: typeof stored.slug === "string" && stored.slug ? stored.slug : input.slug,
    excerpt: typeof stored.excerpt === "string" && stored.excerpt ? stored.excerpt : completeSentenceWithinLimit(input.excerpt, 180),
    metaTitle: typeof stored.metaTitle === "string" && stored.metaTitle ? stored.metaTitle : input.metaTitle,
    metaDescription: typeof stored.metaDescription === "string" && stored.metaDescription ? stored.metaDescription : completeSentenceWithinLimit(input.metaDescription, 155),
    topicTags: asStringArray(stored.topicTags).length ? asStringArray(stored.topicTags) : asStringArray(input.tags),
    sources: storedSources.length ? storedSources.map((source) => ({ ...emptyOrtakAlanSource(), ...source })) : [emptyOrtakAlanSource()],
    inlineImages,
    author: stored.author && typeof stored.author === "object" ? stored.author as GhostAuthor : input.defaultAuthor || null,
    editorialOwner: typeof stored.editorialOwner === "string" && stored.editorialOwner ? stored.editorialOwner : input.editorialOwner || "",
    aiAssisted: Boolean(stored.aiAssisted),
    aiUsageNote: typeof stored.aiUsageNote === "string" ? stored.aiUsageNote : "",
    sponsored: Boolean(stored.sponsored || stored.contentType === "Sponsorlu İçerik"),
    image: {
      alt: typeof storedImage.alt === "string" && storedImage.alt ? storedImage.alt : coverAsset?.alt_text || "",
      source: typeof storedImage.source === "string" && storedImage.source ? storedImage.source : coverAsset?.credit || coverAsset?.source_url || coverAsset?.provider || "",
      license: typeof storedImage.license === "string" && storedImage.license ? storedImage.license : coverAsset?.license_label || "",
      aiGenerated: Boolean(storedImage.aiGenerated || coverAsset?.source_kind === "ai"),
    },
  };
}

export function normalizeOrtakAlanForRequest(metadata: OrtakAlanMetadata): OrtakAlanMetadata {
  return {
    ...metadata,
    topicTags: unique(metadata.topicTags),
    sources: metadata.sources.map((source) => ({ ...source, url: source.url ? normalizeHttpUrl(source.url) : "" })),
    sponsored: metadata.contentType === "Sponsorlu İçerik" || metadata.sponsored,
  };
}

export function ortakAlanClientChecks(metadata: OrtakAlanMetadata, title: string, hasCoverImage: boolean) {
  const validSources = metadata.sources.filter((source) => source.name && validateSourceUrl(source.url).valid);
  const checks = [
    { label: "Başlık", value: `${title.length}/35–95`, ok: title.length >= 35 && title.length <= 95 },
    { label: "Slug", value: `${metadata.slug.length}/20–70`, ok: metadata.slug.length >= 20 && metadata.slug.length <= 70 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug) },
    { label: "Excerpt", value: `${metadata.excerpt.length}/80–180`, ok: metadata.excerpt.length >= 80 && metadata.excerpt.length <= 180 && isCompleteSentence(metadata.excerpt) },
    { label: "Meta başlık", value: `${metadata.metaTitle.length}/45–60`, ok: metadata.metaTitle.length >= 45 && metadata.metaTitle.length <= 60 },
    { label: "Meta açıklama", value: `${metadata.metaDescription.length}/120–155`, ok: metadata.metaDescription.length >= 120 && metadata.metaDescription.length <= 155 && isCompleteSentence(metadata.metaDescription) },
    { label: "Konu etiketi", value: `${metadata.topicTags.length}`, ok: metadata.topicTags.some((tag) => tag.toLocaleLowerCase("tr-TR") !== metadata.contentType.toLocaleLowerCase("tr-TR")) },
    { label: "Kaynaklar", value: validSources.length === metadata.sources.length && validSources.length ? `${validSources.length} geçerli` : "Eksik", ok: metadata.contentType !== "Haber" || (validSources.length > 0 && validSources.length === metadata.sources.length) },
    { label: "Kaynak ayrıntıları", value: metadata.sources.every((source) => source.type && source.publishedAt && source.note) ? "Hazır" : "Uyarı", ok: metadata.sources.every((source) => source.type && source.publishedAt && source.note), blocking: false },
    { label: "Ghost yazarı", value: metadata.author?.name || "Eksik", ok: Boolean(metadata.author?.id) },
    { label: "Kapak görseli", value: hasCoverImage ? "Hazır" : "Eksik", ok: hasCoverImage },
    { label: "Görsel metadata", value: isMeaningfulTurkishAlt(metadata.image.alt) && metadata.image.source && metadata.image.license ? "Hazır" : "Eksik", ok: Boolean(isMeaningfulTurkishAlt(metadata.image.alt) && metadata.image.source && metadata.image.license) },
    { label: "Yazı görselleri", value: metadata.inlineImages.every((image) => isMeaningfulTurkishAlt(image.alt)) ? "Hazır" : "Eksik", ok: metadata.inlineImages.every((image) => isMeaningfulTurkishAlt(image.alt)) },
    { label: "Editöryal sorumlu", value: metadata.editorialOwner || "Eksik", ok: Boolean(metadata.editorialOwner) },
    { label: "AI notu", value: !metadata.aiAssisted || metadata.aiUsageNote ? "Hazır" : "Eksik", ok: !metadata.aiAssisted || Boolean(metadata.aiUsageNote) },
  ];
  return checks;
}

export function isCompleteSentence(value: string) {
  return /[.!?…]["'”’)\]}]*$/.test(value.trim());
}

export function completeSentenceWithinLimit(value: string, maxChars: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars && isCompleteSentence(cleaned)) return cleaned;
  const sentences = cleaned.match(/[^.!?…]+[.!?…]+["'”’)\]}]*/g)?.map((sentence) => sentence.trim()) || [];
  let result = "";
  for (const sentence of sentences) {
    const next = [result, sentence].filter(Boolean).join(" ");
    if (next.length > maxChars) break;
    result = next;
  }
  return result || cleaned;
}

export function isMeaningfulTurkishAlt(value: string) {
  const alt = value.replace(/\s+/g, " ").trim();
  return alt.length >= 12
    && alt.length <= 180
    && alt.split(/\s+/).length >= 3
    && /[çğıöşüİÇĞÖŞÜ]/.test(alt)
    && !/^(?:featured image|article image(?: \d+)?|image)\b|\bfor\b/i.test(alt)
    && !/^https?:\/\//i.test(alt)
    && !/\.(?:avif|gif|jpe?g|png|webp)(?:\?.*)?$/i.test(alt);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 20);
}

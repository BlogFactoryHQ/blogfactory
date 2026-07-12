export const ORTAK_ALAN_PROFILE = "ortak_alan_news";

export const ORTAK_ALAN_CONTENT_TYPES = [
  "Haber",
  "Analiz",
  "Rehber",
  "Liste",
  "Röportaj",
  "Duyuru",
  "Sponsorlu İçerik",
] as const;

export const ORTAK_ALAN_SOURCE_TYPES = [
  "Resmi açıklama",
  "Haber kaynağı",
  "Rapor",
  "Veri seti",
  "Sosyal medya paylaşımı",
  "Basın bülteni",
  "Röportaj",
  "Diğer",
] as const;

export interface OrtakAlanSource {
  name: string;
  url: string;
  type: string;
  publishedAt: string;
  note: string;
}

export interface OrtakAlanInlineImage {
  url: string;
  alt: string;
}

export interface OrtakAlanAuthor {
  id: string;
  email: string;
  slug: string;
  name: string;
}

export interface OrtakAlanPublishingMetadata {
  contentType: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  topicTags: string[];
  sources: OrtakAlanSource[];
  inlineImages: OrtakAlanInlineImage[];
  author: OrtakAlanAuthor | null;
  editorialOwner: string;
  aiAssisted: boolean;
  aiUsageNote: string;
  sponsored: boolean;
  image: {
    alt: string;
    source: string;
    license: string;
    aiGenerated: boolean;
  };
}

export interface OrtakAlanValidation {
  errors: string[];
  warnings: string[];
}

interface MetadataDefaults {
  slug?: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  topicTags?: string[];
  editorialOwner?: string;
  author?: Partial<OrtakAlanAuthor> | null;
  imageAlt?: string;
  imageSource?: string;
  imageLicense?: string;
  imageAiGenerated?: boolean;
  inlineImages?: OrtakAlanInlineImage[];
}

interface ValidationContext {
  mode: "draft" | "publish";
  title: string;
  hasCoverImage: boolean;
  authorMatched: boolean;
  html?: string;
}

export function isOrtakAlanProfile(config: unknown) {
  return Boolean(config && typeof config === "object" && (config as Record<string, unknown>).profile === ORTAK_ALAN_PROFILE);
}

export function normalizeOrtakAlanMetadata(value: unknown, defaults: MetadataDefaults = {}): OrtakAlanPublishingMetadata {
  const record = objectValue(value);
  const image = objectValue(record.image);
  const contentTypeCandidate = textValue(record.contentType) || "Haber";
  const contentType = (ORTAK_ALAN_CONTENT_TYPES as readonly string[]).includes(contentTypeCandidate)
    ? contentTypeCandidate
    : "Haber";
  const sponsored = booleanValue(record.sponsored, contentType === "Sponsorlu İçerik");
  const normalizedContentType = sponsored ? "Sponsorlu İçerik" : contentType;
  const sources = Array.isArray(record.sources)
    ? record.sources.map(normalizeSource).filter((source) => source.name || source.url || source.type || source.publishedAt || source.note).slice(0, 12)
    : [];
  const authorRecord = objectValue(record.author);
  const defaultAuthor = defaults.author || null;
  const author = textValue(authorRecord.id) || defaultAuthor?.id
    ? {
        id: textValue(authorRecord.id) || textValue(defaultAuthor?.id),
        email: textValue(authorRecord.email) || textValue(defaultAuthor?.email),
        slug: textValue(authorRecord.slug) || textValue(defaultAuthor?.slug),
        name: textValue(authorRecord.name) || textValue(defaultAuthor?.name),
      }
    : null;
  const storedInlineImages = (Array.isArray(record.inlineImages) ? record.inlineImages : [])
    .map((value) => {
      const image = objectValue(value);
      return { url: textValue(image.url), alt: textValue(image.alt) };
    })
    .filter((image) => image.url);
  const inlineImages = (defaults.inlineImages?.length
    ? defaults.inlineImages.map((image) => ({ ...image, alt: storedInlineImages.find((stored) => stored.url === image.url)?.alt || image.alt }))
    : storedInlineImages
  ).slice(0, 12);

  return {
    contentType: normalizedContentType,
    slug: textValue(record.slug) || textValue(defaults.slug),
    excerpt: textValue(record.excerpt) || textValue(defaults.excerpt),
    metaTitle: textValue(record.metaTitle) || textValue(defaults.metaTitle),
    metaDescription: textValue(record.metaDescription) || textValue(defaults.metaDescription),
    topicTags: normalizeTags(Array.isArray(record.topicTags) ? record.topicTags : defaults.topicTags || []),
    sources,
    inlineImages,
    author,
    editorialOwner: textValue(record.editorialOwner) || textValue(defaults.editorialOwner),
    aiAssisted: booleanValue(record.aiAssisted),
    aiUsageNote: textValue(record.aiUsageNote),
    sponsored,
    image: {
      alt: textValue(image.alt) || textValue(defaults.imageAlt),
      source: textValue(image.source) || textValue(defaults.imageSource),
      license: textValue(image.license) || textValue(defaults.imageLicense),
      aiGenerated: booleanValue(image.aiGenerated) || Boolean(defaults.imageAiGenerated),
    },
  };
}

export function validateOrtakAlanMetadata(metadata: OrtakAlanPublishingMetadata, context: ValidationContext): OrtakAlanValidation {
  const required: string[] = [];
  const warnings: string[] = [];
  const addRequired = (condition: boolean, message: string) => {
    if (!condition) required.push(message);
  };

  addRequired(context.title.length >= 35 && context.title.length <= 95, "Başlık 35-95 karakter olmalı.");
  addRequired(metadata.slug.length >= 20 && metadata.slug.length <= 70 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug), "Slug 20-70 karakter, küçük harfli ve tireli olmalı.");
  addRequired(metadata.excerpt.length >= 80 && metadata.excerpt.length <= 180, "Excerpt 80-180 karakter olmalı.");
  addRequired(isCompleteSentence(metadata.excerpt), "Excerpt tamamlanmış bir cümleyle bitmeli.");
  addRequired(metadata.metaTitle.length >= 45 && metadata.metaTitle.length <= 60, "Meta başlık 45-60 karakter olmalı.");
  addRequired(metadata.metaDescription.length >= 120 && metadata.metaDescription.length <= 155, "Meta açıklama 120-155 karakter olmalı.");
  addRequired(isCompleteSentence(metadata.metaDescription), "Meta açıklama tamamlanmış bir cümleyle bitmeli.");
  addRequired((ORTAK_ALAN_CONTENT_TYPES as readonly string[]).includes(metadata.contentType), "İçerik tipi seçilmeli.");
  addRequired(metadata.topicTags.some((tag) => tag.toLocaleLowerCase("tr-TR") !== metadata.contentType.toLocaleLowerCase("tr-TR")), "Birincil etiketten farklı en az bir konu etiketi eklenmeli.");
  addRequired(Boolean(metadata.editorialOwner), "Editöryal sorumlu belirtilmeli.");
  if (metadata.contentType === "Haber") {
    addRequired(metadata.sources.length > 0, "En az bir kaynak eklenmeli.");
    metadata.sources.forEach((source, index) => {
      const label = index === 0 ? "Birincil kaynak" : `${index + 1}. kaynak`;
      addRequired(Boolean(source.name), `${label} adı boş olamaz.`);
      addRequired(isPublicHttpUrl(source.url), `${label} URL'si geçerli bir genel HTTP(S) adresi olmalı.`);
      if (!(ORTAK_ALAN_SOURCE_TYPES as readonly string[]).includes(source.type)) warnings.push(`${label} türü seçilmeli.`);
      if (!source.publishedAt) warnings.push(`${label} için orijinal yayın tarihi belirtilmeli.`);
      if (!source.note) warnings.push(`${label} için kısa bir kaynak notu eklenmeli.`);
    });
    addRequired(Boolean(context.html && hasVisibleOrtakAlanSources(context.html)), "Yazı HTML'inde geçerli bağlantılar içeren görünür Kaynaklar bölümü bulunmalı.");
  }
  addRequired(context.hasCoverImage, "Kapak görseli eklenmeli.");
  addRequired(isMeaningfulTurkishAlt(metadata.image.alt), "Kapak görseli için anlamlı Türkçe alt metin eklenmeli.");
  metadata.inlineImages.forEach((image, index) => addRequired(isMeaningfulTurkishAlt(image.alt), `${index + 1}. yazı görseli için anlamlı Türkçe alt metin eklenmeli.`));
  addRequired(Boolean(metadata.image.source), "Görsel kaynağı belirtilmeli.");
  addRequired(Boolean(metadata.image.license), "Görsel lisansı belirtilmeli.");
  if (metadata.aiAssisted) addRequired(Boolean(metadata.aiUsageNote), "AI destekli içerik için kullanım notu eklenmeli.");
  if (metadata.sponsored) addRequired(metadata.contentType === "Sponsorlu İçerik", "Sponsorlu içerik türü ve işareti tutarlı olmalı.");

  if (/şok|inanılmaz|bunu kimse|çok şaşıracaksınız|son dakika/i.test(context.title)) warnings.push("Başlık clickbait veya aşırı iddialı ifade içeriyor olabilir.");

  const authorError = !metadata.author?.id || !context.authorMatched ? "Seçilen yazar aktif bir Ghost yazarıyla eşleşmeli." : null;
  if (context.mode === "publish") return { errors: [...(authorError ? [authorError] : []), ...required], warnings };
  return { errors: [], warnings: [...(authorError ? [authorError] : []), ...required, ...warnings] };
}

export function ortakAlanTags(metadata: OrtakAlanPublishingMetadata) {
  return normalizeTags([metadata.contentType, ...metadata.topicTags]).slice(0, 8);
}

export function ortakAlanFeatureImageCaption(metadata: OrtakAlanPublishingMetadata) {
  const parts = [metadata.image.source && `Görsel: ${metadata.image.source}`, metadata.image.license && `Lisans: ${metadata.image.license}`].filter(Boolean);
  if (metadata.image.aiGenerated) parts.push("AI destekli temsili görsel.");
  return parts.join(" · ");
}

const DISCLOSURE_START = "<!-- blogfactory:ortak-alan:start -->";
const DISCLOSURE_END = "<!-- blogfactory:ortak-alan:end -->";

export function appendOrtakAlanDisclosures(html: string, metadata: OrtakAlanPublishingMetadata) {
  const cleanHtml = html.replace(new RegExp(`${escapeRegExp(DISCLOSURE_START)}[\\s\\S]*?${escapeRegExp(DISCLOSURE_END)}`, "g"), "").trim();
  const sourceItems = metadata.sources.filter((source) => source.name && isPublicHttpUrl(source.url)).map((source) => {
    const published = source.publishedAt ? ` <span class="source-date">(${escapeHtml(source.publishedAt)})</span>` : "";
    const type = source.type ? ` <span class="source-type">${escapeHtml(source.type)}</span>` : "";
    const note = source.note ? `<p>${escapeHtml(source.note)}</p>` : "";
    return `<li><a href="${escapeAttribute(source.url)}" rel="nofollow noopener" target="_blank">${escapeHtml(source.name)}</a>${type}${published}${note}</li>`;
  }).join("");
  const sourceSection = sourceItems ? `<section class="source-note"><h2>Kaynaklar</h2><ul>${sourceItems}</ul></section>` : "";
  const editorialParts = metadata.editorialOwner ? [`<p><strong>Editöryal sorumlu:</strong> ${escapeHtml(metadata.editorialOwner)}</p>`] : [];
  if (metadata.aiAssisted) editorialParts.push(`<p><strong>AI kullanımı:</strong> ${escapeHtml(metadata.aiUsageNote)}</p>`);
  if (metadata.sponsored) editorialParts.push("<p><strong>Sponsorlu içerik:</strong> Bu içerik ticari iş birliği kapsamında hazırlanmıştır.</p>");
  const editorialSection = editorialParts.length ? `<section class="editorial-note"><h2>Editöryal şeffaflık</h2>${editorialParts.join("")}</section>` : "";
  if (!sourceSection && !editorialSection) return cleanHtml;
  return `${cleanHtml}\n${DISCLOSURE_START}<!--kg-card-begin: html-->${sourceSection}${editorialSection}<!--kg-card-end: html-->${DISCLOSURE_END}`.trim();
}

export function hasVisibleOrtakAlanSources(html: string) {
  return html.includes(DISCLOSURE_START)
    && /<section class="source-note">[\s\S]*?<h2>Kaynaklar<\/h2>[\s\S]*?<a href="https?:\/\//i.test(html);
}

export function isCompleteSentence(value: string) {
  return /[.!?…]["'”’\)\]\}]*$/.test(value.trim());
}

export function completeSentenceWithinLimit(value: string, maxChars: number) {
  const cleaned = textValue(value);
  if (cleaned.length <= maxChars && isCompleteSentence(cleaned)) return cleaned;
  const sentences = cleaned.match(/[^.!?…]+[.!?…]+["'”’\)\]\}]*/g)?.map((sentence) => sentence.trim()) || [];
  let result = "";
  for (const sentence of sentences) {
    const next = [result, sentence].filter(Boolean).join(" ");
    if (next.length > maxChars) break;
    result = next;
  }
  return result || cleaned;
}

export function isMeaningfulTurkishAlt(value: string) {
  const alt = textValue(value);
  return alt.length >= 12
    && alt.length <= 180
    && alt.split(/\s+/).length >= 3
    && /[çğıöşüİÇĞÖŞÜ]/.test(alt)
    && !/^(?:featured image|article image(?: \d+)?|image)\b|\bfor\b/i.test(alt)
    && !/^https?:\/\//i.test(alt)
    && !/\.(?:avif|gif|jpe?g|png|webp)(?:\?.*)?$/i.test(alt);
}

function normalizeSource(value: unknown): OrtakAlanSource {
  const source = objectValue(value);
  const type = textValue(source.type);
  return {
    name: textValue(source.name),
    url: normalizeUrl(textValue(source.url)),
    type: (ORTAK_ALAN_SOURCE_TYPES as readonly string[]).includes(type) ? type : "",
    publishedAt: textValue(source.publishedAt),
    note: textValue(source.note),
  };
}

function normalizeTags(values: unknown[]) {
  const seen = new Set<string>();
  return values.map(textValue).filter((value) => {
    if (!value) return false;
    const key = value.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function normalizeUrl(value: string) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    const bareHostname = hostname.replace(/^\[|\]$/g, "");
    if ((!hostname.includes(".") && !bareHostname.includes(":")) || hostname === "localhost" || hostname === "0.0.0.0" || bareHostname === "::1" || /^(?:f[cd]|fe[89ab])/.test(bareHostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
    return !/^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|224\.|24\d\.)/.test(hostname);
  } catch {
    return false;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

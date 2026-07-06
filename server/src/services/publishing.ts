import { Buffer } from "node:buffer";
import { SignJWT } from "jose";
import { connect } from "framer-api";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { imageAssets, postPublications, posts, siteIntegrations, sites } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "./api-keys.js";
import { normalizeImagePlacement, reflowInlineImages, type ImagePlacement, type PlacementImage } from "./image-placement.js";
import { getObject, getPublicUrl } from "./s3-client.js";

export type IntegrationProvider = "wordpress" | "ghost" | "wix" | "framer";
export type PublishMode = "draft" | "publish";

export const PUBLISHING_PROVIDERS: IntegrationProvider[] = ["wordpress", "ghost", "wix", "framer"];

type IntegrationRow = typeof siteIntegrations.$inferSelect;
type PostRow = typeof posts.$inferSelect;

interface WordPressCredentials {
  url: string;
  username: string;
  applicationPassword: string;
}

interface GhostCredentials {
  url: string;
  adminApiKey: string;
}

interface WixCredentials {
  apiKey: string;
  siteId: string;
  memberId: string;
}

interface FramerCredentials {
  projectUrl: string;
  apiKey: string;
  collectionId: string;
}

type ProviderCredentials = WordPressCredentials | GhostCredentials | WixCredentials | FramerCredentials;

interface PublishOptions {
  mode?: PublishMode;
  postType?: "post" | "page";
  slug?: string;
  tags?: string[];
  categories?: string[];
  metaTitle?: string;
  metaDescription?: string;
  excerpt?: string;
}

interface ArticlePayload {
  title: string;
  baseMarkdown: string;
  baseHtml: string;
  markdown: string;
  html: string;
  excerpt: string;
  slug: string;
  tags: string[];
  categories: string[];
  metaTitle: string;
  metaDescription: string;
  coverImageUrl: string | null;
  coverAltText: string;
  inlineImages: PlacementImage[];
}

interface PublishingImageAsset {
  storagePath: string;
  altText: string | null;
  type: string;
  position: number | null;
}

interface PublishResult {
  status: "draft" | "published";
  externalId: string | null;
  externalUrl: string | null;
  externalEditUrl?: string | null;
  responseData?: Record<string, unknown>;
}

interface WixImportedImage {
  id: string;
  url?: string;
  wixMediaIdentifier?: string;
  filename?: string;
  mediaType?: string;
  operationStatus?: string;
  width: number;
  height: number;
}

type WixImageSource = "id" | "url" | "none";
type WixCoverSource = "both" | "media" | "hero" | "none";

export function isPublishingProvider(value: string): value is IntegrationProvider {
  return (PUBLISHING_PROVIDERS as string[]).includes(value);
}

export function serializeIntegration(row: IntegrationRow) {
  const config = (row.config || {}) as Record<string, unknown>;
  return {
    id: row.id,
    userId: row.userId,
    user_id: row.userId,
    siteId: row.siteId,
    site_id: row.siteId,
    provider: row.provider,
    displayName: row.displayName,
    display_name: row.displayName,
    status: row.status,
    credentialHint: row.credentialHint,
    credential_hint: row.credentialHint,
    config,
    lastTestedAt: row.lastTestedAt,
    last_tested_at: row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    last_test_result: row.lastTestResult,
    lastPublishAt: row.lastPublishAt,
    last_publish_at: row.lastPublishAt,
    createdAt: row.createdAt,
    created_at: row.createdAt,
    updatedAt: row.updatedAt,
    updated_at: row.updatedAt,
  };
}

export function serializePublication(row: typeof postPublications.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    user_id: row.userId,
    postId: row.postId,
    post_id: row.postId,
    siteId: row.siteId,
    site_id: row.siteId,
    integrationId: row.integrationId,
    integration_id: row.integrationId,
    provider: row.provider,
    publishMode: row.publishMode,
    publish_mode: row.publishMode,
    status: row.status,
    externalId: row.externalId,
    external_id: row.externalId,
    externalUrl: row.externalUrl,
    external_url: row.externalUrl,
    externalEditUrl: row.externalEditUrl,
    external_edit_url: row.externalEditUrl,
    title: row.title,
    errorMessage: row.errorMessage,
    error_message: row.errorMessage,
    responseData: row.responseData,
    response_data: row.responseData,
    publishedAt: row.publishedAt,
    published_at: row.publishedAt,
    createdAt: row.createdAt,
    created_at: row.createdAt,
    updatedAt: row.updatedAt,
    updated_at: row.updatedAt,
  };
}

export function encryptProviderCredentials(provider: IntegrationProvider, input: unknown, existing?: IntegrationRow) {
  const credentials = validateCredentials(provider, mergeCredentialInput(input, existing));
  return {
    encrypted: encryptSecret(JSON.stringify(credentials)),
    hint: credentialHint(provider, credentials),
  };
}

export function decryptProviderCredentials(row: IntegrationRow): ProviderCredentials {
  const parsed = JSON.parse(decryptSecret(row.credentialsEncrypted)) as unknown;
  return validateCredentials(row.provider as IntegrationProvider, parsed);
}

export async function listUserIntegrations(userId: string, siteId?: string) {
  const where = siteId
    ? and(eq(siteIntegrations.userId, userId), eq(siteIntegrations.siteId, siteId))
    : eq(siteIntegrations.userId, userId);
  const rows = await db.select().from(siteIntegrations).where(where).orderBy(desc(siteIntegrations.createdAt));
  return rows.map(serializeIntegration);
}

export async function testIntegration(row: IntegrationRow) {
  const provider = row.provider as IntegrationProvider;
  const credentials = decryptProviderCredentials(row);

  if (provider === "wordpress") return testWordPress(credentials as WordPressCredentials);
  if (provider === "ghost") return testGhost(credentials as GhostCredentials);
  if (provider === "wix") return testWix(credentials as WixCredentials);
  if (provider === "framer") return testFramer(credentials as FramerCredentials);
  throw new Error("Unsupported integration provider");
}

export async function publishPost(userId: string, postId: string, integrationId: string, options: PublishOptions = {}) {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);
  if (!post) throw new Error("Post not found");

  const [integration] = await db
    .select()
    .from(siteIntegrations)
    .where(and(eq(siteIntegrations.id, integrationId), eq(siteIntegrations.userId, userId)))
    .limit(1);
  if (!integration) throw new Error("Integration not found");
  if (integration.status !== "connected") throw new Error("Integration is not connected");

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, integration.siteId), eq(sites.userId, userId)))
    .limit(1);
  if (!site) throw new Error("Site not found for this integration");

  const provider = integration.provider as IntegrationProvider;
  const credentials = decryptProviderCredentials(integration);
  const assetRows = await db
    .select({
      storagePath: imageAssets.storagePath,
      altText: imageAssets.altText,
      type: imageAssets.type,
      position: imageAssets.position,
    })
    .from(imageAssets)
    .where(and(eq(imageAssets.userId, userId), eq(imageAssets.postId, postId)));
  const article = buildArticlePayload(post, options, normalizeImagePlacement("auto"), assetRows);
  const mode = options.mode === "publish" ? "publish" : "draft";

  try {
    const result =
      provider === "wordpress"
        ? await publishWordPress(credentials as WordPressCredentials, article, mode, options)
        : provider === "ghost"
          ? await publishGhost(credentials as GhostCredentials, article, mode, options)
          : provider === "wix"
            ? await publishWix(credentials as WixCredentials, article, mode)
            : await publishFramer(credentials as FramerCredentials, article, mode, integration.config as Record<string, unknown> | null);

    const [publication] = await db
      .insert(postPublications)
      .values({
        userId,
        postId,
        siteId: integration.siteId,
        integrationId: integration.id,
        provider,
        publishMode: mode,
        status: result.status,
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        externalEditUrl: result.externalEditUrl,
        title: post.title,
        responseData: redactResponseData(result.responseData),
        publishedAt: new Date(),
      })
      .returning();

    await db
      .update(siteIntegrations)
      .set({ lastPublishAt: new Date(), status: "connected" })
      .where(eq(siteIntegrations.id, integration.id));

    if (mode === "publish") {
      await db.update(posts).set({ status: "published" }).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
    }

    if (mode === "publish" && result.externalUrl) {
      try {
        const { submitPublishedUrl } = await import("./indexing.js");
        await submitPublishedUrl(userId, integration.siteId, result.externalUrl);
      } catch (error) {
        console.error("[indexing] Auto-submit failed:", error);
      }
    }

    return {
      success: true,
      publication: serializePublication(publication),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing failed";
    const [publication] = await db
      .insert(postPublications)
      .values({
        userId,
        postId,
        siteId: integration.siteId,
        integrationId: integration.id,
        provider,
        publishMode: mode,
        status: "failed",
        title: post.title,
        errorMessage: message,
      })
      .returning();
    return {
      success: false,
      error: message,
      publication: serializePublication(publication),
    };
  }
}

export async function getPostPublications(userId: string, postId: string) {
  const rows = await db
    .select()
    .from(postPublications)
    .where(and(eq(postPublications.userId, userId), eq(postPublications.postId, postId)))
    .orderBy(desc(postPublications.createdAt));
  return rows.map(serializePublication);
}

function validateCredentials(provider: IntegrationProvider, input: unknown): ProviderCredentials {
  if (!input || typeof input !== "object") throw new Error("Credentials are required");
  const value = input as Record<string, unknown>;
  const stringValue = (key: string) => String(value[key] || "").trim();

  if (provider === "wordpress") {
    const credentials = {
      url: normalizeUrl(stringValue("url")),
      username: stringValue("username"),
      applicationPassword: stringValue("applicationPassword"),
    };
    if (!credentials.username || !credentials.applicationPassword) throw new Error("WordPress username and application password are required");
    return credentials;
  }

  if (provider === "ghost") {
    const credentials = {
      url: normalizeUrl(stringValue("url")),
      adminApiKey: stringValue("adminApiKey"),
    };
    if (!/^[a-f0-9]{24}:[a-f0-9]{64}$/i.test(credentials.adminApiKey)) throw new Error("Ghost Admin API key should look like keyId:secret");
    return credentials;
  }

  if (provider === "wix") {
    const credentials = {
      apiKey: stringValue("apiKey"),
      siteId: stringValue("siteId"),
      memberId: stringValue("memberId"),
    };
    if (!credentials.apiKey || !credentials.siteId || !credentials.memberId) {
      throw new Error("Wix API key, site ID, and author/member ID are required");
    }
    return credentials;
  }

  const credentials = {
    projectUrl: stringValue("projectUrl"),
    apiKey: stringValue("apiKey"),
    collectionId: stringValue("collectionId"),
  };
  if (!credentials.projectUrl || !credentials.apiKey || !credentials.collectionId) {
    throw new Error("Framer project URL, API key, and collection ID/name are required");
  }
  return credentials;
}

function mergeCredentialInput(input: unknown, existing?: IntegrationRow) {
  if (!existing) return input;

  const current = JSON.parse(decryptSecret(existing.credentialsEncrypted)) as unknown;
  if (!current || typeof current !== "object" || !input || typeof input !== "object") return input;

  const merged: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) merged[key] = trimmed;
    } else if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function credentialHint(provider: IntegrationProvider, credentials: ProviderCredentials) {
  if (provider === "wordpress") return (credentials as WordPressCredentials).username;
  if (provider === "ghost") return domainFromUrl((credentials as GhostCredentials).url);
  if (provider === "wix") return last4((credentials as WixCredentials).siteId);
  return domainFromUrl((credentials as FramerCredentials).projectUrl);
}

function normalizeUrl(url: string) {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Only HTTP and HTTPS URLs are supported");
  return parsed.origin;
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function last4(value: string) {
  return value.slice(-4);
}

function fallbackImageAlt(title: string, type: "cover" | "inline", index = 0) {
  return `${type === "cover" ? "Featured image" : `Article image ${index + 1}`} for ${title}`.slice(0, 180);
}

function buildArticlePayload(post: PostRow, options: PublishOptions, imagePlacement: ImagePlacement, imageAssetsForPost: PublishingImageAsset[]): ArticlePayload {
  const rawTitle = post.title.trim();
  const content = post.content || "";
  const meta = parseMarkdownMeta(content);
  const body = articleBody(content);
  const title = publishTitle(rawTitle, body);
  const excerpt = truncateAtWord(options.excerpt || meta.metaDescription || plainText(withoutMarkdownTitle(body)), 220);
  const tags = publishTags(options.tags?.length ? options.tags : meta.tags);
  const categories = normalizeStringList(options.categories || []);
  const slug = slugify(options.slug || meta.slug || title);
  const metaTitle = truncateAtWord(chooseMetaTitle(options.metaTitle || meta.metaTitle, title, body), 60);
  const metaDescription = truncateAtWord(options.metaDescription || meta.metaDescription || excerpt, 145);
  const altByPath = new Map(imageAssetsForPost.map((asset) => [asset.storagePath, asset.altText]));
  const sortedAssets = [...imageAssetsForPost].sort((left, right) =>
    (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
  );
  const assetCover = sortedAssets.find((asset) => asset.type === "cover")?.storagePath || null;
  const markdownImages = markdownImageRefs(body);
  const coverCandidate = post.coverImageUrl || assetCover || null;
  const inlineCandidates = uniqueStrings([
    ...(post.inlineImages || []),
    ...sortedAssets.filter((asset) => asset.type === "inline").map((asset) => asset.storagePath),
    ...markdownImages.map((image) => image.url),
  ]).filter((url) => url && url !== coverCandidate);
  const markdownAltByPath = new Map(markdownImages.map((image) => [image.url, image.altText]));
  const storedInlineImages = inlineCandidates.map((url, index) => ({
    url,
    altText: altByPath.get(url) || markdownAltByPath.get(url) || fallbackImageAlt(title, "inline", index),
  }));
  const autoPromotedCover = !coverCandidate && imagePlacement === "auto" && storedInlineImages.length === 1
    ? storedInlineImages[0]
    : null;
  const coverImageUrl = coverCandidate || autoPromotedCover?.url || null;
  const coverAltText = coverImageUrl ? altByPath.get(coverImageUrl) || autoPromotedCover?.altText || fallbackImageAlt(title, "cover") : fallbackImageAlt(title, "cover");
  const inlineImages = autoPromotedCover ? [] : storedInlineImages;
  const placedMarkdown = reflowInlineImages(body, inlineImages, imagePlacement);

  return {
    title,
    baseMarkdown: body,
    baseHtml: markdownToHtml(body),
    markdown: placedMarkdown,
    html: markdownToHtml(placedMarkdown),
    excerpt,
    slug,
    tags,
    categories,
    metaTitle,
    metaDescription,
    coverImageUrl,
    coverAltText,
    inlineImages,
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function markdownImageRefs(markdown: string) {
  return Array.from(markdown.matchAll(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g))
    .map((match) => ({ altText: match[1]?.trim() || null, url: match[2]?.trim() || "" }))
    .filter((image) => image.url);
}

function markdownSection(content: string, heading: string) {
  const pattern = new RegExp(`^##\\s+(?:${heading})\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`, "im");
  return cleanMetaValue(content.match(pattern)?.[1] || "");
}

function cleanMetaValue(value: string) {
  return value.replace(/^`|`$/g, "").trim();
}

function parseMarkdownMeta(content: string) {
  const keywords = markdownSection(content, "SEO Anahtar Kelimeleri|SEO Keywords|Keywords");
  return {
    slug: markdownSection(content, "Slug"),
    metaTitle: markdownSection(content, "Meta Title"),
    metaDescription: markdownSection(content, "Meta Description"),
    tags: keywords ? keywords.split(",") : [],
  };
}

export function articleBody(content: string) {
  const index = content.search(/^#\s+/m);
  const body = (index >= 0 ? content.slice(index) : content).trim();
  const firstTitle = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  let next = body.replace(/^#\s+.+\n*/m, "").trim();
  if (firstTitle) {
    const duplicate = new RegExp(`^#{1,3}\\s+${escapeRegExp(firstTitle)}\\s*\\n*`, "i");
    while (duplicate.test(next)) next = next.replace(duplicate, "").trim();
  }
  return next || body;
}

function normalizeStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 20);
}

export function publishTags(values: string[] = []) {
  return normalizeStringList(values).slice(0, 8);
}

export function slugify(value: string) {
  const slug = transliterate(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 5)
    .join("-")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return slug || "article";
}

function transliterate(value: string) {
  const map: Record<string, string> = {
    ç: "c",
    Ç: "C",
    ğ: "g",
    Ğ: "G",
    ı: "i",
    I: "I",
    İ: "I",
    ö: "o",
    Ö: "O",
    ş: "s",
    Ş: "S",
    ü: "u",
    Ü: "U",
  };
  return value.replace(/[çÇğĞıİöÖşŞüÜ]/g, (char) => map[char] || char);
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutMarkdownTitle(markdown: string) {
  return markdown.replace(/^#\s+.+\n*/m, "").trim();
}

export function publishTitle(title: string, content: string) {
  const markdownTitle = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  const candidate = markdownTitle || title;
  if (hasTurkishText(content) && !hasTurkishText(candidate)) return titleFromTurkishBody(content, title);
  return truncateAtWord(candidate, 90);
}

function chooseMetaTitle(value: string | undefined, fallbackTitle: string, content: string) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return fallbackTitle;
  if (hasTurkishText(content) && !hasTurkishText(cleaned) && hasTurkishText(fallbackTitle)) return fallbackTitle;
  return cleaned;
}

function titleFromTurkishBody(content: string, fallback: string) {
  const sentence = plainText(withoutMarkdownTitle(content)).split(/(?<=[.!?])\s+/)[0] || fallback;
  const polished = sentence
    .replace(/\bkarşılaştığı temel engellerden biri\b.*$/i, "önündeki temel engeller")
    .replace(/\bkarşılaştığı temel engeller\b.*$/i, "karşılaştığı temel engeller")
    .replace(/,\s+.*$/, "")
    .trim();
  return truncateAtWord(polished || fallback, 90);
}

function hasTurkishText(value: string) {
  return /[çğıöşüÇĞİÖŞÜ]/.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function truncateAtWord(value: string, maxChars: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const clipped = cleaned.slice(0, maxChars + 1).replace(/\s+\S*$/, "").trim();
  return clipped || cleaned.slice(0, maxChars).trim();
}

type ListKind = "ul" | "ol";

export function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let listKind: ListKind | null = null;
  let paragraph: string[] = [];
  let inFaqSection = false;
  let faqItems: Array<{ question: string; body: string[] }> = [];
  let activeFaqItem: { question: string; body: string[] } | null = null;

  const closeList = () => {
    if (!listKind) return;
    html.push(`</${listKind}>`);
    listKind = null;
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushFaqItem = () => {
    if (!activeFaqItem) return;
    faqItems.push(activeFaqItem);
    activeFaqItem = null;
  };

  const flushFaqSection = () => {
    flushFaqItem();
    if (faqItems.length) {
      html.push("<ul class=\"faq-list\">");
      for (const item of faqItems) {
        html.push(`<li><p><strong>${inlineMarkdown(item.question)}</strong></p>${renderFaqBody(item.body)}</li>`);
      }
      html.push("</ul>");
    }
    faqItems = [];
    inFaqSection = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const image = trimmed.match(/^!\[([^\]]*)]\(([^)]+)\)/);
    if (image) {
      if (inFaqSection) flushFaqSection();
      flushParagraph();
      closeList();
      html.push(`<figure><img src="${escapeAttribute(image[2])}" alt="${escapeAttribute(image[1] || "")}" /></figure>`);
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (inFaqSection && level === 3) {
        flushFaqItem();
        activeFaqItem = { question: title, body: [] };
        continue;
      }
      if (inFaqSection) flushFaqSection();
      flushParagraph();
      closeList();
      html.push(`<h${level}>${inlineMarkdown(title)}</h${level}>`);
      if (level === 2 && isFaqHeading(title)) inFaqSection = true;
      continue;
    }
    if (inFaqSection && activeFaqItem) {
      activeFaqItem.body.push(trimmed);
      continue;
    }
    const listItem = parseListItem(trimmed);
    if (listItem) {
      flushParagraph();
      if (listKind && listKind !== listItem.kind) closeList();
      if (!listKind) {
        html.push(`<${listItem.kind}>`);
        listKind = listItem.kind;
      }
      html.push(`<li>${inlineMarkdown(listItem.value)}</li>`);
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  if (inFaqSection) flushFaqSection();
  flushParagraph();
  closeList();
  return html.join("\n");
}

function renderFaqBody(lines: string[]) {
  const html: string[] = [];
  let listKind: ListKind | null = null;
  let paragraph: string[] = [];
  const closeList = () => {
    if (!listKind) return;
    html.push(`</${listKind}>`);
    listKind = null;
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const listItem = parseListItem(trimmed);
    if (listItem) {
      flushParagraph();
      if (listKind && listKind !== listItem.kind) closeList();
      if (!listKind) {
        html.push(`<${listItem.kind}>`);
        listKind = listItem.kind;
      }
      html.push(`<li>${inlineMarkdown(listItem.value)}</li>`);
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return html.join("");
}

function isFaqHeading(value: string) {
  return /^(sık sorulan sorular|sss|faq|faqs|frequently asked questions)$/i.test(value.trim());
}

function parseListItem(value: string): { kind: ListKind; value: string } | null {
  const unordered = value.match(/^[-*]\s+(.+)/);
  if (unordered) return { kind: "ul", value: unordered[1] };
  const ordered = value.match(/^\d+[.)]\s+(.+)/);
  if (ordered) return { kind: "ol", value: ordered[1] };
  return null;
}

function inlineMarkdown(value: string) {
  const linkTokens: string[] = [];
  const withLinkTokens = value.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = href.trim();
    if (!isSafeHref(safeHref)) return label;
    const token = `\u0000LINK_${linkTokens.length}\u0000`;
    linkTokens.push(`<a href="${escapeAttribute(safeHref)}">${inlineMarkdown(label)}</a>`);
    return token;
  });

  let html = escapeHtml(withLinkTokens)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const [index, linkHtml] of linkTokens.entries()) {
    html = html.split(`\u0000LINK_${index}\u0000`).join(linkHtml);
  }

  return html;
}

function isSafeHref(value: string) {
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function replaceImageUrls(html: string, images: Array<{ from: string; to: string }>) {
  return images.reduce((next, image) => next.split(escapeAttribute(image.from)).join(escapeAttribute(image.to)), html);
}

function basicAuth(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function testWordPress(credentials: WordPressCredentials) {
  const response = await fetch(`${credentials.url}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: basicAuth(credentials.username, credentials.applicationPassword) },
  });
  if (!response.ok) throw new Error(`WordPress test failed: ${response.status}`);
  const user = await response.json() as { name?: string; slug?: string };
  return { success: true, message: `Connected as ${user.name || user.slug || credentials.username}` };
}

async function publishWordPress(credentials: WordPressCredentials, article: ArticlePayload, mode: PublishMode, options: PublishOptions): Promise<PublishResult> {
  const headers = {
    Authorization: basicAuth(credentials.username, credentials.applicationPassword),
    "Content-Type": "application/json",
  };
  const tagIds = await resolveWordPressTerms(credentials, "tags", article.tags);
  const categoryIds = await resolveWordPressTerms(credentials, "categories", article.categories);
  const featuredMedia = article.coverImageUrl ? await uploadWordPressMedia(credentials, article.coverImageUrl, article.title, article.coverAltText).catch(() => null) : null;
  const uploadedInlineImages = await Promise.all(
    article.inlineImages.map(async (image, index) => ({
      from: image.url,
      to: (await uploadWordPressMedia(credentials, image.url, `${article.title}-${index + 1}`, image.altText || article.title).catch(() => null))?.url || image.url,
    }))
  );
  const postType = options.postType === "page" ? "pages" : "posts";

  const response = await fetch(`${credentials.url}/wp-json/wp/v2/${postType}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: article.title,
      content: replaceImageUrls(article.html, uploadedInlineImages),
      excerpt: article.excerpt,
      slug: article.slug,
      status: mode === "publish" ? "publish" : "draft",
      ...(tagIds.length && postType === "posts" ? { tags: tagIds } : {}),
      ...(categoryIds.length && postType === "posts" ? { categories: categoryIds } : {}),
      ...(featuredMedia?.id ? { featured_media: featuredMedia.id } : {}),
      meta: {
        _yoast_wpseo_title: article.metaTitle,
        _yoast_wpseo_metadesc: article.metaDescription,
        rank_math_title: article.metaTitle,
        rank_math_description: article.metaDescription,
        _aioseo_title: article.metaTitle,
        _aioseo_description: article.metaDescription,
      },
    }),
  });
  if (!response.ok) throw new Error(`WordPress publish failed: ${await response.text()}`);
  const data = await response.json() as { id?: number; link?: string; status?: string };
  return {
    status: data.status === "publish" ? "published" : "draft",
    externalId: data.id ? String(data.id) : null,
    externalUrl: data.link || null,
    responseData: { id: data.id, status: data.status },
  };
}

async function resolveWordPressTerms(credentials: WordPressCredentials, taxonomy: "tags" | "categories", labels: string[]) {
  const ids: number[] = [];
  for (const label of labels.slice(0, 10)) {
    const found = await fetch(`${credentials.url}/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(label)}&per_page=20`, {
      headers: { Authorization: basicAuth(credentials.username, credentials.applicationPassword) },
    });
    if (found.ok) {
      const rows = await found.json() as Array<{ id: number; name: string }>;
      const exact = rows.find((row) => row.name.toLowerCase() === label.toLowerCase());
      if (exact) {
        ids.push(exact.id);
        continue;
      }
    }
    const created = await fetch(`${credentials.url}/wp-json/wp/v2/${taxonomy}`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(credentials.username, credentials.applicationPassword),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: label }),
    });
    if (created.ok) {
      const row = await created.json() as { id: number };
      ids.push(row.id);
    }
  }
  return ids;
}

async function uploadWordPressMedia(credentials: WordPressCredentials, pathOrUrl: string, title: string, altText?: string) {
  const image = await fetchImage(pathOrUrl);
  if (!image) return null;
  const filename = `${slugify(title)}.${extensionForMime(image.mimeType)}`;
  const response = await fetch(`${credentials.url}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(credentials.username, credentials.applicationPassword),
      "Content-Type": image.mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: image.buffer as unknown as BodyInit,
  });
  if (!response.ok) return null;
  const data = await response.json() as { id?: number; source_url?: string };
  if (data.id && altText) {
    await fetch(`${credentials.url}/wp-json/wp/v2/media/${data.id}`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(credentials.username, credentials.applicationPassword),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alt_text: altText }),
    }).catch(() => null);
  }
  return data.id ? { id: data.id, url: data.source_url || pathOrUrl } : null;
}

async function testGhost(credentials: GhostCredentials) {
  const response = await fetch(`${credentials.url}/ghost/api/admin/site/`, {
    headers: { Authorization: `Ghost ${await ghostJwt(credentials.adminApiKey)}` },
  });
  if (!response.ok) throw new Error(`Ghost test failed: ${response.status}`);
  const data = await response.json() as { site?: { title?: string } };
  return { success: true, message: `Connected to ${data.site?.title || domainFromUrl(credentials.url)}` };
}

async function publishGhost(credentials: GhostCredentials, article: ArticlePayload, mode: PublishMode, options: PublishOptions): Promise<PublishResult> {
  const postType = options.postType === "page" ? "pages" : "posts";
  const featureImage = article.coverImageUrl ? await uploadGhostImage(credentials, article.coverImageUrl, article.title) : null;
  const uploadedInlineImages = await Promise.all(
    article.inlineImages.map(async (image, index) => ({
      from: image.url,
      to: await uploadGhostImage(credentials, image.url, `${article.title}-${index + 1}`).catch(() => image.url) || image.url,
    }))
  );
  const html = replaceImageUrls(article.html, uploadedInlineImages);
  const response = await fetch(`${credentials.url}/ghost/api/admin/${postType}/?source=html`, {
    method: "POST",
    headers: {
      Authorization: `Ghost ${await ghostJwt(credentials.adminApiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      [postType]: [{
        title: article.title,
        html,
        status: mode === "publish" ? "published" : "draft",
        slug: article.slug,
        excerpt: article.excerpt,
        custom_excerpt: article.excerpt,
        meta_title: article.metaTitle,
        meta_description: article.metaDescription,
        tags: article.tags.map((name) => ({ name })),
        ...(featureImage ? { feature_image: featureImage } : {}),
      }],
    }),
  });
  if (!response.ok) throw new Error(`Ghost publish failed: ${await response.text()}`);
  const data = await response.json() as Record<string, Array<{ id?: string; url?: string; status?: string }>>;
  const row = data[postType]?.[0];
  return {
    status: row?.status === "published" ? "published" : "draft",
    externalId: row?.id || null,
    externalUrl: row?.url || null,
    responseData: { id: row?.id, status: row?.status },
  };
}

async function uploadGhostImage(credentials: GhostCredentials, pathOrUrl: string, title: string) {
  const image = await fetchImage(pathOrUrl);
  if (!image) return null;
  const filename = `${slugify(title)}.${extensionForMime(image.mimeType)}`;
  const formData = new FormData();
  formData.append("file", new Blob([image.buffer as BlobPart], { type: image.mimeType }), filename);
  const response = await fetch(`${credentials.url}/ghost/api/admin/images/upload/`, {
    method: "POST",
    headers: { Authorization: `Ghost ${await ghostJwt(credentials.adminApiKey)}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`Ghost image upload failed: ${await response.text()}`);
  const data = await response.json() as { images?: Array<{ url?: string }> };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("Ghost image upload failed: no image URL returned");
  return url;
}

async function ghostJwt(adminApiKey: string) {
  const [id, secret] = adminApiKey.split(":");
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", kid: id, typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("/admin/")
    .sign(Buffer.from(secret, "hex"));
}

async function testWix(credentials: WixCredentials) {
  const response = await wixApi(credentials, "GET", "/blog/v3/posts?paging.limit=1");
  return { success: true, message: `Connected to Wix site ${credentials.siteId.slice(0, 8)}…`, response };
}

async function publishWix(credentials: WixCredentials, article: ArticlePayload, mode: PublishMode): Promise<PublishResult> {
  const coverMedia = article.coverImageUrl ? await importWixImage(credentials, article.coverImageUrl, article.title) : null;
  const importedImages = new Map<string, WixImportedImage>();
  await Promise.all(article.inlineImages.map(async (image, index) => {
    const imported = await importWixImage(credentials, image.url, `${article.title}-${index + 1}`);
    if (imported) importedImages.set(image.url, imported);
  }));

  const createResponse = await createWixDraftPost(credentials, article, coverMedia, importedImages);

  const draftId = createResponse.draftPost?.id;
  if (!draftId) throw new Error("Wix did not return a draft post ID");

  if (mode === "publish") {
    const publishResponse = await wixApi(credentials, "POST", `/blog/v3/draft-posts/${draftId}/publish`) as { post?: { id?: string; url?: string } };
    return {
      status: "published",
      externalId: publishResponse.post?.id || draftId,
      externalUrl: publishResponse.post?.url || null,
      responseData: { draftId, postId: publishResponse.post?.id },
    };
  }

  return {
    status: "draft",
    externalId: draftId,
    externalUrl: createResponse.draftPost?.url || null,
    responseData: {
      draftId,
      imageVariant: createResponse.blogFactoryImageVariant,
      coverImported: Boolean(coverMedia),
      inlineImported: importedImages.size,
    },
  };
}

interface WixDraftCreateResponse {
  draftPost?: { id?: string; url?: string };
  blogFactoryImageVariant?: string;
}

async function createWixDraftPost(
  credentials: WixCredentials,
  article: ArticlePayload,
  coverMedia: WixImportedImage | null,
  importedImages: Map<string, WixImportedImage>,
) {
  const hasImages = Boolean(coverMedia || importedImages.size);
  const payload = (imageSource: WixImageSource, coverSource: WixCoverSource) => {
    const cover = coverMedia ? wixCoverData(coverMedia, article.coverAltText) : null;
    return {
      draftPost: {
      title: article.title,
      richContent: markdownToWixRichContent(article.markdown, null, importedImages, imageSource),
      ...(cover && (coverSource === "both" || coverSource === "media") ? { media: wixCoverMedia(cover) } : {}),
      ...(cover && (coverSource === "both" || coverSource === "hero") ? { heroImage: cover.image } : {}),
      memberId: credentials.memberId,
      slug: article.slug,
      excerpt: article.excerpt,
      tagIds: [],
      seoData: {
        tags: [
          { type: "title", children: article.metaTitle },
          { type: "meta", props: { name: "description", content: article.metaDescription } },
        ],
      },
    },
    };
  };

  const allVariants = [
    { label: "rich-id-cover-both", imageSource: "id", coverSource: "both" },
    { label: "rich-id-cover-media", imageSource: "id", coverSource: "media" },
    { label: "rich-id-cover-hero", imageSource: "id", coverSource: "hero" },
    { label: "rich-id-no-cover", imageSource: "id", coverSource: "none" },
    { label: "rich-url-no-cover", imageSource: "url", coverSource: "none" },
    { label: "no-rich-cover-media", imageSource: "none", coverSource: "media" },
    { label: "no-rich-cover-hero", imageSource: "none", coverSource: "hero" },
  ] satisfies Array<{ label: string; imageSource: WixImageSource; coverSource: WixCoverSource }>;
  const variants = allVariants.filter((variant) => {
    if (!coverMedia && variant.coverSource !== "none") return false;
    if (!importedImages.size && variant.imageSource !== "none") return false;
    return true;
  });

  let lastMediaError = "";
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    try {
      const response = await wixApi(credentials, "POST", "/blog/v3/draft-posts", payload(variant.imageSource, variant.coverSource)) as WixDraftCreateResponse;
      response.blogFactoryImageVariant = variant.label;
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!isWixMediaReferenceError(message)) throw error;
      lastMediaError = message;
      console.warn(`[wix] Draft media variant failed: ${variant.label}: ${message}`);
      if (index === 0) await sleep(1500);
    }
  }

  if (!hasImages) {
    return await wixApi(credentials, "POST", "/blog/v3/draft-posts", payload("none", "none")) as WixDraftCreateResponse;
  }

  throw new Error(`Wix rejected imported media for this draft. No text-only draft was created. Last Wix error: ${lastMediaError || "unknown media error"}`);
}

async function wixApi(credentials: WixCredentials, method: string, path: string, body?: unknown) {
  const response = await fetch(`https://www.wixapis.com${path}`, {
    method,
    headers: {
      Authorization: credentials.apiKey,
      "wix-site-id": credentials.siteId,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Wix API error ${response.status}: ${await response.text()}`);
  return response.json();
}

async function importWixImage(credentials: WixCredentials, imageUrl: string, title: string): Promise<WixImportedImage | null> {
  const url = externalImageUrl(imageUrl);
  if (!url) {
    throw new Error("Wix image publishing needs public image URLs. Set S3_PUBLIC_URL or deploy with VERCEL_URL/BLOGFACTORY_BASE_URL so stored images can be imported.");
  }
  const mimeType = mimeForPath(imageUrl);
  const response = await wixApi(credentials, "POST", "/site-media/v1/files/import", {
    url,
    mediaType: "IMAGE",
    mimeType,
    displayName: `${slugify(title)}.${extensionForMime(mimeType)}`,
    externalInfo: {
      origin: "blogfactory",
      externalIds: [imageUrl.slice(0, 4000)],
    },
  }) as { file?: WixFileInfo };
  const id = normalizeWixMediaId(wixFileId(response.file));
  if (!id) {
    throw new Error(`Wix media import did not return a file ID for ${imageUrl}. Response: ${summarizeWixFile(response.file)}`);
  }
  const image = await waitForWixImage(credentials, {
    id,
    wixMediaIdentifier: wixImageIdentifier(id, response.file),
    url: response.file?.url,
    filename: response.file?.displayName || filenameFromUrl(response.file?.url),
    operationStatus: response.file?.operationStatus,
    width: wixImageWidth(response.file),
    height: wixImageHeight(response.file),
  });
  if (image.operationStatus === "FAILED") {
    throw new Error(`Wix media import failed for ${imageUrl}. Imported ID: ${image.id}`);
  }
  return image;
}

export function markdownToWixRichContent(
  markdown: string,
  coverImage: WixImportedImage | null,
  importedImages = new Map<string, WixImportedImage>(),
  imageSource: WixImageSource = "id",
) {
  const nodes: unknown[] = [];
  let paragraph: string[] = [];
  let list: { kind: ListKind; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(wixParagraphNode(paragraph.join(" ")));
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    nodes.push(wixListNode(list.kind, list.items));
    list = null;
  };

  if (coverImage && imageSource !== "none") {
    nodes.push(wixImageNode(coverImage, "Featured image", imageSource));
  }
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const image = trimmed.match(/^!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
    if (image) {
      flushParagraph();
      flushList();
      const imported = importedImages.get(image[2]);
      if (imported && imageSource !== "none") nodes.push(wixImageNode(imported, image[1] || "Article image", imageSource));
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      flushParagraph();
      flushList();
      nodes.push(wixHeadingNode(Math.min(heading[1].length + 1, 6), heading[2]));
      continue;
    }
    const quote = trimmed.match(/^>\s+(.+)/);
    if (quote) {
      flushParagraph();
      flushList();
      nodes.push(wixBlockquoteNode(quote[1]));
      continue;
    }
    const listItem = parseListItem(trimmed);
    if (listItem) {
      flushParagraph();
      if (list && list.kind !== listItem.kind) flushList();
      if (!list) list = { kind: listItem.kind, items: [] };
      list.items.push(listItem.value);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return { nodes };
}

function wixTextNodesFromMarkdown(value: string) {
  const nodes = parseWixInlineMarkdown(value);
  return nodes.length ? nodes : [wixTextNode("", [])];
}

function wixParagraphNode(value: string) {
  return { type: "PARAGRAPH", nodes: wixTextNodesFromMarkdown(value), paragraphData: {} };
}

function wixHeadingNode(level: number, value: string) {
  return { type: "HEADING", headingData: { level }, nodes: wixTextNodesFromMarkdown(value) };
}

function wixListNode(kind: ListKind, items: string[]) {
  return {
    type: kind === "ol" ? "ORDERED_LIST" : "BULLETED_LIST",
    nodes: items.map((item) => ({
      type: "LIST_ITEM",
      nodes: [wixParagraphNode(item)],
    })),
    ...(kind === "ol" ? { orderedListData: {} } : { bulletedListData: {} }),
  };
}

function wixBlockquoteNode(value: string) {
  return {
    type: "BLOCKQUOTE",
    nodes: [wixParagraphNode(value)],
    blockquoteData: { indentation: 1 },
  };
}

function parseWixInlineMarkdown(value: string, decorations: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  let index = 0;
  const boldPattern = /\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/g;
  for (const match of value.matchAll(boldPattern)) {
    const start = match.index || 0;
    if (start > index) nodes.push(...parseWixLinks(value.slice(index, start), decorations));
    nodes.push(...parseWixInlineMarkdown(match[1], [...decorations, { type: "BOLD" }]));
    index = start + match[0].length;
  }
  if (index < value.length) nodes.push(...parseWixLinks(value.slice(index), decorations));
  return nodes;
}

function parseWixLinks(value: string, decorations: Array<Record<string, unknown>>) {
  const nodes: Array<Record<string, unknown>> = [];
  let index = 0;
  const linkPattern = /\[([^\]]+)]\(([^)\s]+)\)/g;
  for (const match of value.matchAll(linkPattern)) {
    const start = match.index || 0;
    if (start > index) nodes.push(wixTextNode(value.slice(index, start), decorations));
    const href = match[2];
    nodes.push(wixTextNode(match[1], [...decorations, { type: "LINK", linkData: { link: { url: href } } }]));
    index = start + match[0].length;
  }
  if (index < value.length) nodes.push(wixTextNode(value.slice(index), decorations));
  return nodes.filter((node) => Boolean((node.textData as { text?: string }).text));
}

function wixTextNode(text: string, decorations: Array<Record<string, unknown>>) {
  const textData: Record<string, unknown> = { text, decorations };
  return { type: "TEXT", textData };
}

function wixImageNode(image: WixImportedImage, altText: string, imageSource: "id" | "url") {
  const src = imageSource === "url" && image.url ? { url: image.url } : { id: image.id };
  return {
    type: "IMAGE",
    nodes: [],
    imageData: {
      containerData: {
        width: { size: "CONTENT" },
        alignment: "CENTER",
      },
      image: {
        src,
        width: image.width,
        height: image.height,
      },
      altText: altText.slice(0, 180),
    },
  };
}

function wixCoverMedia(cover: ReturnType<typeof wixCoverData>) {
  return {
    displayed: true,
    custom: true,
    wixMedia: {
      image: cover.image,
    },
  };
}

function wixCoverData(image: WixImportedImage, altText: string) {
  return {
    image: {
      id: image.id,
      ...(image.url ? { url: image.url } : {}),
      ...(image.filename ? { filename: image.filename } : {}),
      width: image.width,
      height: image.height,
      altText: altText.slice(0, 180),
    },
  };
}

interface WixFileInfo {
  id?: string;
  _id?: string;
  url?: string;
  displayName?: string;
  filename?: string;
  mediaType?: string;
  operationStatus?: string;
  width?: number;
  height?: number;
  image?: WixImageInfo;
  media?: { image?: { width?: number; height?: number; image?: WixImageInfo } };
}

interface WixImageInfo {
  id?: string;
  _id?: string;
  url?: string;
  width?: number;
  height?: number;
  filename?: string;
  altText?: string;
}

async function waitForWixImage(credentials: WixCredentials, image: WixImportedImage): Promise<WixImportedImage> {
  let latest = image;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (latest.operationStatus === "READY" && latest.width > 0 && latest.height > 0) return latest;
    if (latest.operationStatus === "FAILED") return latest;
    await sleep(attempt === 0 ? 500 : 1000);
    try {
      const response = await wixApi(credentials, "GET", `/site-media/v1/files/get-file-by-id?fileId=${encodeURIComponent(image.id)}`) as { file?: WixFileInfo; files?: WixFileInfo[] };
      const file = response.file || response.files?.[0];
      if (!file) continue;
      latest = {
        ...latest,
        id: normalizeWixMediaId(wixFileId(file) || latest.id) || latest.id,
        wixMediaIdentifier: wixImageIdentifier(wixFileId(file) || latest.id, file) || latest.wixMediaIdentifier,
        url: file.url || latest.url,
        filename: file.displayName || file.filename || latest.filename || filenameFromUrl(file.url),
        operationStatus: file.operationStatus || latest.operationStatus,
        width: wixImageWidth(file) || latest.width,
        height: wixImageHeight(file) || latest.height,
      };
    } catch {
      return latest;
    }
  }
  return latest;
}

function wixFileId(file?: WixFileInfo) {
  return file?._id || file?.id || file?.media?.image?.image?.id || file?.media?.image?.image?._id || "";
}

function wixImageIdentifier(id: string, file?: WixFileInfo) {
  if (!id) return undefined;
  const filename = file?.filename || file?.displayName || filenameFromUrl(file?.url) || id;
  const width = wixImageWidth(file);
  const height = wixImageHeight(file);
  return `wix:image://v1/${id}/${filename}#originWidth=${width}&originHeight=${height}`;
}

function summarizeWixFile(file?: WixFileInfo) {
  if (!file) return "missing file object";
  return JSON.stringify({
    keys: Object.keys(file),
    id: file.id || null,
    _id: file._id || null,
    url: file.url || null,
    mediaType: file.mediaType || null,
    operationStatus: file.operationStatus || null,
    mediaKeys: file.media ? Object.keys(file.media) : null,
    nestedImageId: file.media?.image?.image?.id || file.media?.image?.image?._id || null,
  });
}

function wixImageWidth(file?: WixFileInfo) {
  return Number(file?.width || file?.image?.width || file?.media?.image?.width || file?.media?.image?.image?.width || 1200);
}

function wixImageHeight(file?: WixFileInfo) {
  return Number(file?.height || file?.image?.height || file?.media?.image?.height || file?.media?.image?.image?.height || 675);
}

function filenameFromUrl(value?: string) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(new URL(value).pathname.split("/").pop() || "") || undefined;
  } catch {
    return value.split(/[/?#]/).filter(Boolean).pop();
  }
}

function isWixMediaReferenceError(message: string) {
  return /media image|id not found|provided .* not found/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function externalImageUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;

  const publicUrl = getPublicUrl(pathOrUrl);
  if (publicUrl) return publicUrl;

  const base = process.env.BLOGFACTORY_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_URL || process.env.VERCEL_URL;
  if (!base) return null;

  const normalizedBase = base.startsWith("http") ? base : `https://${base}`;
  const encodedPath = pathOrUrl.split("/").map(encodeURIComponent).join("/");
  return `${normalizedBase.replace(/\/$/, "")}/api/storage/${encodedPath}`;
}

function normalizeWixMediaId(value: string) {
  if (!value) return "";
  const withoutPrefix = value.replace(/^wix:image:\/\/v1\//, "");
  const staticMatch = withoutPrefix.match(/\/media\/([^/?]+)/);
  return (staticMatch?.[1] || withoutPrefix.split(/[?#]/)[0]).trim();
}

async function testFramer(credentials: FramerCredentials) {
  const framer = await connect(credentials.projectUrl, credentials.apiKey);
  try {
    const info = await framer.getProjectInfo();
    const collection = await getFramerCollection(framer, credentials.collectionId);
    return { success: true, message: `Connected to ${info.name || "Framer"} / ${collection.name}` };
  } finally {
    await framer.disconnect();
  }
}

async function publishFramer(credentials: FramerCredentials, article: ArticlePayload, mode: PublishMode, config: Record<string, unknown> | null): Promise<PublishResult> {
  const framer = await connect(credentials.projectUrl, credentials.apiKey);
  try {
    const collection = await getFramerCollection(framer, credentials.collectionId);
    const fields = await collection.getFields();
    const mapping: Record<string, string> = {
      title: "Title",
      content: "Content",
      excerpt: "Excerpt",
      coverImage: "Image",
      ...(typeof config?.fieldMapping === "object" && config.fieldMapping ? config.fieldMapping as Record<string, string> : {}),
    };
    const fieldData: Record<string, unknown> = {};
    const setField = (logicalName: string, value: string | null, preferredType?: string) => {
      const fieldName = mapping[logicalName] || logicalName;
      const field = fields.find((candidate) => candidate.name.toLowerCase() === fieldName.toLowerCase())
        || fields.find((candidate) => candidate.name.toLowerCase().includes(fieldName.toLowerCase()));
      if (!field || !value) return;
      fieldData[field.id] = preferredType === "formattedText" || field.type === "formattedText"
        ? { type: "formattedText", value, contentType: "html" }
        : { type: field.type, value };
    };

    setField("title", article.title, "string");
    setField("content", article.baseHtml, "formattedText");
    setField("excerpt", article.excerpt, "string");
    if (article.coverImageUrl?.startsWith("http")) setField("coverImage", article.coverImageUrl, "image");

    await (collection as any).addItems([{ slug: article.slug, draft: mode !== "publish", fieldData }]);
    const items = await collection.getItems();
    const item = items.find((candidate) => candidate.slug === article.slug);
    return {
      status: mode === "publish" ? "published" : "draft",
      externalId: item?.id || article.slug,
      externalUrl: null,
      responseData: { collectionId: collection.id, slug: article.slug },
    };
  } finally {
    await framer.disconnect();
  }
}

async function getFramerCollection(framer: Awaited<ReturnType<typeof connect>>, collectionIdOrName: string) {
  const collections = await framer.getCollections();
  const collection = collections.find((candidate) => candidate.id === collectionIdOrName)
    || collections.find((candidate) => candidate.name.toLowerCase() === collectionIdOrName.toLowerCase());
  if (!collection) throw new Error("Framer collection not found");
  if (collection.managedBy === "anotherPlugin") throw new Error("This Framer collection is managed by another plugin and is read-only");
  return collection;
}

async function fetchImage(pathOrUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (pathOrUrl.startsWith("http")) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type") || mimeForPath(pathOrUrl);
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType };
  }
  const { body } = await getObject(pathOrUrl);
  return body ? { buffer: body, mimeType: mimeForPath(pathOrUrl) } : null;
}

function mimeForPath(path: string) {
  if (path.match(/\.png($|\?)/i)) return "image/png";
  if (path.match(/\.webp($|\?)/i)) return "image/webp";
  return "image/jpeg";
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

function redactResponseData(data?: Record<string, unknown>) {
  if (!data) return null;
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("key") || key.toLowerCase().includes("authorization")) {
      return "[redacted]";
    }
    return value;
  })) as Record<string, unknown>;
}

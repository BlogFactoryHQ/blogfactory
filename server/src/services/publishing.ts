import { Buffer } from "node:buffer";
import { SignJWT } from "jose";
import { connect } from "framer-api";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { postPublications, posts, siteIntegrations, sites } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "./api-keys.js";
import { getObject } from "./s3-client.js";

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
  memberId?: string;
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
  markdown: string;
  html: string;
  excerpt: string;
  slug: string;
  tags: string[];
  categories: string[];
  metaTitle: string;
  metaDescription: string;
  coverImageUrl: string | null;
  inlineImages: string[];
}

interface PublishResult {
  status: "draft" | "published";
  externalId: string | null;
  externalUrl: string | null;
  externalEditUrl?: string | null;
  responseData?: Record<string, unknown>;
}

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

export function encryptProviderCredentials(provider: IntegrationProvider, input: unknown) {
  const credentials = validateCredentials(provider, input);
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
  const article = buildArticlePayload(post, options);
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
      memberId: stringValue("memberId") || undefined,
    };
    if (!credentials.apiKey || !credentials.siteId) throw new Error("Wix API key and site ID are required");
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

function buildArticlePayload(post: PostRow, options: PublishOptions): ArticlePayload {
  const title = post.title.trim();
  const content = post.content || "";
  const meta = parseMarkdownMeta(content);
  const body = articleBody(content);
  const excerpt = (options.excerpt || meta.metaDescription || plainText(body)).slice(0, 220);
  const tags = normalizeStringList(options.tags?.length ? options.tags : meta.tags.length ? meta.tags : inferTags(title, body));
  const categories = normalizeStringList(options.categories || []);
  const slug = slugify(options.slug || meta.slug || title);
  const metaTitle = (options.metaTitle || meta.metaTitle || title).slice(0, 70);
  const metaDescription = (options.metaDescription || meta.metaDescription || excerpt).slice(0, 160);

  return {
    title,
    markdown: body,
    html: markdownToHtml(body),
    excerpt,
    slug,
    tags,
    categories,
    metaTitle,
    metaDescription,
    coverImageUrl: post.coverImageUrl || null,
    inlineImages: post.inlineImages || [],
  };
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

function articleBody(content: string) {
  const index = content.search(/^#\s+/m);
  return (index >= 0 ? content.slice(index) : content).trim();
}

function normalizeStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 20);
}

function inferTags(title: string, content: string) {
  const match = content.match(/(?:tags?|categories?):\s*(.+)/i);
  if (match) return match[1].split(",");
  return title.split(/\s+/).filter((word) => word.length > 3).slice(0, 5);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "article";
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }
    const image = trimmed.match(/^!\[([^\]]*)]\(([^)]+)\)/);
    if (image) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<figure><img src="${escapeAttribute(image[2])}" alt="${escapeAttribute(image[1] || "")}" /></figure>`);
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const listItem = trimmed.match(/^[-*]\s+(.+)/);
    if (listItem) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
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
  const featuredMedia = article.coverImageUrl ? await uploadWordPressMedia(credentials, article.coverImageUrl, article.title).catch(() => null) : null;
  const postType = options.postType === "page" ? "pages" : "posts";

  const response = await fetch(`${credentials.url}/wp-json/wp/v2/${postType}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: article.title,
      content: article.html,
      excerpt: article.excerpt,
      slug: article.slug,
      status: mode === "publish" ? "publish" : "draft",
      ...(tagIds.length && postType === "posts" ? { tags: tagIds } : {}),
      ...(categoryIds.length && postType === "posts" ? { categories: categoryIds } : {}),
      ...(featuredMedia ? { featured_media: featuredMedia } : {}),
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

async function uploadWordPressMedia(credentials: WordPressCredentials, pathOrUrl: string, title: string) {
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
  const data = await response.json() as { id?: number };
  return data.id || null;
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
  const featureImage = article.coverImageUrl ? await uploadGhostImage(credentials, article.coverImageUrl, article.title).catch(() => null) : null;
  const inlineImages = (await Promise.all(
    article.inlineImages.map((image, index) => uploadGhostImage(credentials, image, `${article.title}-${index + 1}`).catch(() => null))
  )).filter((url): url is string => Boolean(url));
  const html = inlineImages.length
    ? `${article.html}\n${inlineImages.map((url) => `<figure><img src="${escapeAttribute(url)}" alt="" /></figure>`).join("\n")}`
    : article.html;
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
  if (!response.ok) return null;
  const data = await response.json() as { images?: Array<{ url?: string }> };
  return data.images?.[0]?.url || null;
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
  const coverMedia = article.coverImageUrl ? await importWixImage(credentials, article.coverImageUrl, article.title).catch(() => null) : null;
  const createResponse = await wixApi(credentials, "POST", "/blog/v3/draft-posts", {
    draftPost: {
      title: article.title,
      richContent: markdownToWixRichContent(article.markdown, coverMedia),
      ...(credentials.memberId ? { memberId: credentials.memberId } : {}),
      slug: article.slug,
      excerpt: article.excerpt,
      tagIds: [],
      seoData: {
        tags: [
          { type: "title", children: article.metaTitle },
          { type: "meta", props: { name: "description", content: article.metaDescription } },
        ],
      },
      ...(coverMedia ? { coverMedia: { image: coverMedia, displayed: true } } : {}),
    },
  }) as { draftPost?: { id?: string; url?: string } };

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
    responseData: { draftId },
  };
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

async function importWixImage(credentials: WixCredentials, imageUrl: string, title: string) {
  if (!imageUrl.startsWith("http")) return null;
  const response = await wixApi(credentials, "POST", "/site-media/v1/files/import", {
    importFileRequest: {
      url: imageUrl,
      displayName: `${slugify(title)}.webp`,
    },
  }) as { file?: { id?: string; url?: string } };
  return response.file?.url || response.file?.id || null;
}

function markdownToWixRichContent(markdown: string, coverImage: string | null) {
  const nodes: unknown[] = [];
  if (coverImage) {
    nodes.push({ type: "IMAGE", imageData: { image: { src: { url: coverImage } } } });
  }
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const h1 = trimmed.match(/^# (.+)/);
    const h2 = trimmed.match(/^## (.+)/);
    if (h1 || h2) {
      nodes.push({ type: "HEADING", headingData: { level: h1 ? 2 : 3 }, nodes: [{ type: "TEXT", textData: { text: (h1 || h2)![1] } }] });
    } else {
      nodes.push({ type: "PARAGRAPH", nodes: [{ type: "TEXT", textData: { text: trimmed.replace(/^[-*]\s+/, "") } }] });
    }
  }
  return { nodes };
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
    setField("content", article.html, "formattedText");
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

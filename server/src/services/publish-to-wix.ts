import { db } from "../db/index.js";
import { posts, imageAssets } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getObject } from "./s3-client.js";

const WIX_API_KEY = process.env.WIX_API_KEY;
const WIX_SITE_ID = process.env.WIX_SITE_ID;
const WIX_MEMBER_ID = process.env.WIX_MEMBER_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

interface PublishOpts {
  userId: string;
  postId: string;
  generateSeo?: boolean;
}

export async function publishToWix(opts: PublishOpts) {
  if (!WIX_API_KEY || !WIX_SITE_ID) {
    throw new Error("Wix API credentials not configured");
  }

  // Fetch the post
  const [post] = await db.select().from(posts).where(and(eq(posts.id, opts.postId), eq(posts.userId, opts.userId))).limit(1);
  if (!post) throw new Error("Post not found");

  // Parse metadata from content
  const { metaTitle, metaDescription, slug, tags, cleanContent } = parsePostMetadata(post.title, post.content);

  // Generate SEO data with AI if requested
  let seoData = { title: metaTitle, description: metaDescription, slug };
  if (opts.generateSeo && OPENROUTER_API_KEY) {
    try {
      seoData = await generateSeoData(post.title, post.content);
    } catch (err) {
      console.error("[wix] SEO generation failed, using defaults:", err);
    }
  }

  // Collect image paths to import
  const imagePaths: string[] = [];
  if (post.coverImageUrl) {
    imagePaths.push(post.coverImageUrl);
  }
  if (post.inlineImages) {
    for (const img of post.inlineImages) {
      imagePaths.push(img);
    }
  }

  // Import images to Wix Media Manager
  const importedImages: Array<{ originalPath: string; wixUrl: string }> = [];
  for (const imgPath of imagePaths) {
    try {
      const wixUrl = await importImageToWix(imgPath, post.title);
      if (wixUrl) {
        importedImages.push({ originalPath: imgPath, wixUrl });
      }
    } catch (err) {
      console.error("[wix] Image import error:", err);
    }
  }

  // Create/find Wix tags (deduplicate labels and IDs)
  const uniqueLabels = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
  const tagIdResults = await Promise.all(uniqueLabels.map(tag => findOrCreateWixTag(tag)));
  const tagIds = [...new Set(tagIdResults.filter((id): id is string => id !== null))];
  console.log(`[publish-to-wix] Got ${tagIds.length} unique tag IDs`);

  // Convert markdown to Wix Rich Content
  const richContent = markdownToWixRichContent(cleanContent, importedImages);

  // Create draft blog post
  const memberId = WIX_MEMBER_ID || await fetchWixMemberId();

  const createResp = await wixApiCall("POST", "/blog/v3/draft-posts", {
    draftPost: {
      title: post.title,
      richContent,
      memberId,
      ...(tagIds.length > 0 ? { tagIds } : {}),
      seoData: {
        tags: [
          { type: "title", children: seoData.title },
          { type: "meta", props: { name: "description", content: seoData.description } },
        ],
      },
      slug: seoData.slug,
      coverMedia: importedImages[0] ? {
        image: importedImages[0].wixUrl,
        displayed: true,
      } : undefined,
    },
  });

  const draftPostId = createResp?.draftPost?.id;
  if (!draftPostId) throw new Error("Failed to create Wix draft post");

  // Publish the draft
  const publishResp = await wixApiCall("POST", `/blog/v3/draft-posts/${draftPostId}/publish`);
  const postUrl = publishResp?.post?.url;

  // Update local post status
  await db.update(posts).set({ status: "published" }).where(eq(posts.id, opts.postId));

  return {
    success: true,
    postUrl,
    wixPostId: publishResp?.post?.id || draftPostId,
    seoData,
    imagesImported: importedImages.length,
  };
}

function parsePostMetadata(title: string, content: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);

  // Extract tags from content (look for a tags line or use title keywords)
  const tagsMatch = content.match(/(?:tags?|categories?):\s*(.+)/i);
  const tags = tagsMatch
    ? tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean)
    : title.split(/\s+/).filter((w) => w.length > 3).slice(0, 5);

  const metaDescription = content
    .replace(/^#.+$/gm, "")
    .replace(/[*_#\[\]]/g, "")
    .trim()
    .substring(0, 160);

  return {
    metaTitle: title.substring(0, 70),
    metaDescription,
    slug,
    tags: tags.slice(0, 10),
    cleanContent: content,
  };
}

async function generateSeoData(title: string, content: string) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Generate SEO metadata for this blog post. Return JSON with: title (max 60 chars), description (max 155 chars), slug (URL-friendly).

Title: ${title}
Content preview: ${content.substring(0, 500)}`,
      }],
      response_format: { type: "json_object" },
    }),
  });

  const data = await resp.json() as any;
  const seo = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return {
    title: seo.title || title.substring(0, 60),
    description: seo.description || "",
    slug: seo.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 80),
  };
}

async function fetchImageBuffer(pathOrUrl: string): Promise<Buffer | null> {
  if (pathOrUrl.startsWith("http")) {
    const resp = await fetch(pathOrUrl);
    if (!resp.ok) {
      console.error(`Failed to fetch image: HTTP ${resp.status}`);
      return null;
    }
    return Buffer.from(await resp.arrayBuffer());
  }
  // Local S3 key — read directly
  const { body } = await getObject(pathOrUrl);
  return body;
}

async function importImageToWix(pathOrUrl: string, altText: string): Promise<string | null> {
  try {
    const cleanName = altText.substring(0, 100).replace(/\.(png|jpg|jpeg|webp|gif)$/i, '') + '.webp';
    console.log(`[publish-to-wix] Fetching image for WebP conversion: ${pathOrUrl.substring(0, 80)}...`);

    const sourceBuffer = await fetchImageBuffer(pathOrUrl);
    if (!sourceBuffer) return null;
    const sourceSizeKB = Math.round(sourceBuffer.length / 1024);

    // Convert to WebP using sharp with 1MB limit
    let webpBuffer: Buffer | null = null;
    try {
      const sharp = (await import("sharp")).default;
      const qualities = [70, 55, 40, 30];
      for (const q of qualities) {
        webpBuffer = await sharp(sourceBuffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: q }).toBuffer();
        if (webpBuffer.length <= 1024 * 1024) {
          console.log(`[publish-to-wix] WebP at quality=${q}: ${Math.round(webpBuffer.length / 1024)}KB`);
          break;
        }
        console.log(`[publish-to-wix] WebP at quality=${q}: ${Math.round(webpBuffer.length / 1024)}KB — retrying lower`);
      }
    } catch (err) {
      console.error('[publish-to-wix] WebP conversion failed, falling back to import-by-URL');
      return pathOrUrl.startsWith("http") ? importImageToWixByUrl(pathOrUrl, cleanName) : null;
    }

    if (!webpBuffer) return importImageToWixByUrl(pathOrUrl, cleanName);

    console.log(`[publish-to-wix] Converted to WebP: ${sourceSizeKB}KB → ${Math.round(webpBuffer.length / 1024)}KB`);

    // Get upload URL from Wix
    const genUrlResp = await fetch('https://www.wixapis.com/site-media/v1/files/generate-upload-url', {
      method: 'POST',
      headers: {
        'Authorization': WIX_API_KEY!,
        'wix-site-id': WIX_SITE_ID!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mimeType: 'image/webp', fileName: cleanName }),
    });

    if (!genUrlResp.ok) {
      console.error(`Failed to generate upload URL: ${await genUrlResp.text()}`);
      return pathOrUrl.startsWith("http") ? importImageToWixByUrl(pathOrUrl, cleanName) : null;
    }

    const { uploadUrl } = await genUrlResp.json() as any;
    if (!uploadUrl) return importImageToWixByUrl(pathOrUrl, cleanName);

    // Upload WebP bytes to Wix
    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp' },
      body: webpBuffer as any,
    });

    if (!uploadResp.ok) {
      console.error(`Failed to upload WebP to Wix: ${await uploadResp.text()}`);
      return pathOrUrl.startsWith("http") ? importImageToWixByUrl(pathOrUrl, cleanName) : null;
    }

    const uploadData = await uploadResp.json() as any;
    const fileId = uploadData.file?.id;
    console.log(`[publish-to-wix] WebP uploaded successfully as ${cleanName}: ${fileId}`);
    return fileId || null;
  } catch (error) {
    console.error(`Error importing image to Wix:`, error);
    return null;
  }
}

async function importImageToWixByUrl(imageUrl: string, displayName: string): Promise<string | null> {
  try {
    const resp = await wixApiCall("POST", "/site-media/v1/files/import", {
      importFileRequest: {
        url: imageUrl,
        displayName,
        mimeType: "image/webp",
      },
    });
    return resp?.file?.url || null;
  } catch {
    return null;
  }
}

async function findOrCreateWixTag(label: string): Promise<string | null> {
  try {
    // Try to create tag first
    const createResp = await fetch(`https://www.wixapis.com/blog/v3/tags`, {
      method: "POST",
      headers: {
        Authorization: WIX_API_KEY!,
        "wix-site-id": WIX_SITE_ID!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: { label: label.slice(0, 50) } }),
    });

    if (createResp.ok) {
      const data = await createResp.json() as any;
      if (data?.tag?.id) {
        console.log(`Tag created: "${label}" -> ${data.tag.id}`);
        return data.tag.id;
      }
    }

    // If ALREADY_EXISTS, use getTagByLabel endpoint
    const encodedLabel = encodeURIComponent(label.slice(0, 50));
    const getResp = await fetch(`https://www.wixapis.com/blog/v3/tags/labels/${encodedLabel}`, {
      method: "GET",
      headers: {
        Authorization: WIX_API_KEY!,
        "wix-site-id": WIX_SITE_ID!,
      },
    });

    if (getResp.ok) {
      const getData = await getResp.json() as any;
      if (getData?.tag?.id) {
        console.log(`Tag found: "${label}" -> ${getData.tag.id}`);
        return getData.tag.id;
      }
    } else {
      console.error(`Tag lookup failed for "${label}": ${getResp.status}`);
    }

    console.error(`Could not create or find tag "${label}"`);
    return null;
  } catch {
    return null;
  }
}

async function fetchWixMemberId(): Promise<string | undefined> {
  try {
    const resp = await wixApiCall("GET", "/members/v1/members/my");
    return resp?.member?.id;
  } catch {
    return undefined;
  }
}

async function wixApiCall(method: string, path: string, body?: any) {
  const resp = await fetch(`https://www.wixapis.com/v1${path}`, {
    method,
    headers: {
      Authorization: WIX_API_KEY!,
      "wix-site-id": WIX_SITE_ID!,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Wix API error ${resp.status}: ${errorText}`);
  }

  return resp.json();
}

function markdownToWixRichContent(markdown: string, images: Array<{ originalPath: string; wixUrl: string }>): any {
  // Simple markdown to Wix Rich Content conversion
  const nodes: any[] = [];
  const lines = markdown.split("\n");
  let imageIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Heading
    const h1 = trimmed.match(/^# (.+)/);
    const h2 = trimmed.match(/^## (.+)/);
    const h3 = trimmed.match(/^### (.+)/);

    if (h1 || h2 || h3) {
      const level = h1 ? 2 : h2 ? 3 : 4; // Wix uses 2-6 for h1-h5
      const text = (h1 || h2 || h3)![1];
      nodes.push({
        type: "HEADING",
        headingData: { level },
        nodes: [{ type: "TEXT", textData: { text } }],
      });

      // Insert image after headings if available
      if (images[imageIndex] && (h2 || h3)) {
        nodes.push({
          type: "IMAGE",
          imageData: { image: { src: { url: images[imageIndex].wixUrl } } },
        });
        imageIndex++;
      }
      continue;
    }

    // Paragraph
    nodes.push({
      type: "PARAGRAPH",
      nodes: [{ type: "TEXT", textData: { text: trimmed } }],
    });
  }

  return { nodes };
}

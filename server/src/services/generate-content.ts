import { db } from "../db/index.js";
import { jobs, posts, feeds, generationLogs, personas, userSettings } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { saveImageBuffer } from "./image-storage.js";
import { getGoogleAiKey, getOpenRouterKey } from "./api-keys.js";

interface GenerateOpts {
  userId: string;
  sourceType: string;
  sourceValue: string;
  modelId?: string;
  personaId?: string | null;
  variations?: number;
  feedId?: string;
  extractFullContent?: boolean;
  filterOldPostsDays?: number;
  platformConfig?: any;
  generateImages?: boolean;
  imageConfig?: any;
  jobId?: string; // for retry
  schedulerUserId?: string;
}

type UserSettingsRecord = typeof userSettings.$inferSelect;

function summarizeJsonList(value: unknown, maxItems = 5) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return [record.title, record.label, record.description, record.content, record.url]
          .filter((part) => typeof part === "string" && part.trim())
          .join(" — ");
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildSettingsInstructions(settings?: UserSettingsRecord) {
  if (!settings) return "";

  const instructions: string[] = [];

  if (settings.articleWordCount) instructions.push(`Target article length: about ${settings.articleWordCount} words.`);
  if (settings.articleLanguage) instructions.push(`Write in ${settings.articleLanguage}.`);
  if (settings.articleVoice) instructions.push(`Use this default voice/style: ${settings.articleVoice}.`);
  if (settings.includeTableOfContents === true) instructions.push("Include a concise table of contents near the beginning.");
  if (settings.includeTableOfContents === false) instructions.push("Do not include a table of contents.");
  if (settings.enableResearch === true) instructions.push("Add useful research context and explain claims clearly.");
  if (settings.enableInternalLinks === true) instructions.push("Suggest natural internal link opportunities where relevant.");

  const brand: string[] = [];
  if (settings.brandCompanyName) brand.push(`Company name: ${settings.brandCompanyName}`);
  if (settings.brandDescription) brand.push(`What the company does: ${settings.brandDescription}`);
  if (settings.brandTargetAudience) brand.push(`Target audience: ${settings.brandTargetAudience}`);
  if (settings.brandMentions) brand.push(`Brand mention style: ${settings.brandMentions}`);

  const valueProps = summarizeJsonList(settings.brandValueProps);
  if (valueProps.length) brand.push(`Value propositions: ${valueProps.join("; ")}`);

  const ctas = summarizeJsonList(settings.brandCtas, 3);
  if (ctas.length) brand.push(`Calls to action to weave in when natural: ${ctas.join("; ")}`);

  const knowledge = settings.knowledgeBaseEnabled ? summarizeJsonList(settings.knowledgeDocuments, 4) : [];
  if (knowledge.length) brand.push(`Knowledge base context: ${knowledge.join("; ")}`);

  if (brand.length) {
    instructions.push(`Brand context:\n${brand.map((line) => `- ${line}`).join("\n")}`);
  }

  return instructions.length
    ? `\n\nFollow these saved BlogFactory article settings:\n${instructions.map((line) => `- ${line}`).join("\n")}`
    : "";
}

export async function generateContent(opts: GenerateOpts) {
  const userId = opts.schedulerUserId || opts.userId;
  const openRouterKey = await getOpenRouterKey(userId);

  if (!openRouterKey) {
    throw new Error("Add your OpenRouter API key in Settings before generating content");
  }

  // Get or create job
  let jobId = opts.jobId;
  if (!jobId) {
    const [job] = await db.insert(jobs).values({
      userId,
      sourceType: opts.sourceType,
      sourceValue: opts.sourceValue,
      modelId: opts.modelId || "openai/gpt-4o",
      personaId: opts.personaId || null,
      status: "running",
      currentStep: "starting",
    }).returning();
    jobId = job.id;
  } else {
    await db.update(jobs).set({ status: "running", currentStep: "starting" }).where(eq(jobs.id, jobId));
  }

  try {
    // Budget check
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (settings?.budgetPaused) {
      await db.update(jobs).set({ status: "failed", errorMessage: "Generation paused — monthly budget exceeded", completedAt: new Date() }).where(eq(jobs.id, jobId));
      return { jobId, status: "failed", error: "Budget exceeded" };
    }

    if (settings?.monthlyBudget) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [costResult] = await db.select({ total: sql<number>`COALESCE(SUM(cost), 0)` })
        .from(generationLogs)
        .where(and(eq(generationLogs.userId, userId), sql`created_at >= ${startOfMonth.toISOString()}`));

      if ((costResult?.total || 0) >= settings.monthlyBudget) {
        await db.update(userSettings).set({ budgetPaused: true }).where(eq(userSettings.userId, userId));
        await db.update(jobs).set({ status: "failed", errorMessage: "Monthly budget exceeded — generation paused", completedAt: new Date() }).where(eq(jobs.id, jobId));
        return { jobId, status: "failed", error: "Budget exceeded" };
      }
    }

    // Load persona if set
    let systemPrompt = "You are a helpful AI content writer. Generate well-structured blog posts in markdown format.";
    let personaModel = opts.modelId || "openai/gpt-4o";

    if (opts.personaId) {
      const [persona] = await db.select().from(personas).where(eq(personas.id, opts.personaId)).limit(1);
      if (persona) {
        systemPrompt = persona.systemPrompt;
        personaModel = persona.baseModel;
      }
    }

    systemPrompt += buildSettingsInstructions(settings);

    const modelId = opts.modelId || personaModel;

    // Update feed last_run_at
    if (opts.feedId) {
      await db.update(feeds).set({ lastRunAt: new Date() }).where(eq(feeds.id, opts.feedId));
    }

    await db.update(jobs).set({ currentStep: "fetching_content" }).where(eq(jobs.id, jobId));

    // Fetch source content
    let articles: Array<{ title: string; content: string; url?: string; hash?: string }> = [];

    if (opts.sourceType === "rss_feed") {
      // Fetch and parse RSS feed
      articles = await fetchRssArticles(opts.sourceValue, opts.variations || 5, opts.filterOldPostsDays);
    } else if (opts.sourceType === "url") {
      articles = [{ title: "", content: opts.sourceValue, url: opts.sourceValue }];
    } else if (opts.sourceType === "raw_text") {
      articles = [{ title: "", content: opts.sourceValue }];
    } else if (opts.sourceType === "youtube") {
      articles = [{ title: "", content: opts.sourceValue, url: opts.sourceValue }];
    } else if (opts.sourceType === "pdf") {
      articles = [{ title: "", content: opts.sourceValue }];
    }

    if (!articles.length) {
      await db.update(jobs).set({ status: "completed", currentStep: "done", completedAt: new Date() }).where(eq(jobs.id, jobId));
      return { jobId, status: "completed", posts: [] };
    }

    // Set generation plan
    await db.update(jobs).set({
      generationPlan: { totalDrafts: articles.length, articles: articles.map(a => ({ title: a.title || "Untitled", url: a.url })) },
      currentStep: `generating_draft_1_of_${articles.length}`,
    }).where(eq(jobs.id, jobId));

    const createdPostIds: string[] = [];
    let totalCost = 0;
    let totalTokens = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];

      await db.update(jobs).set({
        currentStep: `generating_draft_${i + 1}_of_${articles.length}`,
      }).where(eq(jobs.id, jobId));

      // Check if job was stopped
      const [currentJob] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (currentJob?.status === "failed") break;

      // Check content hash dedup
      const contentHash = hashContent(article.content + article.title);
      if (article.url) {
        const existing = await db.select({ id: posts.id }).from(posts)
          .where(and(eq(posts.userId, userId), eq(posts.sourceContentHash, contentHash)))
          .limit(1);
        if (existing.length > 0) {
          console.log(`[generate] Skipping duplicate content: ${article.title}`);
          continue;
        }
      }

      try {
        // Generate blog post via AI
        const genStart = Date.now();
        const userMessage = article.url
          ? `Write a blog post based on this source:\n\nTitle: ${article.title}\nURL: ${article.url}\n\nContent:\n${article.content.substring(0, 8000)}`
          : `Write a blog post based on this content:\n\n${article.content.substring(0, 8000)}`;

        const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
            headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            max_tokens: 4096,
            plugins: [],
          }),
        });

        if (!aiResp.ok) {
          const errText = await aiResp.text();
          console.error(`[generate] AI error for draft ${i + 1}:`, errText);
          continue;
        }

        const aiData = await aiResp.json() as any;
        const genContent = aiData.choices?.[0]?.message?.content || "";
        const usage = aiData.usage;
        const genLatency = Date.now() - genStart;

        // Extract title from generated content
        const titleMatch = genContent.match(/^#\s+(.+)/m);
        const postTitle = titleMatch ? titleMatch[1].trim() : article.title || "Untitled Post";

        // Log generation
        const cost = parseFloat(aiData.usage?.total_cost || "0") || 0;
        totalCost += cost;
        totalTokens += usage?.total_tokens || 0;

        await db.insert(generationLogs).values({
          userId,
          modelId,
          provider: modelId.split("/")[0],
          status: "success",
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          cost,
          latencyMs: genLatency,
          sessionId: jobId,
        });

        // Create post
        let coverImageUrl: string | null = null;
        let inlineImages: string[] | null = null;

        // Generate images if enabled
        if (opts.generateImages && opts.imageConfig) {
          await db.update(jobs).set({ currentStep: `generating_images_for_draft_${i + 1}` }).where(eq(jobs.id, jobId));

          const imageResults = await generateImages({
            content: genContent,
            title: postTitle,
            userId,
            jobId: jobId!,
            imageConfig: opts.imageConfig,
            imageModel: settings?.imageModel || undefined,
            stylePrompt: settings?.imageStylePrompt || undefined,
            openRouterKey,
            googleAiKey: await getGoogleAiKey(userId),
          });

          coverImageUrl = imageResults.coverPath;
          inlineImages = imageResults.inlinePaths.length > 0 ? imageResults.inlinePaths : null;
          totalCost += imageResults.cost;
        }

        const [post] = await db.insert(posts).values({
          userId,
          title: postTitle,
          content: genContent,
          status: "draft",
          sourceType: opts.sourceType,
          sourceRefId: article.url || opts.feedId || null,
          sourceContentHash: contentHash,
          jobId,
          personaId: opts.personaId || null,
          modelId,
          coverImageUrl,
          inlineImages,
        }).returning();

        createdPostIds.push(post.id);

        // Update image assets with post ID
        if (coverImageUrl) {
          const { imageAssets: ia } = await import("../db/schema.js");
          await db.update(ia).set({ postId: post.id, status: "used" }).where(and(eq(ia.storagePath, coverImageUrl), eq(ia.userId, userId)));
        }

      } catch (draftErr: any) {
        console.error(`[generate] Error on draft ${i + 1}:`, draftErr.message);
        await db.update(jobs).set({ generationError: draftErr.message }).where(eq(jobs.id, jobId));
      }
    }

    // Finalize job
    await db.update(jobs).set({
      status: "completed",
      currentStep: "done",
      resultPostIds: createdPostIds,
      tokenCost: totalTokens,
      totalCost,
      completedAt: new Date(),
    }).where(eq(jobs.id, jobId));

    return { jobId, status: "completed", postIds: createdPostIds };

  } catch (err: any) {
    console.error("[generate] Fatal error:", err);
    await db.update(jobs).set({
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    }).where(eq(jobs.id, jobId));
    return { jobId, status: "failed", error: err.message };
  }
}

async function fetchRssArticles(feedUrl: string, limit: number, filterOldDays?: number) {
  try {
    const resp = await fetch(feedUrl);
    const text = await resp.text();

    // Simple RSS/Atom parsing
    const items: Array<{ title: string; content: string; url?: string; hash?: string; pubDate?: Date }> = [];

    // Extract items from RSS
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;

    let match;
    const regex = text.includes("<entry>") ? entryRegex : itemRegex;

    while ((match = regex.exec(text)) !== null && items.length < limit) {
      const itemXml = match[1];
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link") || extractAttr(itemXml, "link", "href");
      const description = extractTag(itemXml, "description") || extractTag(itemXml, "summary") || extractTag(itemXml, "content:encoded") || extractTag(itemXml, "content");
      const pubDate = extractTag(itemXml, "pubDate") || extractTag(itemXml, "published") || extractTag(itemXml, "updated");

      if (filterOldDays && pubDate) {
        const articleDate = new Date(pubDate);
        const cutoff = new Date(Date.now() - filterOldDays * 24 * 60 * 60 * 1000);
        if (articleDate < cutoff) continue;
      }

      items.push({
        title: title || "Untitled",
        content: stripHtml(description || ""),
        url: link || undefined,
      });
    }

    return items;
  } catch (err) {
    console.error("[generate] RSS fetch error:", err);
    return [];
  }
}

function extractTag(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return match ? match[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const match = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i").exec(xml);
  return match ? match[1] : "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function hashContent(content: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  // Simple hash using Bun's built-in
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function generateImages(opts: {
  content: string;
  title: string;
  userId: string;
  jobId: string;
  imageConfig: any;
  imageModel?: string;
  stylePrompt?: string;
  openRouterKey: string;
  googleAiKey: string | null;
}): Promise<{ coverPath: string | null; inlinePaths: string[]; cost: number }> {
  let coverPath: string | null = null;
  const inlinePaths: string[] = [];
  let totalCost = 0;
  const imageModel = opts.imageModel || "google/gemini-2.5-flash-image";
  if (imageModel.startsWith("google-ai-studio/") && !opts.googleAiKey) {
    throw new Error("Add your Google Gemini API key in Settings before using Google AI Studio image models");
  }

  // Generate cover image
  if (opts.imageConfig?.cover) {
    const coverCount = opts.imageConfig.cover.count || 1;
    const resolution = opts.imageConfig.cover.resolution || "1K";
    const aspectRatio = opts.imageConfig.cover.aspectRatio || "16:9";

    for (let i = 0; i < coverCount; i++) {
      try {
        const prompt = `Create a professional blog cover image for: "${opts.title}". ${opts.stylePrompt || "Modern, clean, professional style."}`;
        const result = await generateSingleImage(prompt, imageModel, resolution, aspectRatio, opts.userId, opts.jobId, "cover", i, opts.openRouterKey, opts.googleAiKey);
        if (result) {
          if (i === 0) coverPath = result.storagePath;
          totalCost += result.cost;
        }
      } catch (err) {
        console.error("[generate] Cover image error:", err);
      }
    }
  }

  // Generate inline images
  if (opts.imageConfig?.inline) {
    const inlineCount = opts.imageConfig.inline.count || 2;
    const resolution = opts.imageConfig.inline.resolution || "1K";
    const aspectRatio = opts.imageConfig.inline.aspectRatio || "3:2";

    for (let i = 0; i < inlineCount; i++) {
      try {
        const prompt = `Create an illustrative image for a blog post titled "${opts.title}". Section ${i + 1}. ${opts.stylePrompt || "Clean, informative style."}`;
        const result = await generateSingleImage(prompt, imageModel, resolution, aspectRatio, opts.userId, opts.jobId, "inline", i, opts.openRouterKey, opts.googleAiKey);
        if (result) {
          inlinePaths.push(result.storagePath);
          totalCost += result.cost;
        }
      } catch (err) {
        console.error("[generate] Inline image error:", err);
      }
    }
  }

  return { coverPath, inlinePaths, cost: totalCost };
}

async function generateSingleImage(
  prompt: string,
  modelId: string,
  resolution: string,
  aspectRatio: string,
  userId: string,
  jobId: string,
  type: string,
  position: number,
  openRouterKey: string,
  googleAiKey: string | null
): Promise<{ storagePath: string; cost: number } | null> {
  // Use Google AI Studio for google-ai-studio models
  if (modelId.startsWith("google-ai-studio/")) {
    if (!googleAiKey) {
      throw new Error("Add your Google Gemini API key in Settings before using Google AI Studio image models");
    }
    return generateWithGoogleAI(prompt, modelId, resolution, aspectRatio, userId, jobId, type, position, googleAiKey);
  }

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    console.error(`[image] OpenRouter error: ${resp.status}`);
    return null;
  }

  const data = await resp.json() as any;
  const imageContent = data.choices?.[0]?.message?.content;

  if (!imageContent) return null;

  // Extract base64 image or URL from response
  const base64Match = imageContent.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
  const urlMatch = imageContent.match(/https?:\/\/[^\s"'\)]+\.(png|jpg|jpeg|webp|gif)/i);

  let imageBuffer: Buffer | null = null;

  if (base64Match) {
    imageBuffer = Buffer.from(base64Match[1], "base64");
  } else if (urlMatch) {
    const imgResp = await fetch(urlMatch[0]);
    if (imgResp.ok) {
      imageBuffer = Buffer.from(await imgResp.arrayBuffer());
    }
  }

  if (!imageBuffer) return null;

  try {
    const sharp = (await import("sharp")).default;
    imageBuffer = (await sharp(imageBuffer).webp({ quality: 85 }).toBuffer()) as any;
  } catch {}

  const cost = parseFloat(data.usage?.total_cost || "0") || 0;
  const { storagePath } = await saveImageBuffer(imageBuffer, userId, {
    type,
    prompt,
    modelId,
    provider: modelId.split("/")[0],
    aspectRatio,
    resolution,
    position,
    cost,
    jobId,
  });

  return { storagePath, cost };
}

async function generateWithGoogleAI(
  prompt: string,
  modelId: string,
  resolution: string,
  aspectRatio: string,
  userId: string,
  jobId: string,
  type: string,
  position: number,
  googleAiKey: string
): Promise<{ storagePath: string; cost: number } | null> {
  const geminiModel = modelId.replace("google-ai-studio/", "");
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleAiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!resp.ok) return null;

  const data = await resp.json() as any;
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

  if (!imagePart) return null;

  let imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");

  try {
    const sharp = (await import("sharp")).default;
    imageBuffer = (await sharp(imageBuffer).webp({ quality: 85 }).toBuffer()) as any;
  } catch {}

  const { storagePath } = await saveImageBuffer(imageBuffer, userId, {
    type,
    prompt,
    modelId,
    provider: "google-ai-studio",
    aspectRatio,
    resolution,
    position,
    cost: 0.04,
    jobId,
  });

  return { storagePath, cost: 0.04 };
}

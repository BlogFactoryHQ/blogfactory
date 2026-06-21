import { db } from "../db/index.js";
import { imageGenerationRequests, jobs, posts, feeds, generationLogs, personas, userSettings } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { saveImageBuffer } from "./image-storage.js";
import { getGoogleAiKey, getOpenRouterKey } from "./api-keys.js";
import { extractContent } from "./extract-content.js";
import { assertOpenRouterModelAvailable } from "./openrouter-models.js";

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
const AI_REQUEST_TIMEOUT_MS = 35_000;
const IMAGE_REQUEST_TIMEOUT_MS = 12_000;
const JOB_SYNC_BUDGET_MS = 52_000;
const OPENROUTER_COST_LOOKUP_DELAY_MS = 900;
const OPENROUTER_COST_LOOKUP_TIMEOUT_MS = 4_000;

function truncatePromptText(value: string, maxChars = 1200) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}...`;
}

function summarizeJsonList(value: unknown, maxItems = 5) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return [record.title, record.label, record.description, record.content, record.url]
          .filter((part) => typeof part === "string" && part.trim())
          .map((part) => truncatePromptText(part as string))
          .join(" — ");
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function summarizeKnowledgeDocuments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "Knowledge document";
      const content = typeof record.content === "string" ? truncatePromptText(record.content, 900) : "";
      return content ? `${title}: ${content}` : "";
    })
    .filter(Boolean)
    .slice(0, 4);
}

function openRouterErrorMessage(value: string) {
  try {
    const parsed = JSON.parse(value) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || value;
  } catch {
    return value;
  }
}

function generationErrorMessage(err: any) {
  if (err?.name === "AbortError" || err?.name === "TimeoutError") {
    return "AI provider timed out before content was created. Try again with a faster model or shorter source.";
  }
  return err?.message || "Draft generation failed";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const numberOrZero = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

async function getOpenRouterCost(openRouterKey: string, responseData: any) {
  let stats: any = null;

  if (responseData?.id) {
    try {
      await sleep(OPENROUTER_COST_LOOKUP_DELAY_MS);
      const resp = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(responseData.id)}`, {
        signal: AbortSignal.timeout(OPENROUTER_COST_LOOKUP_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${openRouterKey}` },
      });
      if (resp.ok) stats = ((await resp.json()) as any).data;
    } catch (err) {
      console.warn("[openrouter] Cost lookup failed:", err);
    }
  }

  return {
    stats,
    cost: numberOrZero(stats?.total_cost ?? responseData?.usage?.total_cost ?? responseData?.usage?.cost ?? responseData?.usage),
  };
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi) || []);
}

function summarizeInternalLinks(settings: UserSettingsRecord, sourceText = "") {
  if (settings.enableInternalLinks !== true) return [];

  const index = settings.internalLinkIndex as
    | { pages?: Array<{ url?: string; title?: string; description?: string; path?: string }> }
    | null
    | undefined;
  const rules = Array.isArray(settings.internalLinkRules) ? settings.internalLinkRules as Array<Record<string, unknown>> : [];
  const lines: string[] = [];

  if (settings.internalLinkDensity) {
    const densityMap: Record<string, string> = {
      minimal: "1-2 internal links",
      light: "3-4 internal links",
      balanced: "5-7 internal links",
      rich: "8-12 internal links",
    };
    lines.push(`Internal link density: ${densityMap[settings.internalLinkDensity] || settings.internalLinkDensity}.`);
  }

  const ruleLines = rules
    .map((rule) => {
      const triggers = typeof rule.triggers === "string" ? rule.triggers.trim() : "";
      const url = typeof rule.url === "string" ? rule.url.trim() : "";
      if (!triggers || !url) return "";
      return `When relevant to "${triggers}", link to ${url}.`;
    })
    .filter(Boolean)
    .slice(0, 5);

  if (ruleLines.length) {
    lines.push(`Custom internal link rules:\n${ruleLines.map((line) => `  - ${line}`).join("\n")}`);
  }

  const pages = Array.isArray(index?.pages) ? index.pages : [];
  if (pages.length) {
    const sourceTokens = tokenize(sourceText);
    const scored = pages
      .map((page) => {
        const haystack = `${page.title || ""} ${page.description || ""} ${page.path || ""}`;
        const pageTokens = tokenize(haystack);
        let score = 0;
        for (const token of pageTokens) {
          if (sourceTokens.has(token)) score += token.length > 4 ? 2 : 1;
        }
        return { page, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ page }) => {
        const title = page.title || page.path || page.url;
        const description = page.description ? ` — ${page.description}` : "";
        return `  - ${title}: ${page.url}${description}`;
      });

    lines.push(`Use these indexed site pages as internal-link candidates where natural:\n${scored.join("\n")}`);
  } else {
    lines.push("Suggest natural internal link opportunities where relevant.");
  }

  return lines;
}

function buildSettingsInstructions(settings?: UserSettingsRecord, sourceText = "") {
  if (!settings) return "";

  const instructions: string[] = [];

  if (settings.articleWordCount) instructions.push(`Target article length: about ${settings.articleWordCount} words.`);
  if (settings.articleLanguage) instructions.push(`Write in ${settings.articleLanguage}.`);
  if (settings.articleVoice) instructions.push(`Use this default voice/style: ${settings.articleVoice}.`);
  if (settings.includeTableOfContents === true) instructions.push("Include a concise table of contents near the beginning.");
  if (settings.includeTableOfContents === false) instructions.push("Do not include a table of contents.");
  if (settings.enableResearch === true) instructions.push("Add useful research context and explain claims clearly.");
  instructions.push(...summarizeInternalLinks(settings, sourceText));

  const brand: string[] = [];
  if (settings.brandCompanyName) brand.push(`Company name: ${settings.brandCompanyName}`);
  if (settings.brandDescription) brand.push(`What the company does: ${settings.brandDescription}`);
  if (settings.brandTargetAudience) brand.push(`Target audience: ${settings.brandTargetAudience}`);
  if (settings.brandMentions) brand.push(`Brand mention style: ${settings.brandMentions}`);

  const valueProps = summarizeJsonList(settings.brandValueProps);
  if (valueProps.length) brand.push(`Value propositions: ${valueProps.join("; ")}`);

  const ctas = summarizeJsonList(settings.brandCtas, 3);
  if (ctas.length) brand.push(`Calls to action to weave in when natural: ${ctas.join("; ")}`);

  const knowledge = settings.knowledgeBaseEnabled ? summarizeKnowledgeDocuments(settings.knowledgeDocuments) : [];
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
  const startedAt = Date.now();

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

    const modelId = opts.modelId || personaModel;
    await assertOpenRouterModelAvailable(openRouterKey, modelId);

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
      const extracted = await extractContent({ userId, sourceType: "url", sourceValue: opts.sourceValue, extractModel: modelId });
      articles = [{ title: extracted.title || "", content: extracted.content || opts.sourceValue, url: opts.sourceValue }];
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
    let lastGenerationError = "";
    let skippedDuplicate = false;

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
          skippedDuplicate = true;
          continue;
        }
      }

      try {
        // Generate blog post via AI
        const genStart = Date.now();
        const settingsInstructions = buildSettingsInstructions(settings, `${article.title}\n${article.url || ""}\n${article.content}`);
        const draftSystemPrompt = `${systemPrompt}${settingsInstructions}`;
        const userMessage = article.url
          ? `Write a blog post based on this source:\n\nTitle: ${article.title}\nURL: ${article.url}\n\nContent:\n${article.content.substring(0, 8000)}`
          : `Write a blog post based on this content:\n\n${article.content.substring(0, 8000)}`;

        const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: draftSystemPrompt },
              { role: "user", content: userMessage },
            ],
            max_tokens: 4096,
            plugins: [],
          }),
        });

        if (!aiResp.ok) {
          const errText = await aiResp.text();
          const message = openRouterErrorMessage(errText);
          console.error(`[generate] AI error for draft ${i + 1}:`, message);
          throw new Error(message);
        }

        const aiData = await aiResp.json() as any;
        const genContent = aiData.choices?.[0]?.message?.content || "";
        const usage = aiData.usage;
        const openRouterUsage = await getOpenRouterCost(openRouterKey, aiData);
        const genLatency = Date.now() - genStart;

        // Extract title from generated content
        const titleMatch = genContent.match(/^#\s+(.+)/m);
        const postTitle = titleMatch ? titleMatch[1].trim() : article.title || "Untitled Post";

        // Log generation
        const cost = openRouterUsage.cost;
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
          responseData: { id: aiData.id, generation: openRouterUsage.stats },
        });

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
        }).returning();

        createdPostIds.push(post.id);

        // Generate images after the draft exists so image timeouts cannot lose the post.
        if (opts.generateImages && opts.imageConfig) {
          await db.update(jobs).set({ currentStep: `generating_images_for_draft_${i + 1}` }).where(eq(jobs.id, jobId));

          const imageResults = await generateImages({
            content: genContent,
            title: postTitle,
            userId,
            postId: post.id,
            jobId: jobId!,
            imageConfig: opts.imageConfig,
            imageModel: settings?.imageModel || undefined,
            stylePrompt: settings?.imageStylePrompt || undefined,
            openRouterKey,
            googleAiKey: await getGoogleAiKey(userId),
            deadlineMs: startedAt + JOB_SYNC_BUDGET_MS,
          });

          totalCost += imageResults.cost;
          const inlineImages = imageResults.inlinePaths.length > 0 ? imageResults.inlinePaths : null;

          if (imageResults.coverPath || inlineImages) {
            const imageUpdate: Partial<typeof posts.$inferInsert> = {};
            if (imageResults.coverPath) imageUpdate.coverImageUrl = imageResults.coverPath;
            if (inlineImages) imageUpdate.inlineImages = inlineImages;
            await db.update(posts).set(imageUpdate).where(eq(posts.id, post.id));
          }

          if (imageResults.coverPath) {
            const { imageAssets: ia } = await import("../db/schema.js");
            await db.update(ia).set({ postId: post.id, status: "used" }).where(and(eq(ia.storagePath, imageResults.coverPath), eq(ia.userId, userId)));
          }
        }

      } catch (draftErr: any) {
        lastGenerationError = generationErrorMessage(draftErr);
        console.error(`[generate] Error on draft ${i + 1}:`, lastGenerationError);
        await db.update(jobs).set({ generationError: lastGenerationError }).where(eq(jobs.id, jobId));
      }
    }

    if (createdPostIds.length === 0) {
      const message = lastGenerationError || (skippedDuplicate ? "This source was already generated. Check My Content for the existing draft." : "No drafts were created from this source.");
      await db.update(jobs).set({
        status: "failed",
        currentStep: "done",
        errorMessage: message,
        generationError: message,
        resultPostIds: [],
        tokenCost: totalTokens,
        totalCost,
        completedAt: new Date(),
      }).where(eq(jobs.id, jobId));
      return { jobId, status: "failed", error: message, postIds: [] };
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
  postId: string;
  jobId: string;
  imageConfig: any;
  imageModel?: string;
  stylePrompt?: string;
  openRouterKey: string;
  googleAiKey: string | null;
  deadlineMs: number;
}): Promise<{ coverPath: string | null; inlinePaths: string[]; cost: number }> {
  let coverPath: string | null = null;
  const inlinePaths: string[] = [];
  let totalCost = 0;
  const imageModel = opts.imageModel || "google/gemini-2.5-flash-image";
  if (imageModel.startsWith("manual/")) {
    await createManualImageRequests({
      imageModel,
      imageConfig: opts.imageConfig,
      stylePrompt: opts.stylePrompt,
      title: opts.title,
      userId: opts.userId,
      postId: opts.postId,
      jobId: opts.jobId,
    });
    return { coverPath, inlinePaths, cost: 0 };
  }

  await assertOpenRouterModelAvailable(opts.openRouterKey, imageModel, "image");
  if (imageModel.startsWith("google-ai-studio/") && !opts.googleAiKey) {
    throw new Error("Add your Google Gemini API key in Settings before using Google AI Studio image models");
  }

  // Generate cover image
  if (opts.imageConfig?.cover) {
    const coverCount = opts.imageConfig.cover.count || 1;
    const resolution = opts.imageConfig.cover.resolution || "1K";
    const aspectRatio = opts.imageConfig.cover.aspectRatio || "16:9";

    for (let i = 0; i < coverCount; i++) {
      if (Date.now() + IMAGE_REQUEST_TIMEOUT_MS > opts.deadlineMs) break;
      try {
        const prompt = `Create a professional blog cover image for: "${opts.title}". ${opts.stylePrompt || "Modern, clean, professional style."}`;
        const result = await generateSingleImage(prompt, imageModel, resolution, aspectRatio, opts.userId, opts.jobId, "cover", i, opts.openRouterKey, opts.googleAiKey);
        if (result) {
          totalCost += result.cost;
          if (i === 0 && result.storagePath) coverPath = result.storagePath;
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
      if (Date.now() + IMAGE_REQUEST_TIMEOUT_MS > opts.deadlineMs) break;
      try {
        const prompt = `Create an illustrative image for a blog post titled "${opts.title}". Section ${i + 1}. ${opts.stylePrompt || "Clean, informative style."}`;
        const result = await generateSingleImage(prompt, imageModel, resolution, aspectRatio, opts.userId, opts.jobId, "inline", i, opts.openRouterKey, opts.googleAiKey);
        if (result) {
          totalCost += result.cost;
          if (!result.storagePath) continue;
          inlinePaths.push(result.storagePath);
        }
      } catch (err) {
        console.error("[generate] Inline image error:", err);
      }
    }
  }

  return { coverPath, inlinePaths, cost: totalCost };
}

async function createManualImageRequests(opts: {
  imageModel: string;
  imageConfig: any;
  stylePrompt?: string;
  title: string;
  userId: string;
  postId: string;
  jobId: string;
}) {
  const rows: Array<typeof imageGenerationRequests.$inferInsert> = [];
  const provider = opts.imageModel.replace("manual/", "");

  if (opts.imageConfig?.cover) {
    const coverCount = opts.imageConfig.cover.count || 1;
    const resolution = opts.imageConfig.cover.resolution || "1K";
    const aspectRatio = opts.imageConfig.cover.aspectRatio || "16:9";
    for (let i = 0; i < coverCount; i++) {
      rows.push({
        userId: opts.userId,
        postId: opts.postId,
        jobId: opts.jobId,
        provider,
        type: "cover",
        position: i,
        aspectRatio,
        resolution,
        prompt: `Create a professional blog cover image for: "${opts.title}". ${opts.stylePrompt || "Modern, clean, professional style."}`,
      });
    }
  }

  if (opts.imageConfig?.inline) {
    const inlineCount = opts.imageConfig.inline.count || 2;
    const resolution = opts.imageConfig.inline.resolution || "1K";
    const aspectRatio = opts.imageConfig.inline.aspectRatio || "3:2";
    for (let i = 0; i < inlineCount; i++) {
      rows.push({
        userId: opts.userId,
        postId: opts.postId,
        jobId: opts.jobId,
        provider,
        type: "inline",
        position: i,
        aspectRatio,
        resolution,
        prompt: `Create an illustrative image for a blog post titled "${opts.title}". Section ${i + 1}. ${opts.stylePrompt || "Clean, informative style."}`,
      });
    }
  }

  if (rows.length) await db.insert(imageGenerationRequests).values(rows);
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
): Promise<{ storagePath: string | null; cost: number } | null> {
  // Use Google AI Studio for google-ai-studio models
  if (modelId.startsWith("google-ai-studio/")) {
    if (!googleAiKey) {
      throw new Error("Add your Google Gemini API key in Settings before using Google AI Studio image models");
    }
    return generateWithGoogleAI(prompt, modelId, resolution, aspectRatio, userId, jobId, type, position, googleAiKey);
  }

  const startedAt = Date.now();
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: resolution,
      },
    }),
  });

  if (!resp.ok) {
    console.error(`[image] OpenRouter error: ${resp.status}`);
    return null;
  }

  const data = await resp.json() as any;
  const openRouterUsage = await getOpenRouterCost(openRouterKey, data);
  const usage = data.usage || {};
  const promptTokens = usage.prompt_tokens ?? openRouterUsage.stats?.tokens_prompt ?? openRouterUsage.stats?.native_tokens_prompt ?? null;
  const completionTokens = usage.completion_tokens ?? openRouterUsage.stats?.tokens_completion ?? openRouterUsage.stats?.native_tokens_completion ?? null;
  const countedTokens = (promptTokens || 0) + (completionTokens || 0);
  const totalTokens = usage.total_tokens ?? (countedTokens || null);
  // Extract base64 image or URL from response
  const message = data.choices?.[0]?.message;
  const imageUrl = message?.images?.[0]?.image_url?.url || message?.images?.[0]?.imageUrl?.url || "";
  const imageContent = `${imageUrl}\n${message?.content || ""}`;
  const base64Match = imageContent.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
  const urlMatch = imageContent.match(/https?:\/\/[^\s"'\)]+\.(png|jpg|jpeg|webp|gif)/i);

  let imageBuffer: Buffer | null = null;

  if (base64Match) {
    imageBuffer = Buffer.from(base64Match[1], "base64");
  } else if (urlMatch) {
    const imgResp = await fetch(urlMatch[0], { signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS) });
    if (imgResp.ok) {
      imageBuffer = Buffer.from(await imgResp.arrayBuffer());
    }
  }

  await db.insert(generationLogs).values({
    userId,
    modelId,
    provider: "openrouter-image",
    status: imageBuffer ? "success" : "failed",
    promptTokens,
    completionTokens,
    totalTokens,
    cost: openRouterUsage.cost,
    latencyMs: Date.now() - startedAt,
    sessionId: jobId,
    responseData: { id: data.id, generation: openRouterUsage.stats },
  });

  if (!imageBuffer) return { storagePath: null, cost: openRouterUsage.cost };

  try {
    const sharp = (await import("sharp")).default;
    imageBuffer = (await sharp(imageBuffer).webp({ quality: 85 }).toBuffer()) as any;
  } catch {}

  const finalImageBuffer = imageBuffer;
  if (!finalImageBuffer) return { storagePath: null, cost: openRouterUsage.cost };

  const { storagePath } = await saveImageBuffer(finalImageBuffer, userId, {
    type,
    prompt,
    modelId,
    provider: "openrouter-image",
    aspectRatio,
    resolution,
    position,
    cost: openRouterUsage.cost,
    jobId,
  });

  return { storagePath, cost: openRouterUsage.cost };
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
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
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

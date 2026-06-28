import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { sites, userSettings } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteApiKey, getApiKeyMetadata, getGoogleAiKey, getOpenAiKey, getOpenRouterKey, setApiKey, type Provider } from "../services/api-keys.js";
import {
  buildInternalLinkIndex,
  canRefreshInternalLinks,
  nextInternalLinkRefreshAt,
  sanitizeInternalLinkIndex,
  type InternalLinkIndexingState,
} from "../services/internal-linking.js";
import { analyzeVoiceProfile } from "../services/voice-content.js";
import { chunkKnowledgeContent } from "../services/knowledge.js";

export const settingsRoutes = new Hono();
const API_KEY_PROVIDERS = new Set(["openrouter", "google", "openai", "replicate", "pexels", "pixabay"]);
const IMAGE_PLACEMENTS = new Set(["auto", "featured_only", "after_intro", "between_sections"]);

const asText = (value: unknown) => typeof value === "string" ? value : null;
const asOptionalText = (value: unknown) => typeof value === "string" ? value : undefined;
const asBool = (value: unknown) => typeof value === "boolean" ? value : undefined;
const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
};
const asJsonArray = (value: unknown) => Array.isArray(value) ? value : undefined;
const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;
type SettingsUpdate = Record<string, any>;

function firstTextFromGemini(data: unknown) {
  const record = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return record.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
}

function firstTextFromOpenRouter(data: unknown) {
  const record = data as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = record.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .join("")
      .trim();
  }
  return "";
}

async function extractKnowledgePdf(file: File, userId: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const googleKey = await getGoogleAiKey(userId);

  if (googleKey) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: "application/pdf", data: base64 } },
              { text: "Extract all useful text from this PDF for an SEO writing knowledge base. Preserve headings, lists, templates, and examples. Output clean markdown only." },
            ],
          }],
        }),
      }
    );
    if (resp.ok) {
      const text = firstTextFromGemini(await resp.json());
      if (text) return text;
    }
  }

  const openRouterKey = await getOpenRouterKey(userId);
  if (openRouterKey) {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract all useful text from this PDF for an SEO writing knowledge base. Preserve headings, lists, templates, and examples. Output clean markdown only." },
            { type: "file", file: { filename: file.name, file_data: `data:application/pdf;base64,${base64}` } },
          ],
        }],
      }),
    });
    if (resp.ok) {
      const text = firstTextFromOpenRouter(await resp.json());
      if (text) return text;
    }
  }

  throw new Error("Add a Google AI or OpenRouter API key before importing PDF knowledge");
}

function serializeSettings(settings: typeof userSettings.$inferSelect | undefined) {
  if (!settings) return {};

  return {
    id: settings.id,
    user_id: settings.userId,
    userId: settings.userId,
    active_site_id: settings.activeSiteId,
    activeSiteId: settings.activeSiteId,
    image_model: settings.imageModel,
    imageModel: settings.imageModel,
    image_style_prompt: settings.imageStylePrompt,
    imageStylePrompt: settings.imageStylePrompt,
    image_placement: settings.imagePlacement || "auto",
    imagePlacement: settings.imagePlacement || "auto",
    image_compression_enabled: settings.imageCompressionEnabled ?? true,
    imageCompressionEnabled: settings.imageCompressionEnabled ?? true,
    source_image_allowed: settings.sourceImageAllowed ?? false,
    sourceImageAllowed: settings.sourceImageAllowed ?? false,
    ai_fallback_enabled: settings.aiFallbackEnabled ?? true,
    aiFallbackEnabled: settings.aiFallbackEnabled ?? true,
    max_ai_images_per_day: settings.maxAiImagesPerDay ?? 30,
    maxAiImagesPerDay: settings.maxAiImagesPerDay ?? 30,
    min_minutes_between_ai_images: settings.minMinutesBetweenAiImages ?? 5,
    minMinutesBetweenAiImages: settings.minMinutesBetweenAiImages ?? 5,
    image_advanced_options: settings.imageAdvancedOptions,
    imageAdvancedOptions: settings.imageAdvancedOptions,
    cover_enabled: settings.coverEnabled,
    coverEnabled: settings.coverEnabled,
    cover_image_count: settings.coverImageCount,
    coverImageCount: settings.coverImageCount,
    cover_resolution: settings.coverResolution,
    coverResolution: settings.coverResolution,
    cover_aspect_ratio: settings.coverAspectRatio,
    coverAspectRatio: settings.coverAspectRatio,
    inline_enabled: settings.inlineEnabled,
    inlineEnabled: settings.inlineEnabled,
    inline_count: settings.inlineCount,
    inlineCount: settings.inlineCount,
    inline_resolution: settings.inlineResolution,
    inlineResolution: settings.inlineResolution,
    inline_aspect_ratio: settings.inlineAspectRatio,
    inlineAspectRatio: settings.inlineAspectRatio,
    article_word_count: settings.articleWordCount,
    articleWordCount: settings.articleWordCount,
    article_language: settings.articleLanguage,
    articleLanguage: settings.articleLanguage,
    article_voice: settings.articleVoice,
    articleVoice: settings.articleVoice,
    voice_mode: settings.voiceMode,
    voiceMode: settings.voiceMode,
    custom_voice_profile: settings.customVoiceProfile,
    customVoiceProfile: settings.customVoiceProfile,
    voice_training_samples: settings.voiceTrainingSamples ?? [],
    voiceTrainingSamples: settings.voiceTrainingSamples ?? [],
    content_rules: settings.contentRules ?? {},
    contentRules: settings.contentRules ?? {},
    custom_article_instructions: settings.customArticleInstructions,
    customArticleInstructions: settings.customArticleInstructions,
    include_table_of_contents: settings.includeTableOfContents,
    includeTableOfContents: settings.includeTableOfContents,
    enable_research: settings.enableResearch,
    enableResearch: settings.enableResearch,
    enable_internal_links: settings.enableInternalLinks,
    enableInternalLinks: settings.enableInternalLinks,
    internal_link_sitemap_url: settings.internalLinkSitemapUrl,
    internalLinkSitemapUrl: settings.internalLinkSitemapUrl,
    internal_link_status: settings.internalLinkStatus,
    internalLinkStatus: settings.internalLinkStatus,
    internal_link_mode: settings.internalLinkMode,
    internalLinkMode: settings.internalLinkMode,
    internal_link_density: settings.internalLinkDensity,
    internalLinkDensity: settings.internalLinkDensity,
    internal_link_include_patterns: settings.internalLinkIncludePatterns ?? [],
    internalLinkIncludePatterns: settings.internalLinkIncludePatterns ?? [],
    internal_link_exclude_patterns: settings.internalLinkExcludePatterns ?? [],
    internalLinkExcludePatterns: settings.internalLinkExcludePatterns ?? [],
    internal_link_rules: settings.internalLinkRules ?? [],
    internalLinkRules: settings.internalLinkRules ?? [],
    internal_link_index: sanitizeInternalLinkIndex(settings.internalLinkIndex),
    internalLinkIndex: sanitizeInternalLinkIndex(settings.internalLinkIndex),
    internal_link_indexing_state: settings.internalLinkIndexingState,
    internalLinkIndexingState: settings.internalLinkIndexingState,
    internal_link_last_synced_at: settings.internalLinkLastSyncedAt,
    internalLinkLastSyncedAt: settings.internalLinkLastSyncedAt,
    brand_company_name: settings.brandCompanyName,
    brandCompanyName: settings.brandCompanyName,
    brand_description: settings.brandDescription,
    brandDescription: settings.brandDescription,
    brand_target_audience: settings.brandTargetAudience,
    brandTargetAudience: settings.brandTargetAudience,
    brand_mentions: settings.brandMentions,
    brandMentions: settings.brandMentions,
    brand_value_props: settings.brandValueProps ?? [],
    brandValueProps: settings.brandValueProps ?? [],
    brand_ctas: settings.brandCtas ?? [],
    brandCtas: settings.brandCtas ?? [],
    knowledge_base_enabled: settings.knowledgeBaseEnabled,
    knowledgeBaseEnabled: settings.knowledgeBaseEnabled,
    knowledge_documents: settings.knowledgeDocuments ?? [],
    knowledgeDocuments: settings.knowledgeDocuments ?? [],
    monthly_budget: settings.monthlyBudget,
    monthlyBudget: settings.monthlyBudget,
    budget_paused: settings.budgetPaused,
    budgetPaused: settings.budgetPaused,
    budget_alert_threshold: settings.budgetAlertThreshold,
    budgetAlertThreshold: settings.budgetAlertThreshold,
    created_at: settings.createdAt,
    createdAt: settings.createdAt,
    updated_at: settings.updatedAt,
    updatedAt: settings.updatedAt,
  };
}

function buildSettingsUpdate(body: Record<string, unknown>): SettingsUpdate {
  const update: SettingsUpdate = {};

  const setText = (camel: string, snake: string, camelName: string = String(camel)) => {
    const value = body[snake] ?? body[camelName];
    if (value !== undefined) update[camel] = asText(value);
  };
  const setOptionalText = (camel: string, snake: string, camelName: string = String(camel)) => {
    const value = body[snake] ?? body[camelName];
    const parsed = asOptionalText(value);
    if (parsed !== undefined) update[camel] = parsed;
  };
  const setBool = (camel: string, snake: string, camelName: string = String(camel)) => {
    const parsed = asBool(body[snake] ?? body[camelName]);
    if (parsed !== undefined) update[camel] = parsed;
  };
  const setNumber = (camel: string, snake: string, camelName: string = String(camel)) => {
    const parsed = asNumber(body[snake] ?? body[camelName]);
    if (parsed !== undefined) update[camel] = parsed;
  };
  const setArray = (camel: string, snake: string, camelName: string = String(camel)) => {
    const parsed = asJsonArray(body[snake] ?? body[camelName]);
    if (parsed !== undefined) update[camel] = parsed;
  };
  const setJson = (camel: string, snake: string, camelName: string = String(camel)) => {
    const value = body[snake] ?? body[camelName];
    if (value !== undefined) update[camel] = value;
  };

  setOptionalText("imageModel", "image_model");
  setText("imageStylePrompt", "image_style_prompt");
  const imagePlacement = body.image_placement ?? body.imagePlacement;
  if (imagePlacement !== undefined) {
    if (typeof imagePlacement !== "string" || !IMAGE_PLACEMENTS.has(imagePlacement)) throw new Error("Invalid image placement");
    update.imagePlacement = imagePlacement;
  }
  setBool("imageCompressionEnabled", "image_compression_enabled");
  setBool("sourceImageAllowed", "source_image_allowed");
  setBool("aiFallbackEnabled", "ai_fallback_enabled");
  setNumber("maxAiImagesPerDay", "max_ai_images_per_day");
  setNumber("minMinutesBetweenAiImages", "min_minutes_between_ai_images");
  if (body.image_advanced_options !== undefined || body.imageAdvancedOptions !== undefined) {
    update.imageAdvancedOptions = (body.image_advanced_options ?? body.imageAdvancedOptions) as never;
  }
  setBool("coverEnabled", "cover_enabled");
  setNumber("coverImageCount", "cover_image_count");
  setOptionalText("coverResolution", "cover_resolution");
  setOptionalText("coverAspectRatio", "cover_aspect_ratio");
  setBool("inlineEnabled", "inline_enabled");
  setNumber("inlineCount", "inline_count");
  setOptionalText("inlineResolution", "inline_resolution");
  setOptionalText("inlineAspectRatio", "inline_aspect_ratio");

  setNumber("articleWordCount", "article_word_count");
  setOptionalText("articleLanguage", "article_language");
  setOptionalText("articleVoice", "article_voice");
  setOptionalText("voiceMode", "voice_mode");
  setJson("customVoiceProfile", "custom_voice_profile");
  setArray("voiceTrainingSamples", "voice_training_samples");
  setJson("contentRules", "content_rules");
  setOptionalText("customArticleInstructions", "custom_article_instructions");
  setBool("includeTableOfContents", "include_table_of_contents");
  setBool("enableResearch", "enable_research");
  setBool("enableInternalLinks", "enable_internal_links");
  setOptionalText("internalLinkSitemapUrl", "internal_link_sitemap_url");
  setOptionalText("internalLinkStatus", "internal_link_status");
  setOptionalText("internalLinkMode", "internal_link_mode");
  setOptionalText("internalLinkDensity", "internal_link_density");
  setArray("internalLinkIncludePatterns", "internal_link_include_patterns");
  setArray("internalLinkExcludePatterns", "internal_link_exclude_patterns");
  setArray("internalLinkRules", "internal_link_rules");

  setText("brandCompanyName", "brand_company_name");
  setText("brandDescription", "brand_description");
  setText("brandTargetAudience", "brand_target_audience");
  setOptionalText("brandMentions", "brand_mentions");
  setArray("brandValueProps", "brand_value_props");
  setArray("brandCtas", "brand_ctas");
  setBool("knowledgeBaseEnabled", "knowledge_base_enabled");
  setArray("knowledgeDocuments", "knowledge_documents");

  setNumber("monthlyBudget", "monthly_budget");
  setBool("budgetPaused", "budget_paused");
  setNumber("budgetAlertThreshold", "budget_alert_threshold");

  update.updatedAt = new Date();
  return update;
}

settingsRoutes.get("/api-keys", async (c) => {
  const userId = getUserId(c);
  return c.json(await getApiKeyMetadata(userId));
});

settingsRoutes.put("/api-keys", async (c) => {
  const userId = getUserId(c);
  const { provider, apiKey } = await c.req.json();

  if (!API_KEY_PROVIDERS.has(provider)) {
    return c.json({ error: "Invalid provider" }, 400);
  }
  if (!apiKey || typeof apiKey !== "string") {
    return c.json({ error: "API key is required" }, 400);
  }

  try {
    return c.json(await setApiKey(userId, provider as Provider, apiKey));
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to save API key" }, 400);
  }
});

settingsRoutes.delete("/api-keys", async (c) => {
  const userId = getUserId(c);
  const provider = c.req.query("provider");

  if (!provider || !API_KEY_PROVIDERS.has(provider)) {
    return c.json({ error: "Invalid provider" }, 400);
  }

  return c.json(await deleteApiKey(userId, provider as Provider));
});

function comparableSitemap(value: string | null | undefined) {
  return (value || "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
}

async function runInternalLinkIndexing({
  userId,
  jobId,
  sitemapUrl,
  mode,
  density,
  includePatterns,
  excludePatterns,
  openAiKey,
  hadExistingIndex,
}: {
  userId: string;
  jobId: string;
  sitemapUrl: string;
  mode: string;
  density: string;
  includePatterns: string[];
  excludePatterns: string[];
  openAiKey: string;
  hadExistingIndex: boolean;
}) {
  const startedAt = new Date().toISOString();
  let state: InternalLinkIndexingState = {
    jobId,
    step: "queued",
    totalPages: 0,
    crawledPages: 0,
    embeddedPages: 0,
    errorMessage: null,
    startedAt,
    completedAt: null,
  };
  const setState = async (patch: Partial<InternalLinkIndexingState>) => {
    state = { ...state, ...patch, jobId, startedAt };
    await db
      .update(userSettings)
      .set({ internalLinkIndexingState: state, updatedAt: new Date() } as any)
      .where(eq(userSettings.userId, userId));
  };

  try {
    await setState({ step: "fetch_sitemap" });
    const index = await buildInternalLinkIndex(sitemapUrl, {
      mode,
      includePatterns,
      excludePatterns,
      openAiKey,
      onProgress: setState,
    });
    const completedAt = new Date();
    const completedState: InternalLinkIndexingState = {
      ...state,
      step: "completed",
      totalPages: index.pageCount,
      crawledPages: index.pageCount,
      embeddedPages: index.vectorCount,
      errorMessage: null,
      completedAt: completedAt.toISOString(),
    };

    const [result] = await db
      .insert(userSettings)
      .values({
        userId,
        enableInternalLinks: true,
        internalLinkSitemapUrl: index.sitemapUrl,
        internalLinkStatus: "connected",
        internalLinkMode: mode,
        internalLinkDensity: density,
        internalLinkIncludePatterns: includePatterns,
        internalLinkExcludePatterns: excludePatterns,
        internalLinkIndex: index as never,
        internalLinkIndexingState: completedState as never,
        internalLinkLastSyncedAt: completedAt,
        updatedAt: completedAt,
      } as any)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          enableInternalLinks: true,
          internalLinkSitemapUrl: index.sitemapUrl,
          internalLinkStatus: "connected",
          internalLinkMode: mode,
          internalLinkDensity: density,
          internalLinkIncludePatterns: includePatterns,
          internalLinkExcludePatterns: excludePatterns,
          internalLinkIndex: index as never,
          internalLinkIndexingState: completedState as never,
          internalLinkLastSyncedAt: completedAt,
          updatedAt: completedAt,
        } as any,
      })
      .returning();

    if (result?.activeSiteId) {
      await db
        .update(sites)
        .set({
          sitemapUrl: index.sitemapUrl,
          domain: index.siteHost,
          status: "active",
          pageCount: index.pageCount,
          vectorCount: index.vectorCount,
          internalLinkIndex: index as never,
          internalLinkLastSyncedAt: result.internalLinkLastSyncedAt,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(sites.id, result.activeSiteId), eq(sites.userId, userId)));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to index sitemap";
    await db
      .update(userSettings)
      .set({
        enableInternalLinks: hadExistingIndex,
        internalLinkStatus: "failed",
        internalLinkIndexingState: {
          ...state,
          step: "failed",
          errorMessage: message,
          completedAt: new Date().toISOString(),
        } as never,
        updatedAt: new Date(),
      } as any)
      .where(eq(userSettings.userId, userId));
    console.error("[internal-linking] Indexing failed:", message);
  }
}

settingsRoutes.post("/internal-linking/index", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const sitemapUrl = asText(body.sitemap_url ?? body.sitemapUrl)?.trim();

  if (!sitemapUrl) {
    return c.json({ error: "Sitemap URL is required" }, 400);
  }

  try {
    const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    const currentState = existing?.internalLinkIndexingState as InternalLinkIndexingState | null | undefined;
    const sameSitemap = comparableSitemap(existing?.internalLinkSitemapUrl) === comparableSitemap(sitemapUrl);
    const recentIndexing = currentState?.startedAt && Date.now() - new Date(currentState.startedAt).getTime() < 30 * 60 * 1000;

    if (existing?.internalLinkStatus === "indexing" && recentIndexing) {
      return c.json({ error: "Internal linking indexing is already running" }, 409);
    }
    if (existing?.internalLinkStatus === "connected" && sameSitemap && !canRefreshInternalLinks(existing.internalLinkLastSyncedAt)) {
      const next = nextInternalLinkRefreshAt(existing.internalLinkLastSyncedAt);
      return c.json({ error: `Refresh is available after ${next?.toISOString() || "the cooldown ends"}` }, 429);
    }

    const openAiKey = await getOpenAiKey(userId);
    if (!openAiKey) {
      return c.json({ error: "Add your OpenAI API key in Settings before indexing internal links" }, 400);
    }

    const mode = asOptionalText(body.mode) || "all";
    const density = asOptionalText(body.density) || "balanced";
    const includePatterns = (asJsonArray(body.include_patterns ?? body.includePatterns) as string[] | undefined) || [];
    const excludePatterns = (asJsonArray(body.exclude_patterns ?? body.excludePatterns) as string[] | undefined) || [];
    const jobId = randomUUID();
    const startedAt = new Date();
    const indexingState: InternalLinkIndexingState = {
      jobId,
      step: "queued",
      totalPages: 0,
      crawledPages: 0,
      embeddedPages: 0,
      errorMessage: null,
      startedAt: startedAt.toISOString(),
      completedAt: null,
    };

    const [result] = await db
      .insert(userSettings)
      .values({
        userId,
        enableInternalLinks: true,
        internalLinkSitemapUrl: sitemapUrl,
        internalLinkStatus: "indexing",
        internalLinkMode: mode,
        internalLinkDensity: density,
        internalLinkIncludePatterns: includePatterns,
        internalLinkExcludePatterns: excludePatterns,
        internalLinkIndexingState: indexingState as never,
        updatedAt: startedAt,
      } as any)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          enableInternalLinks: true,
          internalLinkSitemapUrl: sitemapUrl,
          internalLinkStatus: "indexing",
          internalLinkMode: mode,
          internalLinkDensity: density,
          internalLinkIncludePatterns: includePatterns,
          internalLinkExcludePatterns: excludePatterns,
          internalLinkIndexingState: indexingState as never,
          updatedAt: startedAt,
        } as any,
      })
      .returning();

    runInternalLinkIndexing({
      userId,
      jobId,
      sitemapUrl,
      mode,
      density,
      includePatterns,
      excludePatterns,
      openAiKey,
      hadExistingIndex: Boolean(existing?.internalLinkIndex),
    }).catch((err) => console.error("[internal-linking] Background indexing error:", err));

    return c.json(serializeSettings(result), 202);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to index sitemap" }, 400);
  }
});

settingsRoutes.delete("/internal-linking", async (c) => {
  const userId = getUserId(c);
  const [result] = await db
    .insert(userSettings)
    .values({
      userId,
      enableInternalLinks: false,
      internalLinkSitemapUrl: null,
      internalLinkStatus: "disconnected",
      internalLinkIndex: null,
      internalLinkIndexingState: null,
      internalLinkLastSyncedAt: null,
      updatedAt: new Date(),
    } as any)
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        enableInternalLinks: false,
        internalLinkSitemapUrl: null,
        internalLinkStatus: "disconnected",
        internalLinkIndex: null,
        internalLinkIndexingState: null,
        internalLinkLastSyncedAt: null,
        updatedAt: new Date(),
      } as any,
    })
    .returning();

  if (result?.activeSiteId) {
    await db
      .update(sites)
      .set({
        status: "inactive",
        internalLinkIndex: null,
        internalLinkLastSyncedAt: null,
        updatedAt: new Date(),
      } as any)
      .where(and(eq(sites.id, result.activeSiteId), eq(sites.userId, userId)));
  }

  return c.json(serializeSettings(result));
});

settingsRoutes.post("/knowledge/import", async (c) => {
  const userId = getUserId(c);
  const formData = await c.req.raw.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return c.json({ error: "Knowledge file is required" }, 400);
  }
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return c.json({ error: "Knowledge file must be 10 MB or smaller" }, 400);
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return c.json({ error: "Only PDF files are imported by the server" }, 400);
  }

  try {
    const content = await extractKnowledgePdf(file, userId);
    return c.json({
      title: file.name.replace(/\.[^.]+$/, ""),
      content,
      status: "ready",
      chunks: chunkKnowledgeContent(content),
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to import knowledge file" }, 400);
  }
});

settingsRoutes.post("/voice-profile/analyze", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();

  try {
    const { profile, samples } = await analyzeVoiceProfile({
      userId,
      samples: body.samples,
      modelId: body.modelId,
    });
    const values = {
      userId,
      voiceMode: "custom",
      customVoiceProfile: profile,
      voiceTrainingSamples: samples,
      updatedAt: new Date(),
    } as const;
    const [result] = await db
      .insert(userSettings)
      .values(values as never)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          voiceMode: values.voiceMode,
          customVoiceProfile: values.customVoiceProfile,
          voiceTrainingSamples: values.voiceTrainingSamples,
          updatedAt: values.updatedAt,
        } as any,
      })
      .returning();

    return c.json(serializeSettings(result));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to generate voice profile" }, 400);
  }
});

settingsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return c.json(serializeSettings(settings));
});

settingsRoutes.put("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  let update: SettingsUpdate;
  try {
    update = buildSettingsUpdate(body);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid settings" }, 400);
  }

  if (Object.keys(update).length < 1) {
    return c.json({ error: "No supported settings fields provided" }, 400);
  }

  // Upsert: insert or update on conflict
  const [result] = await db
    .insert(userSettings)
    .values({ ...update, userId } as any)
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: update as any,
    })
    .returning();

  return c.json(serializeSettings(result));
});

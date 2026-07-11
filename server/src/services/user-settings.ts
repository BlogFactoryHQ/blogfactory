import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { sites, userSettings } from "../db/schema.js";

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type UserSettingsUpdate = Partial<typeof userSettings.$inferInsert>;

type SiteRow = typeof sites.$inferSelect;

const SITE_DEFAULT_IMAGE_PROMPT = "Professional, modern, clean style. High quality, suitable for a tech/business blog. No text overlays.";

function articleLanguageForSite(site: SiteRow) {
  if (site.language === "tr") return "Turkish";
  if (site.language === "en") return "US English";
  return "US English";
}

function siteDefaults(site: SiteRow, global?: UserSettingsRow | null): UserSettingsUpdate {
  return {
    userId: site.userId,
    siteId: site.id,
    imageModel: global?.imageModel || null,
    imageStylePrompt: global?.imageStylePrompt || SITE_DEFAULT_IMAGE_PROMPT,
    imageAdvancedOptions: global?.imageAdvancedOptions || {},
    coverEnabled: global?.coverEnabled ?? true,
    inlineEnabled: global?.inlineEnabled ?? true,
    inlineCount: global?.inlineCount ?? 2,
    articleWordCount: global?.articleWordCount ?? 1500,
    articleLanguage: global?.articleLanguage || articleLanguageForSite(site),
    articleVoice: global?.articleVoice || "Natural",
    voiceMode: global?.voiceMode || null,
    customVoiceProfile: global?.customVoiceProfile || null,
    voiceTrainingSamples: global?.voiceTrainingSamples || [],
    contentRules: global?.contentRules || {},
    customArticleInstructions: global?.customArticleInstructions || null,
    includeTableOfContents: global?.includeTableOfContents ?? false,
    enableResearch: global?.enableResearch ?? false,
    enableInternalLinks: Boolean(site.internalLinkIndex),
    internalLinkSitemapUrl: site.sitemapUrl,
    internalLinkStatus: site.internalLinkIndex ? "connected" : "disconnected",
    internalLinkMode: global?.internalLinkMode || "all",
    internalLinkDensity: global?.internalLinkDensity || "balanced",
    internalLinkIncludePatterns: [],
    internalLinkExcludePatterns: [],
    internalLinkRules: [],
    internalLinkIndex: site.internalLinkIndex as never,
    internalLinkIndexingState: null,
    internalLinkLastSyncedAt: site.internalLinkLastSyncedAt,
    brandCompanyName: site.name,
    brandDescription: "",
    brandTargetAudience: "",
    brandMentions: global?.brandMentions || "moderate",
    brandValueProps: [],
    brandCtas: [],
    knowledgeBaseEnabled: false,
    knowledgeDocuments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mergeAccountFields(settings: UserSettingsRow, global?: UserSettingsRow | null): UserSettingsRow {
  if (!global || settings.id === global.id) return settings;
  return {
    ...settings,
    activeSiteId: global.activeSiteId,
    monthlyBudget: global.monthlyBudget,
    budgetPaused: global.budgetPaused,
    budgetAlertThreshold: global.budgetAlertThreshold,
  };
}

export async function getGlobalSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), isNull(userSettings.siteId)))
    .limit(1);
  return settings || null;
}

export async function ensureGlobalSettings(userId: string) {
  const existing = await getGlobalSettings(userId);
  if (existing) return existing;

  const [created] = await db
    .insert(userSettings)
    .values({ userId, updatedAt: new Date() } as never)
    .returning();
  return created;
}

export async function getActiveSiteId(userId: string) {
  return (await ensureGlobalSettings(userId)).activeSiteId || null;
}

export async function updateGlobalSettings(userId: string, update: UserSettingsUpdate) {
  const existing = await ensureGlobalSettings(userId);
  const [updated] = await db
    .update(userSettings)
    .set({ ...update, updatedAt: new Date() } as never)
    .where(eq(userSettings.id, existing.id))
    .returning();
  return updated;
}

export async function getSiteForUser(userId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);
  return site || null;
}

export async function ensureSiteSettings(userId: string, siteId: string) {
  const site = await getSiteForUser(userId, siteId);
  if (!site) throw new Error("Site not found");

  const [existing] = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.siteId, siteId)))
    .limit(1);
  if (existing) return existing;

  const global = await ensureGlobalSettings(userId);
  const [created] = await db
    .insert(userSettings)
    .values(siteDefaults(site, global) as never)
    .returning();
  return created;
}

export async function getEffectiveSettings(userId: string, siteId?: string | null) {
  const global = await ensureGlobalSettings(userId);
  const resolvedSiteId = siteId || global.activeSiteId;
  if (!resolvedSiteId) return global;
  const scoped = await ensureSiteSettings(userId, resolvedSiteId);
  return mergeAccountFields(scoped, global);
}

export async function getPinnedSiteSettings(userId: string, siteId: string | null) {
  const global = await ensureGlobalSettings(userId);
  if (!siteId) return global;
  const scoped = await ensureSiteSettings(userId, siteId);
  return mergeAccountFields(scoped, global);
}

export async function updateSiteSettings(userId: string, siteId: string, update: UserSettingsUpdate) {
  const existing = await ensureSiteSettings(userId, siteId);
  const [updated] = await db
    .update(userSettings)
    .set({ ...update, updatedAt: new Date() } as never)
    .where(eq(userSettings.id, existing.id))
    .returning();
  const global = await ensureGlobalSettings(userId);
  return mergeAccountFields(updated, global);
}

export function isAccountSettingsUpdate(update: Record<string, unknown>) {
  const keys = Object.keys(update).filter((key) => key !== "updatedAt");
  return keys.length > 0 && keys.every((key) =>
    key === "monthlyBudget" || key === "budgetPaused" || key === "budgetAlertThreshold"
  );
}

import type { userSettings } from "../db/schema.js";
import type { CampaignMode, OutlineHeading } from "./campaign-parser.js";
import type { SportsNewsDecision } from "./sports-news.js";

export interface GenerateOpts {
  userId: string;
  sourceType: string;
  sourceValue: string;
  modelId?: string;
  personaId?: string | null;
  variations?: number;
  postsPerRun?: number;
  feedItemOffset?: number;
  filterType?: string;
  filterValue?: number | null;
  keywords?: string[] | string | null;
  draftBatchId?: string;
  draftVariationIndex?: number;
  draftVariationCount?: number;
  feedId?: string;
  siteId?: string | null;
  preferredIntegrationId?: string | null;
  extractFullContent?: boolean;
  filterOldPostsDays?: number;
  platformConfig?: unknown;
  generateImages?: boolean;
  imageConfig?: unknown;
  imageDeliveryMode?: string;
  manualImageProvider?: string;
  relatedKeywords?: string[] | string;
  outline?: string;
  articleDirection?: string;
  customInstructions?: string;
  articleType?: string;
  articleTitleOverride?: string;
  articleWordCount?: number | string;
  includeTableOfContents?: boolean;
  enableResearch?: boolean;
  internalLinkDensity?: string;
  jobId?: string;
  schedulerUserId?: string;
  campaignId?: string | null;
  campaignItemId?: string | null;
  settingsSnapshot?: unknown;
  campaignArticle?: {
    mode: CampaignMode;
    keyword?: string | null;
    title?: string | null;
    outline?: OutlineHeading[] | null;
    sharedContext?: string | null;
    programmatic?: {
      templateName: string;
      variables: Record<string, string>;
      sections: Array<{
        type: string;
        heading: string;
        instructions: string;
        minWords?: number;
        maxWords?: number;
        snippable?: boolean;
      }>;
      wordRange?: [number, number];
    };
  };
}

type UserSettingsRecord = typeof userSettings.$inferSelect;
export type GenerationSettings = Partial<UserSettingsRecord> & Record<string, unknown>;

export type SourceArticle = {
  title: string;
  content: string;
  url?: string;
  hash?: string;
  pubDate?: string;
  sportsDecision?: SportsNewsDecision;
  variationIndex?: number;
  variationCount?: number;
};

export type SeoQaCheck = { label: string; ok: boolean | null; detail: string };

export type SeoPackage = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  keyPoints?: string[];
  faqs: Array<{ question: string; answer: string; sourceQuery?: string }>;
};

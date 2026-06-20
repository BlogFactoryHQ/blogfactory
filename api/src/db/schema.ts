import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── users (replaces Supabase auth.users + profiles) ──
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  emailVerified: boolean("email_verified").default(false).notNull(),
  googleId: text("google_id").unique(),
  consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }),
  marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
  verifyToken: text("verify_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── feeds ──
export const feeds = pgTable("feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceUrl: text("source_url"),
  platform: text("platform").default("rss").notNull(),
  platformConfig: jsonb("platform_config"),
  modelId: text("model_id").notNull().default("openai/gpt-4o"),
  personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
  frequency: text("frequency").default("daily").notNull(),
  filterType: text("filter_type").default("none").notNull(),
  filterValue: real("filter_value"),
  filterOldPostsDays: integer("filter_old_posts_days"),
  keywords: text("keywords").array(),
  postsPerRun: integer("posts_per_run"),
  isActive: boolean("is_active").default(true).notNull(),
  autoContinue: boolean("auto_continue").default(false).notNull(),
  blurNsfw: boolean("blur_nsfw").default(false).notNull(),
  includeContent: boolean("include_content").default(true).notNull(),
  includeSummary: boolean("include_summary").default(false).notNull(),
  includeComments: integer("include_comments"),
  extractFullContent: boolean("extract_full_content").default(false).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  totalArticles: integer("total_articles").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── personas ──
export const personas = pgTable("personas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseModel: text("base_model").default("openai/gpt-4o").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  status: text("status").default("active").notNull(),
  language: text("language"),
  category: text("category"),
  responseFormat: text("response_format"),
  responseSchema: jsonb("response_schema"),
  toolsConfig: jsonb("tools_config"),
  parallelToolCalls: boolean("parallel_tool_calls"),
  toolChoice: text("tool_choice"),
  pluginsConfig: jsonb("plugins_config"),
  validationRules: jsonb("validation_rules"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── posts ──
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  status: text("status").default("draft").notNull(),
  sourceType: text("source_type").notNull(),
  sourceRefId: text("source_ref_id"),
  sourceContentHash: text("source_content_hash"),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
  modelId: text("model_id").notNull(),
  coverImageUrl: text("cover_image_url"),
  inlineImages: text("inline_images").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── jobs ──
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceValue: text("source_value").notNull(),
  modelId: text("model_id").notNull(),
  personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
  status: text("status").default("pending").notNull(),
  currentStep: text("current_step").default("queued").notNull(),
  errorMessage: text("error_message"),
  generationError: text("generation_error"),
  generationPlan: jsonb("generation_plan"),
  resultPostIds: text("result_post_ids").array(),
  summaryResult: text("summary_result"),
  summaryCompletedAt: timestamp("summary_completed_at", { withTimezone: true }),
  tokenCost: real("token_cost"),
  totalCost: real("total_cost"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ── generation_logs ──
export const generationLogs = pgTable("generation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  modelId: text("model_id"),
  provider: text("provider"),
  status: text("status"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  cost: real("cost"),
  latencyMs: integer("latency_ms"),
  traceId: text("trace_id"),
  sessionId: text("session_id"),
  rawTrace: jsonb("raw_trace"),
  requestData: jsonb("request_data"),
  responseData: jsonb("response_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── image_assets ──
export const imageAssets = pgTable("image_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  type: text("type").default("cover").notNull(),
  status: text("status").default("used").notNull(),
  prompt: text("prompt"),
  modelId: text("model_id"),
  provider: text("provider"),
  aspectRatio: text("aspect_ratio"),
  resolution: text("resolution"),
  position: integer("position"),
  cost: real("cost"),
  fileSizeBytes: integer("file_size_bytes"),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── user_settings ──
export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  imageModel: text("image_model"),
  imageStylePrompt: text("image_style_prompt"),
  imageAdvancedOptions: jsonb("image_advanced_options"),
  coverEnabled: boolean("cover_enabled"),
  coverImageCount: integer("cover_image_count"),
  coverResolution: text("cover_resolution"),
  coverAspectRatio: text("cover_aspect_ratio"),
  inlineEnabled: boolean("inline_enabled"),
  inlineCount: integer("inline_count"),
  inlineResolution: text("inline_resolution"),
  inlineAspectRatio: text("inline_aspect_ratio"),
  monthlyBudget: real("monthly_budget"),
  budgetPaused: boolean("budget_paused"),
  budgetAlertThreshold: real("budget_alert_threshold"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── scheduler_logs ──
export const schedulerLogs = pgTable("scheduler_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feedsChecked: integer("feeds_checked").default(0).notNull(),
  feedsTriggered: integer("feeds_triggered").default(0).notNull(),
  feedsSkipped: integer("feeds_skipped").default(0).notNull(),
  feedsErrored: integer("feeds_errored").default(0).notNull(),
  results: jsonb("results"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow().notNull(),
});

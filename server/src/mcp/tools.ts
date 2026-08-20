import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { waitUntil } from "@vercel/functions";
import { db } from "../db/index.js";
import {
  imageAssets,
  jobs,
  personas,
  postPublications,
  posts,
  siteIntegrations,
  sites,
} from "../db/schema.js";
import { encryptedCredentialStatus } from "../services/api-keys.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { NO_DRAFT_TIMEOUT_MESSAGE, reconciledJobForRead } from "../services/job-timeouts.js";
import { resolveOpenRouterTextModel } from "../services/openrouter-models.js";
import { cleanGeneratedPostContent, cleanPostTitle } from "../services/post-cleanup.js";
import { ExpectedPostVersionError, publishPost, SeoMetadataNotReadyError } from "../services/publishing.js";
import { PostNotEditableError, PostRevisionNotFoundError, PostVersionConflictError, currentPostRevision, updatePostWithRevision } from "../services/post-revisions.js";
import { getPublicUrl } from "../services/s3-client.js";
import { getSearchConsoleDashboard, getSearchConsoleInsights } from "../services/search-console.js";
import { drainSeoMetadata, enqueueSeoMetadata, seoMetadata, seoStatusForArticle } from "../services/seo-metadata.js";
import { hasMcpScope, type McpPrincipal } from "./auth.js";
import { ACTIVE_MCP_TOOL_NAMES, MCP_SCOPES, MCP_SERVER_VERSION, MCP_TOOL_NAMES, type McpScope } from "./contracts.js";

export const MCP_POST_CONTENT_LIMIT = 100_000;

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const GENERATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const UPDATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const PUSH_DRAFT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

const isoDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;

export function capMcpPostContent(content: string) {
  return {
    content: content.slice(0, MCP_POST_CONTENT_LIMIT),
    content_truncated: content.length > MCP_POST_CONTENT_LIMIT,
  };
}

const uuid = z.string().uuid();
const nullableText = z.string().nullable();
const seoStatusSchema = z.enum(["missing", "pending", "ready", "needs_review", "failed"]);
const successOutputSchema = (data: z.ZodRawShape) => ({
  ok: z.literal(true),
  data: z.object(data),
  next_action: nullableText,
});

type ToolErrorCode =
  | "insufficient_scope"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "configuration_missing"
  | "generation_busy"
  | "generation_failed"
  | "seo_not_ready"
  | "destination_not_ready"
  | "provider_error"
  | "internal_error";

export class McpToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly nextAction: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

async function requireOwnedAllowedSite(principal: McpPrincipal, siteId: string) {
  if (!principal.siteIds.has(siteId)) {
    throw new McpToolError("not_found", "Site not found.", "Call list_sites to choose an allowed site.");
  }
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, principal.userId)))
    .limit(1);
  if (!site) {
    throw new McpToolError("not_found", "Site not found.", "Call list_sites to choose an allowed site.");
  }
}

async function listSites(principal: McpPrincipal, input: { status: "active" | "inactive" }) {
  const allowedIds = [...principal.siteIds];
  if (!allowedIds.length) return { items: [] };
  const rows = await db
    .select({
      id: sites.id,
      name: sites.name,
      domain: sites.domain,
      status: sites.status,
      language: sites.language,
      topics: sites.topics,
      pageCount: sites.pageCount,
    })
    .from(sites)
    .where(and(
      eq(sites.userId, principal.userId),
      inArray(sites.id, allowedIds),
      eq(sites.status, input.status),
    ))
    .orderBy(asc(sites.name), asc(sites.domain), asc(sites.id))
    .limit(100);
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      status: row.status,
      language: row.language,
      topics: row.topics || [],
      page_count: row.pageCount || 0,
    })),
  };
}

async function listPersonas(principal: McpPrincipal, input: { status: "active" | "inactive" }) {
  const rows = await db
    .select({
      id: personas.id,
      name: personas.name,
      language: personas.language,
      category: personas.category,
      status: personas.status,
      baseModel: personas.baseModel,
    })
    .from(personas)
    .where(and(eq(personas.userId, principal.userId), eq(personas.status, input.status)))
    .orderBy(asc(personas.name), asc(personas.id))
    .limit(100);
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      category: row.category,
      status: row.status,
      base_model: row.baseModel,
    })),
  };
}

async function listPublishTargets(principal: McpPrincipal, input: { site_id: string }) {
  await requireOwnedAllowedSite(principal, input.site_id);
  const rows = await db
    .select({
      id: siteIntegrations.id,
      siteId: siteIntegrations.siteId,
      provider: siteIntegrations.provider,
      displayName: siteIntegrations.displayName,
      status: siteIntegrations.status,
      credentialsEncrypted: siteIntegrations.credentialsEncrypted,
      lastTestedAt: siteIntegrations.lastTestedAt,
    })
    .from(siteIntegrations)
    .where(and(
      eq(siteIntegrations.userId, principal.userId),
      eq(siteIntegrations.siteId, input.site_id),
    ))
    .orderBy(
      sql`case when ${siteIntegrations.status} = 'connected' then 0 else 1 end`,
      asc(siteIntegrations.displayName),
      asc(siteIntegrations.provider),
      asc(siteIntegrations.id),
    )
    .limit(100);
  return {
    items: rows.map((row) => ({
      id: row.id,
      site_id: row.siteId,
      provider: row.provider,
      display_name: row.displayName,
      status: row.status,
      credential_status: encryptedCredentialStatus(row.credentialsEncrypted),
      last_tested_at: isoDate(row.lastTestedAt),
    })),
  };
}

async function searchConsoleDashboard(principal: McpPrincipal, input: { site_id: string }) {
  await requireOwnedAllowedSite(principal, input.site_id);
  return { site_id: input.site_id, dashboard: await getSearchConsoleDashboard(principal.userId, input.site_id) };
}

async function searchConsoleInsights(principal: McpPrincipal, input: { site_id: string }) {
  await requireOwnedAllowedSite(principal, input.site_id);
  return { site_id: input.site_id, insights: await getSearchConsoleInsights(principal.userId, input.site_id) };
}

type ListPostsInput = {
  site_id: string;
  status?: "draft" | "published";
  search?: string;
  seo_status?: "missing" | "pending" | "ready" | "needs_review" | "failed";
  persona_id?: string;
  limit: number;
  page: number;
  sort: "created_at" | "title";
  direction: "asc" | "desc";
};

async function listPosts(principal: McpPrincipal, input: ListPostsInput) {
  await requireOwnedAllowedSite(principal, input.site_id);
  const conditions: SQL[] = [
    eq(posts.userId, principal.userId),
    eq(posts.siteId, input.site_id),
  ];
  if (input.status) conditions.push(eq(posts.status, input.status));
  if (input.search) conditions.push(ilike(posts.title, `%${input.search}%`));
  if (input.persona_id) conditions.push(eq(personas.id, input.persona_id));

  const sortColumn = input.sort === "title" ? posts.title : posts.createdAt;
  const sortDirection = input.direction === "asc" ? asc : desc;
  const selectRows = (limit: number, offset: number) => db
    .select({
      id: posts.id,
      siteId: posts.siteId,
      title: posts.title,
      content: posts.content,
      summary: posts.summary,
      status: posts.status,
      sourceType: posts.sourceType,
      personaId: personas.id,
      jobId: jobs.id,
      seoMetadata: posts.seoMetadata,
      preferredIntegrationId: siteIntegrations.id,
      integrationSiteId: siteIntegrations.siteId,
      integrationStatus: siteIntegrations.status,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .leftJoin(personas, and(
      eq(posts.personaId, personas.id),
      eq(personas.userId, principal.userId),
    ))
    .leftJoin(jobs, and(
      eq(posts.jobId, jobs.id),
      eq(jobs.userId, principal.userId),
      eq(jobs.siteId, input.site_id),
    ))
    .leftJoin(siteIntegrations, and(
      eq(posts.preferredIntegrationId, siteIntegrations.id),
      eq(siteIntegrations.userId, principal.userId),
      eq(siteIntegrations.siteId, input.site_id),
    ))
    .where(and(...conditions))
    .orderBy(sortDirection(sortColumn), sortDirection(posts.id))
    .limit(limit)
    .offset(offset);
  const project = (row: Awaited<ReturnType<typeof selectRows>>[number]) => ({
    id: row.id,
    site_id: row.siteId,
    title: row.title,
    summary: row.summary,
    status: row.status,
    source_type: row.sourceType,
    persona_id: row.personaId,
    job_id: row.jobId,
    seo_status: seoStatusForArticle(row.seoMetadata, row.title, row.content),
    routing_status: row.siteId
      && row.preferredIntegrationId
      && row.integrationSiteId === row.siteId
      && row.integrationStatus === "connected"
      ? "ready"
      : "needs_routing",
    created_at: isoDate(row.createdAt),
    updated_at: isoDate(row.updatedAt),
  });

  let items: ReturnType<typeof project>[] = [];
  let total = 0;
  if (input.seo_status) {
    const pageStart = (input.page - 1) * input.limit;
    const chunkSize = 100;
    for (let offset = 0; ; offset += chunkSize) {
      const rows = await selectRows(chunkSize, offset);
      for (const row of rows) {
        const item = project(row);
        if (item.seo_status !== input.seo_status) continue;
        if (total >= pageStart && items.length < input.limit) items.push(item);
        total += 1;
      }
      if (rows.length < chunkSize) break;
    }
  } else {
    const [rows, [totalRow]] = await Promise.all([
      selectRows(input.limit, (input.page - 1) * input.limit),
      db
        .select({ total: count() })
        .from(posts)
        .leftJoin(personas, and(
          eq(posts.personaId, personas.id),
          eq(personas.userId, principal.userId),
        ))
        .where(and(...conditions)),
    ]);
    items = rows.map(project);
    total = Number(totalRow?.total || 0);
  }
  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      total_pages: Math.ceil(total / input.limit),
    },
  };
}

function publicImageUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return getPublicUrl(value);
}

async function getPost(principal: McpPrincipal, input: { post_id: string }) {
  const allowedIds = [...principal.siteIds];
  if (!allowedIds.length) {
    throw new McpToolError("not_found", "Post not found.", "Call list_posts to choose an allowed post.");
  }
  const [post] = await db
    .select({
      id: posts.id,
      siteId: posts.siteId,
      title: posts.title,
      content: posts.content,
      summary: posts.summary,
      status: posts.status,
      sourceType: posts.sourceType,
      sourceRefId: posts.sourceRefId,
      personaId: personas.id,
      personaName: personas.name,
      seoMetadata: posts.seoMetadata,
      preferredIntegrationId: siteIntegrations.id,
      integrationSiteId: siteIntegrations.siteId,
      integrationStatus: siteIntegrations.status,
      editorialState: posts.editorialState,
      approvedRevisionId: posts.approvedRevisionId,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .leftJoin(personas, and(
      eq(posts.personaId, personas.id),
      eq(personas.userId, principal.userId),
    ))
    .leftJoin(siteIntegrations, and(
      eq(posts.preferredIntegrationId, siteIntegrations.id),
      eq(siteIntegrations.userId, principal.userId),
      eq(siteIntegrations.siteId, posts.siteId),
    ))
    .where(and(
      eq(posts.id, input.post_id),
      eq(posts.userId, principal.userId),
      inArray(posts.siteId, allowedIds),
    ))
    .limit(1);
  if (!post || !post.siteId) {
    throw new McpToolError("not_found", "Post not found.", "Call list_posts to choose an allowed post.");
  }

  const [publicationRows, imageRows, revision] = await Promise.all([
    db
      .select({
        id: postPublications.id,
        integrationId: siteIntegrations.id,
        provider: postPublications.provider,
        publishMode: postPublications.publishMode,
        status: postPublications.status,
        externalId: postPublications.externalId,
        externalUrl: postPublications.externalUrl,
        publishedAt: postPublications.publishedAt,
        updatedAt: postPublications.updatedAt,
      })
      .from(postPublications)
      .leftJoin(siteIntegrations, and(
        eq(postPublications.integrationId, siteIntegrations.id),
        eq(siteIntegrations.userId, principal.userId),
        eq(siteIntegrations.siteId, post.siteId),
      ))
      .where(and(
        eq(postPublications.userId, principal.userId),
        eq(postPublications.postId, post.id),
        eq(postPublications.siteId, post.siteId),
      ))
      .orderBy(desc(postPublications.createdAt)),
    db
      .select({
        storagePath: imageAssets.storagePath,
        type: imageAssets.type,
        altText: imageAssets.altText,
        sourceUrl: imageAssets.sourceUrl,
        credit: imageAssets.credit,
        licenseLabel: imageAssets.licenseLabel,
        attributionUrl: imageAssets.attributionUrl,
        position: imageAssets.position,
      })
      .from(imageAssets)
      .where(and(
        eq(imageAssets.userId, principal.userId),
        eq(imageAssets.postId, post.id),
      ))
      .orderBy(asc(imageAssets.type), asc(imageAssets.position), asc(imageAssets.createdAt)),
    currentPostRevision(principal.userId, post.id),
  ]);

  const metadata = seoMetadata(post.seoMetadata);
  const seoStatus = seoStatusForArticle(post.seoMetadata, post.title, post.content);
  const cappedContent = capMcpPostContent(post.content);
  return {
    id: post.id,
    site_id: post.siteId,
    title: post.title,
    ...cappedContent,
    summary: post.summary,
    status: post.status,
    source_type: post.sourceType,
    source_ref_id: post.sourceRefId,
    persona: post.personaId && post.personaName
      ? { id: post.personaId, name: post.personaName }
      : null,
    seo: {
      status: seoStatus,
      slug: metadata?.slug || null,
      meta_title: metadata?.metaTitle || null,
      meta_description: metadata?.metaDescription || null,
      validation_errors: metadata?.validationErrors || [],
    },
    editorial: {
      state: post.editorialState,
      current_revision_id: revision?.id || null,
      current_revision_number: revision?.revisionNumber || null,
      approved_revision_id: post.approvedRevisionId,
      current_revision_approved: Boolean(revision && post.editorialState === "approved" && post.approvedRevisionId === revision.id),
    },
    publishing: {
      routing_status: post.siteId
        && post.preferredIntegrationId
        && post.integrationSiteId === post.siteId
        && post.integrationStatus === "connected"
        ? "ready"
        : "needs_routing",
      preferred_integration_id: post.preferredIntegrationId,
      publications: publicationRows.map((row) => ({
        id: row.id,
        integration_id: row.integrationId,
        provider: row.provider,
        publish_mode: row.publishMode,
        status: row.status,
        external_id: row.externalId,
        external_url: row.externalUrl,
        published_at: isoDate(row.publishedAt),
        updated_at: isoDate(row.updatedAt),
      })),
    },
    images: imageRows.flatMap((row) => {
      const url = publicImageUrl(row.storagePath);
      return url ? [{
        url,
        type: row.type,
        alt_text: row.altText,
        source_url: row.sourceUrl,
        credit: row.credit,
        license_label: row.licenseLabel,
        attribution_url: row.attributionUrl,
        position: row.position,
      }] : [];
    }),
    updated_at: isoDate(post.updatedAt),
  };
}

const MCP_DRAFT_SOURCE_TYPES = ["article_keyword", "article_title", "url", "raw_text", "youtube"] as const;

type GenerateDraftInput = {
  site_id: string;
  source_type: typeof MCP_DRAFT_SOURCE_TYPES[number];
  source_value: string;
  persona_id?: string;
  preferred_integration_id?: string;
  variations: number;
  article_word_count?: number;
  custom_instructions?: string;
  generate_images: false;
};

function validateMcpDraftSource(input: GenerateDraftInput) {
  if (input.source_type === "url" || input.source_type === "youtube") {
    let url: URL;
    try {
      url = new URL(input.source_value);
    } catch {
      throw new McpToolError("validation_error", "Source must be a valid HTTPS URL.", "Correct source_value and try again.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new McpToolError("validation_error", "Source must be a public HTTPS URL without embedded credentials.", "Correct source_value and try again.");
    }
  }
  if (input.source_type === "raw_text" && input.source_value.length > 50_000) {
    throw new McpToolError("validation_error", "Raw text exceeds the 50,000 character limit.", "Shorten source_value and try again.");
  }
}

async function generateDraft(principal: McpPrincipal, input: GenerateDraftInput) {
  await requireOwnedAllowedSite(principal, input.site_id);
  validateMcpDraftSource(input);

  if (input.persona_id) {
    const [persona] = await db.select({ id: personas.id }).from(personas).where(and(
      eq(personas.id, input.persona_id),
      eq(personas.userId, principal.userId),
    )).limit(1);
    if (!persona) throw new McpToolError("not_found", "Persona not found.", "Call list_personas and choose an available persona.");
  }
  if (input.preferred_integration_id) {
    const [integration] = await db.select({ id: siteIntegrations.id }).from(siteIntegrations).where(and(
      eq(siteIntegrations.id, input.preferred_integration_id),
      eq(siteIntegrations.userId, principal.userId),
      eq(siteIntegrations.siteId, input.site_id),
    )).limit(1);
    if (!integration) throw new McpToolError("not_found", "Publishing target not found.", "Call list_publish_targets and choose a target for this site.");
  }

  const [activeJob] = await db.select({ id: jobs.id }).from(jobs).where(and(
    eq(jobs.userId, principal.userId),
    eq(jobs.siteId, input.site_id),
    inArray(jobs.sourceType, [...MCP_DRAFT_SOURCE_TYPES]),
    inArray(jobs.status, ["pending", "running"]),
  )).limit(1);
  if (activeJob) throw new McpToolError("generation_busy", "A draft generation job is already running for this site.", `Call get_job with job_id ${activeJob.id}.`, true);

  const openRouterKey = await getOpenRouterKey(principal.userId);
  if (!openRouterKey) throw new McpToolError("configuration_missing", "OpenRouter is not configured.", "Add an OpenRouter API key in BlogFactory Settings.");

  let modelId: string;
  try {
    modelId = await resolveOpenRouterTextModel(openRouterKey, "openai/gpt-4o");
  } catch {
    throw new McpToolError("configuration_missing", "The configured text model is unavailable.", "Review the OpenRouter model configuration in BlogFactory Settings.");
  }

  const [job] = await db.insert(jobs).values({
    userId: principal.userId,
    siteId: input.site_id,
    preferredIntegrationId: input.preferred_integration_id || null,
    sourceType: input.source_type,
    sourceValue: input.source_value,
    modelId,
    personaId: input.persona_id || null,
    status: "running",
    currentStep: "starting",
    generationPlan: { totalDrafts: input.variations, origin: "mcp" },
  }).returning({ id: jobs.id });

  const { generateContent } = await import("../services/generate-content.js");
  const generation = generateContent({
    userId: principal.userId,
    jobId: job.id,
    siteId: input.site_id,
    preferredIntegrationId: input.preferred_integration_id || null,
    sourceType: input.source_type,
    sourceValue: input.source_value,
    modelId,
    personaId: input.persona_id || null,
    variations: input.variations,
    articleWordCount: input.article_word_count,
    customInstructions: input.custom_instructions,
    generateImages: false,
  }).catch(async (error) => {
    console.error("[mcp] Draft generation failed:", error instanceof Error ? error.name : "UnknownError");
    await db.update(jobs).set({
      status: "failed",
      errorMessage: "Content generation failed",
      generationError: "Content generation failed",
      completedAt: new Date(),
    }).where(and(eq(jobs.id, job.id), eq(jobs.userId, principal.userId)));
  });
  waitUntil(generation);

  return {
    job_id: job.id,
    status: "running",
    site_id: input.site_id,
    source_type: input.source_type,
    post_ids: [],
    next_action: "Call get_job with this job_id.",
  };
}

type UpdateDraftInput = {
  post_id: string;
  expected_updated_at: string;
  title?: string;
  content?: string;
};

async function updateDraft(principal: McpPrincipal, input: UpdateDraftInput) {
  if (input.title === undefined && input.content === undefined) {
    throw new McpToolError("validation_error", "Provide title or content to update.", "Read the draft, then send at least one changed field.");
  }
  const update: Partial<typeof posts.$inferInsert> = {};
  if (input.title !== undefined) {
    const title = cleanPostTitle(input.title);
    if (!title) throw new McpToolError("validation_error", "Title cannot be empty.", "Provide a non-empty title.");
    update.title = title;
  }
  if (input.content !== undefined) {
    const content = cleanGeneratedPostContent(input.content);
    if (!content) throw new McpToolError("validation_error", "Content cannot be empty.", "Provide non-empty Markdown content.");
    update.content = content;
  }

  const [allowed] = await db.select({ id: posts.id }).from(posts).where(and(
    eq(posts.id, input.post_id),
    eq(posts.userId, principal.userId),
    inArray(posts.siteId, [...principal.siteIds]),
  )).limit(1);
  if (!allowed) throw new McpToolError("not_found", "Draft not found.", "Call list_posts to choose an allowed draft.");
  let result;
  try {
    result = await updatePostWithRevision({
      userId: principal.userId,
      postId: input.post_id,
      expectedUpdatedAt: new Date(input.expected_updated_at),
      source: "mcp",
      changes: update,
      requireDraft: true,
    });
  } catch (error) {
    if (error instanceof PostRevisionNotFoundError) throw new McpToolError("not_found", "Draft not found.", "Call list_posts to choose an allowed draft.");
    if (error instanceof PostNotEditableError) throw new McpToolError("conflict", error.message, "Choose a draft post.");
    if (error instanceof PostVersionConflictError) throw new McpToolError("conflict", error.message, "Call get_post, review the current version, and retry with its updated_at.");
    throw error;
  }
  const updated = result.post;
  if (!updated.siteId) throw new McpToolError("not_found", "Draft not found.", "Call list_posts to choose an allowed draft.");

  const seoJob = await enqueueSeoMetadata({ userId: principal.userId, postId: updated.id, trigger: "mcp_update" });
  if (seoJob.queued) waitUntil(drainSeoMetadata(principal.userId, 1));
  return {
    post_id: updated.id,
    site_id: updated.siteId,
    title: updated.title,
    seo_status: seoJob.status,
    seo_job_id: seoJob.jobId,
    revision_id: result.revision?.id || null,
    updated_at: isoDate(updated.updatedAt),
    next_action: "Call get_post to review the saved version.",
  };
}

type PushDraftInput = {
  post_id: string;
  integration_id: string;
  expected_updated_at: string;
  post_type: "post" | "page";
  tags?: string[];
  categories?: string[];
  excerpt?: string;
  mode?: unknown;
};

async function pushToCmsDraft(principal: McpPrincipal, input: PushDraftInput) {
  if (input.mode !== undefined) throw new McpToolError("validation_error", "mode is not accepted; MCP always sends a CMS draft.", "Remove mode and retry.");
  const [post] = await db.select({ siteId: posts.siteId }).from(posts).where(and(
    eq(posts.id, input.post_id),
    eq(posts.userId, principal.userId),
    inArray(posts.siteId, [...principal.siteIds]),
  )).limit(1);
  if (!post?.siteId) throw new McpToolError("not_found", "Post not found.", "Call list_posts to choose an allowed post.");

  const [integration] = await db.select({ provider: siteIntegrations.provider, status: siteIntegrations.status }).from(siteIntegrations).where(and(
    eq(siteIntegrations.id, input.integration_id),
    eq(siteIntegrations.userId, principal.userId),
    eq(siteIntegrations.siteId, post.siteId),
  )).limit(1);
  if (!integration) throw new McpToolError("not_found", "Publishing target not found.", "Call list_publish_targets for this post's site.");
  if (integration.status !== "connected") throw new McpToolError("destination_not_ready", "Publishing target is not connected.", "Reconnect the target in BlogFactory Integrations.");

  let result: Awaited<ReturnType<typeof publishPost>>;
  try {
    result = await publishPost(principal.userId, input.post_id, input.integration_id, {
      mode: "draft",
      postType: input.post_type,
      tags: input.tags,
      categories: input.categories,
      excerpt: input.excerpt,
      expectedUpdatedAt: new Date(input.expected_updated_at),
    });
  } catch (error) {
    if (error instanceof ExpectedPostVersionError) throw new McpToolError("conflict", error.message, "Call get_post and retry with its updated_at.");
    if (error instanceof SeoMetadataNotReadyError) throw new McpToolError("seo_not_ready", error.message, "Wait for SEO metadata, review it in get_post, then retry.", true);
    throw error;
  }
  if (!result.success) {
    const code = result.validationFailed ? "destination_not_ready" : "provider_error";
    throw new McpToolError(code, result.validationFailed ? "The CMS draft failed validation." : "The CMS provider could not create the draft.", "Review the post and integration in BlogFactory, then retry.", !result.validationFailed);
  }
  const publication = result.publication;
  return {
    success: true,
    status: publication.status,
    provider: integration.provider,
    external_id: publication.external_id,
    external_url: publication.external_url,
    external_edit_url: publication.external_edit_url,
    deduplicated: Boolean(result.idempotent),
    site_id: post.siteId,
  };
}

export function safeMcpJobError(job: { status: string; errorMessage: string | null; generationError: string | null }) {
  const value = job.generationError || job.errorMessage;
  if (!value) return null;
  if (value === "Stopped by user" || value === NO_DRAFT_TIMEOUT_MESSAGE) return value;
  if (/^Generation timed out after \d+\/\d+ drafts were created\. The remaining drafts did not finish; try a faster model or fewer variations\.$/.test(value)) {
    return value;
  }
  return job.status === "failed"
    ? "Generation failed. Open BlogFactory for details or retry the job."
    : null;
}

async function getJob(principal: McpPrincipal, input: { job_id: string }) {
  const allowedIds = [...principal.siteIds];
  if (!allowedIds.length) {
    throw new McpToolError("not_found", "Job not found.", "Use a job ID returned by BlogFactory.");
  }
  const [storedJob] = await db
    .select({
      id: jobs.id,
      siteId: jobs.siteId,
      sourceType: jobs.sourceType,
      status: jobs.status,
      currentStep: jobs.currentStep,
      campaignId: jobs.campaignId,
      generationPlan: jobs.generationPlan,
      resultPostIds: jobs.resultPostIds,
      errorMessage: jobs.errorMessage,
      generationError: jobs.generationError,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .where(and(
      eq(jobs.id, input.job_id),
      eq(jobs.userId, principal.userId),
      inArray(jobs.siteId, allowedIds),
    ))
    .limit(1);
  if (!storedJob || !storedJob.siteId) {
    throw new McpToolError("not_found", "Job not found.", "Use a job ID returned by BlogFactory.");
  }
  const jobSiteId = storedJob.siteId;
  const requestedResultPostIds = [...new Set((storedJob.resultPostIds || []).filter((id) => uuid.safeParse(id).success))];
  const ownedResultRows = requestedResultPostIds.length
    ? await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(
        eq(posts.userId, principal.userId),
        eq(posts.siteId, jobSiteId),
        inArray(posts.id, requestedResultPostIds),
      ))
    : [];
  const ownedResultIds = new Set(ownedResultRows.map((row) => row.id));
  const resultPostIds = requestedResultPostIds.filter((id) => ownedResultIds.has(id));
  const job = reconciledJobForRead({ ...storedJob, resultPostIds });
  const plan = job.generationPlan && typeof job.generationPlan === "object" && !Array.isArray(job.generationPlan)
    ? job.generationPlan as Record<string, unknown>
    : {};
  const requestedTotal = Number(plan.totalDrafts);
  const totalDrafts = Number.isFinite(requestedTotal) && requestedTotal > 0
    ? Math.round(requestedTotal)
    : Math.max(resultPostIds.length, 1);
  const failedDrafts = Array.isArray(plan.failedDrafts) ? plan.failedDrafts.length : 0;
  const nextAction = job.status === "completed" && resultPostIds.length
    ? "Call get_post for a result_post_id."
    : job.status === "failed"
      ? "Review the safe error summary, adjust the input, and start a new draft."
      : "Call get_job again to check progress.";
  return {
    id: job.id,
    site_id: jobSiteId,
    status: job.status,
    current_step: job.currentStep,
    progress: {
      completed_drafts: resultPostIds.length,
      total_drafts: totalDrafts,
      failed_drafts: failedDrafts,
    },
    result_post_ids: resultPostIds,
    error: safeMcpJobError(job),
    created_at: isoDate(job.createdAt),
    completed_at: isoDate(job.completedAt),
    next_action: nextAction,
  };
}

type ToolDefinition = {
  name: typeof ACTIVE_MCP_TOOL_NAMES[number];
  description: string;
  inputSchema: z.ZodRawShape;
  outputSchema: z.ZodRawShape;
  requiredScope: McpScope;
  siteBound: boolean;
  annotations: ToolAnnotations;
  handler: (principal: McpPrincipal, input: any) => Promise<Record<string, unknown>> | Record<string, unknown>;
};

const siteItem = z.object({
  id: uuid,
  name: z.string(),
  domain: z.string(),
  status: z.string(),
  language: nullableText,
  topics: z.array(z.string()),
  page_count: z.number().int().nonnegative(),
});
const personaItem = z.object({
  id: uuid,
  name: z.string(),
  language: nullableText,
  category: nullableText,
  status: z.string(),
  base_model: z.string(),
});
const targetItem = z.object({
  id: uuid,
  site_id: uuid,
  provider: z.string(),
  display_name: z.string(),
  status: z.string(),
  credential_status: z.enum(["usable", "missing", "undecryptable"]),
  last_tested_at: nullableText,
});
const postListItem = z.object({
  id: uuid,
  site_id: uuid,
  title: z.string(),
  summary: nullableText,
  status: z.string(),
  source_type: z.string(),
  persona_id: uuid.nullable(),
  job_id: uuid.nullable(),
  seo_status: seoStatusSchema,
  routing_status: z.enum(["ready", "needs_routing"]),
  created_at: z.string(),
  updated_at: z.string(),
});
const publicationItem = z.object({
  id: uuid,
  integration_id: uuid.nullable(),
  provider: z.string(),
  publish_mode: z.string(),
  status: z.string(),
  external_id: nullableText,
  external_url: nullableText,
  published_at: nullableText,
  updated_at: z.string(),
});
const imageItem = z.object({
  url: z.string().url(),
  type: z.string(),
  alt_text: nullableText,
  source_url: nullableText,
  credit: nullableText,
  license_label: nullableText,
  attribution_url: nullableText,
  position: z.number().int().nullable(),
});

export const MCP_TOOL_REGISTRY = {
  whoami: {
    name: "whoami",
    description: "Show the connected BlogFactory identity, scopes, and allowed sites.",
    inputSchema: {},
    outputSchema: successOutputSchema({
      user_id: uuid,
      display_name: nullableText,
      role: z.string(),
      approval_status: z.string(),
      scopes: z.array(z.enum(MCP_SCOPES)),
      allowed_site_ids: z.array(uuid),
    }),
    requiredScope: "content:read",
    siteBound: false,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: (principal: McpPrincipal) => ({
      user_id: principal.userId,
      display_name: principal.displayName,
      role: principal.role,
      approval_status: principal.approvalStatus,
      scopes: MCP_SCOPES.filter((scope) => principal.scopes.has(scope)),
      allowed_site_ids: [...principal.siteIds].sort(),
    }),
  },
  list_sites: {
    name: "list_sites",
    description: "List the connected BlogFactory sites allowed by this connection.",
    inputSchema: {
      status: z.enum(["active", "inactive"]).default("active"),
    },
    outputSchema: successOutputSchema({ items: z.array(siteItem) }),
    requiredScope: "content:read",
    siteBound: true,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: listSites,
  },
  list_personas: {
    name: "list_personas",
    description: "List compact editorial persona metadata without prompts or tool configuration.",
    inputSchema: {
      status: z.enum(["active", "inactive"]).default("active"),
    },
    outputSchema: successOutputSchema({ items: z.array(personaItem) }),
    requiredScope: "content:read",
    siteBound: false,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: listPersonas,
  },
  list_publish_targets: {
    name: "list_publish_targets",
    description: "List safe CMS destination metadata for one allowed site.",
    inputSchema: { site_id: uuid },
    outputSchema: successOutputSchema({ items: z.array(targetItem) }),
    requiredScope: "content:read",
    siteBound: true,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: listPublishTargets,
  },
  list_posts: {
    name: "list_posts",
    description: "Find compact BlogFactory post records without loading article bodies.",
    inputSchema: {
      site_id: uuid,
      status: z.enum(["draft", "published"]).optional(),
      search: z.string().trim().min(1).max(200).optional(),
      seo_status: seoStatusSchema.optional(),
      persona_id: uuid.optional(),
      limit: z.number().int().min(1).max(50).default(20),
      page: z.number().int().min(1).default(1),
      sort: z.enum(["created_at", "title"]).default("created_at"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    },
    outputSchema: successOutputSchema({
      items: z.array(postListItem),
      pagination: z.object({
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        total_pages: z.number().int().nonnegative(),
      }),
    }),
    requiredScope: "content:read",
    siteBound: true,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: listPosts,
  },
  get_post: {
    name: "get_post",
    description: `Read one allowed BlogFactory post. Content is capped at ${MCP_POST_CONTENT_LIMIT} characters.`,
    inputSchema: { post_id: uuid },
    outputSchema: successOutputSchema({
      id: uuid,
      site_id: uuid,
      title: z.string(),
      content: z.string(),
      content_truncated: z.boolean(),
      summary: nullableText,
      status: z.string(),
      source_type: z.string(),
      source_ref_id: nullableText,
      persona: z.object({ id: uuid, name: z.string() }).nullable(),
      seo: z.object({
        status: seoStatusSchema,
        slug: nullableText,
        meta_title: nullableText,
        meta_description: nullableText,
        validation_errors: z.array(z.string()),
      }),
      editorial: z.object({
        state: z.enum(["draft", "in_review", "approved", "changes_requested"]),
        current_revision_id: uuid.nullable(),
        current_revision_number: z.number().int().positive().nullable(),
        approved_revision_id: uuid.nullable(),
        current_revision_approved: z.boolean(),
      }),
      publishing: z.object({
        routing_status: z.enum(["ready", "needs_routing"]),
        preferred_integration_id: uuid.nullable(),
        publications: z.array(publicationItem),
      }),
      images: z.array(imageItem),
      updated_at: z.string(),
    }),
    requiredScope: "content:read",
    siteBound: true,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getPost,
  },
  generate_draft: {
    name: "generate_draft",
    description: "Start one asynchronous BlogFactory draft-generation job. This can consume the user's configured provider budget.",
    inputSchema: {
      site_id: uuid,
      source_type: z.enum(MCP_DRAFT_SOURCE_TYPES),
      source_value: z.string().trim().min(1).max(50_000),
      persona_id: uuid.optional(),
      preferred_integration_id: uuid.optional(),
      variations: z.number().int().min(1).max(3).default(1),
      article_word_count: z.number().int().min(300).max(5_000).optional(),
      custom_instructions: z.string().trim().min(1).max(4_000).optional(),
      generate_images: z.literal(false).default(false),
    },
    outputSchema: successOutputSchema({
      job_id: uuid,
      status: z.literal("running"),
      site_id: uuid,
      source_type: z.enum(MCP_DRAFT_SOURCE_TYPES),
      post_ids: z.array(uuid),
      next_action: z.string(),
    }),
    requiredScope: "drafts:write",
    siteBound: true,
    annotations: GENERATE_ANNOTATIONS,
    handler: generateDraft,
  },
  get_job: {
    name: "get_job",
    description: "Read safe progress and result metadata for one allowed BlogFactory generation job.",
    inputSchema: { job_id: uuid },
    outputSchema: successOutputSchema({
      id: uuid,
      site_id: uuid,
      status: z.string(),
      current_step: z.string(),
      progress: z.object({
        completed_drafts: z.number().int().nonnegative(),
        total_drafts: z.number().int().positive(),
        failed_drafts: z.number().int().nonnegative(),
      }),
      result_post_ids: z.array(uuid),
      error: nullableText,
      created_at: z.string(),
      completed_at: nullableText,
      next_action: z.string(),
    }),
    requiredScope: "content:read",
    siteBound: true,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getJob,
  },
  get_search_console_dashboard: {
    name: "get_search_console_dashboard",
    description: "Read the connected Search Console status and synchronized performance totals for one allowed site.",
    inputSchema: { site_id: uuid },
    outputSchema: successOutputSchema({ site_id: uuid, dashboard: z.record(z.unknown()) }),
    requiredScope: "content:read",
    siteBound: true,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: searchConsoleDashboard,
  },
  get_search_console_insights: {
    name: "get_search_console_insights",
    description: "Read synchronized Search Console trends, opportunities, top pages, and top queries for one allowed site.",
    inputSchema: { site_id: uuid },
    outputSchema: successOutputSchema({ site_id: uuid, insights: z.record(z.unknown()) }),
    requiredScope: "content:read",
    siteBound: true,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: searchConsoleInsights,
  },
  update_draft: {
    name: "update_draft",
    description: "Update the title and/or Markdown content of one BlogFactory draft using optimistic locking.",
    inputSchema: {
      post_id: uuid,
      expected_updated_at: z.string().datetime({ offset: true }),
      title: z.string().max(500).optional(),
      content: z.string().max(MCP_POST_CONTENT_LIMIT).optional(),
    },
    outputSchema: successOutputSchema({
      post_id: uuid,
      site_id: uuid,
      title: z.string(),
      seo_status: seoStatusSchema,
      seo_job_id: uuid.nullable(),
      revision_id: uuid.nullable(),
      updated_at: z.string(),
      next_action: z.string(),
    }),
    requiredScope: "drafts:write",
    siteBound: true,
    annotations: UPDATE_ANNOTATIONS,
    handler: updateDraft,
  },
  push_to_cms_draft: {
    name: "push_to_cms_draft",
    description: "Send one reviewed BlogFactory post to a connected CMS as a draft. Live publication is unavailable.",
    inputSchema: {
      post_id: uuid,
      integration_id: uuid,
      expected_updated_at: z.string().datetime({ offset: true }),
      post_type: z.enum(["post", "page"]).default("post"),
      tags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
      categories: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
      excerpt: z.string().trim().max(500).optional(),
    },
    outputSchema: successOutputSchema({
      success: z.literal(true),
      status: z.literal("draft"),
      provider: z.string(),
      external_id: nullableText,
      external_url: nullableText,
      external_edit_url: nullableText,
      deduplicated: z.boolean(),
      site_id: uuid,
    }),
    requiredScope: "publish:draft",
    siteBound: true,
    annotations: PUSH_DRAFT_ANNOTATIONS,
    handler: pushToCmsDraft,
  },
} satisfies Record<typeof ACTIVE_MCP_TOOL_NAMES[number], ToolDefinition>;

export function assertMcpToolRegistry() {
  const names = Object.values(MCP_TOOL_REGISTRY).map((tool) => tool.name);
  if (
    names.length !== ACTIVE_MCP_TOOL_NAMES.length
    || new Set(names).size !== names.length
    || names.some((name, index) => name !== ACTIVE_MCP_TOOL_NAMES[index])
  ) throw new Error("MCP tool registry does not match the active catalog");
  for (const tool of Object.values(MCP_TOOL_REGISTRY)) {
    if (!tool.description || !tool.inputSchema || !tool.outputSchema || !tool.handler) {
      throw new Error(`MCP tool ${tool.name} is incomplete`);
    }
    if (Object.values(tool.annotations).some((value) => typeof value !== "boolean")) {
      throw new Error(`MCP tool ${tool.name} has invalid annotations`);
    }
    if (!MCP_TOOL_NAMES.includes(tool.name) || !MCP_SCOPES.includes(tool.requiredScope) || typeof tool.siteBound !== "boolean") {
      throw new Error(`MCP tool ${tool.name} has invalid registry metadata`);
    }
  }
}

function toolError(error: unknown) {
  const known = error instanceof McpToolError;
  const code = known ? error.code : "internal_error";
  const message = known ? error.message : "BlogFactory could not complete this request.";
  const nextAction = known ? error.nextAction : "Try again. If the problem continues, open BlogFactory.";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
    structuredContent: {
      ok: false,
      error: errorSchema.parse({ code, message, retryable: known ? error.retryable : false }),
      next_action: nextAction,
    },
  };
}

function logMcpTool(
  principal: McpPrincipal,
  definition: ToolDefinition,
  requestId: string | number,
  startedAt: number,
  code: "ok" | ToolErrorCode,
  siteId?: string,
) {
  console.info("[mcp] tool", {
    origin: "mcp",
    requestId: String(requestId),
    serverVersion: MCP_SERVER_VERSION,
    tool: definition.name,
    tokenId: principal.tokenId,
    userId: principal.userId,
    ...(siteId ? { siteId } : {}),
    durationMs: Date.now() - startedAt,
    code,
  });
}

function registerTool(server: McpServer, principal: McpPrincipal, definition: ToolDefinition) {
  server.registerTool(definition.name, {
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    annotations: definition.annotations,
  }, async (input, extra) => {
    const startedAt = Date.now();
    const inputSiteId = typeof input.site_id === "string" && principal.siteIds.has(input.site_id)
      ? input.site_id
      : undefined;
    if (!hasMcpScope(principal, definition.requiredScope)) {
      logMcpTool(principal, definition, extra.requestId, startedAt, "insufficient_scope", inputSiteId);
      return toolError(new McpToolError(
        "insufficient_scope",
        `${definition.requiredScope} permission is required.`,
        `Create a connection with ${definition.requiredScope} permission.`,
      ));
    }
    try {
      const result = await definition.handler(principal, input);
      const nextAction = typeof result.next_action === "string" ? result.next_action : null;
      const resultSiteId = typeof result.site_id === "string" ? result.site_id : inputSiteId;
      logMcpTool(principal, definition, extra.requestId, startedAt, "ok", resultSiteId);
      return {
        content: [{ type: "text" as const, text: `${definition.name} completed.` }],
        structuredContent: { ok: true, data: result, next_action: nextAction },
      };
    } catch (error) {
      const code = error instanceof McpToolError ? error.code : "internal_error";
      if (!(error instanceof McpToolError)) {
        console.error("[mcp] Tool failed:", error instanceof Error ? error.name : "UnknownError");
      }
      logMcpTool(principal, definition, extra.requestId, startedAt, code, inputSiteId);
      return toolError(error);
    }
  });
}

export function registerMcpTools(server: McpServer, principal: McpPrincipal) {
  assertMcpToolRegistry();
  registerTool(server, principal, MCP_TOOL_REGISTRY.whoami);
  registerTool(server, principal, MCP_TOOL_REGISTRY.list_sites);
  registerTool(server, principal, MCP_TOOL_REGISTRY.list_personas);
  registerTool(server, principal, MCP_TOOL_REGISTRY.list_publish_targets);
  registerTool(server, principal, MCP_TOOL_REGISTRY.list_posts);
  registerTool(server, principal, MCP_TOOL_REGISTRY.get_post);
  registerTool(server, principal, MCP_TOOL_REGISTRY.generate_draft);
  registerTool(server, principal, MCP_TOOL_REGISTRY.get_job);
  registerTool(server, principal, MCP_TOOL_REGISTRY.get_search_console_dashboard);
  registerTool(server, principal, MCP_TOOL_REGISTRY.get_search_console_insights);
  registerTool(server, principal, MCP_TOOL_REGISTRY.update_draft);
  registerTool(server, principal, MCP_TOOL_REGISTRY.push_to_cms_draft);
}

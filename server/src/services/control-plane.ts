import { and, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  generationLogs,
  jobs,
  mcpAccessTokens,
  mcpOAuthConnections,
  postPublications,
  postRevisions,
  posts,
  siteIntegrations,
  sites,
} from "../db/schema.js";
import { readySeoMetadataForArticle, seoStatusForArticle } from "./seo-metadata.js";
import { getSearchConsoleInsights } from "./search-console.js";
import { listOperationEvents } from "./operation-events.js";
import { postRevisionSnapshot, type PostRevisionSnapshot } from "./post-revisions.js";
import { encryptedCredentialStatus, type CredentialStatus } from "./api-keys.js";

export const ACTION_KINDS = [
  "missing_revision",
  "seo_not_ready",
  "destination_not_ready",
  "changes_requested",
  "in_review",
  "stale_approval",
  "missing_cover",
  "publishing_metadata_missing",
  "stale_draft",
] as const;
export const ACTION_SEVERITIES = ["blocker", "review", "warning"] as const;

export type ActionKind = typeof ACTION_KINDS[number];
export type ActionSeverity = typeof ACTION_SEVERITIES[number];

export type ActionReason = {
  kind: ActionKind;
  severity: ActionSeverity;
  label: string;
  message: string;
};

export type ActionItem = {
  id: string;
  object_type: "post";
  object_id: string;
  site_id: string;
  title: string;
  summary: string | null;
  source_type: string;
  editorial_state: string;
  revision_number: number | null;
  routing_status: "ready" | "needs_routing";
  destination_id: string | null;
  destination_name: string | null;
  destination_provider: string | null;
  severity: ActionSeverity;
  kind: ActionKind;
  reasons: ActionReason[];
  updated_at: string;
  suggested_action: string;
};

type DraftActionInput = {
  id: string;
  siteId: string;
  title: string;
  content: string;
  summary: string | null;
  sourceType: string;
  seoMetadata: unknown;
  editorialState: string;
  approvedRevisionId: string | null;
  coverImageUrl: string | null;
  publishingMetadata: unknown;
  preferredIntegrationId: string | null;
  integrationSiteId: string | null;
  integrationStatus: string | null;
  integrationCredentialStatus?: CredentialStatus;
  integrationDisplayName?: string | null;
  integrationProvider?: string | null;
  usableDestinationCount?: number;
  updatedAt: Date;
  revision: { id: string; revisionNumber: number } | null;
  now: Date;
};

const severityRank: Record<ActionSeverity, number> = { blocker: 0, review: 1, warning: 2 };
const kindRank = new Map<ActionKind, number>(ACTION_KINDS.map((kind, index) => [kind, index]));

export function classifyDraftAction(input: DraftActionInput): ActionItem | null {
  const reasons: ActionReason[] = [];
  const hasPublishingMetadata = Boolean(input.publishingMetadata && typeof input.publishingMetadata === "object" && Object.keys(input.publishingMetadata).length);
  const preferredRoutingReady = Boolean(
    input.preferredIntegrationId
    && input.integrationSiteId === input.siteId
    && input.integrationStatus === "connected"
    && input.integrationCredentialStatus === "usable",
  );
  const destinationReady = preferredRoutingReady || Boolean(input.usableDestinationCount);
  if (!input.revision) reasons.push({ kind: "missing_revision", severity: "blocker", label: "Saved revision", message: "No saved revision exists." });
  if (!readySeoMetadataForArticle(input.seoMetadata, input.title, input.content)) {
    reasons.push({ kind: "seo_not_ready", severity: "blocker", label: "SEO", message: "SEO metadata is missing, stale, or invalid." });
  }
  if (!destinationReady) reasons.push({ kind: "destination_not_ready", severity: "blocker", label: "CMS destination", message: "Connect a CMS destination for this site." });
  if (input.editorialState === "changes_requested") reasons.push({ kind: "changes_requested", severity: "review", label: "Changes requested", message: "This draft needs another editorial pass." });
  else if (input.editorialState === "in_review") reasons.push({ kind: "in_review", severity: "review", label: "In review", message: "This draft is waiting for an editorial decision." });
  else if (input.editorialState === "approved" && input.revision && input.approvedRevisionId !== input.revision.id) {
    reasons.push({ kind: "stale_approval", severity: "review", label: "Approval expired", message: "The approved revision is no longer current." });
  }
  if (!input.coverImageUrl) reasons.push({ kind: "missing_cover", severity: "warning", label: "Cover image", message: "No cover image is attached." });
  if (!hasPublishingMetadata) reasons.push({ kind: "publishing_metadata_missing", severity: "warning", label: "Publishing metadata", message: "Tags, categories, or provider metadata have not been saved." });
  if (input.now.getTime() - input.updatedAt.getTime() > 14 * 24 * 60 * 60 * 1000) {
    reasons.push({ kind: "stale_draft", severity: "warning", label: "Stale draft", message: "This draft has not changed for more than 14 days." });
  }
  if (!reasons.length) return null;
  reasons.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || (kindRank.get(left.kind) || 0) - (kindRank.get(right.kind) || 0));
  const primary = reasons[0];
  return {
    id: input.id,
    object_type: "post",
    object_id: input.id,
    site_id: input.siteId,
    title: input.title,
    summary: input.summary,
    source_type: input.sourceType,
    editorial_state: input.editorialState,
    revision_number: input.revision?.revisionNumber || null,
    routing_status: preferredRoutingReady ? "ready" : "needs_routing",
    destination_id: input.preferredIntegrationId,
    destination_name: input.integrationDisplayName || null,
    destination_provider: input.integrationProvider || null,
    severity: primary.severity,
    kind: primary.kind,
    reasons,
    updated_at: input.updatedAt.toISOString(),
    suggested_action: primary.message,
  };
}

async function ownedSite(userId: string, siteId: string) {
  const [site] = await db.select({ id: sites.id, name: sites.name, domain: sites.domain })
    .from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  return site || null;
}

async function draftActionItems(userId: string, siteId: string, now = new Date()) {
  if (!await ownedSite(userId, siteId)) return null;
  const [rows, connectedDestinations] = await Promise.all([db.select({
    id: posts.id,
    siteId: posts.siteId,
    title: posts.title,
    content: posts.content,
    summary: posts.summary,
    sourceType: posts.sourceType,
    seoMetadata: posts.seoMetadata,
    editorialState: posts.editorialState,
    approvedRevisionId: posts.approvedRevisionId,
    coverImageUrl: posts.coverImageUrl,
    publishingMetadata: posts.publishingMetadata,
    preferredIntegrationId: posts.preferredIntegrationId,
    integrationSiteId: siteIntegrations.siteId,
    integrationStatus: siteIntegrations.status,
    integrationCredentialsEncrypted: siteIntegrations.credentialsEncrypted,
    integrationDisplayName: siteIntegrations.displayName,
    integrationProvider: siteIntegrations.provider,
    updatedAt: posts.updatedAt,
  }).from(posts)
    .leftJoin(siteIntegrations, and(
      eq(siteIntegrations.id, posts.preferredIntegrationId),
      eq(siteIntegrations.userId, userId),
    ))
    .where(and(eq(posts.userId, userId), eq(posts.siteId, siteId), eq(posts.status, "draft")))
    .orderBy(desc(posts.updatedAt)),
  db.select({ credentialsEncrypted: siteIntegrations.credentialsEncrypted }).from(siteIntegrations).where(and(
    eq(siteIntegrations.userId, userId),
    eq(siteIntegrations.siteId, siteId),
    eq(siteIntegrations.status, "connected"),
  ))]);
  const usableDestinationCount = connectedDestinations.filter((destination) => encryptedCredentialStatus(destination.credentialsEncrypted) === "usable").length;
  if (!rows.length) return [];

  // ponytail: one bounded projection scan; move classification into SQL if draft volume makes this measurable.
  const revisions = await db.select({ id: postRevisions.id, postId: postRevisions.postId, revisionNumber: postRevisions.revisionNumber })
    .from(postRevisions)
    .where(and(eq(postRevisions.userId, userId), inArray(postRevisions.postId, rows.map((row) => row.id))))
    .orderBy(desc(postRevisions.revisionNumber));
  const latest = new Map<string, { id: string; revisionNumber: number }>();
  for (const revision of revisions) if (!latest.has(revision.postId)) latest.set(revision.postId, { id: revision.id, revisionNumber: revision.revisionNumber });
  return rows.flatMap((row) => {
    if (!row.siteId) return [];
    const item = classifyDraftAction({
      ...row,
      siteId: row.siteId,
      integrationCredentialStatus: encryptedCredentialStatus(row.integrationCredentialsEncrypted),
      usableDestinationCount,
      revision: latest.get(row.id) || null,
      now,
    });
    return item ? [item] : [];
  }).sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
    || (kindRank.get(left.kind) || 0) - (kindRank.get(right.kind) || 0)
    || right.updated_at.localeCompare(left.updated_at));
}

export async function listActionItems(input: {
  userId: string;
  siteId: string;
  severity?: ActionSeverity;
  kind?: ActionKind;
  limit?: number;
  page?: number;
  now?: Date;
}) {
  const all = await draftActionItems(input.userId, input.siteId, input.now);
  if (!all) return null;
  const filtered = filterActionItems(all, input.severity, input.kind);
  const limit = Math.min(Math.max(input.limit || 20, 1), 50);
  const page = Math.max(input.page || 1, 1);
  const start = (page - 1) * limit;
  return {
    items: filtered.slice(start, start + limit),
    counts: {
      total: all.length,
      blocker: all.filter((item) => item.severity === "blocker").length,
      review: all.filter((item) => item.severity === "review").length,
      warning: all.filter((item) => item.severity === "warning").length,
    },
    pagination: { page, limit, total: filtered.length, total_pages: Math.ceil(filtered.length / limit) },
  };
}

export function filterActionItems(all: ActionItem[], severity?: ActionSeverity, kind?: ActionKind) {
  return all.flatMap((item) => {
    if (severity && item.severity !== severity) return [];
    if (!kind) return [item];
    const reasons = item.reasons.filter((reason) => reason.kind === kind && (!severity || reason.severity === severity));
    if (!reasons.length) return [];
    const primary = reasons[0];
    return [{ ...item, reasons, severity: primary.severity, kind: primary.kind, suggested_action: primary.message }];
  });
}

function words(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function revisionChangeSummary(current: PostRevisionSnapshot, previous: PostRevisionSnapshot | null) {
  if (!previous) return { changed_fields: ["initial_revision"], word_delta: words(current.content) };
  const changedFields = [
    current.title !== previous.title && "title",
    current.content !== previous.content && "content",
    current.summary !== previous.summary && "summary",
    current.cover_image_url !== previous.cover_image_url && "cover_image",
    JSON.stringify(current.inline_images) !== JSON.stringify(previous.inline_images) && "inline_images",
    JSON.stringify(current.publishing_metadata) !== JSON.stringify(previous.publishing_metadata) && "publishing_metadata",
  ].filter((value): value is string => Boolean(value));
  return { changed_fields: changedFields, word_delta: words(current.content) - words(previous.content) };
}

export async function getReviewPacket(input: { userId: string; postId: string; allowedSiteIds?: ReadonlySet<string>; canPushCmsDraft: boolean }) {
  const [post] = await db.select({
    id: posts.id,
    siteId: posts.siteId,
    title: posts.title,
    content: posts.content,
    summary: posts.summary,
    status: posts.status,
    sourceType: posts.sourceType,
    sourceRefId: posts.sourceRefId,
    seoMetadata: posts.seoMetadata,
    editorialState: posts.editorialState,
    approvedRevisionId: posts.approvedRevisionId,
    coverImageUrl: posts.coverImageUrl,
    publishingMetadata: posts.publishingMetadata,
    preferredIntegrationId: posts.preferredIntegrationId,
    updatedAt: posts.updatedAt,
  }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.userId, input.userId))).limit(1);
  if (!post?.siteId || (input.allowedSiteIds && !input.allowedSiteIds.has(post.siteId))) return null;

  const [revisionRows, destinations, publicationRows] = await Promise.all([
    db.select().from(postRevisions).where(and(eq(postRevisions.userId, input.userId), eq(postRevisions.postId, post.id))).orderBy(desc(postRevisions.revisionNumber)).limit(2),
    db.select({ id: siteIntegrations.id, provider: siteIntegrations.provider, displayName: siteIntegrations.displayName, status: siteIntegrations.status, credentialsEncrypted: siteIntegrations.credentialsEncrypted })
      .from(siteIntegrations).where(and(eq(siteIntegrations.userId, input.userId), eq(siteIntegrations.siteId, post.siteId))).orderBy(desc(siteIntegrations.updatedAt)),
    db.select({ id: postPublications.id, status: postPublications.status, externalUrl: postPublications.externalUrl, externalEditUrl: postPublications.externalEditUrl, updatedAt: postPublications.updatedAt })
      .from(postPublications).where(and(eq(postPublications.userId, input.userId), eq(postPublications.postId, post.id))).orderBy(desc(postPublications.updatedAt)).limit(5),
  ]);
  const currentRevision = revisionRows[0] || null;
  const previousRevision = revisionRows[1] || null;
  const seoReady = Boolean(readySeoMetadataForArticle(post.seoMetadata, post.title, post.content));
  const usableDestinations = destinations.filter((destination) => destination.status === "connected" && encryptedCredentialStatus(destination.credentialsEncrypted) === "usable");
  const hasPublishingMetadata = Boolean(post.publishingMetadata && typeof post.publishingMetadata === "object" && Object.keys(post.publishingMetadata).length);
  const checks = [
    { id: "saved_revision", label: "Saved revision", status: currentRevision ? "pass" : "blocker", message: currentRevision ? `Revision ${currentRevision.revisionNumber}` : "No saved revision exists" },
    { id: "seo", label: "Canonical SEO", status: seoReady ? "pass" : "blocker", message: seoReady ? "Current and valid" : "SEO metadata is missing, stale, or invalid" },
    { id: "destination", label: "CMS destination", status: usableDestinations.length ? "pass" : "blocker", message: usableDestinations.length ? `${usableDestinations.length} usable destination${usableDestinations.length === 1 ? "" : "s"}` : "Connect or repair a CMS destination for this site" },
    { id: "cover_image", label: "Cover image", status: post.coverImageUrl ? "pass" : "warning", message: post.coverImageUrl ? "Attached to the saved revision" : "No cover image is attached" },
    { id: "publishing_metadata", label: "Publishing metadata", status: hasPublishingMetadata ? "pass" : "warning", message: hasPublishingMetadata ? "Saved for this revision" : "Tags, categories, or provider metadata have not been saved yet" },
  ] as const;
  const currentSnapshot = currentRevision ? postRevisionSnapshot(currentRevision.snapshot) : null;
  const previousSnapshot = previousRevision ? postRevisionSnapshot(previousRevision.snapshot) : null;
  return {
    post: {
      id: post.id,
      site_id: post.siteId,
      title: post.title,
      summary: post.summary,
      source_type: post.sourceType,
      source_ref_id: post.sourceRefId,
      status: post.status,
      updated_at: post.updatedAt.toISOString(),
      web_url: new URL(`/library/posts/${post.id}/preview`, process.env.WEB_APP_URL || process.env.MCP_RESOURCE_URL || "https://blogfactory.io").toString(),
    },
    source: { type: post.sourceType, reference: post.sourceRefId },
    editorial: {
      state: post.editorialState,
      revision_id: currentRevision?.id || null,
      revision_number: currentRevision?.revisionNumber || null,
      revision_source: currentRevision?.source || null,
      approved_revision_id: post.approvedRevisionId,
      current_revision_approved: Boolean(currentRevision && post.approvedRevisionId === currentRevision.id),
    },
    changes: currentSnapshot ? revisionChangeSummary(currentSnapshot, previousSnapshot) : { changed_fields: [], word_delta: 0 },
    seo: { status: seoStatusForArticle(post.seoMetadata, post.title, post.content) },
    preflight: { can_send: !checks.some((check) => check.status === "blocker"), has_blockers: checks.some((check) => check.status === "blocker"), checks },
    destinations: destinations.map((destination) => ({
      id: destination.id,
      provider: destination.provider,
      display_name: destination.displayName,
      status: destination.status,
      credential_status: encryptedCredentialStatus(destination.credentialsEncrypted),
      preferred: destination.id === post.preferredIntegrationId,
    })),
    publications: publicationRows.map((publication) => ({
      id: publication.id,
      status: publication.status,
      external_url: publication.externalUrl,
      external_edit_url: publication.externalEditUrl,
      updated_at: publication.updatedAt.toISOString(),
    })),
    permissions: { can_push_cms_draft: input.canPushCmsDraft },
    links: {
      edit: `/library/posts/${post.id}/edit`,
      preview: `/library/posts/${post.id}/preview`,
    },
  };
}

export async function getWorkspaceDigest(input: { userId: string; siteId: string; now?: Date }) {
  const site = await ownedSite(input.userId, input.siteId);
  if (!site) return null;
  const now = input.now || new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const actions = await listActionItems({ userId: input.userId, siteId: input.siteId, limit: 5, now });
  const [[runCounts], recentRuns, [outcomes], [cost], [oauthConnections], [personalConnections], activity, searchGrowth, recentOutputs, cmsConnections] = await Promise.all([
    db.select({
      running: sql<number>`count(*) filter (where ${jobs.status} in ('pending', 'running'))::int`,
      failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')::int`,
    }).from(jobs).where(and(eq(jobs.userId, input.userId), eq(jobs.siteId, input.siteId))),
    db.select({ id: jobs.id, status: jobs.status, source_type: jobs.sourceType, current_step: jobs.currentStep, created_at: jobs.createdAt })
      .from(jobs).where(and(eq(jobs.userId, input.userId), eq(jobs.siteId, input.siteId))).orderBy(desc(jobs.createdAt)).limit(5),
    db.select({
      drafts: sql<number>`count(*) filter (where ${posts.status} = 'draft')::int`,
      published: sql<number>`count(*) filter (where ${posts.status} = 'published')::int`,
    }).from(posts).where(and(eq(posts.userId, input.userId), eq(posts.siteId, input.siteId), gte(posts.createdAt, thirtyDaysAgo))),
    db.select({ total: sql<number>`coalesce(sum(${generationLogs.cost}), 0)::float8` }).from(generationLogs)
      .innerJoin(posts, and(eq(posts.id, generationLogs.postId), eq(posts.userId, input.userId), eq(posts.siteId, input.siteId)))
      .where(and(eq(generationLogs.userId, input.userId), gte(generationLogs.createdAt, thirtyDaysAgo))),
    db.select({ count: count() }).from(mcpOAuthConnections).where(and(eq(mcpOAuthConnections.userId, input.userId), eq(mcpOAuthConnections.siteId, input.siteId), isNull(mcpOAuthConnections.revokedAt))),
    db.select({ count: count() }).from(mcpAccessTokens).where(and(
      eq(mcpAccessTokens.userId, input.userId),
      isNull(mcpAccessTokens.revokedAt),
      sql`${input.siteId}::uuid = ANY(${mcpAccessTokens.siteIds})`,
      or(isNull(mcpAccessTokens.expiresAt), gte(mcpAccessTokens.expiresAt, now)),
    )),
    listOperationEvents({ userId: input.userId, siteId: input.siteId, limit: 8 }),
    getSearchConsoleInsights(input.userId, input.siteId),
    db.select({ id: posts.id, title: posts.title, status: posts.status, editorial_state: posts.editorialState, source_type: posts.sourceType, updated_at: posts.updatedAt })
      .from(posts).where(and(eq(posts.userId, input.userId), eq(posts.siteId, input.siteId))).orderBy(desc(posts.updatedAt)).limit(5),
    db.select({ status: siteIntegrations.status, credentialsEncrypted: siteIntegrations.credentialsEncrypted })
      .from(siteIntegrations).where(and(eq(siteIntegrations.userId, input.userId), eq(siteIntegrations.siteId, input.siteId))),
  ]);
  const [cmsDrafts] = await db.select({ count: count() }).from(postPublications).where(and(
    eq(postPublications.userId, input.userId),
    eq(postPublications.siteId, input.siteId),
    eq(postPublications.publishMode, "draft"),
    eq(postPublications.status, "draft"),
    gte(postPublications.createdAt, thirtyDaysAgo),
  ));
  return {
    site,
    attention: actions?.counts || { total: 0, blocker: 0, review: 0, warning: 0 },
    action_items: actions?.items || [],
    runs: {
      running: Number(runCounts?.running || 0),
      failed: Number(runCounts?.failed || 0),
      recent: recentRuns.map((run) => ({ ...run, created_at: run.created_at.toISOString() })),
    },
    outcomes: {
      drafts: Number(outcomes?.drafts || 0),
      published: Number(outcomes?.published || 0),
      cms_drafts: Number(cmsDrafts?.count || 0),
      cost: Number(cost?.total || 0),
      window_days: 30,
    },
    search_growth: {
      connected: Boolean(searchGrowth.integration),
      segments: searchGrowth.segments,
      totals: searchGrowth.totals,
      opportunity_scope: searchGrowth.opportunity_scope,
      provenance: searchGrowth.provenance,
    },
    recent_outputs: recentOutputs.map((post) => ({ ...post, updated_at: post.updated_at.toISOString() })),
    connections: {
      active: Number(oauthConnections?.count || 0) + Number(personalConnections?.count || 0),
      cms: {
        total: cmsConnections.length,
        connected: cmsConnections.filter((connection) => connection.status === "connected" && encryptedCredentialStatus(connection.credentialsEncrypted) === "usable").length,
        attention: cmsConnections.filter((connection) => connection.status !== "connected" || encryptedCredentialStatus(connection.credentialsEncrypted) !== "usable").length,
      },
      search_console: { connected: Boolean(searchGrowth.integration) },
    },
    activity,
  };
}

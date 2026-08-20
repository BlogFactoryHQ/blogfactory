import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { postRevisions, posts } from "../db/schema.js";

export const EDITORIAL_STATES = ["draft", "in_review", "approved", "changes_requested"] as const;
export type EditorialState = typeof EDITORIAL_STATES[number];
export type PostRevisionSource = "save" | "mcp" | "restore" | "publish_metadata" | "image" | "system";

export interface PostRevisionSnapshot {
  title: string;
  content: string;
  summary: string | null;
  cover_image_url: string | null;
  inline_images: string[] | null;
  publishing_metadata: unknown;
}

export class PostVersionConflictError extends Error {
  constructor() {
    super("The post changed after it was read");
    this.name = "PostVersionConflictError";
  }
}

export class PostNotEditableError extends Error {
  constructor() {
    super("Only BlogFactory drafts can be edited");
    this.name = "PostNotEditableError";
  }
}

export class PostRevisionNotFoundError extends Error {
  constructor(message = "Post revision not found") {
    super(message);
    this.name = "PostRevisionNotFoundError";
  }
}

function snapshotFromPost(post: typeof posts.$inferSelect): PostRevisionSnapshot {
  return {
    title: post.title,
    content: post.content,
    summary: post.summary,
    cover_image_url: post.coverImageUrl,
    inline_images: post.inlineImages,
    publishing_metadata: post.publishingMetadata,
  };
}

export function postRevisionSnapshot(value: unknown): PostRevisionSnapshot {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    title: typeof input.title === "string" ? input.title : "",
    content: typeof input.content === "string" ? input.content : "",
    summary: typeof input.summary === "string" ? input.summary : null,
    cover_image_url: typeof input.cover_image_url === "string" ? input.cover_image_url : null,
    inline_images: Array.isArray(input.inline_images) ? input.inline_images.filter((item): item is string => typeof item === "string") : null,
    publishing_metadata: input.publishing_metadata ?? null,
  };
}

export function serializePostRevision(row: typeof postRevisions.$inferSelect) {
  return {
    id: row.id,
    post_id: row.postId,
    revision_number: row.revisionNumber,
    source: row.source,
    snapshot: postRevisionSnapshot(row.snapshot),
    created_at: row.createdAt,
  };
}

export async function currentPostRevision(userId: string, postId: string) {
  const [revision] = await db.select().from(postRevisions).where(and(
    eq(postRevisions.userId, userId),
    eq(postRevisions.postId, postId),
  )).orderBy(desc(postRevisions.revisionNumber)).limit(1);
  return revision || null;
}

export async function listPostRevisions(userId: string, postId: string, limit = 50) {
  const [owned] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
  if (!owned) throw new PostRevisionNotFoundError("Post not found");
  return db.select().from(postRevisions).where(and(
    eq(postRevisions.userId, userId),
    eq(postRevisions.postId, postId),
  )).orderBy(desc(postRevisions.revisionNumber)).limit(Math.min(Math.max(limit, 1), 100));
}

type RevisionChanges = Partial<Pick<typeof posts.$inferInsert,
  "title" | "content" | "summary" | "coverImageUrl" | "inlineImages" | "publishingMetadata"
>>;

export async function updatePostWithRevision(input: {
  userId: string;
  postId: string;
  expectedUpdatedAt: Date;
  source: PostRevisionSource;
  changes: RevisionChanges;
  requireDraft?: boolean;
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(posts).where(and(
      eq(posts.id, input.postId),
      eq(posts.userId, input.userId),
    )).for("update").limit(1);
    if (!current) throw new PostRevisionNotFoundError("Post not found");
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new PostVersionConflictError();
    if (input.requireDraft && current.status !== "draft") throw new PostNotEditableError();

    const next = { ...current, ...input.changes };
    if (JSON.stringify(snapshotFromPost(current)) === JSON.stringify(snapshotFromPost(next))) {
      const [revision] = await tx.select().from(postRevisions).where(and(
        eq(postRevisions.userId, input.userId),
        eq(postRevisions.postId, input.postId),
      )).orderBy(desc(postRevisions.revisionNumber)).limit(1);
      return { post: current, revision, changed: false };
    }

    await tx.execute(sql`select set_config('blogfactory.revision_source', ${input.source}, true)`);
    const [updated] = await tx.update(posts).set(input.changes).where(and(
      eq(posts.id, input.postId),
      eq(posts.userId, input.userId),
      eq(posts.updatedAt, input.expectedUpdatedAt),
    )).returning();
    if (!updated) throw new PostVersionConflictError();
    const [revision] = await tx.select().from(postRevisions).where(and(
      eq(postRevisions.userId, input.userId),
      eq(postRevisions.postId, input.postId),
    )).orderBy(desc(postRevisions.revisionNumber)).limit(1);
    return { post: updated, revision, changed: true };
  });
}

export async function restorePostRevision(input: {
  userId: string;
  postId: string;
  revisionId: string;
  expectedUpdatedAt: Date;
}) {
  const [target] = await db.select().from(postRevisions).where(and(
    eq(postRevisions.id, input.revisionId),
    eq(postRevisions.postId, input.postId),
    eq(postRevisions.userId, input.userId),
  )).limit(1);
  if (!target) throw new PostRevisionNotFoundError();
  const snapshot = postRevisionSnapshot(target.snapshot);
  return updatePostWithRevision({
    userId: input.userId,
    postId: input.postId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    source: "restore",
    changes: {
      title: snapshot.title,
      content: snapshot.content,
      summary: snapshot.summary,
      coverImageUrl: snapshot.cover_image_url,
      inlineImages: snapshot.inline_images,
      publishingMetadata: snapshot.publishing_metadata,
    },
  });
}

export async function setPostEditorialState(input: {
  userId: string;
  postId: string;
  state: EditorialState;
  expectedRevisionId: string;
}) {
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(and(
      eq(posts.id, input.postId),
      eq(posts.userId, input.userId),
    )).for("update").limit(1);
    if (!post) throw new PostRevisionNotFoundError("Post not found");
    const [revision] = await tx.select().from(postRevisions).where(and(
      eq(postRevisions.postId, input.postId),
      eq(postRevisions.userId, input.userId),
    )).orderBy(desc(postRevisions.revisionNumber)).limit(1);
    if (!revision || revision.id !== input.expectedRevisionId) throw new PostVersionConflictError();
    const [updated] = await tx.update(posts).set({
      editorialState: input.state,
      ...(input.state === "approved" ? { approvedRevisionId: revision.id } : {}),
    }).where(and(eq(posts.id, input.postId), eq(posts.userId, input.userId))).returning();
    return { post: updated, revision };
  });
}

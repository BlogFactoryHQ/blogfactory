import assert from "node:assert/strict";
import { classifyDraftAction, cmsConnectionReady, filterActionItems, generationReadiness, revisionChangeSummary } from "./control-plane.js";
import { seoSourceHash } from "./seo-metadata.js";

const title = "A useful article title";
const content = "This article explains a useful topic with enough detail for a reader.";
const seoMetadata = {
  version: 1,
  status: "ready",
  sourceHash: seoSourceHash(title, content),
  slug: "useful-article-topic-guide",
  metaTitle: "A Useful Article Topic Guide for Modern Editorial Teams",
  metaDescription: "Learn how modern editorial teams can use a clear article workflow to review content, resolve delivery blockers, and prepare reliable CMS drafts.",
  primaryQuery: "useful article topic",
  searchIntent: "informational",
  language: "en",
  provenance: { slug: "ai", metaTitle: "ai", metaDescription: "ai", primaryQuery: "ai", searchIntent: "ai", language: "ai" },
  manualReviewRequired: false,
  modelId: "test/model",
  generatedAt: "2026-08-22T00:00:00.000Z",
  validationErrors: [],
  error: null,
};
const base = {
  id: "00000000-0000-4000-8000-000000000001",
  siteId: "00000000-0000-4000-8000-000000000002",
  title,
  content,
  summary: null,
  sourceType: "raw_text",
  seoMetadata,
  editorialState: "draft",
  approvedRevisionId: null,
  coverImageUrl: "cover.webp",
  publishingMetadata: { tags: ["test"] },
  preferredIntegrationId: "00000000-0000-4000-8000-000000000003",
  integrationSiteId: "00000000-0000-4000-8000-000000000002",
  integrationStatus: "connected",
  integrationCredentialStatus: "usable" as const,
  usableDestinationCount: 1,
  updatedAt: new Date("2026-08-21T00:00:00.000Z"),
  revision: { id: "00000000-0000-4000-8000-000000000004", revisionNumber: 2 },
  now: new Date("2026-08-22T00:00:00.000Z"),
};

assert.equal(classifyDraftAction(base), null);
assert.equal(classifyDraftAction({ ...base, revision: null })?.kind, "missing_revision");
assert.equal(classifyDraftAction({ ...base, seoMetadata: null })?.kind, "seo_not_ready");
assert.equal(classifyDraftAction({ ...base, preferredIntegrationId: null, integrationSiteId: null, integrationStatus: null, integrationCredentialStatus: "missing", usableDestinationCount: 0 })?.kind, "destination_not_ready");
assert.equal(classifyDraftAction({ ...base, editorialState: "changes_requested" })?.kind, "changes_requested");
assert.equal(classifyDraftAction({ ...base, editorialState: "in_review" })?.kind, "in_review");
assert.equal(classifyDraftAction({ ...base, editorialState: "approved", approvedRevisionId: "00000000-0000-4000-8000-000000000099" })?.kind, "stale_approval");
assert.equal(classifyDraftAction({ ...base, coverImageUrl: null })?.kind, "missing_cover");
assert.equal(classifyDraftAction({ ...base, publishingMetadata: null })?.kind, "publishing_metadata_missing");
assert.equal(classifyDraftAction({ ...base, updatedAt: new Date("2026-08-01T00:00:00.000Z") })?.kind, "stale_draft");
assert.equal(classifyDraftAction({ ...base, seoMetadata: null, editorialState: "changes_requested", coverImageUrl: null })?.severity, "blocker");
const mixed = classifyDraftAction({ ...base, seoMetadata: null, coverImageUrl: null })!;
assert.equal(filterActionItems([mixed], "warning").length, 0);
assert.equal(filterActionItems([mixed], "blocker")[0]?.severity, "blocker");
assert.equal(filterActionItems([mixed], undefined, "missing_cover")[0]?.severity, "warning");

assert.deepEqual(generationReadiness("missing"), { ready: false, credential_status: "missing" });
assert.deepEqual(generationReadiness("usable"), { ready: true, credential_status: "usable" });
assert.deepEqual(generationReadiness("undecryptable"), { ready: false, credential_status: "undecryptable" });
assert.equal(cmsConnectionReady({ status: "connected", lastTestedAt: new Date() }, "usable"), true);
assert.equal(cmsConnectionReady({ status: "connected", lastTestedAt: null }, "usable"), false);
assert.equal(cmsConnectionReady({ status: "connected", lastTestedAt: new Date() }, "undecryptable"), false);

assert.deepEqual(revisionChangeSummary(
  { title: "New", content: "one two three", summary: null, cover_image_url: null, inline_images: null, publishing_metadata: null },
  { title: "Old", content: "one two", summary: null, cover_image_url: null, inline_images: null, publishing_metadata: null },
), { changed_fields: ["title", "content"], word_delta: 1 });

console.log("control plane classification self-check passed");

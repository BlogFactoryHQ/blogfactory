// Per-post helpers on saved drafts: social/newsletter repurposing and SERP term coverage.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaignItems, postPublications, posts } from "../db/schema.js";
import { plainMarkdownText } from "./content-analysis.js";
import { getSerpTerms, serpProviderConfigured } from "./keyword-research.js";
import { ownedSiteRow } from "./product-seo.js";
import { buildRepurposed } from "./repurpose.js";
import { termCoverage } from "./term-coverage.js";

async function ownPost(userId: string, postId: string) {
  const [post] = await db.select({ id: posts.id, siteId: posts.siteId, title: posts.title, content: posts.content, campaignItemId: posts.campaignItemId })
    .from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
  return post || null;
}

export async function postRepurpose(userId: string, postId: string) {
  const post = await ownPost(userId, postId);
  if (!post) return null;
  const [publication] = await db.select({ url: postPublications.externalUrl }).from(postPublications)
    .where(and(eq(postPublications.userId, userId), eq(postPublications.postId, post.id), eq(postPublications.status, "published"), isNotNull(postPublications.externalUrl)))
    .orderBy(desc(postPublications.updatedAt)).limit(1);
  return { ...buildRepurposed({ title: post.title, markdown: post.content, url: publication?.url }), publishedUrl: publication?.url ?? null };
}

export async function postTermCoverage(userId: string, postId: string, keyword?: string) {
  const post = await ownPost(userId, postId);
  if (!post) return null;
  let term = keyword?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  if (!term && post.campaignItemId) {
    const [item] = await db.select({ keyword: campaignItems.keyword }).from(campaignItems)
      .where(and(eq(campaignItems.id, post.campaignItemId), eq(campaignItems.userId, userId))).limit(1);
    term = item?.keyword?.trim().toLowerCase() || "";
  }
  if (!term) return { available: false as const, reason: "Add a target keyword: create the draft from a plan item or pass one." };
  if (!serpProviderConfigured()) return { available: false as const, reason: "Set BRAVE_SEARCH_API_KEY to compare with the top results." };
  const site = post.siteId ? await ownedSiteRow(userId, post.siteId) : null;
  const language = (site?.language || "en").slice(0, 2).toLowerCase();
  const terms = await getSerpTerms(term, language);
  if (!terms.length) return { available: false as const, reason: "Too few top results could be read to find shared terms." };
  return { available: true as const, keyword: term, ...termCoverage(plainMarkdownText(post.content), terms) };
}

import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaigns, feeds, generationLogs, jobs, posts, sites } from "../db/schema.js";
import { getOpenRouterKey } from "./api-keys.js";
import { getEffectiveSettings } from "./user-settings.js";

export const SEO_MODEL_ID = "openai/gpt-4.1-mini";

export const SEO_LIMITS = {
  slugMin: 20,
  slugMax: 70,
  titleMin: 45,
  titleMax: 60,
  descriptionMin: 120,
  descriptionMax: 145,
} as const;

export type SeoStatus = "missing" | "pending" | "ready" | "needs_review" | "failed";
export type SeoFieldSource = "ai" | "manual";

export interface SeoMetadataV1 {
  version: 1;
  status: Exclude<SeoStatus, "missing">;
  sourceHash: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryQuery: string;
  searchIntent: string;
  language: string;
  provenance: {
    slug: SeoFieldSource;
    metaTitle: SeoFieldSource;
    metaDescription: SeoFieldSource;
    primaryQuery: SeoFieldSource;
    searchIntent: SeoFieldSource;
    language: SeoFieldSource;
  };
  manualReviewRequired: boolean;
  modelId: string | null;
  generatedAt: string | null;
  validationErrors: string[];
  error: string | null;
}

type SeoCandidate = Pick<SeoMetadataV1, "slug" | "metaTitle" | "metaDescription" | "primaryQuery" | "searchIntent" | "language">;

const emptyProvenance = (): SeoMetadataV1["provenance"] => ({
  slug: "ai",
  metaTitle: "ai",
  metaDescription: "ai",
  primaryQuery: "ai",
  searchIntent: "ai",
  language: "ai",
});

const SEO_MODEL_TIMEOUT_MS = 25_000;

export const SEO_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "seo_metadata",
    strict: true,
    schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          minLength: SEO_LIMITS.slugMin,
          maxLength: SEO_LIMITS.slugMax,
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+){2,}$",
        },
        metaTitle: { type: "string", minLength: 48, maxLength: 56 },
        metaDescription: { type: "string", minLength: 125, maxLength: 138 },
        primaryQuery: { type: "string", minLength: 1 },
        searchIntent: { type: "string", enum: ["informational", "navigational", "commercial", "transactional"] },
        language: { type: "string", minLength: 2 },
      },
      required: ["slug", "metaTitle", "metaDescription", "primaryQuery", "searchIntent", "language"],
      additionalProperties: false,
    },
  },
} as const;

export function seoSourceHash(title: string, content: string) {
  return createHash("sha256").update(`${title.trim()}\n${content.replace(/\s+/g, " ").trim()}`).digest("hex");
}

function transliterate(value: string) {
  const map: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", I: "I", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
  return value.replace(/[çÇğĞıİöÖşŞüÜ]/g, (character) => map[character] || character);
}

export function normalizeSeoSlug(value: string) {
  return transliterate(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function cleanLine(value: unknown) {
  return String(value || "").replace(/^[#*`\-\s]+|[`\s]+$/g, "").replace(/\s+/g, " ").trim();
}

function endsWithSentence(value: string) {
  return /[.!?…]["'”’)}\]]*$/.test(value.trim());
}

export function normalizeAiSeoCandidate(candidate: SeoCandidate): SeoCandidate {
  if (endsWithSentence(candidate.metaDescription)) return candidate;
  return {
    ...candidate,
    metaDescription: `${candidate.metaDescription.replace(/[,;:–—-]+$/u, "").trim()}.`,
  };
}

function hasDanglingEnding(value: string) {
  return /(?:[:|/–—-]|(?:^|\s)(?:and|or|with|for|ve|veya|ile|için|icin|yeni|new|und|oder|mit|für|et|ou|avec|pour|y|o|con|para))$/iu.test(value.trim());
}

function repeatedPhrase(value: string) {
  const words = value.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const phrases = words.slice(0, -3).map((_, index) => words.slice(index, index + 4).join(" "));
  return new Set(phrases).size !== phrases.length;
}

export function validateSeoMetadata(candidate: SeoCandidate, allowShortDescription = false) {
  const errors: string[] = [];
  if (candidate.slug.length < SEO_LIMITS.slugMin || candidate.slug.length > SEO_LIMITS.slugMax) errors.push(`Slug ${SEO_LIMITS.slugMin}-${SEO_LIMITS.slugMax} characters.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.slug) || candidate.slug === "article") errors.push("Slug must contain meaningful lowercase ASCII words separated by hyphens.");
  if (candidate.slug.split("-").filter(Boolean).length < 3) errors.push("Slug must contain at least three meaningful words.");
  if (candidate.metaTitle.length < SEO_LIMITS.titleMin || candidate.metaTitle.length > SEO_LIMITS.titleMax) errors.push(`Meta title is ${candidate.metaTitle.length} characters; required ${SEO_LIMITS.titleMin}-${SEO_LIMITS.titleMax}.`);
  if (hasDanglingEnding(candidate.metaTitle)) errors.push("Meta title has a dangling ending.");
  if (!candidate.metaDescription) errors.push("Meta description is required.");
  else if ((!allowShortDescription && candidate.metaDescription.length < SEO_LIMITS.descriptionMin) || candidate.metaDescription.length > SEO_LIMITS.descriptionMax) errors.push(`Meta description is ${candidate.metaDescription.length} characters; required ${allowShortDescription ? `1-${SEO_LIMITS.descriptionMax}` : `${SEO_LIMITS.descriptionMin}-${SEO_LIMITS.descriptionMax}`}.`);
  if (hasDanglingEnding(candidate.metaDescription)) errors.push("Meta description has a dangling ending.");
  if (repeatedPhrase(candidate.metaDescription)) errors.push("Meta description repeats a phrase.");
  const title = candidate.metaTitle.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const description = candidate.metaDescription.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (title.length > 20 && description.split(title).length > 2) errors.push("Meta description repeats the meta title.");
  if (!candidate.primaryQuery.trim()) errors.push("Primary query is required.");
  if (!["informational", "navigational", "commercial", "transactional"].includes(candidate.searchIntent.trim().toLowerCase())) errors.push("Search intent must use the supported vocabulary.");
  if (!candidate.language.trim()) errors.push("Language is required.");
  return errors;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  tr: "tr", turkish: "tr", "türkçe": "tr",
  en: "en", english: "en", "us english": "en", "uk english": "en",
  de: "de", german: "de", deutsch: "de",
  fr: "fr", french: "fr", français: "fr", francais: "fr",
  es: "es", spanish: "es", español: "es", espanol: "es",
  it: "it", italian: "it", italiano: "it",
  pt: "pt", portuguese: "pt", português: "pt", portugues: "pt",
  nl: "nl", dutch: "nl", nederlands: "nl",
};

const LANGUAGE_MARKERS: Record<string, Set<string>> = {
  tr: new Set(["ve", "bir", "bu", "için", "ile", "olarak", "daha", "gibi", "olan", "sonra", "neden", "nasıl", "yeni", "etkisi"]),
  en: new Set(["the", "and", "with", "for", "from", "into", "this", "that", "how", "why", "new", "after", "explains"]),
  de: new Set(["und", "der", "die", "das", "mit", "für", "von", "wie", "warum", "eine", "einer", "nach"]),
  fr: new Set(["et", "le", "la", "les", "avec", "pour", "des", "une", "comment", "pourquoi", "après"]),
  es: new Set(["y", "el", "la", "los", "las", "con", "para", "una", "cómo", "por", "después"]),
};

function languageCode(value: string) {
  return LANGUAGE_ALIASES[value.trim().toLocaleLowerCase("tr-TR")] || value.trim().toLowerCase();
}

function detectedLanguage(value: string) {
  const words = value.toLocaleLowerCase("tr-TR").match(/\p{L}+/gu) || [];
  const scores = Object.entries(LANGUAGE_MARKERS).map(([code, markers]) => ({ code, score: words.reduce((sum, word) => sum + (markers.has(word) ? 1 : 0), 0) }));
  const specials: Array<[string, RegExp]> = [["tr", /[çğıöşüİÇĞÖŞÜ]/], ["de", /[äÄß]/], ["fr", /[àâéèêëîïôùûÿœæ]/i], ["es", /[áíóúñ¿¡]/i]];
  for (const [code, pattern] of specials) {
    if (pattern.test(value)) scores.find((score) => score.code === code)!.score += 3;
  }
  scores.sort((left, right) => right.score - left.score);
  return scores[0]?.score >= 3 && scores[0].score > (scores[1]?.score || 0) ? scores[0].code : "";
}

function normalizedWords(value: string) {
  return value.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function validateSeoForArticle(candidate: SeoCandidate, article: string, expectedLanguage = "", articleTitle = "", allowShortDescription = false) {
  const errors = validateSeoMetadata(candidate, allowShortDescription);
  const articleLanguage = detectedLanguage(article);
  const metadataLanguage = detectedLanguage(`${candidate.metaTitle} ${candidate.metaDescription}`);
  const declaredLanguage = languageCode(candidate.language);
  const requiredLanguage = languageCode(expectedLanguage) || articleLanguage;
  if (requiredLanguage && declaredLanguage !== requiredLanguage) errors.push("SEO metadata declared language does not match the requested article language.");
  if (articleLanguage && metadataLanguage && articleLanguage !== metadataLanguage) errors.push("SEO metadata text does not match the article language.");
  if (requiredLanguage && metadataLanguage && requiredLanguage !== metadataLanguage) errors.push("SEO metadata text does not match the requested language.");
  const normalizedTitle = normalizedWords(articleTitle);
  if (normalizedTitle && normalizedWords(candidate.metaTitle) === normalizedTitle) errors.push("Meta title must not copy the article title exactly.");
  if (normalizedTitle.length > 20 && normalizedWords(candidate.metaDescription).startsWith(normalizedTitle)) errors.push("Meta description must not begin by copying the article title.");
  return errors;
}

export function parseSeoCandidate(value: unknown): SeoCandidate {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    slug: normalizeSeoSlug(cleanLine(record.slug)),
    metaTitle: cleanLine(record.metaTitle ?? record.meta_title),
    metaDescription: cleanLine(record.metaDescription ?? record.meta_description),
    primaryQuery: cleanLine(record.primaryQuery ?? record.primary_query),
    searchIntent: cleanLine(record.searchIntent ?? record.search_intent),
    language: cleanLine(record.language),
  };
}

export function seoMetadata(value: unknown): SeoMetadataV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !["pending", "ready", "needs_review", "failed"].includes(String(record.status))) return null;
  const candidate = parseSeoCandidate(record);
  const provenance = record.provenance && typeof record.provenance === "object" ? record.provenance as Record<string, unknown> : {};
  return {
    version: 1,
    status: record.status as SeoMetadataV1["status"],
    sourceHash: String(record.sourceHash || ""),
    ...candidate,
    provenance: {
      slug: provenance.slug === "manual" ? "manual" : "ai",
      metaTitle: provenance.metaTitle === "manual" ? "manual" : "ai",
      metaDescription: provenance.metaDescription === "manual" ? "manual" : "ai",
      primaryQuery: provenance.primaryQuery === "manual" ? "manual" : "ai",
      searchIntent: provenance.searchIntent === "manual" ? "manual" : "ai",
      language: provenance.language === "manual" ? "manual" : "ai",
    },
    manualReviewRequired: Boolean(record.manualReviewRequired),
    modelId: typeof record.modelId === "string" ? record.modelId : null,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : null,
    validationErrors: Array.isArray(record.validationErrors) ? record.validationErrors.filter((item): item is string => typeof item === "string") : [],
    error: typeof record.error === "string" ? record.error : null,
  };
}

export function readySeoMetadataForArticle(value: unknown, title: string, content: string) {
  const metadata = seoMetadata(value);
  if (!metadata || metadata.status !== "ready") return null;
  if (metadata.sourceHash !== seoSourceHash(title, content)) return null;
  return validateSeoForArticle(metadata, `${title} ${content}`, "", title, metadata.provenance.metaDescription === "manual").length ? null : metadata;
}

export function seoStatusForArticle(value: unknown, title: string, content: string): SeoStatus {
  const metadata = seoMetadata(value);
  if (!metadata) return "missing";
  return metadata.status === "ready" && !readySeoMetadataForArticle(metadata, title, content)
    ? "needs_review"
    : metadata.status;
}

export function duplicateSeoSlugs(entries: Array<{ id: string; slug: string }>) {
  const owners = new Map<string, string>();
  const conflicts: string[] = [];
  for (const entry of entries) {
    const owner = owners.get(entry.slug);
    if (owner) conflicts.push(owner, entry.id);
    else owners.set(entry.slug, entry.id);
  }
  return [...new Set(conflicts)];
}

function jsonFromModel(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return a JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function articleText(markdown: string) {
  return markdown.replace(/!\[[^\]]*]\([^)]+\)/g, " ").replace(/\[([^\]]+)]\([^)]+\)/g, "$1").replace(/[#>*_`~-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 20_000);
}

type CandidateResponse = {
  candidate: SeoCandidate;
  usage: Record<string, unknown>;
  cost: number;
  responseData: Record<string, unknown>;
  latencyMs: number;
};

type CandidateRequester = (apiKey: string, modelId: string, prompt: string) => Promise<CandidateResponse>;

export class SeoGenerationAttemptError extends Error {
  constructor(
    message: string,
    readonly usage: Record<string, unknown> = {},
    readonly cost = 0,
    readonly latencyMs = 0,
    readonly responseData: Record<string, unknown> = {},
    readonly rawOutput = "",
  ) {
    super(message);
    this.name = "SeoGenerationAttemptError";
  }
}

function combineUsage(...values: Record<string, unknown>[]) {
  return {
    prompt_tokens: values.reduce((sum, value) => sum + Number(value.prompt_tokens || 0), 0),
    completion_tokens: values.reduce((sum, value) => sum + Number(value.completion_tokens || 0), 0),
    total_tokens: values.reduce((sum, value) => sum + Number(value.total_tokens || 0), 0),
  };
}

async function requestCandidate(apiKey: string, modelId: string, prompt: string): Promise<CandidateResponse> {
  const startedAt = Date.now();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(SEO_MODEL_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: "You are a rigorous multilingual SEO editor. Return only one valid JSON object and never copy or truncate the article opening." },
        { role: "user", content: prompt },
      ],
      response_format: SEO_RESPONSE_FORMAT,
      provider: { require_parameters: true },
      max_tokens: 900,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(`SEO metadata generation failed (${response.status}): ${body?.error?.message || response.statusText}`);
  }
  const payload = await response.json() as any;
  const usage = payload.usage || {};
  const cost = Number(payload.usage?.cost || payload.usage?.total_cost || 0) || 0;
  const responseData = { id: payload.id, model: payload.model };
  const latencyMs = Date.now() - startedAt;
  const rawOutput = String(payload.choices?.[0]?.message?.content || "");
  let candidate: SeoCandidate;
  try {
    candidate = normalizeAiSeoCandidate(parseSeoCandidate(jsonFromModel(rawOutput)));
  } catch (error) {
    throw new SeoGenerationAttemptError(
      error instanceof Error ? error.message : "AI returned invalid JSON",
      usage,
      cost,
      latencyMs,
      responseData,
      rawOutput,
    );
  }
  return {
    candidate,
    usage,
    cost,
    responseData,
    latencyMs,
  };
}

type SeoGenerationInput = {
  apiKey: string;
  modelId: string;
  title: string;
  content: string;
  sourceRef: string;
  keywords: string[];
  siteName: string;
  siteContext: string;
  requestedLanguage: string;
  requestedIntent?: string;
};

function generationPrompt(input: SeoGenerationInput) {
  return `Create an independent SEO metadata package for the finished article below.
Infer the real primary search query and intent unless supplied. When a keyword is supplied, return it unchanged as primaryQuery. Match the article language.
Hard rules: slug ${SEO_LIMITS.slugMin}-${SEO_LIMITS.slugMax} lowercase ASCII characters; target metaTitle 48-56 characters; target metaDescription 125-138 characters and one complete sentence. Count every character, including spaces and punctuation, before returning. Do not concatenate or repeat the H1. Do not cut a sentence.
Return exactly: {"slug":"...","metaTitle":"...","metaDescription":"...","primaryQuery":"...","searchIntent":"informational|navigational|commercial|transactional","language":"..."}

Site: ${input.siteName || "Unknown"}
Site and brand context: ${input.siteContext || "None"}
Requested language: ${input.requestedLanguage || "Infer from the article"}
Provided keywords: ${input.keywords.join(", ") || "None; infer one"}
Provided search intent: ${input.requestedIntent || "None; infer it"}
Source: ${input.sourceRef || "None"}
Article title: ${input.title}
Article: ${articleText(input.content)}`;
}

function generationErrors(input: SeoGenerationInput, candidate: SeoCandidate) {
  const errors = validateSeoForArticle(candidate, `${input.title} ${input.content}`, input.requestedLanguage, input.title);
  const primaryKeyword = input.keywords.find((value) => value.trim());
  if (primaryKeyword && normalizedWords(candidate.primaryQuery) !== normalizedWords(primaryKeyword)) {
    errors.push("Primary query must exactly match the supplied primary keyword.");
  }
  const requestedIntent = input.requestedIntent?.trim().toLowerCase() || "";
  if (["informational", "navigational", "commercial", "transactional"].includes(requestedIntent) && candidate.searchIntent.toLowerCase() !== requestedIntent) {
    errors.push("Search intent must match the supplied supported intent.");
  }
  return errors;
}

function repairPrompt(input: SeoGenerationInput, previousOutput: string, errors: string[]) {
  let lengths = "The previous object could not be parsed.";
  try {
    const previous = parseSeoCandidate(jsonFromModel(previousOutput));
    lengths = `Previous lengths: slug ${previous.slug.length}, metaTitle ${previous.metaTitle.length}, metaDescription ${previous.metaDescription.length}.`;
  } catch {
    // The parse error is already included below.
  }
  return `Repair this SEO metadata JSON so every listed error is resolved. Preserve its meaning and return only the corrected object.
Errors:
- ${errors.join("\n- ")}
${lengths}
Rewrite invalid text as a complete phrase or sentence; never truncate it. Target 50-54 characters for metaTitle and 128-135 characters for metaDescription. Count spaces and punctuation before returning.
Previous object: ${previousOutput}
Article title: ${input.title}
Requested language: ${input.requestedLanguage || "Infer from the article"}
Provided keywords: ${input.keywords.join(", ") || "None; infer one"}
Provided search intent: ${input.requestedIntent || "None; infer it"}`;
}

export async function generateValidatedCandidate(input: SeoGenerationInput, requester: CandidateRequester = requestCandidate) {
  let first: CandidateResponse | null = null;
  let firstError: SeoGenerationAttemptError | null = null;
  let errors: string[];
  try {
    first = await requester(input.apiKey, input.modelId, generationPrompt(input));
    errors = generationErrors(input, first.candidate);
    if (!errors.length) return { ...first, attempts: 1 };
  } catch (error) {
    if (!(error instanceof SeoGenerationAttemptError)) throw error;
    firstError = error;
    errors = [`JSON parse error: ${error.message}`];
  }

  const firstUsage = first?.usage || firstError?.usage || {};
  const firstCost = first?.cost || firstError?.cost || 0;
  const firstLatency = first?.latencyMs || firstError?.latencyMs || 0;
  const previousOutput = first ? JSON.stringify(first.candidate) : firstError?.rawOutput || "No parseable JSON";
  let repaired: CandidateResponse;
  try {
    repaired = await requester(input.apiKey, input.modelId, repairPrompt(input, previousOutput, errors));
  } catch (error) {
    const repairError = error instanceof SeoGenerationAttemptError
      ? error
      : new SeoGenerationAttemptError(error instanceof Error ? error.message : "SEO metadata repair failed");
    throw new SeoGenerationAttemptError(
      `SEO metadata repair failed: ${repairError.message}`,
      combineUsage(firstUsage, repairError.usage),
      firstCost + repairError.cost,
      firstLatency + repairError.latencyMs,
      repairError.responseData,
      repairError.rawOutput,
    );
  }
  errors = generationErrors(input, repaired.candidate);
  if (errors.length) throw new SeoGenerationAttemptError(
    `SEO metadata remained invalid after repair: ${errors.join(" ")}`,
    combineUsage(firstUsage, repaired.usage),
    firstCost + repaired.cost,
    firstLatency + repaired.latencyMs,
    repaired.responseData,
  );
  return {
    ...repaired,
    attempts: 2,
    usage: combineUsage(firstUsage, repaired.usage),
    cost: firstCost + repaired.cost,
    latencyMs: firstLatency + repaired.latencyMs,
  };
}

export async function enqueueSeoMetadata(input: { userId: string; postId: string; trigger: string; overwriteManual?: boolean }) {
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(and(eq(posts.id, input.postId), eq(posts.userId, input.userId))).limit(1).for("update");
    if (!post) throw new Error("Post not found");
    const sourceHash = seoSourceHash(post.title, post.content);
    const current = seoMetadata(post.seoMetadata);
    if (current?.status === "ready" && current.sourceHash === sourceHash && !input.overwriteManual) return { queued: false, status: "ready" as const, jobId: null };
    const next: SeoMetadataV1 = {
      version: 1,
      status: "pending",
      sourceHash,
      slug: current?.slug || "",
      metaTitle: current?.metaTitle || "",
      metaDescription: current?.metaDescription || "",
      primaryQuery: current?.primaryQuery || "",
      searchIntent: current?.searchIntent || "",
      language: current?.language || "",
      provenance: input.overwriteManual ? emptyProvenance() : current?.provenance || emptyProvenance(),
      manualReviewRequired: !input.overwriteManual && Boolean(current && Object.values(current.provenance).includes("manual")),
      modelId: null,
      generatedAt: null,
      validationErrors: [],
      error: null,
    };
    const sourceValue = `${post.id}:${sourceHash}`;
    await tx.update(posts).set({ seoMetadata: next }).where(and(eq(posts.id, post.id), eq(posts.userId, input.userId)));
    const [job] = await tx.insert(jobs).values({
      userId: input.userId,
      siteId: post.siteId,
      feedId: post.feedId,
      preferredIntegrationId: post.preferredIntegrationId,
      sourceType: "seo_metadata",
      sourceValue,
      modelId: SEO_MODEL_ID,
      personaId: post.personaId,
      campaignId: post.campaignId,
      campaignItemId: post.campaignItemId,
      status: "pending",
      currentStep: "queued",
      resultPostIds: [post.id],
      generationPlan: { kind: "seo_metadata", postId: post.id, sourceHash, trigger: input.trigger, overwriteManual: Boolean(input.overwriteManual) },
    }).onConflictDoNothing().returning();
    if (job) return { queued: true, status: "pending" as const, jobId: job.id };
    const [existing] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, input.userId), eq(jobs.sourceType, "seo_metadata"), eq(jobs.sourceValue, sourceValue), inArray(jobs.status, ["pending", "running"]))).limit(1);
    return { queued: false, status: "pending" as const, jobId: existing?.id || null };
  });
}

export async function enqueueUntrackedDraftSeoMetadata(limit = 100) {
  const candidates = await db.select({ id: posts.id, userId: posts.userId }).from(posts).where(and(
    eq(posts.status, "draft"),
    sql`(
      ${posts.seoMetadata} IS NULL
      OR (
        ${posts.seoMetadata}->>'status' = 'pending'
        AND NOT EXISTS (
          SELECT 1
          FROM jobs active_seo_jobs
          WHERE active_seo_jobs.user_id = ${posts.userId}
            AND active_seo_jobs.source_type = 'seo_metadata'
            AND active_seo_jobs.source_value = (${posts.id}::text || ':' || (${posts.seoMetadata}->>'sourceHash'))
            AND active_seo_jobs.status IN ('pending', 'running')
        )
      )
    )`,
  )).orderBy(desc(posts.createdAt)).limit(Math.max(1, Math.min(limit, 500)));

  const results = [];
  for (const candidate of candidates) {
    results.push(await enqueueSeoMetadata({
      userId: candidate.userId,
      postId: candidate.id,
      trigger: "automatic_backfill",
    }));
  }
  return {
    discovered: candidates.length,
    queued: results.filter((result) => result.queued).length,
    alreadyQueued: results.filter((result) => !result.queued).length,
  };
}

export async function saveManualSeoMetadata(userId: string, postId: string, value: SeoCandidate) {
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1).for("update");
    if (!post) throw new Error("Post not found");
    const candidate = parseSeoCandidate(value);
    const errors = validateSeoForArticle(candidate, `${post.title} ${post.content}`, "", post.title, true);
    if (errors.length) return { saved: false, errors };
    const metadata = mergeManualSeoMetadata(seoMetadata(post.seoMetadata), candidate, seoSourceHash(post.title, post.content));
    await tx.update(posts).set({ seoMetadata: metadata }).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
    return { saved: true, metadata, errors: [] };
  });
}

export function mergeManualSeoMetadata(current: SeoMetadataV1 | null, candidate: SeoCandidate, sourceHash: string, generatedAt = new Date().toISOString()): SeoMetadataV1 {
  const provenanceFor = (field: keyof SeoCandidate): SeoFieldSource =>
    current && current[field] === candidate[field] ? current.provenance[field] : "manual";
  return {
    version: 1,
    status: "ready",
    sourceHash,
    ...candidate,
    provenance: {
      slug: provenanceFor("slug"),
      metaTitle: provenanceFor("metaTitle"),
      metaDescription: provenanceFor("metaDescription"),
      primaryQuery: provenanceFor("primaryQuery"),
      searchIntent: provenanceFor("searchIntent"),
      language: provenanceFor("language"),
    },
    manualReviewRequired: false,
    modelId: current?.modelId || null,
    generatedAt,
    validationErrors: [],
    error: null,
  };
}

export async function confirmManualSeoMetadata(userId: string, postId: string) {
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1).for("update");
    if (!post) throw new Error("Post not found");
    const current = seoMetadata(post.seoMetadata);
    if (!current) return { saved: false, errors: ["SEO metadata is missing."] };
    if (current.status !== "needs_review" || !current.manualReviewRequired || !Object.values(current.provenance).includes("manual")) {
      return { saved: false, errors: ["Only stale manual SEO metadata can be confirmed."] };
    }
    const errors = validateSeoForArticle(current, `${post.title} ${post.content}`, "", post.title, current.provenance.metaDescription === "manual");
    if (errors.length) return { saved: false, errors };
    const metadata: SeoMetadataV1 = {
      ...current,
      status: "ready",
      sourceHash: seoSourceHash(post.title, post.content),
      manualReviewRequired: false,
      validationErrors: [],
      error: null,
    };
    await tx.update(posts).set({ seoMetadata: metadata }).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
    return { saved: true, metadata, errors: [] };
  });
}

async function processSeoJob(job: typeof jobs.$inferSelect) {
  const plan = job.generationPlan && typeof job.generationPlan === "object" ? job.generationPlan as Record<string, unknown> : {};
  const postId = String(plan.postId || job.resultPostIds?.[0] || "");
  const expectedHash = String(plan.sourceHash || "");
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, job.userId))).limit(1);
  const pendingMetadata = seoMetadata(post?.seoMetadata);
  if (!post || seoSourceHash(post.title, post.content) !== expectedHash || pendingMetadata?.sourceHash !== expectedHash || pendingMetadata.status !== "pending") {
    await db.update(jobs).set({ status: "completed", currentStep: "superseded", completedAt: new Date() }).where(eq(jobs.id, job.id));
    return { processed: true, status: "superseded" };
  }

  const apiKey = await getOpenRouterKey(job.userId);
  if (!apiKey) throw new Error("Add your OpenRouter API key before generating SEO metadata");
  const modelId = SEO_MODEL_ID;
  const [feed] = post.feedId ? await db.select({ keywords: feeds.keywords }).from(feeds).where(eq(feeds.id, post.feedId)).limit(1) : [];
  const [site] = post.siteId ? await db.select({ name: sites.name, language: sites.language, topics: sites.topics, editorialTopics: sites.editorialTopics }).from(sites).where(eq(sites.id, post.siteId)).limit(1) : [];
  const [sourceJob] = post.jobId ? await db.select({ sourceValue: jobs.sourceValue, generationPlan: jobs.generationPlan }).from(jobs).where(eq(jobs.id, post.jobId)).limit(1) : [];
  const sourcePlan = sourceJob?.generationPlan && typeof sourceJob.generationPlan === "object" ? sourceJob.generationPlan as Record<string, unknown> : {};
  const seoContext = sourcePlan.seoContext && typeof sourcePlan.seoContext === "object" && !Array.isArray(sourcePlan.seoContext)
    ? sourcePlan.seoContext as Record<string, unknown>
    : {};
  const programmaticKeywords = Array.isArray(seoContext.keywords)
    ? seoContext.keywords.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  const sourceArticles = Array.isArray(sourcePlan.articles) ? sourcePlan.articles.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const sourceArticle = sourceArticles.find((item) => String(item.url || "") === String(post.sourceRefId || "")) || sourceArticles[0];
  const sourceRef = [
    sourceArticle?.title && `Source title: ${String(sourceArticle.title)}`,
    sourceArticle?.url && `Source URL: ${String(sourceArticle.url)}`,
    post.sourceRefId && `Source reference: ${post.sourceRefId}`,
    sourceJob?.sourceValue && `Source input: ${sourceJob.sourceValue}`,
    seoContext.sourceContext && `Programmatic row: ${String(seoContext.sourceContext)}`,
  ].filter(Boolean).join("; ").slice(0, 2_000);
  const settings = await getEffectiveSettings(job.userId, post.siteId);
  const siteContext = [
    settings.brandCompanyName && `Brand: ${settings.brandCompanyName}`,
    settings.brandDescription && `Description: ${settings.brandDescription}`,
    settings.brandTargetAudience && `Audience: ${settings.brandTargetAudience}`,
    site?.topics?.length && `Topics: ${site.topics.join(", ")}`,
    site?.editorialTopics?.length && `Editorial topics: ${site.editorialTopics.join(", ")}`,
  ].filter(Boolean).join("; ");
  const result = await generateValidatedCandidate({
    apiKey, modelId, title: post.title, content: post.content, sourceRef,
    keywords: programmaticKeywords.length ? programmaticKeywords : post.sourceType === "article_keyword" && post.sourceRefId ? [post.sourceRefId] : feed?.keywords || [],
    siteName: site?.name || "",
    siteContext,
    requestedLanguage: String(seoContext.requestedLanguage || settings.articleLanguage || site?.language || ""),
    requestedIntent: String(seoContext.searchIntent || ""),
  });
  const generated = result.candidate;
  const [latest] = await db.select({ title: posts.title, content: posts.content, seoMetadata: posts.seoMetadata }).from(posts).where(and(eq(posts.id, postId), eq(posts.userId, job.userId))).limit(1);
  if (!latest || seoSourceHash(latest.title, latest.content) !== expectedHash) {
    await db.update(jobs).set({ status: "completed", currentStep: "superseded", completedAt: new Date() }).where(eq(jobs.id, job.id));
    return { processed: true, status: "superseded" };
  }
  const current = seoMetadata(latest.seoMetadata);
  const overwriteManual = Boolean(plan.overwriteManual);
  const keep = (field: keyof SeoCandidate) => !overwriteManual && current?.provenance[field] === "manual";
  const candidate: SeoCandidate = {
    slug: keep("slug") ? current!.slug : generated.slug,
    metaTitle: keep("metaTitle") ? current!.metaTitle : generated.metaTitle,
    metaDescription: keep("metaDescription") ? current!.metaDescription : generated.metaDescription,
    primaryQuery: keep("primaryQuery") ? current!.primaryQuery : generated.primaryQuery,
    searchIntent: keep("searchIntent") ? current!.searchIntent : generated.searchIntent,
    language: keep("language") ? current!.language : generated.language,
  };
  const validationErrors = validateSeoForArticle(candidate, `${latest.title} ${latest.content}`, "", latest.title, keep("metaDescription"));
  const metadata: SeoMetadataV1 = {
    version: 1,
    status: validationErrors.length || current?.manualReviewRequired ? "needs_review" : "ready",
    sourceHash: expectedHash,
    ...candidate,
    provenance: overwriteManual ? emptyProvenance() : current?.provenance || emptyProvenance(),
    manualReviewRequired: Boolean(!overwriteManual && current?.manualReviewRequired),
    modelId,
    generatedAt: new Date().toISOString(),
    validationErrors,
    error: null,
  };
  const [stored] = await db.update(posts).set({ seoMetadata: metadata }).where(and(
    eq(posts.id, postId),
    eq(posts.userId, job.userId),
    sql`${posts.seoMetadata} = ${JSON.stringify(latest.seoMetadata)}::jsonb`,
  )).returning({ id: posts.id });
  if (!stored) {
    await db.update(jobs).set({ status: "completed", currentStep: "superseded", completedAt: new Date() }).where(eq(jobs.id, job.id));
    return { processed: true, status: "superseded" };
  }
  await db.insert(generationLogs).values({
    userId: job.userId, postId, usageType: "seo_metadata", modelId, provider: modelId.split("/")[0], status: "success",
    promptTokens: Number(result.usage.prompt_tokens || 0), completionTokens: Number(result.usage.completion_tokens || 0), totalTokens: Number(result.usage.total_tokens || 0),
    cost: result.cost, latencyMs: result.latencyMs, sessionId: job.id, responseData: { ...result.responseData, attempts: result.attempts },
  });
  await db.update(jobs).set({
    status: "completed",
    currentStep: metadata.status,
    tokenCost: Number(result.usage.total_tokens || 0),
    totalCost: result.cost,
    completedAt: new Date(),
  }).where(eq(jobs.id, job.id));
  await syncCampaignCost(job.campaignId);
  return { processed: true, status: metadata.status };
}

export async function processNextSeoMetadata(userId?: string) {
  const candidates = await db.select().from(jobs).where(and(eq(jobs.sourceType, "seo_metadata"), eq(jobs.status, "pending"), ...(userId ? [eq(jobs.userId, userId)] : []))).orderBy(asc(jobs.createdAt)).limit(5);
  for (const candidate of candidates) {
    const [claimed] = await db.update(jobs).set({ status: "running", currentStep: "generating_seo_metadata", modelId: SEO_MODEL_ID, startedAt: new Date(), errorMessage: null }).where(and(eq(jobs.id, candidate.id), eq(jobs.status, "pending"))).returning();
    if (!claimed) continue;
    try {
      return await processSeoJob(claimed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SEO metadata generation failed";
      const postId = String((claimed.generationPlan as Record<string, unknown> | null)?.postId || claimed.resultPostIds?.[0] || "");
      const expectedHash = String((claimed.generationPlan as Record<string, unknown> | null)?.sourceHash || "");
      let failedStored = false;
      if (postId) {
        const [post] = await db.select({ title: posts.title, content: posts.content, seoMetadata: posts.seoMetadata }).from(posts).where(and(eq(posts.id, postId), eq(posts.userId, claimed.userId))).limit(1);
        const current = seoMetadata(post?.seoMetadata);
        if (post && current?.status === "pending" && seoSourceHash(post.title, post.content) === expectedHash) {
          const [stored] = await db.update(posts).set({ seoMetadata: { ...current, status: "failed", error: message, validationErrors: [] } }).where(and(
            eq(posts.id, postId),
            eq(posts.userId, claimed.userId),
            sql`${posts.seoMetadata} = ${JSON.stringify(post.seoMetadata)}::jsonb`,
          )).returning({ id: posts.id });
          failedStored = Boolean(stored);
        }
      }
      await db.insert(generationLogs).values({
        userId: claimed.userId,
        postId: postId || null,
        usageType: "seo_metadata",
        modelId: claimed.modelId,
        provider: claimed.modelId.split("/")[0],
        status: "failed",
        sessionId: claimed.id,
        promptTokens: error instanceof SeoGenerationAttemptError ? Number(error.usage.prompt_tokens || 0) : 0,
        completionTokens: error instanceof SeoGenerationAttemptError ? Number(error.usage.completion_tokens || 0) : 0,
        totalTokens: error instanceof SeoGenerationAttemptError ? Number(error.usage.total_tokens || 0) : 0,
        cost: error instanceof SeoGenerationAttemptError ? error.cost : 0,
        latencyMs: error instanceof SeoGenerationAttemptError ? error.latencyMs : null,
        responseData: { error: message, ...(error instanceof SeoGenerationAttemptError ? error.responseData : {}) },
      });
      const failedTokens = error instanceof SeoGenerationAttemptError ? Number(error.usage.total_tokens || 0) : 0;
      const failedCost = error instanceof SeoGenerationAttemptError ? error.cost : 0;
      await db.update(jobs).set(failedStored
        ? { status: "failed", currentStep: "failed", errorMessage: message, tokenCost: failedTokens, totalCost: failedCost, completedAt: new Date() }
        : { status: "completed", currentStep: "superseded", errorMessage: null, tokenCost: failedTokens, totalCost: failedCost, completedAt: new Date() }
      ).where(eq(jobs.id, claimed.id));
      await syncCampaignCost(claimed.campaignId);
      return { processed: true, status: failedStored ? "failed" : "superseded", error: failedStored ? message : undefined };
    }
  }
  return { processed: false };
}

async function syncCampaignCost(campaignId: string | null) {
  if (!campaignId) return;
  const [cost] = await db.select({ total: sql<number>`COALESCE(SUM(${jobs.totalCost}), 0)` }).from(jobs).where(eq(jobs.campaignId, campaignId));
  await db.update(campaigns).set({ totalCost: Number(cost?.total || 0) }).where(eq(campaigns.id, campaignId));
}

export async function recoverStalledSeoMetadataJobs(maxAgeMs = 2 * 60_000) {
  const staleBefore = new Date(Date.now() - maxAgeMs);
  const recovered = await db.update(jobs).set({ status: "pending", currentStep: "queued", startedAt: null, errorMessage: null }).where(and(
    eq(jobs.sourceType, "seo_metadata"),
    eq(jobs.status, "running"),
    lt(jobs.startedAt, staleBefore),
  )).returning({ id: jobs.id });
  return recovered.length;
}

export async function drainSeoMetadata(userId?: string, limit = 2) {
  await recoverStalledSeoMetadataJobs();
  return Promise.all(Array.from({ length: limit }, () => processNextSeoMetadata(userId)));
}

export function kickSeoMetadataWorker(userId?: string) {
  setTimeout(() => {
    // ponytail: best-effort local wake; cron is the durable worker on deploy.
    drainSeoMetadata(userId, 1).catch((error) => console.warn("[seo] Worker kick failed:", error instanceof Error ? error.message : error));
  }, 0);
}

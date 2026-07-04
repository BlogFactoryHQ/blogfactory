import { getOpenRouterKey } from "./api-keys.js";
import { assertOpenRouterModelAvailable } from "./openrouter-models.js";
import { randomUUID } from "node:crypto";

const MAX_SAMPLES = 10;
const MAX_TOTAL_CHARS = 60_000;
const DEFAULT_PROFILE_MODEL = "openai/gpt-4o";
const AI_PHRASE_HINT =
  "Avoid overused AI-style openings and filler such as 'In today's fast-paced world', 'Let's dive in', 'unlock', 'game-changer', and 'it is important to note'.";

export interface VoiceTrainingSample {
  id?: string;
  title: string;
  sourceType: "paste" | "url" | "file";
  sourceUrl?: string;
  content: string;
  createdAt?: string;
}

type SettingsLike = Record<string, any>;

function cleanText(value: unknown, max = 10_000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function stringList(value: unknown, maxItems = 20) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, maxItems)
    : [];
}

function jsonValue(settings: SettingsLike, camel: string, snake: string) {
  return settings[camel] ?? settings[snake];
}

function presetVoiceInstruction(value: string) {
  switch (value.toLowerCase()) {
    case "natural":
      return "Use a natural, human-sounding style: clear, varied sentence lengths, concrete wording, no stiff corporate filler, no exaggerated hype.";
    case "professional":
      return "Use a professional style: polished, structured, business-appropriate, precise, and calm without sounding robotic.";
    case "conversational":
      return "Use a conversational style: relaxed, direct to the reader, approachable, plain-spoken, and easy to scan.";
    case "technical":
      return "Use a technical style: precise, specific, implementation-aware, careful with claims, and comfortable with domain terminology.";
    case "friendly":
      return "Use a friendly style: warm, encouraging, accessible, and helpful without becoming casual or fluffy.";
    case "authoritative":
      return "Use an authoritative style: expert, confident, decisive, evidence-oriented, and clear about practical implications.";
    default:
      return `Use this default voice/style: ${value}.`;
  }
}

function profileInstructions(profile: unknown) {
  if (!profile || typeof profile !== "object") return "";
  const record = profile as Record<string, unknown>;
  const explicit = cleanText(record.finalPromptInstructions || record.promptInstructions, 4000);
  if (explicit) return explicit;

  const lines = [
    cleanText(record.summary, 800),
    ...stringList(record.styleTraits, 8).map((item) => `Style trait: ${item}`),
    ...stringList(record.doRules, 8).map((item) => `Do: ${item}`),
    ...stringList(record.dontRules, 8).map((item) => `Do not: ${item}`),
    cleanText(record.vocabularyGuidance, 800),
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildVoiceContentInstructions(settings?: SettingsLike) {
  if (!settings) return [];

  const lines: string[] = [];
  const voiceMode = cleanText(jsonValue(settings, "voiceMode", "voice_mode"), 20);
  const profile = jsonValue(settings, "customVoiceProfile", "custom_voice_profile");
  const customProfile = voiceMode === "custom" ? profileInstructions(profile) : "";

  if (customProfile) {
    lines.push(`Use this custom trained voice profile:\n${customProfile}`);
  } else {
    const articleVoice = cleanText(jsonValue(settings, "articleVoice", "article_voice"), 80);
    if (articleVoice) lines.push(presetVoiceInstruction(articleVoice));
  }

  const rules = jsonValue(settings, "contentRules", "content_rules") || {};
  const bannedWords = stringList(rules.bannedWords || rules.banned_words);
  const bannedPhrases = stringList(rules.bannedPhrases || rules.banned_phrases);
  const competitors = stringList(rules.competitors || rules.competitorNames || rules.competitor_names);
  const preferredTerms = Array.isArray(rules.preferredTerms || rules.preferred_terms)
    ? (rules.preferredTerms || rules.preferred_terms)
        .map((item: any) => {
          const from = cleanText(item?.from || item?.avoid, 80);
          const to = cleanText(item?.to || item?.prefer, 80);
          return from && to ? `${from} -> ${to}` : "";
        })
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (bannedWords.length) lines.push(`Never use these words: ${bannedWords.join(", ")}.`);
  if (bannedPhrases.length) lines.push(`Never use these phrases: ${bannedPhrases.join("; ")}.`);
  if (preferredTerms.length) lines.push(`Use preferred terminology: ${preferredTerms.join("; ")}.`);
  if ((rules.competitorAvoidance || rules.competitor_avoidance) && competitors.length) {
    lines.push(`Do not mention these competitors: ${competitors.join(", ")}.`);
  }
  if (rules.avoidAiPhrases ?? rules.avoid_ai_phrases ?? true) lines.push(AI_PHRASE_HINT);

  const custom = cleanText(jsonValue(settings, "customArticleInstructions", "custom_article_instructions"), 2000);
  if (custom) lines.push(`Custom article instructions: ${custom}`);

  return lines;
}

export function sanitizeTrainingSamples(value: unknown): VoiceTrainingSample[] {
  if (!Array.isArray(value)) return [];
  let remaining = MAX_TOTAL_CHARS;
  const samples: VoiceTrainingSample[] = [];

  for (const item of value.slice(0, MAX_SAMPLES)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const content = cleanText(record.content, remaining);
    if (!content || remaining <= 0) continue;
    remaining -= content.length;
    samples.push({
      id: cleanText(record.id, 80) || randomUUID(),
      title: cleanText(record.title, 160) || "Writing sample",
      sourceType: ["url", "file"].includes(String(record.sourceType)) ? record.sourceType as "url" | "file" : "paste",
      sourceUrl: cleanText(record.sourceUrl, 500) || undefined,
      content,
      createdAt: cleanText(record.createdAt, 80) || new Date().toISOString(),
    });
  }

  return samples;
}

function extractJsonObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || value;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Voice profile response was not JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function analyzeVoiceProfile(opts: { userId: string; samples: unknown; modelId?: string }) {
  const samples = sanitizeTrainingSamples(opts.samples);
  if (!samples.length) throw new Error("Add at least one writing sample");

  const apiKey = await getOpenRouterKey(opts.userId);
  if (!apiKey) throw new Error("Add your OpenRouter API key before generating a voice profile");

  const model = cleanText(opts.modelId, 120) || DEFAULT_PROFILE_MODEL;
  await assertOpenRouterModelAvailable(apiKey, model);

  const sampleText = samples
    .map((sample, index) => `Sample ${index + 1}: ${sample.title}\n${sample.content}`)
    .join("\n\n---\n\n");

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(35_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Analyze writing samples and return only valid JSON.",
        },
        {
          role: "user",
          content: `Create a reusable brand voice profile from these samples. Return JSON with keys summary, styleTraits, doRules, dontRules, vocabularyGuidance, finalPromptInstructions.\n\n${sampleText}`,
        },
      ],
      max_completion_tokens: 1800,
    }),
  });

  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json() as any;
  const content = data.choices?.[0]?.message?.content || "";
  const profile = extractJsonObject(content);

  return { profile, samples };
}

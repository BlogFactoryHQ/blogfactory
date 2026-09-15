import { getOpenRouterKey } from "./api-keys.js";
import { creditsForProviderCost, reservationCredits } from "./billing-config.js";
import { getCloudAccess } from "./cloud-entitlements.js";
import { getGlobalSettings } from "./user-settings.js";
import { getOpenRouterModels } from "./openrouter-models.js";
import { markAiCreditsForReconciliation, releaseAiCredits, reserveAiCredits, settleAiCredits } from "./ai-credits.js";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiCreditReservations } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";

export const MANAGED_TEXT_MODELS = ["google/gemini-3.5-flash", "openai/gpt-5.4", "anthropic/claude-sonnet-5"] as const;
export const MANAGED_IMAGE_MODELS = ["google/gemini-3.1-flash-image", "google/gemini-3-pro-image", "x-ai/grok-imagine-image-quality"] as const;

export type OpenRouterAccess = { mode: "byo" | "managed"; apiKey: string };

export async function resolveOpenRouterAccess(userId: string): Promise<OpenRouterAccess> {
  const [settings, byoKey] = await Promise.all([getGlobalSettings(userId), getOpenRouterKey(userId)]);
  const preference = settings?.aiPreference || "auto";
  if ((preference === "auto" || preference === "byo") && byoKey) return { mode: "byo", apiKey: byoKey };
  if (preference === "byo") throw new ApiError(400, "validation_error", "Add your OpenRouter API key before using BYO AI");
  if (process.env.BLOGFACTORY_CLOUD !== "true" || process.env.MANAGED_AI_ENABLED !== "true") throw new ApiError(503, "service_unavailable", "Managed AI is not enabled");
  const apiKey = process.env.OPENROUTER_MANAGED_API_KEY?.trim();
  if (!apiKey) throw new ApiError(503, "service_unavailable", "Managed AI is not configured");
  const access = await getCloudAccess(userId, new Date(), true);
  if (!access.allowed) throw new ApiError(403, "forbidden", "An active BlogFactory Cloud plan is required for Managed AI");
  return { mode: "managed", apiKey };
}

export async function reserveManagedTextRequest(
  access: OpenRouterAccess,
  userId: string,
  modelId: string,
  inputCharacters: number,
  maxOutputTokens: number,
  operationKey: string,
) {
  if (access.mode === "byo") return null;
  if (!MANAGED_TEXT_MODELS.includes(modelId as typeof MANAGED_TEXT_MODELS[number])) throw new Error("This model is not available with Managed AI");
  const models = await getOpenRouterModels(access.apiKey, "text");
  const model = models.find((item: { id: string }) => item.id === modelId);
  if (!model || model.rawPricing.prompt < 0 || model.rawPricing.completion < 0) throw new Error("Managed AI pricing is unavailable for this model");
  const inputTokens = Math.max(1, Math.ceil(inputCharacters / 4));
  const estimatedUsd = (inputTokens * model.rawPricing.prompt + maxOutputTokens * model.rawPricing.completion) / 1_000_000 + model.rawPricing.request;
  return reserveAiCredits(userId, operationKey, reservationCredits(estimatedUsd));
}

export async function finishManagedTextRequest(reservationId: string | undefined, costUsd: number, providerGenerationId?: string | null) {
  if (!reservationId) return;
  if (costUsd > 0) await settleAiCredits(reservationId, creditsForProviderCost(costUsd), providerGenerationId);
  else await markAiCreditsForReconciliation(reservationId, providerGenerationId);
}

export async function failManagedTextRequest(reservationId: string | undefined) {
  if (reservationId) await releaseAiCredits(reservationId);
}

async function providerCost(apiKey: string, data: Record<string, unknown>) {
  const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : {};
  const embedded = Number(usage.total_cost ?? usage.cost ?? 0);
  if (Number.isFinite(embedded) && embedded > 0) return embedded;
  if (typeof data.id !== "string") return 0;
  await new Promise((resolve) => setTimeout(resolve, 900));
  const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(data.id)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(4_000) });
  if (!response.ok) return 0;
  const result = await response.json() as { data?: { total_cost?: number } };
  return Number(result.data?.total_cost || 0);
}

export async function openRouterInferenceFetch(userId: string, url: string, init: RequestInit) {
  const access = await resolveOpenRouterAccess(userId);
  const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
  let modelId = String(body.model || "");
  const isImage = url.endsWith("/images");
  let reservation: Awaited<ReturnType<typeof reserveAiCredits>> | null = null;
  if (access.mode === "managed") {
    if (isImage) {
      if (!MANAGED_IMAGE_MODELS.includes(modelId as typeof MANAGED_IMAGE_MODELS[number])) throw new Error("This image model is not available with Managed AI");
      const model = (await getOpenRouterModels(access.apiKey, "image")).find((item: { id: string }) => item.id === modelId);
      const resolution = String(body.resolution || "1K") as "512" | "1K";
      const cost = model ? Number(model.rawPricing.imageByResolution[resolution] || model.rawPricing.image || 0) : 0;
      if (!(cost > 0)) throw new Error("Managed AI pricing is unavailable for this image model");
      reservation = await reserveAiCredits(userId, `ai:${randomUUID()}`, reservationCredits(cost));
    } else {
      if (!modelId) {
        modelId = MANAGED_TEXT_MODELS[0];
        body.model = modelId;
        init = { ...init, body: JSON.stringify(body) };
      }
      if (!MANAGED_TEXT_MODELS.includes(modelId as typeof MANAGED_TEXT_MODELS[number])) {
        throw new ApiError(400, "validation_error", "This text model is not available with Managed AI");
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const inputCharacters = JSON.stringify(messages).length;
      reservation = await reserveManagedTextRequest(access, userId, modelId, inputCharacters, Number(body.max_completion_tokens || body.max_tokens || 4096), `ai:${randomUUID()}`);
    }
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${access.apiKey}`);
  let response: Response;
  try { response = await fetch(url, { ...init, headers }); }
  catch (error) {
    if (reservation) await markAiCreditsForReconciliation(reservation.id);
    throw error;
  }
  if (!reservation) return response;
  if (!response.ok) { await releaseAiCredits(reservation.id); return response; }
  try {
    const data = await response.clone().json() as Record<string, unknown>;
    const cost = await providerCost(access.apiKey, data);
    if (cost > 0) await settleAiCredits(reservation.id, creditsForProviderCost(cost), typeof data.id === "string" ? data.id : null);
    else await markAiCreditsForReconciliation(reservation.id, typeof data.id === "string" ? data.id : null);
  } catch {
    await markAiCreditsForReconciliation(reservation.id);
  }
  return response;
}

export function managedCatalogHealthy(models: Array<{ id: string; rawPricing: { prompt: number; completion: number } }>) {
  return MANAGED_TEXT_MODELS.every((id) => {
    const model = models.find((item) => item.id === id);
    return model && model.rawPricing.prompt >= 0 && model.rawPricing.completion >= 0;
  });
}

export async function assertManagedCatalogReady() {
  if (process.env.MANAGED_AI_ENABLED !== "true") return;
  const apiKey = process.env.OPENROUTER_MANAGED_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_MANAGED_API_KEY is not configured");
  const [textModels, imageModels] = await Promise.all([getOpenRouterModels(apiKey, "text"), getOpenRouterModels(apiKey, "image")]);
  if (!managedCatalogHealthy(textModels)) throw new Error("Managed text catalog is unavailable");
  for (const id of MANAGED_IMAGE_MODELS) {
    const model = imageModels.find((item: { id: string }) => item.id === id);
    if (!model || Math.max(model.rawPricing.image, ...Object.values(model.rawPricing.imageByResolution).map(Number)) <= 0) throw new Error(`Managed image pricing is unavailable for ${id}`);
  }
}

export async function reconcileManagedAiReservations(limit = 5) {
  const apiKey = process.env.OPENROUTER_MANAGED_API_KEY?.trim();
  if (!apiKey) return { processed: 0, pending: 0 };
  const rows = await db.select().from(aiCreditReservations).where(eq(aiCreditReservations.state, "reconcile"))
    .orderBy(asc(aiCreditReservations.updatedAt)).limit(limit);
  let processed = 0;
  for (const row of rows) {
    if (!row.providerGenerationId) continue;
    const cost = await providerCost(apiKey, { id: row.providerGenerationId });
    if (cost > 0) { await settleAiCredits(row.id, creditsForProviderCost(cost), row.providerGenerationId); processed++; }
  }
  return { processed, pending: rows.length - processed };
}

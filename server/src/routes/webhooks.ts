import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { generationLogs, users } from "../db/schema.js";

const MAX_BODY_BYTES = 1_000_000;
const MAX_SPANS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type LogInsert = typeof generationLogs.$inferInsert;
type RecordValue = Record<string, unknown>;

type WebhookDependencies = {
  secret: () => string | undefined;
  existingUserIds: (ids: string[]) => Promise<string[]>;
  insertLogs: (logs: LogInsert[]) => Promise<void>;
};

class WebhookInputError extends Error {
  constructor(message: string, readonly status: 400 | 413 | 422 = 400) {
    super(message);
  }
}

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function scalar(value: unknown) {
  const wrapped = record(value);
  if (!wrapped) return value;
  return wrapped.stringValue ?? wrapped.intValue ?? wrapped.doubleValue ?? wrapped.boolValue ?? null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function userId(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function attributes(value: unknown) {
  const result: RecordValue = {};
  for (const candidate of array(value)) {
    const attribute = record(candidate);
    if (typeof attribute?.key === "string") result[attribute.key] = scalar(attribute.value);
  }
  return result;
}

function durationMs(span: RecordValue) {
  const start = finiteNumber(span.startTimeUnixNano);
  const end = finiteNumber(span.endTimeUnixNano);
  return start !== null && end !== null && end >= start ? Math.round((end - start) / 1e6) : null;
}

export function parseOpenRouterPayload(value: unknown): LogInsert[] {
  const body = record(value);
  if (!body) throw new WebhookInputError("JSON body must be an object");
  if ("resourceSpans" in body) {
    const logs: LogInsert[] = [];
    for (const resourceSpan of array(body.resourceSpans)) {
      for (const scopeSpan of array(record(resourceSpan)?.scopeSpans)) {
        for (const candidate of array(record(scopeSpan)?.spans)) {
          if (logs.length >= MAX_SPANS) throw new WebhookInputError(`Payload exceeds ${MAX_SPANS} spans`, 413);
          const span = record(candidate);
          if (!span) throw new WebhookInputError("OTLP spans must be objects");
          const attrs = attributes(span.attributes);
          const id = userId(attrs["user.id"] ?? attrs.user_id);
          if (!id) throw new WebhookInputError("Every span requires a valid user.id", 422);
          const promptTokens = integer(attrs["gen_ai.usage.prompt_tokens"]);
          const completionTokens = integer(attrs["gen_ai.usage.completion_tokens"]);
          logs.push({
            userId: id,
            modelId: typeof attrs["gen_ai.request.model"] === "string" ? attrs["gen_ai.request.model"] : null,
            provider: typeof attrs["gen_ai.system"] === "string" ? attrs["gen_ai.system"] : "openrouter",
            status: record(span.status)?.code === 1 ? "success" : "error",
            promptTokens,
            completionTokens,
            totalTokens: promptTokens !== null || completionTokens !== null ? (promptTokens || 0) + (completionTokens || 0) : null,
            cost: finiteNumber(attrs["gen_ai.usage.cost"]),
            latencyMs: durationMs(span),
            traceId: typeof span.traceId === "string" ? span.traceId : null,
            sessionId: typeof attrs["session.id"] === "string" ? attrs["session.id"] : null,
            rawTrace: span,
          });
        }
      }
    }
    return logs;
  }

  const id = userId(body.user_id ?? body.user);
  if (!id) throw new WebhookInputError("A valid user_id is required", 422);
  return [{
    userId: id,
    modelId: typeof body.model === "string" ? body.model : null,
    provider: "openrouter",
    status: typeof body.status === "string" ? body.status : null,
    promptTokens: integer(body.prompt_tokens),
    completionTokens: integer(body.completion_tokens),
    totalTokens: integer(body.total_tokens),
    cost: finiteNumber(body.cost),
    traceId: typeof body.trace_id === "string" ? body.trace_id : null,
    rawTrace: body,
  }];
}

function authorized(header: string | undefined, secret: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createWebhooksRoutes(dependencies: WebhookDependencies) {
  const routes = new Hono();
  routes.post("/openrouter", async (c) => {
    const secret = dependencies.secret();
    if (!secret) return c.json({ error: "Webhook is not configured" }, 503);
    if (!authorized(c.req.header("Authorization"), secret)) return c.json({ error: "Invalid webhook credentials" }, 401);
    const contentLength = Number(c.req.header("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return c.json({ error: "Webhook payload is too large" }, 413);

    try {
      const raw = await c.req.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new WebhookInputError("Webhook payload is too large", 413);
      let body: unknown;
      try { body = JSON.parse(raw); } catch { throw new WebhookInputError("Malformed JSON body"); }
      const logs = parseOpenRouterPayload(body);
      if (logs.length === 0 && c.req.header("X-Test-Connection") === "true") return c.json({ success: true, inserted: 0 });
      if (logs.length === 0) throw new WebhookInputError("Payload contains no spans");
      const ids = [...new Set(logs.map((log) => log.userId))];
      const existing = await dependencies.existingUserIds(ids);
      if (existing.length !== ids.length) throw new WebhookInputError("Payload contains an unknown user", 422);
      await dependencies.insertLogs(logs);
      return c.json({ success: true, inserted: logs.length });
    } catch (error) {
      if (error instanceof WebhookInputError) return c.json({ error: error.message }, error.status);
      console.error("[webhook] OpenRouter persistence failed");
      return c.json({ error: "Webhook persistence failed" }, 500);
    }
  });
  return routes;
}

export const webhooksRoutes = createWebhooksRoutes({
  secret: () => process.env.OPENROUTER_WEBHOOK_SECRET,
  existingUserIds: async (ids) => (await db.select({ id: users.id }).from(users).where(inArray(users.id, ids))).map((row) => row.id),
  insertLogs: async (logs) => { await db.insert(generationLogs).values(logs); },
});

import { Hono } from "hono";
import { db } from "../db/index.js";
import { generationLogs } from "../db/schema.js";

export const webhooksRoutes = new Hono();

webhooksRoutes.post("/openrouter", async (c) => {
  try {
    const body = await c.req.json();

    // Handle OTLP format (resourceSpans)
    if (body.resourceSpans) {
      for (const rs of body.resourceSpans) {
        for (const ss of rs.scopeSpans || []) {
          for (const span of ss.spans || []) {
            const attrs: Record<string, any> = {};
            for (const attr of span.attributes || []) {
              attrs[attr.key] = attr.value?.stringValue || attr.value?.intValue || attr.value?.doubleValue;
            }

            await db.insert(generationLogs).values({
              userId: attrs["user_id"] || "00000000-0000-0000-0000-000000000000",
              modelId: attrs["gen_ai.request.model"] || null,
              provider: attrs["gen_ai.system"] || "openrouter",
              status: span.status?.code === 1 ? "success" : "error",
              promptTokens: parseInt(attrs["gen_ai.usage.prompt_tokens"]) || null,
              completionTokens: parseInt(attrs["gen_ai.usage.completion_tokens"]) || null,
              totalTokens:
                (parseInt(attrs["gen_ai.usage.prompt_tokens"]) || 0) +
                (parseInt(attrs["gen_ai.usage.completion_tokens"]) || 0) || null,
              cost: parseFloat(attrs["gen_ai.usage.cost"]) || null,
              latencyMs: span.endTimeUnixNano && span.startTimeUnixNano
                ? Math.round((span.endTimeUnixNano - span.startTimeUnixNano) / 1e6)
                : null,
              traceId: span.traceId || null,
              sessionId: attrs["session.id"] || null,
              rawTrace: span,
            });
          }
        }
      }
    } else {
      // Flat JSON fallback
      await db.insert(generationLogs).values({
        userId: body.user_id || "00000000-0000-0000-0000-000000000000",
        modelId: body.model || null,
        provider: "openrouter",
        status: body.status || null,
        promptTokens: body.prompt_tokens || null,
        completionTokens: body.completion_tokens || null,
        totalTokens: body.total_tokens || null,
        cost: body.cost || null,
        traceId: body.trace_id || null,
        rawTrace: body,
      });
    }

    return c.json({ success: true });
  } catch (err: any) {
    console.error("[webhook] Error:", err);
    return c.json({ error: err.message }, 500);
  }
});

import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
const { createWebhooksRoutes } = await import("./webhooks.js");

const knownUser = "11111111-1111-4111-8111-111111111111";
const inserted: unknown[][] = [];
const app = createWebhooksRoutes({
  secret: () => "test-secret",
  existingUserIds: async (ids: string[]) => ids.filter((id) => id === knownUser),
  insertLogs: async (logs: unknown[]) => { inserted.push(logs); },
});

const request = (body: unknown, authorization = "Bearer test-secret", headers: Record<string, string> = {}) => app.request("/openrouter", {
  method: "POST",
  headers: { Authorization: authorization, "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

assert.equal((await request({}, "")).status, 401);
assert.equal((await request({}, "Bearer wrong")).status, 401);
assert.equal((await request("{" )).status, 400);
assert.equal((await request({ user_id: "not-a-user" })).status, 422);
assert.equal((await request({ user_id: "22222222-2222-4222-8222-222222222222" })).status, 422);

const flat = await request({ user_id: knownUser, model: "openai/gpt-4o", prompt_tokens: 0, completion_tokens: 2 });
assert.equal(flat.status, 200);
assert.deepEqual(await flat.json(), { success: true, inserted: 1 });

const otlp = await request({ resourceSpans: [{ scopeSpans: [{ spans: [{
  traceId: "trace-1",
  startTimeUnixNano: "1000000",
  endTimeUnixNano: "3000000",
  status: { code: 1 },
  attributes: [
    { key: "user.id", value: { stringValue: knownUser } },
    { key: "gen_ai.request.model", value: { stringValue: "openai/gpt-4o" } },
    { key: "gen_ai.usage.prompt_tokens", value: { intValue: "3" } },
    { key: "gen_ai.usage.completion_tokens", value: { intValue: "4" } },
  ],
}, {
  traceId: "trace-2",
  status: { code: 2 },
  attributes: [{ key: "user_id", value: { stringValue: knownUser } }],
}] }] }] }, "Bearer test-secret");
assert.equal(otlp.status, 200);
assert.deepEqual(await otlp.json(), { success: true, inserted: 2 });
assert.equal(inserted.length, 2);
assert.equal(inserted[1].length, 2);

const connectionTest = await request({ resourceSpans: [] }, "Bearer test-secret", { "X-Test-Connection": "true" });
assert.equal(connectionTest.status, 200);
assert.deepEqual(await connectionTest.json(), { success: true, inserted: 0 });

const tooMany = Array.from({ length: 101 }, () => ({ attributes: [{ key: "user.id", value: { stringValue: knownUser } }] }));
assert.equal((await request({ resourceSpans: [{ scopeSpans: [{ spans: tooMany }] }] })).status, 413);

console.log("OpenRouter webhook self-check passed");

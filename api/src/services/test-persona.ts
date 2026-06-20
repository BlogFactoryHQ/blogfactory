import { db } from "../db/index.js";
import { personas } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, unknown>; required?: string[] };
  enabled: boolean;
}

interface PluginsConfig {
  web?: { enabled: boolean; engine?: string; max_results?: number };
  pdf?: { enabled: boolean };
  responseHealing?: { enabled: boolean };
}

interface ExecutionTrace {
  timestamp: string;
  type: "input" | "tool_call" | "tool_result" | "plugin" | "output" | "error";
  content: string;
  metadata?: Record<string, unknown>;
}

export async function testPersona(opts: {
  personaId: string;
  userId: string;
  prompt: string;
  sourceUrl?: string;
}) {
  const startTime = Date.now();
  const trace: ExecutionTrace[] = [];

  const addTrace = (type: ExecutionTrace["type"], content: string, metadata?: Record<string, unknown>) => {
    trace.push({ timestamp: new Date().toISOString(), type, content, metadata });
  };

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) throw new Error("OpenRouter API key not configured");

  const [persona] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, opts.personaId), eq(personas.userId, opts.userId)))
    .limit(1);

  if (!persona) throw new Error("Persona not found");

  addTrace("input", `Test prompt: ${opts.prompt.substring(0, 100)}...`);
  addTrace("input", `Using agent: ${persona.name} with model ${persona.baseModel}`);

  const toolsConfig = (persona.toolsConfig as ToolDefinition[] | null) || [];
  const enabledTools = toolsConfig.filter((t) => t.enabled);
  const pluginsConfig = (persona.pluginsConfig as PluginsConfig | null) || {};
  const toolChoice = persona.toolChoice || "auto";
  const parallelToolCalls = persona.parallelToolCalls ?? true;

  const messages = [
    { role: "system", content: persona.systemPrompt },
    { role: "user", content: opts.prompt },
  ];

  const tools = enabledTools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const plugins: Array<{ id: string; [key: string]: unknown }> = [];
  const pluginsUsed: string[] = [];

  if (pluginsConfig.web?.enabled) {
    const webPlugin: any = { id: "web" };
    if (pluginsConfig.web.engine) webPlugin.engine = pluginsConfig.web.engine;
    if (pluginsConfig.web.max_results) webPlugin.max_results = pluginsConfig.web.max_results;
    plugins.push(webPlugin);
    pluginsUsed.push("web");
    addTrace("plugin", "Web search plugin enabled", pluginsConfig.web as any);
  }

  if (pluginsConfig.responseHealing?.enabled) {
    plugins.push({ id: "response-healing" });
    pluginsUsed.push("response-healing");
    addTrace("plugin", "Response healing plugin enabled");
  }

  const requestBody: Record<string, unknown> = { model: persona.baseModel, messages, max_tokens: 2000 };

  if (tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = toolChoice === "required" ? "required" : toolChoice;
    requestBody.parallel_tool_calls = parallelToolCalls;
    addTrace("input", `${tools.length} tools configured (choice: ${toolChoice})`);
  }

  if (plugins.length > 0) requestBody.plugins = plugins;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
    if (response.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
    throw new Error(`AI request failed: ${response.status}`);
  }

  const aiResponse = await response.json() as any;
  const choice = aiResponse.choices?.[0];
  const message = choice?.message;
  const usage = aiResponse.usage;

  const toolCalls: any[] = [];
  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}"),
      });
      addTrace("tool_call", `Tool called: ${tc.function.name}`, { arguments: JSON.parse(tc.function.arguments || "{}") });
      addTrace("tool_result", `Tool ${tc.function.name} completed (simulated)`);
    }
  }

  const output = message?.content || "";
  addTrace("output", `Generated ${output.length} characters`);

  const validationRules = (persona.validationRules as Record<string, unknown>) || {};
  const validationErrors: string[] = [];

  if (validationRules.minLength && typeof validationRules.minLength === "number") {
    if (output.length < validationRules.minLength) {
      validationErrors.push(`Output too short: ${output.length} chars (minimum: ${validationRules.minLength})`);
    }
  }
  if (validationRules.requiredSections && Array.isArray(validationRules.requiredSections)) {
    for (const section of validationRules.requiredSections) {
      if (!output.toLowerCase().includes((section as string).toLowerCase())) {
        validationErrors.push(`Missing required section: "${section}"`);
      }
    }
  }
  if (validationRules.blocklist && Array.isArray(validationRules.blocklist)) {
    for (const phrase of validationRules.blocklist) {
      if (output.toLowerCase().includes((phrase as string).toLowerCase())) {
        validationErrors.push(`Contains blocked phrase: "${phrase}"`);
      }
    }
  }

  return {
    success: validationErrors.length === 0,
    output,
    toolCalls,
    pluginsUsed,
    executionTime: Date.now() - startTime,
    tokenUsage: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens } : undefined,
    trace,
    validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
  };
}

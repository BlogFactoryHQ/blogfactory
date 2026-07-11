import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorCode =
  | "invalid_json"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "upstream_failure"
  | "service_unavailable"
  | "internal_error";

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: ApiErrorCode,
    message: string,
    public details?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorEnvelope(code: ApiErrorCode, message: string, details?: FieldError[]) {
  return {
    error: message,
    code,
    message,
    ...(details?.length ? { details } : {}),
  };
}

export function errorResponse(c: Context, status: ContentfulStatusCode, code: ApiErrorCode, message: string, details?: FieldError[]) {
  return c.json(errorEnvelope(code, message, details), status);
}

export function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status === 502) return "upstream_failure";
  if (status === 503) return "service_unavailable";
  if (status >= 500) return "internal_error";
  return "validation_error";
}

export const normalizeApiErrors: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.res.status < 400 || !c.res.headers.get("content-type")?.includes("application/json")) return;
  const body = await c.res.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.error !== "string" || (typeof body.code === "string" && typeof body.message === "string")) return;
  const status = c.res.status as ContentfulStatusCode;
  const headers = new Headers(c.res.headers);
  headers.set("content-type", "application/json; charset=UTF-8");
  c.res = new Response(JSON.stringify({ ...body, ...errorEnvelope(codeForStatus(status), body.error) }), { status, headers });
};

export function handleApiError(error: Error, c: Context) {
  if (error instanceof ApiError) return errorResponse(c, error.status, error.code, error.message, error.details);
  if (error instanceof HTTPException) {
    return errorResponse(c, error.status as ContentfulStatusCode, codeForStatus(error.status), error.message || "Request failed");
  }
  if (error instanceof SyntaxError) return errorResponse(c, 400, "invalid_json", "Request body must contain valid JSON");
  console.error("[api] Unhandled request error", safeError(error));
  return errorResponse(c, 500, "internal_error", "An unexpected error occurred");
}

export function safeError(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const cause = value?.cause && typeof value.cause === "object" ? value.cause as Record<string, unknown> : null;
  const code = value?.code;
  const causeCode = cause?.code;
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    ...(cause ? { causeName: cause instanceof Error ? cause.name : "UnknownError" } : {}),
    ...(typeof causeCode === "string" || typeof causeCode === "number" ? { causeCode } : {}),
  };
}

export async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must contain valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "validation_error", "Request body must be a JSON object", [{ field: "body", message: "Expected an object" }]);
  }
  return value as Record<string, unknown>;
}

export function requiredString(body: Record<string, unknown>, field: string, aliases: string[] = []) {
  const value = [field, ...aliases].map((key) => body[key]).find((entry) => typeof entry === "string" && entry.trim());
  if (typeof value !== "string") {
    throw new ApiError(400, "validation_error", `${field} is required`, [{ field, message: "Required" }]);
  }
  return value.trim();
}

export function optionalEnum<const T extends readonly string[]>(body: Record<string, unknown>, field: string, values: T, fallback: T[number]) {
  const value = body[field];
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !values.includes(value)) {
    throw new ApiError(400, "validation_error", `Invalid ${field}`, [{ field, message: `Expected one of: ${values.join(", ")}` }]);
  }
  return value as T[number];
}

export function requiredEnum<const T extends readonly string[]>(body: Record<string, unknown>, field: string, values: T) {
  const value = body[field];
  if (typeof value !== "string" || !values.includes(value)) {
    throw new ApiError(400, "validation_error", `Invalid ${field}`, [{ field, message: `Expected one of: ${values.join(", ")}` }]);
  }
  return value as T[number];
}

export function requiredStringArray(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (!Array.isArray(value) || !value.length || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new ApiError(400, "validation_error", `${field} must contain at least one id`, [{ field, message: "Expected a non-empty string array" }]);
  }
  return value.map((entry) => (entry as string).trim());
}

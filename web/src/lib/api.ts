const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "ef_token";

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details: ApiFieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function retryTransientApiError(failureCount: number, error: Error) {
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2;
}

export function authRedirectHref(pathname: string, search: string) {
  if (pathname === "/auth") return `/auth${search}`;
  return `/auth?returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
}

export function shouldRedirectAfterUnauthorized(apiPath: string) {
  return !apiPath.startsWith("/auth/");
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    if (body && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!resp.ok) {
      const err: unknown = await resp.json().catch(() => null);
      const envelope = err && typeof err === "object" ? err as Record<string, unknown> : {};
      const baseMessage = typeof envelope.message === "string"
        ? envelope.message
        : typeof envelope.error === "string"
          ? envelope.error
          : `Request failed: ${resp.status}`;
      const validationErrors = Array.isArray(envelope.errors)
        ? envelope.errors.filter((item): item is string => typeof item === "string")
        : [];
      const message = validationErrors.length ? `${baseMessage}: ${validationErrors.join(" ")}` : baseMessage;
      const code = typeof envelope.code === "string" ? envelope.code : `http_${resp.status}`;
      const details = Array.isArray(envelope.details)
        ? envelope.details.filter((item): item is ApiFieldError => Boolean(
            item && typeof item === "object" && "field" in item && typeof item.field === "string" && "message" in item && typeof item.message === "string",
          ))
        : [];
      const apiError = new ApiError(message, resp.status, code, details);
      if (resp.status === 401) {
        this.setToken(null);
        if (shouldRedirectAfterUnauthorized(path)) {
          window.location.href = authRedirectHref(window.location.pathname, window.location.search);
        }
      }
      throw apiError;
    }

    return resp.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async getArray<T>(path: string): Promise<T[]> {
    const value = await this.request<unknown>("GET", path);
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === "object" && "items" in value && Array.isArray(value.items)) {
      return value.items as T[];
    }
    return [];
  }

  post<T>(path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>("POST", path, body, options?.signal);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  upload<T>(path: string, formData: FormData, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>("POST", path, formData, options?.signal);
  }
}

export const api = new ApiClient();

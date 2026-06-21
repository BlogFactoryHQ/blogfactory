const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "ef_token";

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

  private async request<T>(method: string, path: string, body?: any, signal?: AbortSignal): Promise<T> {
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

    if (resp.status === 401) {
      this.setToken(null);
      window.location.href = "/auth";
      throw new Error("Unauthorized");
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(err.error || `Request failed: ${resp.status}`);
    }

    return resp.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: any, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>("POST", path, body, options?.signal);
  }

  put<T>(path: string, body?: any): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: any): Promise<T> {
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

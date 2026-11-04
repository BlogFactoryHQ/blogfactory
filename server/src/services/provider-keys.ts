import { AsyncLocalStorage } from "node:async_hooks";
import { getBraveKey, getDataForSeoCredentials } from "./api-keys.js";

export type ProviderKeys = {
  brave: string | null;
  dataforseo: { login: string; password: string } | null;
};

// The SEO providers are optional. A key the user saved wins; otherwise the server operator's environment keys apply.
// Services read the active keys from this scope, so callers only wrap the entry point that knows the user.
const scope = new AsyncLocalStorage<ProviderKeys>();

function envBrave() {
  return process.env.BRAVE_SEARCH_API_KEY?.trim() || null;
}

function envDataForSeo() {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  return login && password ? { login, password } : null;
}

export async function loadProviderKeys(userId: string): Promise<ProviderKeys> {
  const [brave, dataforseo] = await Promise.all([
    getBraveKey(userId).catch(() => null),
    getDataForSeoCredentials(userId).catch(() => null),
  ]);
  return { brave: brave || envBrave(), dataforseo: dataforseo || envDataForSeo() };
}

export async function withProviderKeys<T>(userId: string, run: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return run();
  return scope.run(await loadProviderKeys(userId), run);
}

/** Outside a scope (tests, scripts) only the environment applies. */
export function activeBraveKey() {
  const keys = scope.getStore();
  return keys ? keys.brave : envBrave();
}

export function activeDataForSeo() {
  const keys = scope.getStore();
  return keys ? keys.dataforseo : envDataForSeo();
}

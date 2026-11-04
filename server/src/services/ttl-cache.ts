// Small process-local TTL cache. Serverless instances do not share it, so it only trims repeat calls.
export function createTtlCache<T>(ttlMs: number, maxEntries: number) {
  const store = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) { store.delete(key); return undefined; }
      return hit.value;
    },
    set(key: string, value: T) {
      if (store.size >= maxEntries) store.delete(store.keys().next().value as string);
      store.set(key, { at: Date.now(), value });
    },
    get size() { return store.size; },
  };
}

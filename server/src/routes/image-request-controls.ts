const RESTARTABLE_AI_STATUSES = new Set(["failed", "processing", "queued", "pending"]);

export function canRestartImageRequest(provider: string, status: string) {
  return provider === "ai-deferred" && RESTARTABLE_AI_STATUSES.has(status);
}

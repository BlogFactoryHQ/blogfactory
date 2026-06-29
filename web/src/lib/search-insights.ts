export type TrendTone = "good" | "bad" | "flat" | "pending";
export type SemanticTone = "performance" | "opportunity" | "risk" | "success" | "neutral";

export function formatCompactNumber(value: number) {
  const abs = Math.abs(value);
  if (abs < 1000) return Math.round(value).toLocaleString();
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: abs >= 10_000 ? 0 : 1,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

export function formatDelta(delta: number | null, options: { percent?: boolean; lowerIsBetter?: boolean } = {}) {
  if (delta === null) return { label: "baseline building", tone: "pending" as TrendTone };
  const tone = classifyTrend(delta, options.lowerIsBetter);
  const sign = delta > 0 ? "+" : "";
  const label = options.percent ? `${sign}${(delta * 100).toFixed(1)}%` : `${sign}${formatCompactNumber(delta)}`;
  return { label, tone };
}

export function formatCompactCurrency(value: number, options: { minimum?: number } = {}) {
  const abs = Math.abs(value);
  const minimum = options.minimum ?? 0.01;
  if (abs > 0 && abs < minimum) return `<$${minimum.toFixed(2)}`;
  if (abs < 1000) {
    const digits = abs >= 10 ? 2 : 4;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: abs === 0 ? 2 : Math.min(2, digits),
      maximumFractionDigits: digits,
    }).format(value);
  }
  return `$${formatCompactNumber(value)}`;
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function safePercent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function bucketBubbleSize(value: number, max: number): "sm" | "md" | "lg" {
  const ratio = max ? value / max : 0;
  if (ratio >= 0.66) return "lg";
  if (ratio >= 0.25) return "md";
  return "sm";
}

export function classifyTrend(delta: number | null, lowerIsBetter = false): TrendTone {
  if (delta === null) return "pending";
  if (Math.abs(delta) < 0.0001) return "flat";
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return good ? "good" : "bad";
}

export function semanticToneClass(tone: SemanticTone) {
  switch (tone) {
    case "performance":
      return "border-byword-blue/25 bg-byword-blue-soft/45 text-byword-blue";
    case "opportunity":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "risk":
      return "border-red-200 bg-red-50 text-red-700";
    case "success":
      return "border-green-200 bg-green-50 text-green-700";
    default:
      return "border-byword-border bg-muted/30 text-foreground";
  }
}

export function topBuckets<T>(
  items: T[],
  getLabel: (item: T) => string | null | undefined,
  options: { limit?: number; getValue?: (item: T) => number } = {}
) {
  const limit = options.limit ?? 5;
  const buckets = new Map<string, number>();

  for (const item of items) {
    const label = getLabel(item)?.trim() || "Unassigned";
    buckets.set(label, (buckets.get(label) || 0) + (options.getValue?.(item) ?? 1));
  }

  return [...buckets.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export type TrendTone = "good" | "bad" | "flat" | "pending";

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

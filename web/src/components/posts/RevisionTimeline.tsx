import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { countWords } from "@/lib/revision-diff";
import { safeFormatDate } from "@/lib/date-format";
import type { PostRevision } from "./EditorialSafetyPanel";

const PLOT_WIDTH = 720;
const PLOT_HEIGHT = 120;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 108;

export type RevisionPoint = {
  revision: PostRevision;
  words: number;
  score: number | null;
  value: number;
  x: number;
};

function positionPercent(index: number, total: number) {
  if (total <= 1) return 50;
  return (index / (total - 1)) * 100;
}

function sourceLabel(source: string) {
  return source.replace(/_/g, " ");
}

/**
 * Plots the server-scored SEO score per revision when it is available, and falls back to word
 * count when it is not. The axis label always says which of the two is on screen.
 */
export function RevisionTimeline({
  revisions,
  baseId,
  candidateId,
  onSelectCandidate,
  scores,
}: {
  revisions: PostRevision[];
  baseId: string;
  candidateId: string;
  onSelectCandidate: (revisionId: string) => void;
  scores?: Record<string, number>;
}) {
  const points = useMemo<RevisionPoint[]>(() => {
    const ordered = [...revisions].sort((a, b) => a.revision_number - b.revision_number);
    return ordered.map((revision, index) => {
      const words = countWords(revision.snapshot.content || "");
      const score = scores && typeof scores[revision.id] === "number" ? scores[revision.id] : null;
      return { revision, words, score, value: score ?? words, x: positionPercent(index, ordered.length) };
    });
  }, [revisions, scores]);

  const scored = points.length > 0 && points.every((point) => point.score !== null);

  const { areaPath, linePath, minValue, maxValue } = useMemo(() => {
    if (!points.length) return { areaPath: "", linePath: "", minValue: 0, maxValue: 0 };
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series has no range to plot against, so it rides the middle instead of the floor.
    const toY = (value: number) =>
      max === min ? (PLOT_TOP + PLOT_BOTTOM) / 2 : PLOT_BOTTOM - ((value - min) / (max - min)) * (PLOT_BOTTOM - PLOT_TOP);
    const toX = (index: number) => (points.length <= 1 ? PLOT_WIDTH / 2 : (index / (points.length - 1)) * PLOT_WIDTH);

    if (points.length === 1) {
      const y = toY(values[0]);
      return {
        linePath: `M 0 ${y} L ${PLOT_WIDTH} ${y}`,
        areaPath: `M 0 ${y} L ${PLOT_WIDTH} ${y} L ${PLOT_WIDTH} ${PLOT_BOTTOM} L 0 ${PLOT_BOTTOM} Z`,
        minValue: min,
        maxValue: max,
      };
    }

    // Each revision holds a plateau centred on its own marker, so the newest value stays
    // visible instead of collapsing into the right edge.
    const segments = [`M 0 ${toY(values[0])}`];
    for (let index = 1; index < points.length; index += 1) {
      const boundary = (toX(index - 1) + toX(index)) / 2;
      segments.push(`L ${boundary} ${toY(values[index - 1])}`);
      segments.push(`L ${boundary} ${toY(values[index])}`);
    }
    segments.push(`L ${PLOT_WIDTH} ${toY(values[values.length - 1])}`);
    const line = segments.join(" ");
    return {
      linePath: line,
      areaPath: `${line} L ${PLOT_WIDTH} ${PLOT_BOTTOM} L 0 ${PLOT_BOTTOM} Z`,
      minValue: min,
      maxValue: max,
    };
  }, [points]);

  if (!points.length) return null;

  const candidate = points.find((point) => point.revision.id === candidateId);
  const base = points.find((point) => point.revision.id === baseId);
  const dense = points.length > 8;

  return (
    <section className="rounded-sm border border-byword-border bg-card" aria-label="Revision timeline">
      <div className="relative px-6 pb-2 pt-5">
        {/* Guides run from the marker rail down through the plot, so the selection reads as one column.
            inset-x-6 matches the content box the markers are positioned against. */}
        <div className="pointer-events-none absolute inset-x-6 bottom-6 top-[3.7rem]" aria-hidden="true">
          {[base, candidate].map((point, index) =>
            // base and candidate can be the same revision, so the key is the role, not the id.
            point ? (
              <span
                key={index === 0 ? "base-guide" : "candidate-guide"}
                className={cn(
                  "absolute top-0 h-full border-l border-dashed",
                  index === 0 ? "border-byword-blue/45" : "border-primary/55",
                )}
                style={{ left: `${point.x}%` }}
              />
            ) : null,
          )}
        </div>

        <div className="relative h-11">
          <span className="absolute inset-x-0 top-[1.95rem] h-px bg-byword-border" aria-hidden="true" />
          {points.map((point) => {
            const isCandidate = point.revision.id === candidateId;
            const isBase = point.revision.id === baseId;
            const showLabel = !dense || isCandidate || isBase || point === points[0] || point === points[points.length - 1];
            return (
              <button
                key={point.revision.id}
                type="button"
                onClick={() => onSelectCandidate(point.revision.id)}
                aria-pressed={isCandidate}
                title={`Revision ${point.revision.revision_number} · ${point.score !== null ? `SEO ${point.score} · ` : ""}${point.words.toLocaleString()} words · ${sourceLabel(point.revision.source)}`}
                className="group absolute top-0 flex h-11 w-12 -translate-x-1/2 flex-col items-center justify-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                style={{ left: `${point.x}%` }}
              >
                <span
                  className={cn(
                    "font-mono text-[10px] font-semibold uppercase leading-none transition-calm",
                    showLabel ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    isCandidate ? "text-primary" : isBase ? "text-byword-blue" : "text-muted-foreground",
                  )}
                >
                  r{point.revision.revision_number}
                </span>
                <span
                  className={cn(
                    "mt-1 font-mono text-[9px] leading-none text-muted-foreground transition-calm",
                    showLabel && !dense ? "opacity-100" : "opacity-0",
                  )}
                >
                  {sourceLabel(point.revision.source)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 transition-calm",
                    isCandidate
                      ? "h-2.5 w-2.5 rotate-45 bg-primary shadow-[0_0_0_3px_hsl(var(--card))]"
                      : isBase
                        ? "h-2.5 w-2.5 rounded-full border-2 border-byword-blue bg-card"
                        : "h-2 w-2 rounded-full bg-byword-border group-hover:bg-byword-blue",
                  )}
                />
              </button>
            );
          })}
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute inset-0 device-perforation opacity-[0.28]" aria-hidden="true" />
          <svg
            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
            preserveAspectRatio="none"
            className="relative h-24 w-full sm:h-28"
            role="img"
            aria-label={scored
              ? `SEO score across ${points.length} revisions, from ${minValue} to ${maxValue} out of 100`
              : `Word count across ${points.length} revisions, from ${minValue.toLocaleString()} to ${maxValue.toLocaleString()} words`}
          >
            <path d={areaPath} fill="hsl(var(--accent))" fillOpacity="0.1" />
            <path
              d={linePath}
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="type-meta pointer-events-none absolute left-0 top-1 bg-card/85 px-1">
            {scored ? "seo score" : "words"}
          </span>
          {maxValue === minValue ? (
            <span className="type-meta pointer-events-none absolute right-0 top-1/2 -translate-y-4 bg-card/85 px-1">
              {minValue.toLocaleString()}{scored ? " / 100" : " words"}
            </span>
          ) : (
            <>
              <span className="type-meta pointer-events-none absolute right-0 top-1 bg-card/85 px-1">
                max {maxValue.toLocaleString()}
              </span>
              <span className="type-meta pointer-events-none absolute bottom-1 right-0 bg-card/85 px-1">
                min {minValue.toLocaleString()}
              </span>
            </>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <span className="type-meta">{safeFormatDate(points[0].revision.created_at, "MMM d")}</span>
          {points.length > 2 && (
            <span className="type-meta">{safeFormatDate(points[Math.floor(points.length / 2)].revision.created_at, "MMM d")}</span>
          )}
          <span className="type-meta">{safeFormatDate(points[points.length - 1].revision.created_at, "MMM d")}</span>
        </div>
      </div>

      {candidate && (
        <div className="flex flex-wrap items-center gap-2 border-t border-byword-border bg-muted/25 px-6 py-3">
          <StatPill tone="primary" label="candidate" value={`r${candidate.revision.revision_number}`} />
          {base && base.revision.id !== candidate.revision.id && (
            <StatPill tone="blue" label="base" value={`r${base.revision.revision_number}`} />
          )}
          {candidate.score !== null && (
            <StatPill
              label="seo"
              value={
                base && base.score !== null && base.revision.id !== candidate.revision.id
                  ? `${base.score} → ${candidate.score}`
                  : String(candidate.score)
              }
            />
          )}
          <StatPill
            label="words"
            value={
              base && base.revision.id !== candidate.revision.id
                ? `${base.words.toLocaleString()} → ${candidate.words.toLocaleString()}`
                : candidate.words.toLocaleString()
            }
          />
          <StatPill label="revisions" value={String(points.length)} />
          <StatPill label="saved by" value={sourceLabel(candidate.revision.source)} />
        </div>
      )}
    </section>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string; tone?: "primary" | "blue" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[11px]",
        tone === "primary"
          ? "border-primary/35 bg-primary/10 text-primary"
          : tone === "blue"
            ? "border-byword-blue/35 bg-byword-blue-soft text-byword-blue"
            : "border-byword-border bg-card text-muted-foreground",
      )}
    >
      <span className="uppercase opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

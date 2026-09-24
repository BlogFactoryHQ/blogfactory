import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/EmptyState";

export type ScorecardCheck = {
  label: string;
  ok: boolean | null;
  detail: string;
};

export type RevisionScore = {
  revision_id: string;
  revision_number: number;
  created_at: string;
  score: number;
  passed: number;
  total: number;
  checks: ScorecardCheck[];
};

type CheckRow = {
  label: string;
  detail: string;
  history: Array<boolean | null>;
  current: boolean | null;
  baseline: boolean | null;
};

function markTone(ok: boolean | null) {
  if (ok === true) return "bg-status-success";
  if (ok === false) return "bg-status-error/65";
  return "bg-byword-border";
}

/**
 * One row per SEO check, with its pass history across the saved revisions and what changed
 * between the two revisions being compared. Scores come from the server, which runs the same
 * evaluation generation uses, so nothing here is estimated in the browser.
 */
export function RevisionScorecard({
  entries,
  baseId,
  candidateId,
}: {
  entries: RevisionScore[];
  baseId: string;
  candidateId: string;
}) {
  const ordered = useMemo(
    () => [...entries].sort((a, b) => a.revision_number - b.revision_number),
    [entries],
  );

  const candidate = ordered.find((entry) => entry.revision_id === candidateId) || ordered[ordered.length - 1];
  const base = ordered.find((entry) => entry.revision_id === baseId);
  const comparing = Boolean(base && candidate && base.revision_id !== candidate.revision_id);

  const rows = useMemo<CheckRow[]>(() => {
    if (!candidate) return [];
    return candidate.checks.map((check) => ({
      label: check.label,
      detail: check.detail,
      current: check.ok,
      baseline: base?.checks.find((item) => item.label === check.label)?.ok ?? null,
      history: ordered.map((entry) => entry.checks.find((item) => item.label === check.label)?.ok ?? null),
    }));
  }, [base, candidate, ordered]);

  if (!candidate) return null;

  const candidateIndex = ordered.findIndex((entry) => entry.revision_id === candidate.revision_id);
  const delta = comparing ? candidate.score - base!.score : 0;
  const fixed = comparing ? rows.filter((row) => row.current === true && row.baseline === false).length : 0;
  const regressed = comparing ? rows.filter((row) => row.current === false && row.baseline === true).length : 0;

  return (
    <section className="rounded-sm border border-byword-border bg-card" aria-label="SEO scorecard">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-byword-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{candidate.score}</span>
          <span className="type-meta">SEO score · r{candidate.revision_number}</span>
          {comparing && delta !== 0 && (
            <span
              className={cn(
                "font-mono text-[11px] font-semibold",
                delta > 0 ? "text-status-success" : "text-status-error",
              )}
            >
              {delta > 0 ? "+" : ""}{delta} vs r{base!.revision_number}
            </span>
          )}
        </div>
        <span className="type-meta">
          passing <span className="font-semibold text-foreground">{candidate.passed} of {candidate.total}</span>
        </span>
      </div>

      {candidate.total === 0 ? (
        <EmptyState
          size="row"
          tone="empty"
          title="No SEO checks apply"
          description="This draft was not created from an article source, so there is nothing to score."
        />
      ) : (
        <ul className="divide-y divide-byword-border">
          {rows.map((row) => {
            const changed = comparing && row.current !== row.baseline;
            return (
              <li
                key={row.label}
                className="flex flex-col gap-2 px-4 py-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">{row.label}</p>
                  <p className="type-meta mt-0.5 break-words">{row.detail}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="flex items-center gap-[3px]" aria-hidden="true">
                    {row.history.map((ok, index) => (
                      <span
                        key={index}
                        className={cn(
                          "h-3 w-1.5 rounded-[1px]",
                          markTone(ok),
                          // The candidate ring would read as an alert on a grey "not applicable"
                          // mark, so it only rings a check that actually has a result.
                          index === candidateIndex && ok !== null && "shadow-[0_0_0_1.5px_hsl(var(--card)),0_0_0_2.5px_hsl(var(--primary))]",
                        )}
                      />
                    ))}
                  </span>
                  <span
                    className={cn(
                      "w-20 text-right font-mono text-[11px] font-semibold",
                      row.current === true
                        ? "text-status-success"
                        : row.current === false
                          ? "text-status-error"
                          : "text-muted-foreground",
                    )}
                  >
                    {row.current === true ? "pass" : row.current === false ? "fail" : "n/a"}
                    {changed && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        {row.current === true ? "fixed" : row.baseline === true ? "lost" : ""}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {comparing && (fixed > 0 || regressed > 0) && (
        <div className="border-t border-byword-border bg-muted/25 px-4 py-2.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            {fixed > 0 && <span className="font-semibold text-status-success">{fixed} fixed</span>}
            {fixed > 0 && regressed > 0 && " · "}
            {regressed > 0 && <span className="font-semibold text-status-error">{regressed} lost</span>}
            {" "}since r{base!.revision_number}
          </span>
        </div>
      )}
    </section>
  );
}

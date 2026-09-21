import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { DailyUsage } from "@/hooks/useUsageAnalytics";

const WIDTH = 720;
const HEIGHT = 160;
const TOP = 12;
const BOTTOM = 140;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Projection is a straight line from today's cumulative spend at today's average daily rate.
 * It is labelled as a projection because it assumes the rest of the month looks like the days so far.
 */
export function BudgetBurnChart({
  daily,
  monthlyBudget,
  monthToDateSpend,
}: {
  daily: DailyUsage[];
  monthlyBudget: number | null;
  monthToDateSpend: number;
}) {
  const model = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();

    const perDay = new Array(daysInMonth).fill(0);
    for (const entry of daily) {
      const date = new Date(entry.date);
      if (Number.isNaN(date.getTime())) continue;
      if (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) continue;
      perDay[date.getDate() - 1] += Number(entry.cost) || 0;
    }

    const cumulative: number[] = [];
    let running = 0;
    for (let index = 0; index < today; index += 1) {
      running += perDay[index];
      cumulative.push(running);
    }

    // The summary endpoint is authoritative for month-to-date; scale the daily curve to land on it.
    const dailyTotal = cumulative[cumulative.length - 1] || 0;
    const scale = dailyTotal > 0 && monthToDateSpend > 0 ? monthToDateSpend / dailyTotal : 1;
    const scaled = cumulative.map((value) => value * scale);
    const spent = scaled[scaled.length - 1] ?? monthToDateSpend;
    const projected = today > 0 ? (spent / today) * daysInMonth : spent;

    return { monthStart, daysInMonth, today, cumulative: scaled, spent, projected };
  }, [daily, monthToDateSpend]);

  const { daysInMonth, today, cumulative, spent, projected, monthStart } = model;
  const budget = monthlyBudget && monthlyBudget > 0 ? monthlyBudget : null;
  const ceiling = Math.max(projected, budget ?? 0, spent, 0.0001) * 1.08;

  const toX = (day: number) => ((day - 1) / Math.max(daysInMonth - 1, 1)) * WIDTH;
  const toY = (value: number) => BOTTOM - (value / ceiling) * (BOTTOM - TOP);

  const actualPoints = cumulative.map((value, index) => `${toX(index + 1)} ${toY(value)}`);
  const actualLine = actualPoints.length ? `M ${actualPoints.join(" L ")}` : "";
  const actualArea = actualPoints.length
    ? `${actualLine} L ${toX(today)} ${BOTTOM} L ${toX(1)} ${BOTTOM} Z`
    : "";
  const projectionLine = actualPoints.length
    ? `M ${toX(today)} ${toY(spent)} L ${toX(daysInMonth)} ${toY(projected)}`
    : "";

  const overBy = budget ? projected - budget : 0;
  const budgetY = budget ? toY(budget) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(spent)}</span>
        {budget && (
          <>
            <span className="font-mono text-2xl text-muted-foreground">/ {formatCurrency(budget)}</span>
            <span className={cn("font-mono text-xs font-semibold", overBy > 0 ? "text-destructive" : "text-[hsl(var(--status-success))]")}>
              {Math.round((spent / budget) * 100)}% used
            </span>
          </>
        )}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-40 w-full"
          role="img"
          aria-label={
            budget
              ? `${formatCurrency(spent)} spent of a ${formatCurrency(budget)} budget, projected to reach ${formatCurrency(projected)} by the end of the month`
              : `${formatCurrency(spent)} spent this month, projected to reach ${formatCurrency(projected)}`
          }
        >
          <defs>
            <pattern id="budget-over" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--destructive))" strokeWidth="2" strokeOpacity="0.4" />
            </pattern>
          </defs>

          {budgetY !== null && overBy > 0 && (() => {
            // Hatch only the stretch after the projection actually crosses the ceiling.
            const rate = today > 0 ? spent / today : 0;
            const crossingDay = rate > 0 ? Math.min(Math.max(today + (budget! - spent) / rate, 1), daysInMonth) : today;
            const crossX = toX(crossingDay);
            return <rect x={crossX} y={TOP} width={Math.max(WIDTH - crossX, 0)} height={Math.max(budgetY - TOP, 0)} fill="url(#budget-over)" />;
          })()}

          {actualArea && <path d={actualArea} fill="hsl(var(--accent))" fillOpacity="0.12" />}
          {actualLine && (
            <path d={actualLine} fill="none" stroke="hsl(var(--accent))" strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
          {projectionLine && (
            <path
              d={projectionLine}
              fill="none"
              stroke={overBy > 0 ? "hsl(var(--destructive))" : "hsl(var(--accent))"}
              strokeWidth="1.5"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {budgetY !== null && (
            <line
              x1="0"
              y1={budgetY}
              x2={WIDTH}
              y2={budgetY}
              stroke="hsl(var(--foreground))"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <line
            x1={toX(today)}
            y1={TOP}
            x2={toX(today)}
            y2={BOTTOM}
            stroke="hsl(var(--foreground))"
            strokeOpacity="0.25"
            strokeWidth="1"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {budget && (
          <span className="type-meta pointer-events-none absolute left-0 bg-card/85 px-1" style={{ top: `${((budgetY! - 14) / HEIGHT) * 100}%` }}>
            {formatCurrency(budget)} budget
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="type-meta">{monthLabel(monthStart)}</span>
        <span className="type-meta">today</span>
        <span className="type-meta">{monthLabel(new Date(monthStart.getFullYear(), monthStart.getMonth(), daysInMonth))}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-byword-border pt-3">
        <span className="font-mono text-[11px] text-muted-foreground">
          projected <span className={cn("font-semibold", overBy > 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(projected)}</span>
        </span>
        {budget && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {overBy > 0 ? (
              <>over by <span className="font-semibold text-destructive">{formatCurrency(overBy)}</span></>
            ) : (
              <>headroom <span className="font-semibold text-[hsl(var(--status-success))]">{formatCurrency(-overBy)}</span></>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

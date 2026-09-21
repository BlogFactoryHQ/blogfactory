import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { ListSkeleton } from "@/components/patterns/PageSkeleton";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { DailyUsage } from "@/hooks/useUsageAnalytics";

type GuardrailKey = "dailyCostLimit" | "dailyRequestLimit" | "dailyFailureLimit";

type GuardrailSettings = {
  monthly_budget: number | null;
  budget_paused: boolean;
  daily_cost_limit: number | null;
  daily_request_limit: number | null;
  daily_failure_limit: number | null;
};

type RuleDefinition = {
  key: GuardrailKey;
  field: keyof GuardrailSettings;
  label: string;
  unit: "cost" | "count";
  enforced: boolean;
  note: string;
  value: (day: DailyUsage) => number;
};

const RULES: RuleDefinition[] = [
  {
    key: "dailyCostLimit",
    field: "daily_cost_limit",
    label: "daily spend",
    unit: "cost",
    enforced: true,
    note: "",
    value: (day) => Number(day.cost) || 0,
  },
  {
    key: "dailyRequestLimit",
    field: "daily_request_limit",
    label: "daily requests",
    unit: "count",
    enforced: true,
    note: "",
    value: (day) => Number(day.requests) || 0,
  },
  {
    key: "dailyFailureLimit",
    field: "daily_failure_limit",
    label: "failed calls",
    unit: "count",
    enforced: false,
    note: "Watch only — a provider outage never blocks your own generation.",
    value: (day) => Number(day.failed) || 0,
  },
];

function formatThreshold(value: number, unit: "cost" | "count") {
  return unit === "cost" ? `$${value.toFixed(2)}` : value.toLocaleString();
}

/** Twice the worst recent day, rounded, so switching a rule on starts somewhere defensible. */
function suggestThreshold(series: number[], unit: "cost" | "count") {
  const peak = series.length ? Math.max(...series) : 0;
  if (peak <= 0) return unit === "cost" ? 10 : 100;
  const doubled = peak * 2;
  return unit === "cost" ? Math.max(1, Math.ceil(doubled)) : Math.max(1, Math.ceil(doubled / 10) * 10);
}

export function GuardrailRules({ daily }: { daily: DailyUsage[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<GuardrailKey, string>>({
    dailyCostLimit: "",
    dailyRequestLimit: "",
    dailyFailureLimit: "",
  });
  // The settings query refetches on window focus; without this guard a background refetch
  // would silently discard ceilings the operator had typed but not saved yet.
  const [touched, setTouched] = useState(false);

  const editDraft = (key: GuardrailKey, value: string) => {
    setTouched(true);
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ["guardrail-settings", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return api.get<GuardrailSettings | null>("/settings");
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!settings || touched) return;
    setDrafts({
      dailyCostLimit: settings.daily_cost_limit != null ? String(settings.daily_cost_limit) : "",
      dailyRequestLimit: settings.daily_request_limit != null ? String(settings.daily_request_limit) : "",
      dailyFailureLimit: settings.daily_failure_limit != null ? String(settings.daily_failure_limit) : "",
    });
  }, [settings, touched]);

  const series = useMemo(() => {
    const ordered = [...daily].sort((a, b) => a.date.localeCompare(b.date)).slice(-21);
    return Object.fromEntries(RULES.map((rule) => [rule.key, ordered.map(rule.value)])) as Record<GuardrailKey, number[]>;
  }, [daily]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not logged in");
      const payload: Record<string, number | null> = {};
      for (const rule of RULES) {
        const raw = drafts[rule.key].trim();
        if (!raw) {
          payload[rule.key] = null;
          continue;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${rule.label} needs a positive number`);
        payload[rule.key] = rule.unit === "count" ? Math.floor(parsed) : parsed;
      }
      await api.put("/settings", payload);
    },
    onSuccess: () => {
      setTouched(false);
      queryClient.invalidateQueries({ queryKey: ["guardrail-settings"] });
      queryClient.invalidateQueries({ queryKey: ["budget-settings"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Guardrails saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Guardrails could not be saved"),
  });

  if (isLoading) return <ListSkeleton rows={RULES.length} className="p-4 sm:p-5" />;

  const states = RULES.map((rule) => {
    const points = series[rule.key] || [];
    const latest = points.length ? points[points.length - 1] : 0;
    const draft = drafts[rule.key].trim();
    const threshold = draft ? Number(draft) : null;
    const active = threshold !== null && Number.isFinite(threshold) && threshold > 0;
    return { rule, points, latest, threshold: active ? threshold! : null, firing: active && latest >= threshold! };
  });

  const firing = states.filter((state) => state.firing).length;
  const off = states.filter((state) => state.threshold === null).length;
  const dirty = RULES.some((rule) => {
    const saved = settings?.[rule.field];
    const savedText = saved != null ? String(saved) : "";
    return savedText !== drafts[rule.key].trim();
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-byword-border px-4 py-2.5 sm:px-5">
        <span className="type-meta">
          {RULES.length} rules · {firing} firing · {off} off
        </span>
        {settings?.budget_paused && (
          <span className="status-badge status-badge-error">monthly budget paused generation</span>
        )}
      </div>

      <ul className="divide-y divide-byword-border">
        {states.map(({ rule, points, latest, threshold, firing: isFiring }) => (
          <li key={rule.key} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5">
            <div className="min-w-[10rem] flex-1">
              <p className="flex items-center gap-2 font-mono text-[13px] font-semibold text-foreground">
                {rule.label}
                {!rule.enforced && <span className="type-kicker rounded-sm border border-byword-border px-1 py-px">watch</span>}
              </p>
              <p className="type-meta mt-0.5">
                {threshold !== null ? `> ${formatThreshold(threshold, rule.unit)} · day` : "not set"}
                {" · "}
                today {formatThreshold(latest, rule.unit)}
              </p>
            </div>

            <Sparkline points={points} threshold={threshold} firing={isFiring} />

            <span
              className={cn(
                "status-badge w-[4.5rem] justify-center",
                threshold === null ? "status-badge-pending" : isFiring ? "status-badge-error" : "status-badge-success",
              )}
            >
              {threshold === null ? "Off" : isFiring ? "Firing" : "Ok"}
            </span>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step={rule.unit === "cost" ? "0.01" : "1"}
                value={drafts[rule.key]}
                onChange={(event) => editDraft(rule.key, event.target.value)}
                placeholder="off"
                aria-label={`${rule.label} ceiling`}
                className="h-8 w-24 font-mono text-xs"
              />
              <Switch
                checked={threshold !== null}
                aria-label={`Enable the ${rule.label} guardrail`}
                onCheckedChange={(checked) => editDraft(rule.key, checked ? String(suggestThreshold(points, rule.unit)) : "")}
              />
            </div>

            {!rule.enforced && <p className="type-meta w-full sm:basis-full">{rule.note}</p>}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-byword-border px-4 py-3 sm:px-5">
        <p className="type-meta">A breached ceiling stops generation for the rest of the UTC day. The monthly budget is managed above.</p>
        <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save guardrails
        </Button>
      </div>
    </div>
  );
}

function Sparkline({ points, threshold, firing }: { points: number[]; threshold: number | null; firing: boolean }) {
  const width = 108;
  const height = 30;
  const ceiling = Math.max(...points, threshold ?? 0, 1) * 1.15;
  const toX = (index: number) => (points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width);
  const toY = (value: number) => height - (value / ceiling) * height;
  const line = points.length
    ? `M ${points.map((value, index) => `${toX(index)} ${toY(value)}`).join(" L ")}`
    : "";
  const thresholdY = threshold !== null ? toY(threshold) : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      role="img"
      aria-label={
        threshold !== null
          ? `Recent daily values against a ceiling of ${threshold}`
          : "Recent daily values, no ceiling set"
      }
    >
      {thresholdY !== null && (
        <line
          x1="0"
          y1={thresholdY}
          x2={width}
          y2={thresholdY}
          stroke={firing ? "hsl(var(--status-error))" : "hsl(var(--foreground))"}
          strokeOpacity={firing ? 0.7 : 0.3}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}
      {line && (
        <path
          d={line}
          fill="none"
          stroke={firing ? "hsl(var(--status-error))" : "hsl(var(--accent))"}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {points.length > 0 && (
        <circle
          cx={toX(points.length - 1)}
          cy={toY(points[points.length - 1])}
          r="2"
          fill={firing ? "hsl(var(--status-error))" : "hsl(var(--accent))"}
        />
      )}
    </svg>
  );
}

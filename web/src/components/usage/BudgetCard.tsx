import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { DetailSkeleton } from "@/components/patterns/PageSkeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { BudgetBurnChart } from "@/components/usage/BudgetBurnChart";
import { Shield, Loader2, Save, AlertTriangle, CheckCircle } from "lucide-react";
import type { DailyUsage } from "@/hooks/useUsageAnalytics";
import { toast } from "sonner";

interface BudgetSettings {
  monthly_budget: number | null;
  budget_alert_threshold: number;
  budget_paused: boolean;
}

interface BudgetCardProps {
  currentMonthSpend: number;
  daily: DailyUsage[];
}

export function BudgetCard({ currentMonthSpend, daily }: BudgetCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState("10.00");
  const [alertThreshold, setAlertThreshold] = useState(80);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["budget-settings", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return api.get<BudgetSettings | null>("/settings");
    },
    enabled: !!user?.id,
  });

  // The settings query refetches on window focus; re-seeding after the operator has started
  // editing would discard a budget they typed but had not saved yet.
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (settings && !touched) {
      setBudgetEnabled(settings.monthly_budget != null);
      if (settings.monthly_budget != null) {
        setMonthlyBudget(settings.monthly_budget.toString());
      }
      setAlertThreshold(Math.round((settings.budget_alert_threshold ?? 0.8) * 100));
    }
  }, [settings, touched]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not logged in");
      const budget = budgetEnabled ? parseFloat(monthlyBudget) : null;
      if (budgetEnabled && (isNaN(budget!) || budget! <= 0)) {
        throw new Error("Please enter a valid budget amount");
      }
      await api.put("/settings", {
        monthly_budget: budget,
        budget_alert_threshold: alertThreshold / 100,
        budget_paused: false,
      });
    },
    onSuccess: () => {
      setTouched(false);
      queryClient.invalidateQueries({ queryKey: ["budget-settings"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Budget settings saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
  });

  const unpauseMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not logged in");
      await api.put("/settings", { budget_paused: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-settings"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Generation resumed");
    },
    onError: () => toast.error("Failed to resume"),
  });

  if (isLoading) {
    return (
      <BywordCard>
        <SectionHeader icon={Shield} title="Budget controls" description="Set monthly spending limits to auto-pause generation when exceeded." />
        <DetailSkeleton className="p-6" />
      </BywordCard>
    );
  }

  const budgetNum = parseFloat(monthlyBudget) || 0;
  const spendPercent = budgetEnabled && budgetNum > 0 ? Math.min((currentMonthSpend / budgetNum) * 100, 100) : 0;
  const isPaused = settings?.budget_paused === true;
  const isOverBudget = budgetEnabled && budgetNum > 0 && currentMonthSpend >= budgetNum;
  const isNearBudget = budgetEnabled && budgetNum > 0 && spendPercent >= alertThreshold;

  return (
    <BywordCard>
      <SectionHeader icon={Shield} title="Budget controls" description="Set monthly spending limits to auto-pause generation when exceeded." />
      <div className="space-y-6 p-4 sm:p-5 lg:p-6">
        {/* Paused Banner */}
        {isPaused && (
          <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" />
              <div>
                <AlertTitle>Generation paused</AlertTitle>
                <AlertDescription className="text-xs">Monthly budget exceeded. Resume or increase your budget.</AlertDescription>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => unpauseMutation.mutate()}
              disabled={unpauseMutation.isPending}
            >
              {unpauseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resume"}
            </Button>
          </Alert>
        )}

        {/* Burn to date, with a projection at the current daily rate. */}
        <BudgetBurnChart
          daily={daily}
          monthlyBudget={budgetEnabled && budgetNum > 0 ? budgetNum : null}
          monthToDateSpend={currentMonthSpend}
        />

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable monthly budget</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Auto-pause generation when limit is reached</p>
          </div>
          <Switch checked={budgetEnabled} onCheckedChange={(checked) => { setTouched(true); setBudgetEnabled(checked); }} />
        </div>

        {budgetEnabled && (
          <>
            {/* Budget amount */}
            <div className="space-y-2">
              <Label>Monthly budget (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monthlyBudget}
                  onChange={(e) => { setTouched(true); setMonthlyBudget(e.target.value); }}
                  className="pl-7"
                  placeholder="10.00"
                />
              </div>
            </div>

            {/* Alert threshold */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alert threshold</Label>
                <span className="text-sm text-muted-foreground">{alertThreshold}%</span>
              </div>
              <Slider
                value={[alertThreshold]}
                onValueChange={([v]) => { setTouched(true); setAlertThreshold(v); }}
                min={50}
                max={100}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                You'll see a warning when spend reaches {alertThreshold}% of your budget.
              </p>
            </div>
          </>
        )}

        {budgetEnabled && isNearBudget && !isOverBudget && !isPaused && (
          <div className="flex items-center gap-2 text-sm text-status-warning">
            <AlertTriangle className="h-4 w-4" />
            Spend has passed {alertThreshold}% of the monthly budget.
          </div>
        )}

        {/* Status indicator */}
        {budgetEnabled && !isPaused && !isOverBudget && !isNearBudget && (
          <div className="flex items-center gap-2 text-sm text-status-success">
            <CheckCircle className="h-4 w-4" />
            Generation active — within budget
          </div>
        )}

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          size="sm"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save budget
        </Button>
      </div>
    </BywordCard>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Shield, Loader2, Save, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface BudgetSettings {
  monthly_budget: number | null;
  budget_alert_threshold: number;
  budget_paused: boolean;
}

interface BudgetCardProps {
  currentMonthSpend: number;
}

export function BudgetCard({ currentMonthSpend }: BudgetCardProps) {
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

  useEffect(() => {
    if (settings) {
      setBudgetEnabled(settings.monthly_budget != null);
      if (settings.monthly_budget != null) {
        setMonthlyBudget(settings.monthly_budget.toString());
      }
      setAlertThreshold(Math.round((settings.budget_alert_threshold ?? 0.8) * 100));
    }
  }, [settings]);

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
      queryClient.invalidateQueries({ queryKey: ["budget-settings"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Budget settings saved!");
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
      toast.success("Generation resumed!");
    },
    onError: () => toast.error("Failed to resume"),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const budgetNum = parseFloat(monthlyBudget) || 0;
  const spendPercent = budgetEnabled && budgetNum > 0 ? Math.min((currentMonthSpend / budgetNum) * 100, 100) : 0;
  const isPaused = settings?.budget_paused === true;
  const isOverBudget = budgetEnabled && budgetNum > 0 && currentMonthSpend >= budgetNum;
  const isNearBudget = budgetEnabled && budgetNum > 0 && spendPercent >= alertThreshold;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Budget Controls
        </CardTitle>
        <CardDescription>
          Set monthly spending limits to auto-pause generation when exceeded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Paused Banner */}
        {isPaused && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">Generation Paused</p>
                <p className="text-xs text-muted-foreground">Monthly budget exceeded. Resume or increase your budget.</p>
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
          </div>
        )}

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable Monthly Budget</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Auto-pause generation when limit is reached</p>
          </div>
          <Switch checked={budgetEnabled} onCheckedChange={setBudgetEnabled} />
        </div>

        {budgetEnabled && (
          <>
            {/* Budget amount */}
            <div className="space-y-2">
              <Label>Monthly Budget (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  className="pl-7"
                  placeholder="10.00"
                />
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current month spend</span>
                <span className={`font-medium ${isOverBudget ? "text-destructive" : isNearBudget ? "text-[hsl(var(--status-warning))]" : ""}`}>
                  ${currentMonthSpend.toFixed(4)} / ${budgetNum.toFixed(2)}
                </span>
              </div>
              <Progress
                value={spendPercent}
                className={`h-2 ${isOverBudget ? "[&>div]:bg-destructive" : isNearBudget ? "[&>div]:bg-[hsl(var(--status-warning))]" : ""}`}
              />
              <p className="text-xs text-muted-foreground">{spendPercent.toFixed(1)}% used</p>
            </div>

            {/* Alert threshold */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alert Threshold</Label>
                <span className="text-sm text-muted-foreground">{alertThreshold}%</span>
              </div>
              <Slider
                value={[alertThreshold]}
                onValueChange={([v]) => setAlertThreshold(v)}
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

        {/* Status indicator */}
        {budgetEnabled && !isPaused && !isOverBudget && (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--status-success))]">
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
          Save Budget Settings
        </Button>
      </CardContent>
    </Card>
  );
}

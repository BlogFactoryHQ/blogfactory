import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, PLAN_REQUIRED_EVENT } from "@/lib/api";
import { transitionDaysRemaining, type BillingState } from "@/lib/billing";

// Blocked writes return billing_url; turn that into one actionable prompt instead of a dead-end error.
export function PlanRequiredNotice() {
  const navigate = useNavigate();
  const location = useLocation();
  const billing = useQuery({
    queryKey: ["billing-state"],
    queryFn: async () => {
      const state = await api.get<BillingState>("/billing/state");
      if (!state) throw new Error("Billing state is unavailable");
      return state;
    },
    staleTime: 60_000,
  });
  const daysRemaining = transitionDaysRemaining(billing.data);

  useEffect(() => {
    const onPlanRequired = (event: Event) => {
      const billingUrl = (event as CustomEvent<{ billingUrl?: string }>).detail?.billingUrl || "/billing";
      if (location.pathname === billingUrl) return;
      toast("Choose a plan to continue", {
        id: "plan-required",
        description: "Your workspace is read-only until a BlogFactory Cloud plan is active.",
        action: { label: "See plans", onClick: () => navigate(billingUrl) },
      });
    };
    window.addEventListener(PLAN_REQUIRED_EVENT, onPlanRequired);
    return () => window.removeEventListener(PLAN_REQUIRED_EVENT, onPlanRequired);
  }, [location.pathname, navigate]);

  if (daysRemaining === null) return null;
  const urgent = daysRemaining <= 14;
  return (
    <aside
      role="status"
      className={`fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4 shadow-lg ${urgent ? "border-[hsl(var(--status-warning))]" : "border-byword-blue/40"}`}
    >
      <div className="text-sm">
        <p className="font-semibold">{daysRemaining ? `Transition access ends in ${daysRemaining} days` : "Transition access has ended"}</p>
        <p className="mt-0.5 text-muted-foreground">Choose a plan to keep automations and MCP writes running.</p>
      </div>
      <Button size="sm" onClick={() => navigate("/billing")}>Choose a plan</Button>
    </aside>
  );
}

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PLAN_REQUIRED_EVENT } from "@/lib/api";

// Blocked writes return billing_url; turn that into one actionable prompt instead of a dead-end error.
export function PlanRequiredNotice() {
  const navigate = useNavigate();
  const location = useLocation();

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

  return null;
}

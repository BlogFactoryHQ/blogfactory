import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { CLOUD_PLANS, isCheckoutActivated, type BillingState } from "@/lib/billing";
import { cn } from "@/lib/utils";

const PLAN_LABELS: Record<string, string> = { none: "No plan", cloud: "Cloud", advanced: "Advanced", internal: "Internal" };
const ACTIVATION_POLL_MS = 3_000;
const RECONCILE_AFTER_MS = 20_000;
const ACTIVATION_TIMEOUT_MS = 180_000;

function draftUsage(state: BillingState) {
  return state.plan === "advanced"
    ? { used: state.usage.automated_completed + state.usage.automated_reserved, limit: state.limits.monthlyAutomatedDrafts }
    : { used: state.usage.manual_completed + state.usage.manual_reserved + state.usage.automated_completed + state.usage.automated_reserved, limit: state.limits.monthlyDrafts };
}

function UsageItem({ label, used, limit, format = String }: { label: string; used: number; limit: number | null; format?: (value: number) => string }) {
  const reached = typeof limit === "number" && limit > 0 && used >= limit;
  return (
    <span className={cn(reached && "text-[hsl(var(--status-warning))]")}>
      {label} <strong>{format(used)}/{limit === null ? "∞" : format(limit)}</strong>{reached && " · limit reached"}
    </span>
  );
}

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const returnedFromCheckout = searchParams.get("checkout") === "success";
  const [activationTimedOut, setActivationTimedOut] = useState(false);
  const baselineCredits = useRef<number | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["billing-state"],
    queryFn: () => api.get<BillingState>("/billing/state"),
    refetchInterval: (query) => (
      returnedFromCheckout && !activationTimedOut && !isCheckoutActivated(query.state.data, baselineCredits.current) ? ACTIVATION_POLL_MS : false
    ),
  });
  if (data && baselineCredits.current === null) baselineCredits.current = data.credits.available;
  const activated = returnedFromCheckout && isCheckoutActivated(data, baselineCredits.current);

  useEffect(() => {
    if (!returnedFromCheckout) return;
    // If the webhook is slow, ask the server to reconcile directly with Polar once.
    const reconcile = window.setTimeout(() => { api.post("/billing/reconcile").then(() => refetch()).catch(() => undefined); }, RECONCILE_AFTER_MS);
    const timeout = window.setTimeout(() => setActivationTimedOut(true), ACTIVATION_TIMEOUT_MS);
    return () => { window.clearTimeout(reconcile); window.clearTimeout(timeout); };
  }, [returnedFromCheckout, refetch]);

  useEffect(() => {
    if (!activated) return;
    toast.success("Your BlogFactory plan is active");
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    next.delete("checkout_id");
    setSearchParams(next, { replace: true });
  }, [activated, searchParams, setSearchParams]);

  const checkout = useMutation({
    mutationFn: (sku: string) => api.post<{ url: string }>("/billing/checkout", { sku, return_path: "/billing" }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (error: Error) => toast.error(error.message),
  });
  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal"),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <BywordPageShell><Loader2 className="h-6 w-6 animate-spin" /></BywordPageShell>;
  const planLabel = PLAN_LABELS[data?.plan || "none"] || data?.plan || "No plan";
  const needsPlan = Boolean(data?.cloud_enforcement && !data.access_allowed);
  const drafts = data ? draftUsage(data) : null;
  const refreshButton = (
    <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
      <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")} />Refresh
    </Button>
  );

  return (
    <BywordPageShell className="max-w-6xl">
      <PageHeader title="Billing" description={data?.managed_ai_enabled ? "Plans, payment status, and prepaid BlogFactory AI Credits." : "Plans, usage, and payment status."} />

      {returnedFromCheckout && !activated && (
        <BywordCard className="mb-6 p-5" >
          <div role="status" className="flex items-start gap-3 text-sm">
            {activationTimedOut ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-warning))]" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-byword-blue" />}
            <div>
              <p className="font-semibold">{activationTimedOut ? "Payment is still processing" : "Payment received. Activating your plan…"}</p>
              <p className="mt-1 text-muted-foreground">{activationTimedOut
                ? "Polar has not confirmed the payment yet. This can take a few minutes. Refresh this page later, or contact support if access does not appear."
                : "This usually takes a few seconds. You can stay on this page; it updates automatically."}</p>
            </div>
          </div>
        </BywordCard>
      )}

      {data?.access_allowed && data.plan !== "internal" && data.usage.sites === 0 && !returnedFromCheckout && (
        <BywordCard className="mb-6 border-byword-blue/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-byword-blue" />
              <div><p className="font-semibold">Your plan is active</p><p className="mt-1 text-muted-foreground">Connect your site and OpenRouter key to create your first draft.</p></div>
            </div>
            <Button asChild><Link to="/onboarding">Set up your workspace <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
          </div>
        </BywordCard>
      )}

      {needsPlan && !returnedFromCheckout && (
        <BywordCard className="mb-6 border-byword-blue/40 p-5">
          <div className="flex items-start gap-3 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-byword-blue" />
            <div>
              <p className="font-semibold">{data?.plan === "none" ? "Choose a plan to start creating" : "Your plan is no longer active"}</p>
              <p className="mt-1 text-muted-foreground">You can look around, but adding sites, sources, and drafts is paused until a BlogFactory Cloud plan is active.</p>
            </div>
          </div>
        </BywordCard>
      )}

      <BywordCard className="mb-6">
        <SectionHeader
          icon={CreditCard}
          title={`Current plan: ${planLabel}`}
          description={data?.subscription_state ? `Subscription ${data.subscription_state}` : data?.entitlement_source === "transition" ? "Transition access" : "Choose a Cloud plan to start."}
          action={<div className="flex items-center gap-2">{refreshButton}{data?.subscription_state && <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>Manage in Polar</Button>}</div>}
        />
        {(data?.grace_ends_at || data?.period_end) && <p className="px-6 pb-5 text-sm text-muted-foreground">{data.grace_ends_at ? `Payment grace ends ${new Date(data.grace_ends_at).toLocaleString()}` : `Current access through ${new Date(data!.period_end!).toLocaleDateString()}`}</p>}
        {data?.entitlement_source === "transition" && <p className="px-6 pb-5 text-sm text-[hsl(var(--status-warning))]">Transition access ends on {new Date(data.period_end!).toLocaleDateString()}. Choose a paid plan before then.</p>}
        {data?.usage && drafts && <div className="grid gap-3 border-t p-5 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <UsageItem label="Sites" used={data.usage.sites} limit={data.limits.sites} />
          <UsageItem label="RSS" used={data.usage.active_feeds} limit={data.limits.activeFeeds} />
          <UsageItem label="Storage" used={data.usage.storage_bytes} limit={data.limits.storageBytes} format={(bytes) => `${(bytes / 1_000_000_000).toFixed(bytes && bytes < 1_000_000_000 ? 2 : 0)} GB`} />
          <UsageItem label="Running" used={data.usage.concurrency} limit={data.limits.concurrency} />
          <UsageItem label="Drafts" used={drafts.used} limit={drafts.limit} />
        </div>}
        {data?.warnings.drafts_limit_reached
          ? <p className="px-6 pb-5 text-sm text-[hsl(var(--status-warning))]">You have used this month's draft allowance. {data.plan === "cloud" ? "Upgrade to Advanced for more drafts, or wait for next month's reset." : "It resets at the start of next month (UTC)."}</p>
          : data?.warnings.drafts_80_percent && <p className="px-6 pb-5 text-sm text-[hsl(var(--status-warning))]">You have used at least 80% of this month's draft allowance.</p>}
      </BywordCard>

      <div className="grid gap-4 md:grid-cols-2">
        {CLOUD_PLANS.map((plan) => {
          const current = data?.plan === plan.name.toLowerCase() && data?.entitlement_source === "polar";
          return <BywordCard key={plan.name} className={cn("p-6", current && "border-byword-blue")}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              {current && <span className="inline-flex items-center gap-1 text-xs font-semibold text-byword-blue"><CheckCircle2 className="h-3.5 w-3.5" />Current plan</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{plan.detail}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => checkout.mutate(plan.monthlySku)} disabled={checkout.isPending || !data?.checkout_enabled}>{plan.monthly}/month</Button>
              <Button variant="outline" onClick={() => checkout.mutate(plan.yearlySku)} disabled={checkout.isPending || !data?.checkout_enabled}>{plan.yearly}/year</Button>
            </div>
          </BywordCard>;
        })}
      </div>

      {data?.managed_ai_enabled ? (
        <BywordCard className="mt-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-byword-orange" /><h2 className="text-lg font-semibold">Managed AI Credits</h2></div><p className="mt-2 text-sm text-muted-foreground">14,000 prepaid credits, valid for 365 days. BYO OpenRouter remains available and does not consume these credits.</p></div>
            <Button onClick={() => checkout.mutate("ai_credits_14000")} disabled={checkout.isPending || !data?.checkout_enabled}>Buy 14,000 · $20</Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Available</p><p className="text-2xl font-semibold">{data.credits.available.toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Reserved</p><p className="text-2xl font-semibold">{data.credits.reserved.toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Debt</p><p className="text-2xl font-semibold">{data.credits.debt.toLocaleString()}</p></div>
          </div>
          {data.eligible_refunds?.length ? <p className="mt-3 text-xs text-muted-foreground">Unused eligible top-ups can currently be refunded through support for up to {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.eligible_refunds.reduce((sum, grant) => sum + grant.maximum_refund_cents, 0) / 100)}.</p> : null}
        </BywordCard>
      ) : (
        <BywordCard className="mt-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-byword-orange" /><h2 className="text-lg font-semibold">Managed AI Credits</h2></div><p className="mt-2 text-sm text-muted-foreground">Managed AI is not available yet. Add your own OpenRouter key in Settings to generate drafts.</p></div>
            <span className="rounded-full border border-byword-border px-3 py-1 text-xs text-muted-foreground">Coming soon</span>
          </div>
        </BywordCard>
      )}

      {!data?.checkout_enabled && <p className="mt-5 text-sm text-muted-foreground">Cloud checkout is not open yet. Existing access and billing state remain visible.</p>}
      <p className="mt-5 text-xs text-muted-foreground">Taxes are calculated at checkout. Access activates after Polar confirms the payment, usually within a few seconds.</p>
    </BywordPageShell>
  );
}

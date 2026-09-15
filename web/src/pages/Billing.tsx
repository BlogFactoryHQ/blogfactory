import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BywordCard, BywordPageShell, SectionHeader } from "@/components/layout/BywordSurface";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type BillingState = {
  checkout_enabled: boolean;
  plan: string;
  subscription_state: string | null;
  entitlement_source: string | null;
  period_end: string | null;
  grace_ends_at: string | null;
  credits: { available: number; reserved: number; debt: number; next_expiry: string | null };
  eligible_refunds: Array<{ grant_id: string; purchased_at: string; remaining_credits: number; maximum_refund_cents: number }>;
  limits: { sites: number | null; storageBytes: number | null; concurrency: number | null; activeFeeds: number | null; monthlyDrafts: number | null; monthlyAutomatedDrafts: number | null };
  usage: { sites: number; storage_bytes: number; concurrency: number; active_feeds: number; manual_completed: number; manual_reserved: number; automated_completed: number; automated_reserved: number };
  warnings: { drafts_80_percent: boolean };
};

const plans = [
  { name: "Cloud", monthly: "$5", yearly: "$49", monthlySku: "cloud_monthly", yearlySku: "cloud_yearly", detail: "3 sites · 1 GB · 3 RSS · 150 successful drafts/month" },
  { name: "Advanced", monthly: "$15", yearly: "$149", monthlySku: "advanced_monthly", yearlySku: "advanced_yearly", detail: "10 sites · 10 GB · 20 RSS · unlimited manual + 600 automated drafts/month" },
];

export default function Billing() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["billing-state"], queryFn: () => api.get<BillingState>("/billing/state") });
  const checkout = useMutation({
    mutationFn: (sku: string) => api.post<{ url: string }>("/billing/checkout", { sku }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (error: Error) => toast.error(error.message),
  });
  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal"),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <BywordPageShell><Loader2 className="h-6 w-6 animate-spin" /></BywordPageShell>;
  return (
    <BywordPageShell className="max-w-6xl">
      <PageHeader title="Billing" description="Plans, payment status, and prepaid BlogFactory AI Credits." />
      <BywordCard className="mb-6">
        <SectionHeader icon={CreditCard} title={`Current plan: ${data?.plan || "none"}`} description={data?.subscription_state ? `Subscription ${data.subscription_state}` : "Choose a Cloud plan to start."} action={data?.subscription_state ? <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>Manage in Polar</Button> : undefined} />
        {(data?.grace_ends_at || data?.period_end) && <p className="px-6 pb-5 text-sm text-muted-foreground">{data.grace_ends_at ? `Payment grace ends ${new Date(data.grace_ends_at).toLocaleString()}` : `Current access through ${new Date(data!.period_end!).toLocaleDateString()}`}</p>}
        {data?.entitlement_source === "transition" && <p className="px-6 pb-5 text-sm text-[hsl(var(--status-warning))]">Transition access ends on {new Date(data.period_end!).toLocaleDateString()}. Choose a paid plan before then.</p>}
        {data?.usage && <div className="grid gap-3 border-t p-5 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <span>Sites <strong>{data.usage.sites}/{data.limits.sites ?? "∞"}</strong></span>
          <span>RSS <strong>{data.usage.active_feeds}/{data.limits.activeFeeds ?? "∞"}</strong></span>
          <span>Storage <strong>{(data.usage.storage_bytes / 1_000_000_000).toFixed(2)}/{data.limits.storageBytes ? data.limits.storageBytes / 1_000_000_000 : "∞"} GB</strong></span>
          <span>Running <strong>{data.usage.concurrency}/{data.limits.concurrency ?? "∞"}</strong></span>
          <span>Drafts <strong>{data.plan === "advanced" ? data.usage.automated_completed + data.usage.automated_reserved : data.usage.manual_completed + data.usage.manual_reserved + data.usage.automated_completed + data.usage.automated_reserved}/{data.plan === "advanced" ? data.limits.monthlyAutomatedDrafts : data.limits.monthlyDrafts}</strong></span>
        </div>}
        {data?.warnings.drafts_80_percent && <p className="px-6 pb-5 text-sm text-[hsl(var(--status-warning))]">You have used at least 80% of this month's draft allowance.</p>}
      </BywordCard>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => <BywordCard key={plan.name} className="p-6">
          <h2 className="text-xl font-semibold">{plan.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{plan.detail}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => checkout.mutate(plan.monthlySku)} disabled={checkout.isPending || !data?.checkout_enabled}>{plan.monthly}/month</Button>
            <Button variant="outline" onClick={() => checkout.mutate(plan.yearlySku)} disabled={checkout.isPending || !data?.checkout_enabled}>{plan.yearly}/year</Button>
          </div>
        </BywordCard>)}
      </div>
      <BywordCard className="mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-byword-orange" /><h2 className="text-lg font-semibold">Managed AI Credits</h2></div><p className="mt-2 text-sm text-muted-foreground">14,000 prepaid credits, valid for 365 days. BYO OpenRouter remains available and does not consume these credits.</p></div>
          <Button onClick={() => checkout.mutate("ai_credits_14000")} disabled={checkout.isPending || !data?.checkout_enabled}>Buy 14,000 · $20</Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Available</p><p className="text-2xl font-semibold">{data?.credits.available.toLocaleString() || 0}</p></div>
          <div><p className="text-xs text-muted-foreground">Reserved</p><p className="text-2xl font-semibold">{data?.credits.reserved.toLocaleString() || 0}</p></div>
          <div><p className="text-xs text-muted-foreground">Debt</p><p className="text-2xl font-semibold">{data?.credits.debt.toLocaleString() || 0}</p></div>
        </div>
        <Button className="mt-4" variant="ghost" size="sm" onClick={() => refetch()}>Refresh payment state</Button>
        {data?.eligible_refunds?.length ? <p className="mt-3 text-xs text-muted-foreground">Unused eligible top-ups can currently be refunded through support for up to {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.eligible_refunds.reduce((sum, grant) => sum + grant.maximum_refund_cents, 0) / 100)}.</p> : null}
      </BywordCard>
      {!data?.checkout_enabled && <p className="mt-5 text-sm text-muted-foreground">Cloud checkout is not open yet. Existing access and billing state remain visible.</p>}
      <p className="mt-5 text-xs text-muted-foreground">Taxes are calculated at checkout. Checkout success alone does not activate access; BlogFactory waits for Polar payment confirmation.</p>
    </BywordPageShell>
  );
}

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { accessStatus, formatDate, formatDateTime, planLabel, type CustomerDetail } from "@/lib/admin-customers";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  );
}

function jobStatus(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "error" as const;
  if (status === "processing" || status === "running") return "running" as const;
  return "pending" as const;
}

export default function AdminCustomerDetail() {
  const { id = "" } = useParams();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"suspend" | "unsuspend" | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-customer", id],
    queryFn: () => api.get<CustomerDetail>(`/admin/customers/${id}`),
  });

  const action = useMutation({
    mutationFn: (kind: "suspend" | "unsuspend") => api.post(`/admin/customers/${id}/${kind}`, { reason: reason.trim() }),
    onSuccess: (_result, kind) => {
      toast.success(kind === "suspend" ? "Account suspended" : "Account restored");
      setDialog(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-customer", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !data) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" asChild><Link to="/admin/customers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Customers</Link></Button>
        <p className="mt-6 text-sm text-destructive">{(error as Error | null)?.message || "Customer not found"}</p>
      </div>
    );
  }

  const { customer, entitlement } = data;
  const suspended = Boolean(customer.suspendedAt);
  const access = accessStatus({
    suspendedAt: customer.suspendedAt,
    plan: entitlement?.plan || null,
    entitlementStatus: entitlement?.status || null,
    entitlementExpiresAt: entitlement?.expiresAt || null,
  });
  const canSuspend = customer.role !== "admin" && customer.id !== me?.id;
  const totalPosts = data.sites.reduce((sum, site) => sum + site.posts, 0);

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link to="/admin/customers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Customers</Link>
      </Button>
      <PageHeader title={customer.email} description={customer.displayName || undefined}>
        <StatusBadge status={access.status} label={access.label} />
        {customer.role === "admin" && <Badge variant="outline">admin</Badge>}
        {suspended ? (
          <Button size="sm" onClick={() => setDialog("unsuspend")}><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Unsuspend</Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={!canSuspend} title={canSuspend ? undefined : "Admins cannot be suspended"} onClick={() => setDialog("suspend")}>
            <Ban className="mr-1.5 h-3.5 w-3.5" />Suspend
          </Button>
        )}
      </PageHeader>

      {suspended && (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Suspended {formatDateTime(customer.suspendedAt)}</p>
          {customer.suspendedReason && <p className="mt-1 text-muted-foreground">{customer.suspendedReason}</p>}
          <p className="mt-1 text-muted-foreground">Web sign-in, MCP connections and background generation are blocked. No data has been deleted.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Account</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Joined">{formatDate(customer.createdAt)}</Field>
              <Field label="Last login">{formatDateTime(customer.lastLoginAt)}</Field>
              <Field label="Email verified">{customer.emailVerified ? "Yes" : "No"}</Field>
              <Field label="Active MCP tokens">{data.mcpTokensActive}</Field>
              <Field label="Account ID"><span className="font-mono text-xs" title={customer.id}>{customer.id}</span></Field>
              <Field label="WorkOS ID"><span className="font-mono text-xs" title={customer.workosUserId || undefined}>{customer.workosUserId || "—"}</span></Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Plan</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Plan">{planLabel(entitlement?.plan)}</Field>
              <Field label="Source">{entitlement?.source || "—"}</Field>
              <Field label="Status">{entitlement?.status || "—"}</Field>
              <Field label="Expires">{formatDate(entitlement?.expiresAt, entitlement ? "No expiry" : "—")}</Field>
              <Field label="Polar customer"><span className="font-mono text-xs">{data.polarCustomerId || "—"}</span></Field>
              <Field label="Subscription">
                {data.subscriptions[0]
                  ? `${data.subscriptions[0].planCode} · ${data.subscriptions[0].status}${data.subscriptions[0].cancelAtPeriodEnd ? " · cancels" : ""}`
                  : "—"}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Usage · {data.usage.period.slice(0, 7)}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Manual drafts">{data.usage.manual}</Field>
              <Field label="Automated drafts">{data.usage.automated}</Field>
              <Field label="In progress">{data.usage.reserved}</Field>
              <Field label="AI credits">{data.credits ? `${data.credits.available.toLocaleString()}${data.credits.debt ? ` (debt ${data.credits.debt})` : ""}` : "—"}</Field>
              <Field label="Jobs (all time)">{data.jobs.total}</Field>
              <Field label="Failed jobs, 7 days"><span className={data.jobs.failed7d ? "text-destructive" : undefined}>{data.jobs.failed7d}</span></Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Sites · {data.sites.length} · {totalPosts} posts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Site</TableHead><TableHead>Domain</TableHead><TableHead className="text-right">Posts</TableHead><TableHead>Last post</TableHead><TableHead>Created</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.sites.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">No sites.</TableCell></TableRow>
              ) : data.sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{site.domain}</TableCell>
                  <TableCell className="text-right tabular-nums">{site.posts}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(site.lastPostAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(site.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent jobs</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {data.jobs.recent.length === 0 ? (
                  <TableRow><TableCell className="h-16 text-center text-muted-foreground">No jobs yet.</TableCell></TableRow>
                ) : data.jobs.recent.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="w-28"><StatusBadge status={jobStatus(job.status)} label={job.status} /></TableCell>
                    <TableCell>
                      <div className="text-sm">{job.sourceType} · {job.currentStep}</div>
                      {job.errorMessage && <div className="line-clamp-2 text-xs text-destructive">{job.errorMessage}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{formatDateTime(job.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Admin history</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {data.audit.length === 0 ? (
                  <TableRow><TableCell className="h-16 text-center text-muted-foreground">No admin actions recorded.</TableCell></TableRow>
                ) : data.audit.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="w-28"><Badge variant={event.action === "suspend" ? "destructive" : "secondary"}>{event.action}</Badge></TableCell>
                    <TableCell>
                      <div className="text-sm">{event.reason || "—"}</div>
                      <div className="text-xs text-muted-foreground">by {event.adminEmail || "deleted admin"}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !action.isPending) { setDialog(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "suspend" ? `Suspend ${customer.email}?` : `Unsuspend ${customer.email}?`}</DialogTitle>
            <DialogDescription>
              {dialog === "suspend"
                ? "They will be signed out of the web app, their MCP connections will stop working, and background generation will pause. Nothing is deleted, and you can undo this."
                : "Their web sign-in, MCP connections and background generation will work again."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="admin-reason">Reason (kept in the admin history)</Label>
            <Textarea
              id="admin-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder={dialog === "suspend" ? "e.g. Spam generation on 3 sites, ticket #12" : "e.g. Issue resolved with customer"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setReason(""); }} disabled={action.isPending}>Cancel</Button>
            <Button
              variant={dialog === "suspend" ? "destructive" : "default"}
              disabled={reason.trim().length < 3 || action.isPending}
              onClick={() => dialog && action.mutate(dialog)}
            >
              {action.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {dialog === "suspend" ? "Suspend account" : "Unsuspend account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

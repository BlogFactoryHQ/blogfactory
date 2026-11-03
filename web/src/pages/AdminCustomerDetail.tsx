import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, Ban, CalendarClock, Coins, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { ACTION_LABELS, accessStatus, dateInputValue, endOfDayIso, formatDate, formatDateTime, planLabel, type AdminAction, type CustomerDetail } from "@/lib/admin-customers";

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
  const [dialog, setDialog] = useState<AdminAction | null>(null);
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState("advanced");
  const [endDate, setEndDate] = useState("");
  const [credits, setCredits] = useState("");
  const [targetEmail, setTargetEmail] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-customer", id],
    queryFn: () => api.get<CustomerDetail>(`/admin/customers/${id}`),
  });

  // Extensions count from the current end date while the plan is still running.
  const extensionBase = () => {
    const current = data?.entitlement?.status !== "revoked" && data?.entitlement?.expiresAt ? new Date(data.entitlement.expiresAt) : null;
    return current && current.getTime() > Date.now() ? current : new Date();
  };
  const closeDialog = () => { setDialog(null); setReason(""); setCredits(""); setTargetEmail(""); };
  const openDialog = (next: AdminAction) => {
    if (next.kind === "plan") {
      setPlan(data?.entitlement?.plan && data.entitlement.plan !== "none" ? data.entitlement.plan : "advanced");
      setEndDate(dateInputValue(new Date(extensionBase().getTime() + 30 * 86_400_000)));
    }
    if (next.kind === "credits") setEndDate(dateInputValue(new Date(Date.now() + 365 * 86_400_000)));
    setDialog(next);
  };

  const action = useMutation({
    mutationFn: (kind: AdminAction) => {
      const body: Record<string, unknown> = { reason: reason.trim() };
      if (kind.kind === "plan") Object.assign(body, { plan, expiresAt: plan === "internal" && !endDate ? null : endOfDayIso(endDate) });
      if (kind.kind === "credits") Object.assign(body, { credits: Number(credits), expiresAt: endOfDayIso(endDate) });
      if (kind.kind === "transfer") Object.assign(body, { targetEmail: targetEmail.trim() });
      const path = kind.kind === "revoke_plan" ? "plan/revoke" : kind.kind === "transfer" ? `sites/${kind.site.id}/transfer` : kind.kind;
      return api.post(`/admin/customers/${id}/${path}`, body);
    },
    onSuccess: (_result, kind) => {
      toast.success(ACTION_LABELS[kind.kind].done);
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["admin-customer"] });
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
  const polarOwned = Boolean(entitlement && entitlement.source === "polar" && entitlement.status !== "revoked"
    && (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > Date.now()));
  const labels = dialog ? ACTION_LABELS[dialog.kind] : null;
  const formValid = reason.trim().length >= 3
    && (dialog?.kind !== "plan" || (plan === "internal" || Boolean(endDate)))
    && (dialog?.kind !== "credits" || (Number.isInteger(Number(credits)) && Number(credits) > 0 && Boolean(endDate)))
    && (dialog?.kind !== "transfer" || targetEmail.includes("@"));

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link to="/admin/customers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Customers</Link>
      </Button>
      <PageHeader title={customer.email} description={customer.displayName || undefined}>
        <StatusBadge status={access.status} label={access.label} />
        {customer.role === "admin" && <Badge variant="outline">admin</Badge>}
        {suspended ? (
          <Button size="sm" onClick={() => openDialog({ kind: "unsuspend" })}><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Unsuspend</Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={!canSuspend} title={canSuspend ? undefined : "Admins cannot be suspended"} onClick={() => openDialog({ kind: "suspend" })}>
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={polarOwned} title={polarOwned ? "Paid Polar plans are changed in Polar" : undefined} onClick={() => openDialog({ kind: "plan" })}>
                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />{entitlement && entitlement.status !== "revoked" ? "Change or extend" : "Grant plan"}
              </Button>
              {entitlement && entitlement.status !== "revoked" && !polarOwned && entitlement.source !== "polar" && (
                <Button size="sm" variant="outline" onClick={() => openDialog({ kind: "revoke_plan" })}>Revoke</Button>
              )}
            </div>
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
            <div className="mt-4">
              <Button size="sm" variant="outline" onClick={() => openDialog({ kind: "credits" })}><Coins className="mr-1.5 h-3.5 w-3.5" />Give AI credits</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Sites · {data.sites.length} · {totalPosts} posts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Site</TableHead><TableHead>Domain</TableHead><TableHead className="text-right">Posts</TableHead><TableHead>Last post</TableHead><TableHead>Created</TableHead><TableHead className="w-24" /></TableRow>
            </TableHeader>
            <TableBody>
              {data.sites.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-16 text-center text-muted-foreground">No sites.</TableCell></TableRow>
              ) : data.sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{site.domain}</TableCell>
                  <TableCell className="text-right tabular-nums">{site.posts}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(site.lastPostAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(site.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openDialog({ kind: "transfer", site })}>
                      <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />Move
                    </Button>
                  </TableCell>
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
                    <TableCell className="w-28"><Badge variant={event.action === "suspend" || event.action === "revoke_plan" ? "destructive" : "secondary"}>{event.action.replace(/_/g, " ")}</Badge></TableCell>
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

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !action.isPending) closeDialog(); }}>
        <DialogContent>
          {dialog && labels && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.kind === "transfer" ? `Move “${dialog.site.name}” to another account?` : `${labels.title} · ${customer.email}`}</DialogTitle>
                <DialogDescription>
                  {dialog.kind === "transfer"
                    ? `All ${dialog.site.posts} posts, jobs, feeds, campaigns, integrations and Search Console data for this site move to the account you enter. Brand voices it uses are copied. ${customer.email} loses access to it, including through MCP.`
                    : labels.description}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {dialog.kind === "plan" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <Select value={plan} onValueChange={setPlan}>
                        <SelectTrigger aria-label="Plan"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cloud">Cloud</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="internal">Internal (unlimited)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-end">{plan === "internal" ? "Ends (optional)" : "Ends"}</Label>
                      <Input id="admin-end" type="date" value={endDate} min={dateInputValue(new Date(Date.now() + 86_400_000))} onChange={(event) => setEndDate(event.target.value)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                      <span className="text-xs text-muted-foreground">
                        {extensionBase().getTime() > Date.now() + 60_000 ? `From current end, ${formatDate(extensionBase().toISOString())}:` : "From today:"}
                      </span>
                      {[30, 60, 90, 365].map((days) => (
                        <Button key={days} type="button" size="sm" variant="outline" onClick={() => setEndDate(dateInputValue(new Date(extensionBase().getTime() + days * 86_400_000)))}>
                          {days === 365 ? "+1 year" : `+${days} days`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {dialog.kind === "credits" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-credits">Credits</Label>
                      <Input id="admin-credits" type="number" min={1} step={1} inputMode="numeric" value={credits} onChange={(event) => setCredits(event.target.value)} placeholder="14000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-end">Expire on</Label>
                      <Input id="admin-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                    </div>
                  </div>
                )}
                {dialog.kind === "transfer" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-target">Move to account (email)</Label>
                    <Input id="admin-target" type="email" value={targetEmail} onChange={(event) => setTargetEmail(event.target.value)} placeholder="name@example.com" autoComplete="off" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="admin-reason">Reason (kept in the admin history)</Label>
                  <Textarea id="admin-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder={labels.placeholder} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={action.isPending}>Cancel</Button>
                <Button variant={labels.destructive ? "destructive" : "default"} disabled={!formValid || action.isPending} onClick={() => action.mutate(dialog)}>
                  {action.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {labels.confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

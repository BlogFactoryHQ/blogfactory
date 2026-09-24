import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, UserCheck, UserMinus, UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusType } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/patterns/EmptyState";
import { RowActions } from "@/components/patterns/RowActions";
import { BywordCard, BywordPageShell } from "@/components/layout/BywordSurface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TableSkeleton } from "@/components/patterns/PageSkeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "user";
  approvalStatus: "pending" | "approved" | "rejected";
  rejectedReason: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  hasOpenrouterKey: boolean;
  openrouterKeyLast4: string | null;
  openrouterCredentialStatus?: "usable" | "missing" | "undecryptable" | string;
  hasGoogleAiKey: boolean;
  googleKeyLast4: string | null;
  googleAiCredentialStatus?: "usable" | "missing" | "undecryptable" | string;
}

function approvalBadge(status: AdminUser["approvalStatus"]): { status: StatusType; label: string } {
  if (status === "approved") return { status: "success", label: "Approved" };
  if (status === "rejected") return { status: "error", label: "Rejected" };
  return { status: "pending", label: "Pending" };
}

function keyStatus(saved: boolean, last4: string | null, status?: string) {
  if (status === "undecryptable") return "needs re-save";
  return saved ? `••••${last4}` : "missing";
}

export default function AdminUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [rejectTarget, setRejectTarget] = useState<AdminUser | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null);

  const { data: users = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.getArray<AdminUser>("/admin/users"),
  });

  const actionMutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) => api.post(path, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectUser = (target: AdminUser) => {
    setRejectReason(target.rejectedReason || "");
    setRejectTarget(target);
  };

  return (
    <BywordPageShell>
      <PageHeader
        title="Users"
        description="Approve beta testers, manage admin access, and review API key setup status."
      />

      <BywordCard>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>API keys</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0"><TableSkeleton rows={4} columns={5} /></TableCell>
                </TableRow>
              ) : error ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      size="row"
                      tone="error"
                      title="Users could not be loaded"
                      description="No account was changed. Retry to see the current list."
                      primaryAction={{ label: "Try again", onClick: () => void refetch() }}
                    />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState size="row" title="No users yet" description="Accounts appear here once someone signs up or is bootstrapped by an administrator." />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((target) => {
                  const isSelf = target.id === user?.id;
                  return (
                    <TableRow key={target.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{target.displayName || target.email.split("@")[0]}</p>
                          <p className="text-xs text-muted-foreground">{target.email}</p>
                          {target.rejectedReason && (
                            <p className="mt-1 text-xs text-status-error">{target.rejectedReason}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge {...approvalBadge(target.approvalStatus)} showIcon={false} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={target.role === "admin" ? "secondary" : "outline"}>
                          {target.role === "admin" ? "Admin" : "User"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <p>
                            OpenRouter: {keyStatus(target.hasOpenrouterKey, target.openrouterKeyLast4, target.openrouterCredentialStatus)}
                          </p>
                          <p>
                            Google: {keyStatus(target.hasGoogleAiKey, target.googleKeyLast4, target.googleAiCredentialStatus)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {target.lastLoginAt ? new Date(target.lastLoginAt).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {target.approvalStatus !== "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actionMutation.mutate({ path: `/admin/users/${target.id}/approve` })}
                              disabled={actionMutation.isPending}
                            >
                              <UserCheck className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                          )}
                          <RowActions
                            triggerLabel={`Actions for ${target.email}`}
                            label={target.email}
                            actions={[
                              {
                                label: target.role === "admin" ? "Demote to user" : "Promote to admin",
                                icon: Shield,
                                disabled: actionMutation.isPending || (isSelf && target.role === "admin"),
                                onSelect: () => actionMutation.mutate({
                                  path: `/admin/users/${target.id}/role`,
                                  body: { role: target.role === "admin" ? "user" : "admin" },
                                }),
                              },
                              ...(target.approvalStatus !== "rejected" ? [{
                                label: "Reject",
                                icon: UserX,
                                destructive: true,
                                separatorBefore: true,
                                disabled: actionMutation.isPending || isSelf,
                                onSelect: () => rejectUser(target),
                              }] : []),
                              ...(target.approvalStatus === "approved" ? [{
                                label: "Revoke access",
                                icon: UserMinus,
                                destructive: true,
                                disabled: actionMutation.isPending || isSelf,
                                onSelect: () => setRevokeTarget(target),
                              }] : []),
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </BywordCard>

      <AlertDialog open={Boolean(rejectTarget)} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {rejectTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>The account cannot use BlogFactory until it is approved again.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input id="reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (rejectTarget) actionMutation.mutate({ path: `/admin/users/${rejectTarget.id}/reject`, body: { reason: rejectReason } });
                setRejectTarget(null);
              }}
            >
              Reject user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for {revokeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>The account returns to pending and loses access until it is approved again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revokeTarget) actionMutation.mutate({ path: `/admin/users/${revokeTarget.id}/revoke` });
                setRevokeTarget(null);
              }}
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BywordPageShell>
  );
}

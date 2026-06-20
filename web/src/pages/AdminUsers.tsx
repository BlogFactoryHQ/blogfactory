import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, UserCheck, UserMinus, UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  hasGoogleAiKey: boolean;
  googleKeyLast4: string | null;
}

function statusVariant(status: AdminUser["approvalStatus"]) {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

export default function AdminUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users"),
  });

  const actionMutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: any }) => api.post(path, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectUser = (target: AdminUser) => {
    const reason = window.prompt(`Reason for rejecting ${target.email}?`, target.rejectedReason || "");
    if (reason === null) return;
    actionMutation.mutate({ path: `/admin/users/${target.id}/reject`, body: { reason } });
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Admin Users"
        description="Approve beta testers, manage admin access, and review API key setup status."
      />

      <Card className="mt-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>API Keys</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No users found.
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
                            <p className="mt-1 text-xs text-destructive">{target.rejectedReason}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(target.approvalStatus)}>
                          {target.approvalStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={target.role === "admin" ? "default" : "outline"}>
                          {target.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <p>
                            OpenRouter: {target.hasOpenrouterKey ? `••••${target.openrouterKeyLast4}` : "missing"}
                          </p>
                          <p>
                            Google: {target.hasGoogleAiKey ? `••••${target.googleKeyLast4}` : "missing"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {target.lastLoginAt ? new Date(target.lastLoginAt).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {target.approvalStatus !== "approved" && (
                            <Button
                              size="sm"
                              onClick={() => actionMutation.mutate({ path: `/admin/users/${target.id}/approve` })}
                              disabled={actionMutation.isPending}
                            >
                              <UserCheck className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                          )}
                          {target.approvalStatus !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectUser(target)}
                              disabled={actionMutation.isPending || isSelf}
                            >
                              <UserX className="mr-1 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          )}
                          {target.approvalStatus === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => actionMutation.mutate({ path: `/admin/users/${target.id}/revoke` })}
                              disabled={actionMutation.isPending || isSelf}
                            >
                              <UserMinus className="mr-1 h-3.5 w-3.5" />
                              Revoke
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              actionMutation.mutate({
                                path: `/admin/users/${target.id}/role`,
                                body: { role: target.role === "admin" ? "user" : "admin" },
                              })
                            }
                            disabled={actionMutation.isPending || (isSelf && target.role === "admin")}
                          >
                            <Shield className="mr-1 h-3.5 w-3.5" />
                            {target.role === "admin" ? "Demote" : "Promote"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

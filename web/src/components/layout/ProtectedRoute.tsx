import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Clock, Loader2, LogOut, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FactoryMark } from "@/components/layout/BywordSurface";

function AccountStatusScreen({
  type,
  reason,
  onSignOut,
}: {
  type: "pending" | "rejected";
  reason?: string | null;
  onSignOut: () => void;
}) {
  const rejected = type === "rejected";
  const Icon = rejected ? ShieldX : Clock;

  return (
    <div className="flex min-h-screen items-center justify-center factory-grid-bg p-4">
      <div className="w-full max-w-md rounded-md border border-byword-border bg-card p-6 text-center factory-panel">
        <FactoryMark className="mb-6 justify-center" />
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-sm border border-byword-border bg-muted">
          <Icon className="h-6 w-6 text-foreground" />
        </div>
        <h1 className="font-mono text-xl font-semibold uppercase">
          {rejected ? "Access request rejected" : "Approval pending"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {rejected
            ? reason || "Your BlogFactory beta access request was not approved."
            : "Your account has been created. An admin needs to approve your access before you can use BlogFactory."}
        </p>
        <Button variant="outline" className="mt-8" onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, isLoading, signOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center factory-grid-bg">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/auth"
        state={{ returnTo: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }

  if (user.role !== "admin" && user.approvalStatus === "pending") {
    return <AccountStatusScreen type="pending" onSignOut={signOut} />;
  }

  if (user.role !== "admin" && user.approvalStatus === "rejected") {
    return <AccountStatusScreen type="rejected" reason={user.rejectedReason} onSignOut={signOut} />;
  }

  return <Outlet />;
}

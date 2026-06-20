import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Clock, Loader2, LogOut, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-6 w-6 text-foreground" />
        </div>
        <h1 className="text-xl font-semibold">
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (user.role !== "admin" && user.approvalStatus === "pending") {
    return <AccountStatusScreen type="pending" onSignOut={signOut} />;
  }

  if (user.role !== "admin" && user.approvalStatus === "rejected") {
    return <AccountStatusScreen type="rejected" reason={user.rejectedReason} onSignOut={signOut} />;
  }

  return <Outlet />;
}

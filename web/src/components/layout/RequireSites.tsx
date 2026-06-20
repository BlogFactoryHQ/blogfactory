import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSites } from "@/hooks/useSites";

export function RequireSites() {
  const { sites, isLoading } = useSites();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center byword-dot-bg">
        <div className="flex items-center gap-3 rounded-lg border border-byword-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-byword-blue" />
          Loading workspace...
        </div>
      </div>
    );
  }

  if (sites.length === 0 && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

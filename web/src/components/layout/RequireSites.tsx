import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSites } from "@/hooks/useSites";

export function RequireSites() {
  const { sites, isLoading } = useSites();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center factory-grid-bg">
        <div className="flex items-center gap-3 rounded-md border border-byword-border bg-card px-5 py-4 text-sm text-muted-foreground factory-panel">
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

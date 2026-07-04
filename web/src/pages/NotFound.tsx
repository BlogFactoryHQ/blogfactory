import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { FactoryMark } from "@/components/layout/BywordSurface";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center factory-grid-bg p-6">
      <div className="w-full max-w-sm rounded-md border border-byword-border bg-card p-8 text-center factory-panel">
        <FactoryMark className="mb-6 justify-center" />
        <p className="mb-4 font-mono text-7xl font-semibold text-foreground/25">404</p>
        <p className="text-sm text-muted-foreground mb-6">This page doesn't exist.</p>
        <a href="/" className="text-sm text-byword-blue underline underline-offset-4 hover:text-byword-blue/70 transition-calm">
          Back to dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { BywordCard, FactoryMark, WorkspaceBackground } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function McpOAuthLogin() {
  const [searchParams] = useSearchParams();
  const externalAuthId = searchParams.get("external_auth_id");
  const started = useRef(false);
  const [error, setError] = useState<string | null>(
    externalAuthId ? null : "This authorization request is missing or expired.",
  );

  const complete = useCallback(async () => {
    if (!externalAuthId) return;
    setError(null);
    try {
      const result = await api.post<{ redirect_uri: string }>("/mcp/oauth/complete", {
        external_auth_id: externalAuthId,
      });
      window.location.assign(result.redirect_uri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The MCP connection could not be authorized.");
    }
  }, [externalAuthId]);

  useEffect(() => {
    if (started.current || !externalAuthId) return;
    started.current = true;
    void complete();
  }, [complete, externalAuthId]);

  return (
    <WorkspaceBackground className="flex min-h-screen items-center justify-center p-4">
      <BywordCard className="w-full max-w-md">
        <div className="border-b border-byword-border px-5 py-4 sm:px-6">
          <FactoryMark />
        </div>
        <div className="px-5 py-8 text-center sm:px-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm border border-byword-border bg-muted text-byword-blue">
            {error
              ? <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
              : <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />}
          </div>
          <h1 className="mt-5 text-xl font-semibold text-foreground">
            {error ? "Connection needs attention" : "Connecting your MCP client"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground" aria-live="polite">
            {error || "BlogFactory is confirming your account. Next, choose the site this client may read."}
          </p>
          {error ? (
            <Button type="button" className="mt-6 w-full" onClick={() => void complete()} disabled={!externalAuthId}>
              Try again
            </Button>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
              Your BlogFactory password is never shared with the client.
            </div>
          )}
        </div>
      </BywordCard>
    </WorkspaceBackground>
  );
}

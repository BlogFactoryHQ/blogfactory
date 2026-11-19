import { useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { BywordCard, FactoryMark, WorkspaceBackground } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSites } from "@/hooks/useSites";
import { api } from "@/lib/api";

export default function McpOAuthLogin() {
  const [searchParams] = useSearchParams();
  const externalAuthId = searchParams.get("external_auth_id");
  const { sites, isLoading } = useSites();
  const activeSites = sites.filter((site) => site.status === "active");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    externalAuthId ? null : "This authorization request is missing or expired.",
  );

  const complete = async () => {
    if (!externalAuthId || !siteIds.length || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ redirect_uri: string }>("/mcp/oauth/complete", {
        external_auth_id: externalAuthId,
        site_ids: siteIds,
      });
      window.location.assign(result.redirect_uri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The MCP connection could not be authorized.");
      setSubmitting(false);
    }
  };

  const toggleSite = (siteId: string, checked: boolean) => {
    setSiteIds((current) => checked
      ? [...new Set([...current, siteId])]
      : current.filter((id) => id !== siteId));
  };

  return (
    <WorkspaceBackground className="flex min-h-screen items-center justify-center p-4">
      <BywordCard className="w-full max-w-md">
        <div className="border-b border-byword-border px-5 py-4 sm:px-6">
          <FactoryMark />
        </div>
        <div className="px-5 py-8 sm:px-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm border border-byword-border bg-muted text-byword-blue">
            {error
              ? <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
              : <ShieldCheck className="h-6 w-6 text-success" aria-hidden="true" />}
          </div>
          <h1 className="mt-5 text-center text-xl font-semibold text-foreground">Choose allowed sites</h1>
          <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
            This MCP connection can access only the sites you select.
          </p>
          {error && <p className="mt-4 text-center text-sm text-destructive" role="alert">{error}</p>}
          <fieldset className="relative mt-6 space-y-2" disabled={isLoading || submitting || !externalAuthId}>
            <legend className="text-sm font-medium">Allowed sites</legend>
            {activeSites.length > 1 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="absolute right-0 top-0 h-auto p-0"
                onClick={() => setSiteIds(siteIds.length === activeSites.length ? [] : activeSites.map((site) => site.id))}
              >
                {siteIds.length === activeSites.length ? "Clear all" : "Select all sites"}
              </Button>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-byword-border p-3">
              {isLoading && <div className="flex items-center justify-center py-4 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading sites</div>}
              {!isLoading && activeSites.map((site) => (
                <div key={site.id} className="flex items-start gap-3 rounded-sm p-2 hover:bg-muted/60">
                  <Checkbox
                    id={`oauth-site-${site.id}`}
                    checked={siteIds.includes(site.id)}
                    onCheckedChange={(checked) => toggleSite(site.id, checked === true)}
                  />
                  <Label htmlFor={`oauth-site-${site.id}`} className="min-w-0 cursor-pointer">
                    <span className="block text-sm font-medium">{site.name}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{site.domain}</span>
                  </Label>
                </div>
              ))}
              {!isLoading && !activeSites.length && <p className="py-4 text-center text-sm text-muted-foreground">Add an active site before connecting an MCP client.</p>}
            </div>
          </fieldset>
          <Button type="button" className="mt-6 w-full" onClick={() => void complete()} disabled={!externalAuthId || !siteIds.length || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Continue
          </Button>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
            Unselected sites remain inaccessible.
          </div>
        </div>
      </BywordCard>
    </WorkspaceBackground>
  );
}

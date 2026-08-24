import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Plus, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { api, retryTransientApiError } from "@/lib/api";
import { useMcpCapabilities } from "@/hooks/useMcpCapabilities";
import { useSites } from "@/hooks/useSites";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface McpToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  site_ids: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface McpTokenList {
  tokens: McpToken[];
}

interface CreatedMcpToken {
  token: McpToken;
  secret: string;
}

interface McpOAuthConnection {
  id: string;
  name: string;
  scopes: string[];
  site_id: string;
  site_name: string;
  site_domain: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface McpOAuthConnectionList {
  connections: McpOAuthConnection[];
}

type RevokeTarget = {
  id: string;
  name: string;
  kind: "personal" | "oauth";
};

function tokenStatus(token: McpToken) {
  if (token.revoked_at) return { label: "Revoked", variant: "destructive" as const };
  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    return { label: "Expired", variant: "secondary" as const };
  }
  return { label: "Active", variant: "default" as const };
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

function scopeLabel(scope: string) {
  if (scope === "content:read") return "Read content";
  if (scope === "drafts:write") return "Edit drafts";
  if (scope === "publish:draft") return "Push CMS drafts";
  return scope;
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Clipboard is not available");
  }
}

export function McpConnectionsPanel() {
  const queryClient = useQueryClient();
  const { sites, activeSite, isLoading: sitesLoading } = useSites();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [expiresOn, setExpiresOn] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const tokensQuery = useQuery({
    queryKey: ["mcp-tokens"],
    queryFn: () => api.get<McpTokenList>("/mcp/tokens"),
    retry: retryTransientApiError,
  });
  const capabilitiesQuery = useMcpCapabilities();
  const endpoint = new URL(capabilitiesQuery.data?.endpoint || import.meta.env.VITE_MCP_URL || `${window.location.origin}/mcp`).toString();
  const codexOauthCommand = `codex mcp add blogfactory --url ${endpoint}`;
  const codexTokenCommand = `${codexOauthCommand} --bearer-token-env-var BLOGFACTORY_MCP_TOKEN`;
  const oauthEnabled = capabilitiesQuery.data?.oauth_enabled === true;
  const oauthConnectionsQuery = useQuery({
    queryKey: ["mcp-oauth-connections"],
    queryFn: () => api.get<McpOAuthConnectionList>("/mcp/oauth/connections"),
    retry: retryTransientApiError,
    enabled: oauthEnabled,
  });

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !siteIds.length || creating) return;
    setCreating(true);
    try {
      const { secret, token } = await api.post<CreatedMcpToken>("/mcp/tokens", {
        name: name.trim(),
        scopes: ["content:read", "drafts:write", "publish:draft"],
        site_ids: siteIds,
        expires_at: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null,
      });
      queryClient.setQueryData<McpTokenList>(["mcp-tokens"], (current) => ({
        tokens: [token, ...(current?.tokens.filter((item) => item.id !== token.id) || [])],
      }));
      setCreateOpen(false);
      setCreatedSecret(secret);
      setName("");
      setSiteIds([]);
      setExpiresOn("");
      void queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection token could not be created");
    } finally {
      setCreating(false);
    }
  };

  const revokeMutation = useMutation({
    mutationFn: (target: RevokeTarget) => api.delete(
      target.kind === "oauth"
        ? `/mcp/oauth/connections/${encodeURIComponent(target.id)}`
        : `/mcp/tokens/${encodeURIComponent(target.id)}`,
    ),
    onSuccess: (_, target) => {
      if (target.kind === "oauth") {
        queryClient.setQueryData<McpOAuthConnectionList>(["mcp-oauth-connections"], (current) => current ? {
          connections: current.connections.map((connection) => connection.id === target.id
            ? { ...connection, revoked_at: new Date().toISOString() }
            : connection),
        } : current);
      } else {
        queryClient.setQueryData<McpTokenList>(["mcp-tokens"], (current) => current ? {
          tokens: current.tokens.map((token) => token.id === target.id
            ? { ...token, revoked_at: new Date().toISOString() }
            : token),
        } : current);
      }
      setRevokeTarget(null);
      toast.success("Connection revoked");
      void queryClient.invalidateQueries({
        queryKey: [target.kind === "oauth" ? "mcp-oauth-connections" : "mcp-tokens"],
      });
    },
    onError: (error: Error) => toast.error(error.message || "Connection could not be revoked"),
  });

  const openCreate = () => {
    setSiteIds(activeSite && sites.some((site) => site.id === activeSite.id) ? [activeSite.id] : []);
    setCreateOpen(true);
  };

  const toggleSite = (siteId: string, checked: boolean) => {
    setSiteIds((current) => checked
      ? [...new Set([...current, siteId])]
      : current.filter((id) => id !== siteId));
  };

  const closeSecret = () => setCreatedSecret(null);
  const tokens = tokensQuery.data?.tokens || [];
  const oauthConnections = oauthConnectionsQuery.data?.connections || [];
  const siteNames = new Map(sites.map((site) => [site.id, site.name || site.domain]));
  const minExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const connectionsLoading = tokensQuery.isLoading || oauthConnectionsQuery.isLoading;
  const connectionsError = tokensQuery.isError || oauthConnectionsQuery.isError;
  const activeConnectionCount = tokens.filter((token) => tokenStatus(token).label === "Active").length
    + oauthConnections.filter((connection) => !connection.revoked_at).length;

  return (
    <>
      <BywordCard>
        <SectionHeader
          icon={KeyRound}
          title="MCP Connections"
          description="Let Codex or another MCP client work with BlogFactory drafts. Start by choosing how the client will authenticate."
          action={
            <Button
              type="button"
              onClick={() => oauthEnabled ? copyText(codexOauthCommand, "OAuth setup command") : openCreate()}
              disabled={sitesLoading || !sites.length}
            >
              {oauthEnabled ? <Terminal className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {oauthEnabled ? "Copy OAuth setup" : "Create personal token"}
            </Button>
          }
        />

        <div className="space-y-6 p-4 sm:p-6">
          <div className="grid overflow-hidden rounded-md border border-byword-border bg-card sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["MCP access", connectionsLoading ? "Checking" : connectionsError ? "Attention" : "Ready"],
              ["Connections", connectionsLoading ? "—" : `${activeConnectionCount} active`],
              ["Site scope", activeSite?.domain || "No site selected"],
              ["Tool catalog", capabilitiesQuery.data ? `${capabilitiesQuery.data.tool_count} available` : "Checking"],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-byword-border p-4 last:border-b-0 sm:odd:border-r sm:[&:nth-child(3)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0">
                <p className="type-kicker text-muted-foreground">{label}</p>
                <p className="mt-2 truncate text-xl font-semibold text-foreground" title={value}>{value}</p>
              </div>
            ))}
          </div>

          <section aria-labelledby="mcp-workflow-title" className="space-y-3">
            <div>
              <h3 id="mcp-workflow-title" className="text-sm font-semibold">Connect a client</h3>
              <p className="mt-1 text-sm text-muted-foreground">Do this once per AI client. Provider and CMS credentials are never given to the client.</p>
            </div>
            <ol className="grid overflow-hidden rounded-md border border-byword-border bg-card sm:grid-cols-3">
              {[
                ["01", oauthEnabled ? "Copy the OAuth command" : "Create a personal token", oauthEnabled ? "Run the command in Codex. It opens BlogFactory in your browser for approval." : "Choose the site this client may access. Copy the token when it appears; it is shown once."],
                ["02", "Add the server", `Use ${endpoint} as the MCP server endpoint. Token connections use it with Bearer authentication.`],
                ["03", "Verify in this list", "Ask the client to list BlogFactory tools, then return here. Its last-used time will update after the first successful request."],
              ].map(([step, title, description]) => <li key={step} className="border-b border-byword-border p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="type-kicker text-byword-blue">{step}</span><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{description}</p></li>)}
            </ol>
            <Button asChild variant="link" size="sm" className="h-auto justify-start px-0"><a href="/docs/mcp" target="_blank" rel="noreferrer">Open the complete MCP client guide</a></Button>
          </section>

          <section className="space-y-2">
            <Label htmlFor="mcp-endpoint">MCP endpoint</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="mcp-endpoint" value={endpoint} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={() => copyText(endpoint, "Endpoint")}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Add this endpoint to a compatible client. Access remains limited to the sites selected for that connection.
            </p>
            {oauthEnabled && <details className="rounded-md border border-byword-border bg-muted/25 p-3">
              <summary className="cursor-pointer text-sm font-medium">Codex OAuth setup</summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Run this command. Codex will open the secure browser authorization flow:
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <code className="min-w-0 flex-1 break-all rounded-sm border border-byword-border bg-card p-3 font-mono text-xs">
                    {codexOauthCommand}
                  </code>
                  <Button type="button" variant="outline" onClick={() => copyText(codexOauthCommand, "OAuth setup command")}>
                    <Terminal className="mr-2 h-4 w-4" />
                    Copy command
                  </Button>
                </div>
              </div>
            </details>}
          </section>

          <div className="rounded-md border border-byword-border bg-muted/35 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-status-success" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">Site-scoped MCP access</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connections can inspect content, generate and edit drafts, and send reviewed posts to a CMS as drafts. Live publishing and deletion remain unavailable.
                </p>
              </div>
            </div>
          </div>

          <details className="rounded-md border border-byword-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span>Server tool catalog</span><span className="type-meta">{capabilitiesQuery.data ? `${capabilitiesQuery.data.tool_count} tools` : capabilitiesQuery.isError ? "Unavailable" : "Checking"}</span></summary>
            <div className="flex flex-wrap gap-2 border-t border-byword-border p-4">
              {capabilitiesQuery.data?.tools?.map((tool) => <code key={tool} className="rounded-sm border border-byword-border bg-muted/35 px-2 py-1 font-mono text-[11px] text-foreground">{tool}</code>)}
              {capabilitiesQuery.isLoading && <span className="text-sm text-muted-foreground">Loading catalog…</span>}
              {capabilitiesQuery.isError && <span className="text-sm text-destructive">Tool catalog unavailable.</span>}
            </div>
          </details>

          {!sitesLoading && !sites.length && (
            <div className="rounded-md border border-dashed border-byword-border p-6 text-center">
              <p className="text-sm font-medium">Add a site before creating an MCP connection.</p>
              <Button asChild variant="link" className="mt-1">
                <Link to="/control/sites">Go to Sites</Link>
              </Button>
            </div>
          )}

          {oauthEnabled && <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Browser-authorized clients</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                OAuth clients appear after their first successful MCP request.
              </p>
            </div>
            {oauthConnectionsQuery.isLoading ? (
              <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading OAuth connections
              </div>
            ) : oauthConnectionsQuery.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">OAuth connections could not be loaded.</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => oauthConnectionsQuery.refetch()}>
                  Try again
                </Button>
              </div>
            ) : oauthConnections.length === 0 ? (
              <div className="rounded-md border border-dashed border-byword-border p-5 text-sm text-muted-foreground">
                No browser-authorized MCP clients yet.
              </div>
            ) : (
              <div className="divide-y divide-byword-border rounded-md border border-byword-border">
                {oauthConnections.map((connection) => {
                  const active = !connection.revoked_at;
                  return (
                    <div key={connection.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{connection.name}</p>
                          <Badge variant={active ? "default" : "destructive"}>{active ? "Active" : "Revoked"}</Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground" title={`${connection.site_name} — ${connection.site_domain}`}>
                          {connection.site_name} — {connection.site_domain} · {connection.scopes.map(scopeLabel).join(", ")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Connected {formatDate(connection.created_at)} · Last used {formatDate(connection.last_used_at)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start text-destructive hover:text-destructive sm:self-auto"
                        aria-label={`Revoke ${connection.name}`}
                        disabled={!active || revokeMutation.isPending}
                        onClick={() => setRevokeTarget({
                          id: connection.id,
                          name: connection.name,
                          kind: "oauth",
                        })}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Revoke
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>}

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Personal tokens</h3>
                <p className="mt-1 text-sm text-muted-foreground">Use this when OAuth is unavailable: create one token, then add it with the endpoint above to your AI client.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={openCreate} disabled={sitesLoading || !sites.length}>
                <Plus className="mr-2 h-4 w-4" />
                Create personal token
              </Button>
            </div>
          {tokensQuery.isLoading ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading connections
            </div>
          ) : tokensQuery.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Connections could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => tokensQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-md border border-dashed border-byword-border p-8 text-center">
              <KeyRound className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">No personal MCP connections yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">Create a token for Codex or another MCP-compatible client.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connection</TableHead>
                  <TableHead>Sites</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => {
                  const status = tokenStatus(token);
                  return (
                    <TableRow key={token.id}>
                      <TableCell>
                        <div className="max-w-44">
                          <p className="truncate font-medium" title={token.name}>{token.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{token.prefix}…</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-44">
                        <span className="line-clamp-2">
                          {token.site_ids.map((id) => siteNames.get(id) || "Removed site").join(", ")}
                        </span>
                      </TableCell>
                      <TableCell>{token.scopes.map(scopeLabel).join(", ")}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(token.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(token.last_used_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(token.expires_at)}</TableCell>
                      <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Revoke ${token.name}`}
                          disabled={status.label !== "Active" || revokeMutation.isPending}
                          onClick={() => setRevokeTarget({
                            id: token.id,
                            name: token.name,
                            kind: "personal",
                          })}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          </section>
        </div>
      </BywordCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={submitCreate} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Create connection token</DialogTitle>
              <DialogDescription>
                Create a site-scoped token for one AI client. The secret is shown once.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="mcp-token-name">Connection name</Label>
              <Input
                id="mcp-token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Personal Codex"
                maxLength={100}
                autoComplete="off"
                autoFocus
                required
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Allowed sites</legend>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-byword-border p-3">
                {sites.map((site) => (
                  <div key={site.id} className="flex items-start gap-3 rounded-sm p-2 hover:bg-muted/60">
                    <Checkbox
                      id={`mcp-site-${site.id}`}
                      checked={siteIds.includes(site.id)}
                      onCheckedChange={(checked) => toggleSite(site.id, checked === true)}
                    />
                    <Label htmlFor={`mcp-site-${site.id}`} className="min-w-0 cursor-pointer">
                      <span className="block text-sm font-medium">{site.name}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">{site.domain}</span>
                    </Label>
                  </div>
                ))}
              </div>
              {!siteIds.length && <p className="text-xs text-destructive">Select at least one site.</p>}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Permission</legend>
              <label className="flex items-start gap-3 rounded-md border border-byword-border bg-muted/35 p-3">
                <Checkbox checked disabled aria-label="MCP draft permissions are required" />
                <span>
                  <span className="block text-sm font-medium">Read content, edit drafts, push CMS drafts</span>
                  <span className="block text-xs text-muted-foreground">Live publishing and deletion are never granted.</span>
                </span>
              </label>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="mcp-token-expiry">Expiry date (optional)</Label>
              <Input
                id="mcp-token-expiry"
                type="date"
                min={minExpiry}
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || !siteIds.length || creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create token
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(createdSecret)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy your connection token</AlertDialogTitle>
            <AlertDialogDescription>
              This secret is shown once. Complete the client setup before closing this dialog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-byword-border bg-muted/45 p-4">
            <code className="block break-all font-mono text-xs">{createdSecret}</code>
          </div>
          <details open className="rounded-md border border-byword-border bg-muted/25 p-3">
            <summary className="cursor-pointer text-sm font-medium">Where this token goes</summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Codex:</strong> save the copied value in your shell as <code className="font-mono text-xs">BLOGFACTORY_MCP_TOKEN</code>, then run this command:
              </p>
              <code className="block break-all rounded-sm border border-byword-border bg-card p-3 font-mono text-xs">
                {codexTokenCommand}
              </code>
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">Other clients:</strong> add <code className="font-mono text-xs">{endpoint}</code> as the MCP server URL and use this token as the Bearer token.</p>
            </div>
          </details>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeSecret}>I connected my client</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => copyText(codexTokenCommand, "Codex setup command")}>
              <Terminal className="mr-2 h-4 w-4" />
              Copy Codex command
            </Button>
            <Button type="button" onClick={() => createdSecret && copyText(createdSecret, "Token")}>
              <Copy className="mr-2 h-4 w-4" />
              Copy token
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && !revokeMutation.isPending && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this MCP connection?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.name} will immediately lose access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
            >
              {revokeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke connection
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

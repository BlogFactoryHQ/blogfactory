import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  SearchCheck,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { IndexingIntegration, IndexingProvider, useIndexing } from "@/hooks/useIndexing";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import { useSites } from "@/hooks/useSites";
import { SearchGrowthDependencyBand } from "@/components/search-growth/SearchGrowthDependencyBand";
import { cn } from "@/lib/utils";

const providerDetails: Record<IndexingProvider, {
  name: string;
  description: string;
  badge: string;
  icon: typeof SearchCheck;
  fields: Array<{ key: string; label: string; placeholder: string; type?: string; multiline?: boolean }>;
  helpUrl: string;
  setupSteps: string[];
}> = {
  indexnow: {
    name: "IndexNow",
    description: "Submit article URLs to Bing and Yandex using one hosted key file.",
    badge: "Bing + Yandex",
    icon: SearchCheck,
    helpUrl: "https://www.indexnow.org/documentation",
    setupSteps: [
      "Generate a key here.",
      "Create a text file named {key}.txt on the site root.",
      "Put only the key inside that file, then save this connection.",
    ],
    fields: [
      { key: "key", label: "IndexNow key", placeholder: "8-128 character key" },
      { key: "keyLocation", label: "Key file URL", placeholder: "https://example.com/your-key.txt" },
    ],
  },
  google: {
    name: "Google",
    description: "Submit eligible JobPosting or BroadcastEvent pages with the Google Indexing API.",
    badge: "Eligible only",
    icon: KeyRound,
    helpUrl: "https://developers.google.com/search/apis/indexing-api/v3/prereqs",
    setupSteps: [
      "Search Console OAuth is read-only performance access; it does not publish URLs.",
      "Enable the Google Indexing API in Google Cloud.",
      "Create a service account JSON key.",
      "Add the service account email as a Search Console owner, then paste the JSON here.",
    ],
    fields: [
      { key: "serviceAccountJson", label: "Service account JSON", placeholder: "{ ... }", multiline: true },
    ],
  },
};

const providers: IndexingProvider[] = ["indexnow", "google"];

export function IndexingPanel() {
  const { activeSite } = useSites();
  const { integrations, submissions, stats, isLoading, saveIntegration, testIntegration, deleteIntegration, submitUrls, startGoogleOAuth } = useIndexing();
  const { integration: searchConsoleIntegration } = useSearchConsole();
  const [providerToConnect, setProviderToConnect] = useState<IndexingProvider | null>(null);
  const [editing, setEditing] = useState<IndexingIntegration | null>(null);
  const [bulkUrls, setBulkUrls] = useState("");

  const byProvider = useMemo(() => new Map(integrations.map((integration) => [integration.provider, integration])), [integrations]);
  const parsedUrls = useMemo(() => bulkUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean), [bulkUrls]);

  const handleSubmit = async () => {
    const validation = normalizeUrlsForSubmit(parsedUrls, activeSite?.domain || "");
    if (validation.error) {
      toast.error(validation.error);
      return;
    }
    try {
      const result = await submitUrls.mutateAsync(validation.urls);
      setBulkUrls("");
      toast.success(`${result.submitted} indexing submissions created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submission failed");
    }
  };

  const handleTest = async (integration: IndexingIntegration) => {
    try {
      const result = await testIntegration.mutateAsync(integration.id);
      toast.success(result.message || "Connection test passed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    }
  };

  const handleDelete = async (integration: IndexingIntegration) => {
    try {
      await deleteIntegration.mutateAsync(integration.id);
      toast.success(`${providerDetails[integration.provider].name} disconnected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
    }
  };

  return (
    <>
      <div className="space-y-8">
        <div className="grid overflow-hidden rounded-lg border border-byword-border bg-card md:grid-cols-5">
          {[
            ["Site", activeSite?.domain || "No site selected"],
            ["Accepted", String(stats.accepted)],
            ["Queued", String(stats.queued)],
            ["Skipped", String(stats.skipped)],
            ["Failed", String(stats.failed)],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-byword-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
              <p className="mt-2 truncate text-2xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <SearchGrowthDependencyBand
          title="Indexing role in search growth"
          description="Use this tab after an optimization edit to request faster discovery from connected providers."
          items={[
            {
              label: "Active site",
              value: activeSite?.domain || "No site selected",
              detail: activeSite ? "Submissions are limited to this domain." : "Select a site before submitting URLs.",
              state: activeSite ? "ready" : "blocked",
            },
            {
              label: "Search Console",
              value: searchConsoleIntegration?.status === "connected" ? "Connected" : "Not connected",
              detail: searchConsoleIntegration ? "Performance data can confirm edits after the next sync." : "Connect GSC from Optimize to measure the result.",
              state: searchConsoleIntegration?.status === "connected" ? "ready" : "idle",
            },
            {
              label: "Indexing providers",
              value: integrations.length ? `${integrations.length} configured` : "Not connected",
              detail: integrations.length ? `${stats.accepted} accepted, ${stats.queued} queued, ${stats.failed} failed.` : "Connect IndexNow for normal article URLs.",
              state: integrations.some((item) => item.status === "connected") ? "ready" : "warning",
            },
          ]}
        />

        <BywordCard>
          <SectionHeader icon={CheckCircle2} title="Providers" description="Connect IndexNow for regular articles; Google is gated to eligible structured-data pages." />
          <div className="grid gap-4 p-6 lg:grid-cols-2">
            {providers.map((provider) => {
              const details = providerDetails[provider];
              const integration = byProvider.get(provider);
              return (
                <div key={provider} className="rounded-lg border border-byword-border bg-card p-5">
                  <div className="flex items-start gap-4">
                    <IconTile icon={details.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{details.name}</h3>
                        <Badge variant="secondary" className="bg-byword-blue-soft text-byword-blue">{details.badge}</Badge>
                        {integration && <Badge variant={integration.status === "connected" ? "default" : "destructive"}>{integration.status}</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{integration?.credentialHint ? `Credential: ${integration.credentialHint}` : details.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last submit: {integration?.lastSubmitAt ? new Date(integration.lastSubmitAt).toLocaleString() : "None yet"}
                      </p>
                      {integration?.lastTestResult && (
                        <p className="mt-1 truncate text-xs text-muted-foreground" title={integration.lastTestResult}>
                          Last test: {integration.lastTestResult}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    {integration ? (
                      <label className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Switch
                          className="mt-0.5"
                          checked={integration.autoSubmit}
                          onCheckedChange={(checked) => saveIntegration.mutate({ id: integration.id, provider, autoSubmit: checked })}
                        />
                        <span>
                          Auto-submit on publish
                          <span className="block text-xs">Off still keeps this provider available for Bulk Submit.</span>
                        </span>
                      </label>
                    ) : <span className="text-sm text-muted-foreground">Not connected</span>}

                    <div className="flex flex-wrap gap-2">
                      {integration ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleTest(integration)} disabled={testIntegration.isPending}>
                            <RefreshCw className={cn("mr-1.5 h-4 w-4", testIntegration.isPending && "animate-spin")} />
                            Test
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditing(integration)}>
                            <Settings2 className="mr-1.5 h-4 w-4" />
                            Manage
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(integration)}>
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => setProviderToConnect(provider)}>
                          Connect <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </BywordCard>

        <BywordCard>
          <SectionHeader icon={Send} title="Bulk Submit" description="Paste URLs from the active site, one per line." />
          <div className="space-y-4 p-6">
            <Textarea
              value={bulkUrls}
              onChange={(event) => setBulkUrls(event.target.value)}
              placeholder={activeSite ? `https://${activeSite.domain}/article` : "https://example.com/article"}
              className="min-h-[180px]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{parsedUrls.length} URL{parsedUrls.length === 1 ? "" : "s"} ready</p>
              <Button onClick={handleSubmit} disabled={!parsedUrls.length || submitUrls.isPending || integrations.length === 0}>
                {submitUrls.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Submit URLs
              </Button>
            </div>
          </div>
        </BywordCard>

        <BywordCard>
          <SectionHeader icon={SearchCheck} title="Recent Submissions" description="Submission status from connected providers." />
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading submissions
            </div>
          ) : submissions.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p>No indexing submissions yet.</p>
              <p className="mt-2 text-sm">Connect IndexNow before publishing large batches.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">{providerLabel(submission.provider)}</TableCell>
                    <TableCell className="max-w-[340px] truncate">{submission.url}</TableCell>
                    <TableCell><StatusBadge status={submission.status} /></TableCell>
                    <TableCell>{submission.source}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(submission.createdAt || submission.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">{submission.errorMessage || submission.error_message || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </BywordCard>
      </div>

      <IndexingSetupDialog
        provider={providerToConnect}
        integration={editing}
        siteDomain={activeSite?.domain || ""}
        onClose={() => {
          setProviderToConnect(null);
          setEditing(null);
        }}
        onSave={async (input) => {
          try {
            const result = await saveIntegration.mutateAsync(input);
            toast.success(`${providerDetails[input.provider].name} saved`);
            setProviderToConnect(null);
            setEditing(null);
            return result.integration;
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save integration");
            throw error;
          }
        }}
        isSaving={saveIntegration.isPending}
        onGoogleOAuth={async (input) => {
          try {
            const result = await startGoogleOAuth.mutateAsync(input);
            window.location.href = result.authUrl;
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to start Google OAuth");
          }
        }}
        isGoogleOAuthStarting={startGoogleOAuth.isPending}
      />
    </>
  );
}

export default function Indexing() {
  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Indexing"
        description="Submit live URLs from the active site to connected indexing providers."
      />
      <IndexingPanel />
    </BywordPageShell>
  );
}

function IndexingSetupDialog({
  provider,
  integration,
  siteDomain,
  onClose,
  onSave,
  isSaving,
  onGoogleOAuth,
  isGoogleOAuthStarting,
}: {
  provider: IndexingProvider | null;
  integration: IndexingIntegration | null;
  siteDomain: string;
  onClose: () => void;
  onSave: (input: { id?: string; provider: IndexingProvider; displayName: string; autoSubmit: boolean; credentials?: Record<string, string> }) => Promise<IndexingIntegration>;
  isSaving: boolean;
  onGoogleOAuth: (input: { displayName: string; autoSubmit: boolean }) => Promise<void>;
  isGoogleOAuthStarting: boolean;
}) {
  const activeProvider = provider || integration?.provider || null;
  const details = activeProvider ? providerDetails[activeProvider] : null;
  const [displayName, setDisplayName] = useState("");
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const open = Boolean(activeProvider);

  useEffect(() => {
    if (integration) {
      setDisplayName(integration.displayName);
      setAutoSubmit(integration.autoSubmit);
    } else if (details) {
      setDisplayName(details.name);
      setAutoSubmit(true);
    }
  }, [details, integration]);

  const setCredential = (key: string, value: string) => setCredentials((current) => ({ ...current, [key]: value }));

  const generateIndexNowKey = () => {
    const key = randomHex(16);
    setCredentials((current) => ({
      ...current,
      key,
      keyLocation: current.keyLocation || indexNowKeyLocation(siteDomain, key),
    }));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDisplayName("");
      setCredentials({});
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!activeProvider || !details) return;
    const hasAnyCredential = Object.values(credentials).some(Boolean);
    let nextCredentials: Record<string, string> | undefined;
    try {
      nextCredentials = integration && !hasAnyCredential ? undefined : normalizeCredentials(activeProvider, credentials);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid credentials");
      return;
    }
    await onSave({
      id: integration?.id,
      provider: activeProvider,
      displayName: displayName || details.name,
      autoSubmit,
      credentials: nextCredentials,
    });
    setDisplayName("");
    setCredentials({});
  };

  const handleGoogleOAuth = () => {
    if (!details) return;
    onGoogleOAuth({ displayName: displayName || details.name, autoSubmit });
  };

  if (!activeProvider || !details) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration ? "Manage" : "Connect"} {details.name}</DialogTitle>
          <DialogDescription>{details.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={details.name} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-byword-border p-3 text-sm">
            <span>
              Auto-submit on live publish
              <span className="block text-xs text-muted-foreground">Turn off to submit manually from Bulk Submit.</span>
            </span>
            <Switch checked={autoSubmit} onCheckedChange={setAutoSubmit} />
          </label>
          {integration && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Credentials are encrypted and cannot be shown again. Leave credential fields blank to keep the saved values.
            </p>
          )}
          <div className="rounded-lg border border-byword-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-foreground">Setup</h3>
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <a href={details.helpUrl} target="_blank" rel="noreferrer">
                  Provider guide <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
              {details.setupSteps.map((step) => (
                <li key={step}>{formatSetupStep(step, credentials.key)}</li>
              ))}
            </ol>
            {activeProvider === "indexnow" && (
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={generateIndexNowKey}>
                Generate key
              </Button>
            )}
            {activeProvider === "google" && (
              <Button type="button" className="mt-4 w-full" onClick={handleGoogleOAuth} disabled={isGoogleOAuthStarting}>
                {isGoogleOAuthStarting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
                Continue with Google
              </Button>
            )}
          </div>
          {activeProvider === "google" ? (
            <details className="rounded-lg border border-byword-border p-4">
              <summary className="cursor-pointer font-semibold text-foreground">Advanced: service account JSON</summary>
              <div className="mt-4 grid gap-4">
                {details.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Textarea
                      value={credentials[field.key] || ""}
                      onChange={(event) => setCredential(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="min-h-[180px] font-mono text-xs"
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={handleSubmit} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Save JSON fallback
                </Button>
              </div>
            </details>
          ) : (
            <div className="grid gap-4">
            {details.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                {field.multiline ? (
                  <Textarea
                    value={credentials[field.key] || ""}
                    onChange={(event) => setCredential(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="min-h-[180px] font-mono text-xs"
                  />
                ) : (
                  <Input
                    type={field.type || "text"}
                    value={credentials[field.key] || ""}
                    onChange={(event) => setCredential(field.key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          {(activeProvider !== "google" || integration) && <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {activeProvider === "google" ? "Save settings" : "Save connection"}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalizeCredentials(provider: IndexingProvider, credentials: Record<string, string>) {
  if (provider === "google") {
    try {
      return JSON.parse(credentials.serviceAccountJson || "{}") as Record<string, string>;
    } catch {
      throw new Error("Google service account must be valid JSON");
    }
  }
  return credentials;
}

function randomHex(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function indexNowKeyLocation(domain: string, key: string) {
  const host = comparableHost(domain);
  return host ? `https://${host}/${key}.txt` : "";
}

function formatSetupStep(step: string, key?: string) {
  return step.replace("{key}", key || "your-key");
}

function normalizeUrlsForSubmit(urls: string[], domain: string) {
  if (!domain) return { urls: [], error: "Select a site first" };
  if (urls.length > 1000) return { urls: [], error: "Submit at most 1,000 URLs at once" };
  const root = comparableHost(domain);
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return { urls: [], error: `Only HTTP and HTTPS URLs are supported: ${url}` };
      if (comparableHost(parsed.hostname) !== root) return { urls: [], error: `URL does not belong to ${domain}: ${url}` };
      parsed.hash = "";
      const value = parsed.toString();
      if (!seen.has(value)) {
        seen.add(value);
        normalized.push(value);
      }
    } catch {
      return { urls: [], error: `Invalid URL: ${url}` };
    }
  }

  return { urls: normalized };
}

function comparableHost(value: string) {
  const host = value.trim().toLowerCase();
  try {
    return new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`).hostname.replace(/^www\./, "");
  } catch {
    return host.replace(/^www\./, "");
  }
}

function providerLabel(provider: string) {
  return provider === "google" ? "Google" : "IndexNow";
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "failed" ? "destructive" : status === "accepted" ? "default" : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

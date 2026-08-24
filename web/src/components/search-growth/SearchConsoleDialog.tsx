import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SearchConsoleIntegration, SearchConsoleProperty } from "@/hooks/useSearchConsole";

const oauthSteps = [
  "Use the Google account that owns or can read this Search Console property.",
  "Click Continue with Google and approve read-only Search Console access.",
  "If access fails, open Search Console Settings > Users and permissions and add that Google account.",
];

const serviceAccountSteps = [
  "In Google Cloud, create a service account, add a JSON key, and download the file.",
  "Open the JSON file and copy its client_email value.",
  "A Search Console property owner must add that email under Settings > Users and permissions.",
  "Paste the entire JSON file below. BlogFactory stores it encrypted and uses read-only Search Console access.",
];

export function SearchConsoleDialog({
  open,
  integration,
  oauthEnabled,
  activeSiteDomain,
  onClose,
  onOAuth,
  onSave,
  isSaving,
  isOAuthStarting,
  properties,
  onSelectProperty,
  isSelectingProperty,
}: {
  open: boolean;
  integration: SearchConsoleIntegration | null;
  oauthEnabled: boolean;
  activeSiteDomain: string;
  onClose: () => void;
  onOAuth: (propertyUrl?: string) => Promise<void>;
  onSave: (input: { id?: string; propertyUrl: string; credentials?: Record<string, string> }) => Promise<void>;
  isSaving: boolean;
  isOAuthStarting: boolean;
  properties: SearchConsoleProperty[];
  onSelectProperty: (propertyUrl: string) => Promise<void>;
  isSelectingProperty: boolean;
}) {
  const [propertyUrl, setPropertyUrl] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const callbackUrl = `${window.location.origin}/api/search-console/oauth/callback`;

  useEffect(() => {
    if (open) {
      setPropertyUrl(integration?.propertyUrl || defaultProperty(activeSiteDomain));
      setServiceAccountJson("");
    }
  }, [activeSiteDomain, integration, open]);

  const handleManualSubmit = async () => {
    let credentials: Record<string, string> | undefined;
    if (serviceAccountJson.trim()) {
      try {
        credentials = JSON.parse(serviceAccountJson);
      } catch {
        toast.error("Service account JSON must be valid JSON");
        return;
      }
    }
    if (!integration && !credentials) {
      toast.error("Paste service account JSON first");
      return;
    }
    await onSave({ id: integration?.id, propertyUrl: propertyUrl || integration?.propertyUrl || "", credentials });
    setServiceAccountJson("");
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration ? "Manage" : "Connect"} Search Console</DialogTitle>
          <DialogDescription>Connect the Google account that has access to this Search Console property.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Property URL</Label>
            <Input value={propertyUrl} onChange={(event) => setPropertyUrl(event.target.value)} placeholder="Optional — choose after Google sign-in" />
          </div>
          {properties.length > 0 && (
            <div className="space-y-2 rounded-lg border border-byword-border p-4">
              <Label>Accessible Google properties</Label>
              <div className="flex gap-2">
                <Select value={propertyUrl} onValueChange={setPropertyUrl}>
                  <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Choose a property" /></SelectTrigger>
                  <SelectContent>{properties.map((property) => <SelectItem key={property.siteUrl} value={property.siteUrl}>{property.siteUrl} · {property.permissionLevel}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" onClick={() => onSelectProperty(propertyUrl)} disabled={!propertyUrl || isSelectingProperty}>
                  {isSelectingProperty && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Use
                </Button>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-byword-border p-4">
            <h3 className="font-semibold text-foreground">Google OAuth</h3>
            <p className="mt-1 text-sm text-muted-foreground">Approve read-only Search Console access. BlogFactory stores the refresh token encrypted.</p>
            {oauthEnabled ? (
              <>
                <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                  {oauthSteps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <Button className="mt-4 w-full" onClick={() => onOAuth(propertyUrl.trim() || undefined)} disabled={isOAuthStarting}>
                  {isOAuthStarting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
                  Continue with Google
                </Button>
              </>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <strong>Google OAuth is not configured on this server.</strong> If you run this instance, complete the one-time setup below. If someone else runs it, send them this guide.
                </div>
                <ol className="space-y-3 text-sm leading-6">
                  <li><strong>1. Enable the API.</strong> Open the <a className="font-semibold text-byword-blue underline underline-offset-2" href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noreferrer">Search Console API in Google Cloud</a> and enable it for your project.</li>
                  <li><strong>2. Configure consent.</strong> Set up the OAuth consent screen for the Google accounts that will connect.</li>
                  <li><strong>3. Create credentials.</strong> Create an OAuth client with application type <strong>Web application</strong>.</li>
                  <li><strong>4. Add the callback URL.</strong><code className="mt-2 block break-all rounded-sm border border-byword-border bg-card p-3 font-mono text-xs">{callbackUrl}</code></li>
                  <li><strong>5. Configure the API service.</strong><code className="mt-2 block whitespace-pre-wrap rounded-sm border border-byword-border bg-card p-3 font-mono text-xs">GOOGLE_SEARCH_CONSOLE_CLIENT_ID=…{"\n"}GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET=…</code></li>
                  <li><strong>6. Restart BlogFactory.</strong><code className="mt-2 block overflow-x-auto rounded-sm border border-byword-border bg-card p-3 font-mono text-xs">docker compose up -d --no-deps --force-recreate api</code></li>
                </ol>
                <p className="text-xs leading-5 text-muted-foreground">Return to this dialog after restart. The Google button will appear automatically. BlogFactory requests only <code className="font-mono">webmasters.readonly</code>.</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm"><a href="/docs/self-hosting" target="_blank" rel="noreferrer">Open full self-hosting guide <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
                  <Button asChild variant="outline" size="sm"><a href="https://developers.google.com/webmaster-tools/v1/how-tos/authorizing" target="_blank" rel="noreferrer">Google authorization guide <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
                </div>
              </div>
            )}
          </div>
          <details className="rounded-lg border border-byword-border p-4">
            <summary className="cursor-pointer font-semibold text-foreground">Alternative: service account JSON (no OAuth)</summary>
            <div className="mt-4 space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">A service account is a Google identity for this BlogFactory server, not a person. Its downloaded JSON file contains the identity and private key. Keep that file secret and paste it only into your own instance.</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                {serviceAccountSteps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer">Open service accounts <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
                <Button asChild variant="outline" size="sm"><a href="https://support.google.com/webmasters/answer/7687615?hl=en" target="_blank" rel="noreferrer">Property permission guide <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
              </div>
              {integration && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Leave JSON blank to keep the saved credential.</p>}
              <div className="space-y-2">
                <Label>Service account JSON</Label>
                <Textarea value={serviceAccountJson} onChange={(event) => setServiceAccountJson(event.target.value)} className="min-h-[160px] font-mono text-xs" placeholder="{ ... }" />
              </div>
              <Button variant="outline" onClick={handleManualSubmit} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save service account
              </Button>
            </div>
          </details>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultProperty(domain: string) {
  const value = domain.trim();
  if (!value) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return `sc-domain:${parsed.hostname.replace(/^www\./, "")}`;
  } catch {
    return `sc-domain:${value.replace(/^https?:\/\//i, "").replace(/^www\./, "").replace(/\/.*$/, "")}`;
  }
}

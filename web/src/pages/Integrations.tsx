import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Globe2,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Settings2,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  BywordCard,
  BywordPageShell,
  IconTile,
  SectionHeader,
} from "@/components/layout/BywordSurface";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useGhostAuthors, useIntegrations, IntegrationProvider, SiteIntegration } from "@/hooks/useIntegrations";
import { useSites } from "@/hooks/useSites";
import { connectionReady, displayConnectionStatus } from "@/lib/credential-status";
import { cn } from "@/lib/utils";

const providerDetails: Record<IntegrationProvider, {
  name: string;
  description: string;
  badge: string;
  icon: typeof Plug;
  docsUrl: string;
  guide: string[];
  fields: Array<{ key: string; label: string; placeholder: string; type?: string; helper?: string }>;
}> = {
  wordpress: {
    name: "WordPress",
    description: "Create WordPress drafts with tags, categories, images, and SEO metadata.",
    badge: "CMS",
    icon: Globe2,
    docsUrl: "https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/#basic-authentication-with-application-passwords",
    guide: [
      "Open WordPress admin for the site that will receive drafts.",
      "Go to Users > Profile and create an Application Password named BlogFactory.",
      "Paste the site URL, your WordPress username, and the generated application password here.",
    ],
    fields: [
      { key: "url", label: "WordPress URL", placeholder: "https://example.com", helper: "Use the public site origin, without /wp-admin or /wp-json." },
      { key: "username", label: "Username", placeholder: "editor", helper: "Use the WordPress user that created the application password." },
      { key: "applicationPassword", label: "Application password", placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx", type: "password", helper: "Use the generated application password, not the user's login password." },
    ],
  },
  ghost: {
    name: "Ghost",
    description: "Create Ghost post or page drafts with tags, excerpt, SEO fields, and clean HTML formatting.",
    badge: "CMS",
    icon: CircleDashed,
    docsUrl: "https://docs.ghost.org/admin-api/#token-authentication",
    guide: [
      "Open Ghost Admin for the publication that will receive drafts.",
      "Go to Settings > Integrations and add a custom integration named BlogFactory.",
      "Paste the API URL shown by Ghost and the Admin API key.",
    ],
    fields: [
      { key: "url", label: "Ghost Admin URL", placeholder: "https://example.com", helper: "Use the API URL shown in the Ghost custom integration." },
      { key: "adminApiKey", label: "Admin API key", placeholder: "key_id:secret", type: "password", helper: "Copy the Admin API key in key-id:secret form. The Content API key will not work." },
    ],
  },
  wix: {
    name: "Wix",
    description: "Create Wix blog drafts for review in the connected site.",
    badge: "CMS",
    icon: ExternalLink,
    docsUrl: "https://dev.wix.com/docs/rest/articles/getting-started/api-keys",
    guide: [
      "Open Wix API Keys Manager and create a key for the target site with Blog and Media Manager access.",
      "Copy the token from Generated keys. Use the key for the site receiving drafts, not an account-wide key for a different site.",
      "Copy the site ID from the Wix dashboard URL after /dashboard/. Do not paste the Account ID unless Wix specifically asks for account-level APIs.",
      "Paste the Wix author/member ID for the post owner. Blog draft creation requires this value even though other API calls do not.",
    ],
    fields: [
      { key: "apiKey", label: "Wix API key", placeholder: "Wix API key", type: "password", helper: "Use a key created by the site owner or co-owner with Manage Blog and media access." },
      { key: "siteId", label: "Wix site ID", placeholder: "site-id", helper: "Find this after /dashboard/ in the target site's dashboard URL. Do not use the account ID." },
      { key: "memberId", label: "Author/member ID", placeholder: "Wix member ID", helper: "This is the draft post owner's member ID; Wix requires it for third-party draft creation." },
    ],
  },
  framer: {
    name: "Framer",
    description: "Write generated articles into a Framer CMS collection as draft CMS items.",
    badge: "CMS",
    icon: Plug,
    docsUrl: "https://www.framer.com/developers/server-api-quick-start",
    guide: [
      "Open the Framer project and copy the project URL from the browser address bar.",
      "In Site Settings > General, create an API key for BlogFactory.",
      "Paste the project URL, API key, and the CMS collection ID or exact collection name.",
    ],
    fields: [
      { key: "projectUrl", label: "Framer project URL", placeholder: "https://framer.com/projects/Website--...", helper: "Copy the project URL, not the public website URL." },
      { key: "apiKey", label: "Framer API key", placeholder: "ap...", type: "password", helper: "Create this in the project's Site Settings > General. It is bound to that project." },
      { key: "collectionId", label: "Collection ID or name", placeholder: "Blog", helper: "Use the collection ID or its exact name, for example Blog." },
    ],
  },
};

const providers: IntegrationProvider[] = ["wordpress", "ghost", "wix", "framer"];

export const shouldReloadGhostAuthors = (existing: boolean, provider: IntegrationProvider | null, profile: string, credentialsChanged: boolean, hasDefaultAuthor: boolean) =>
  existing && provider === "ghost" && profile === "ortak_alan_news" && credentialsChanged && !hasDefaultAuthor;

export default function Integrations() {
  const { activeSite } = useSites();
  const { integrations, isLoading, saveIntegration, testIntegration, deleteIntegration } = useIntegrations();
  const [searchParams] = useSearchParams();
  const [providerToConnect, setProviderToConnect] = useState<IntegrationProvider | null>(null);
  const [editing, setEditing] = useState<SiteIntegration | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const connectedCount = integrations.filter(connectionReady).length;
  const fromFirstDraft = searchParams.get("from") === "first-draft";
  const lastPublish = useMemo(() => {
    const dates = integrations.map((integration) => integration.lastPublishAt).filter(Boolean) as string[];
    return dates.sort().at(-1) || null;
  }, [integrations]);

  const handleTest = async (integration: SiteIntegration) => {
    setTestingId(integration.id);
    try {
      const result = await testIntegration.mutateAsync(integration.id);
      toast.success(result.message || "Connection test passed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (integration: SiteIntegration) => {
    try {
      await deleteIntegration.mutateAsync(integration.id);
      toast.success(`${providerDetails[integration.provider].name} disconnected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
    }
  };

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Integrations"
        description="Connect the CMS draft destinations BlogFactory will use for the active site."
      />

      <div className="space-y-8">
        {fromFirstDraft && <BywordCard className="relative overflow-hidden border-primary/30">
          <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
          <div className="flex items-start gap-4 p-5 pl-6 sm:p-6 sm:pl-7">
            <IconTile icon={ShieldCheck} className="h-10 w-10 border-emerald-200 bg-emerald-50 text-emerald-700" />
            <div>
              <p className="type-kicker text-byword-blue">First draft complete</p>
              <h2 className="mt-1 text-lg font-semibold">Choose where approved drafts should go</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Your first draft is still safe in BlogFactory. Select a CMS below, connect its credentials, and test the destination. Nothing is published live.</p>
            </div>
          </div>
        </BywordCard>}

        <div className="grid overflow-hidden rounded-lg border border-byword-border bg-card md:grid-cols-3">
          {[
            ["Site", activeSite?.domain || "No site selected"],
            ["Ready", `${connectedCount} tested ${connectedCount === 1 ? "destination" : "destinations"}`],
            ["Last delivery", lastPublish ? new Date(lastPublish).toLocaleString() : "None yet"],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-byword-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
              <p className="mt-2 truncate text-2xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {(isLoading || integrations.length > 0) && <BywordCard>
          <SectionHeader
            icon={CheckCircle2}
            title="Connected"
            description="CMS draft destinations connected to the selected site."
          />
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading integrations
            </div>
          ) : integrations.length === 0 ? (
            <div className="p-12 text-center">
              <IconTile icon={Plug} className="mx-auto" />
              <h3 className="mt-5 font-semibold text-foreground">No integrations yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">Connect WordPress, Ghost, Wix, or Framer before CMS draft delivery.</p>
              <p className="mt-4 text-xs text-muted-foreground">Choose your CMS from the connection cards below.</p>
            </div>
          ) : (
            <div className="divide-y divide-byword-border">
              {integrations.map((integration) => {
                const details = providerDetails[integration.provider];
                const ready = connectionReady(integration);
                return (
                  <div key={integration.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4">
                      <IconTile icon={details.icon} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-foreground">{integration.displayName}</h3>
                          <Badge variant="secondary" className="bg-byword-blue-soft text-byword-blue">{details.name}</Badge>
                          {integration.config?.profile === "ortak_alan_news" && (
                            <Badge variant="outline">Ortak Alan Haber</Badge>
                          )}
                          <Badge variant={ready ? "default" : integration.lastTestedAt ? "destructive" : "outline"}>
                            {integration.lastTestedAt ? displayConnectionStatus(integration) : "Not tested"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {integration.credentialHint ? `Credential: ${integration.credentialHint}` : details.description}
                        </p>
                        <p className="mt-1 line-clamp-2 break-all text-xs text-muted-foreground" title={integration.lastTestResult || undefined}>
                          Last check: {integration.lastTestedAt ? new Date(integration.lastTestedAt).toLocaleString() : "Not tested yet"}
                          {integration.lastTestResult ? ` · ${integration.lastTestResult}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleTest(integration)} disabled={testingId === integration.id}>
                        <RefreshCw className={cn("mr-1.5 h-4 w-4", testingId === integration.id && "animate-spin")} />
                        {integration.lastTestedAt ? "Test again" : "Test now"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditing(integration)}>
                        <Settings2 className="mr-1.5 h-4 w-4" />
                        Manage
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(integration)}>
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BywordCard>}

        <BywordCard>
          <SectionHeader
            icon={Plug}
            title={integrations.length ? "Connect another CMS" : "Choose a CMS"}
            description="Credentials are encrypted, site-scoped, and used only for draft delivery."
          />
          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            {providers.map((provider) => {
              const details = providerDetails[provider];
              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setProviderToConnect(provider)}
                  className="group min-h-[205px] rounded-lg border border-byword-border bg-card p-5 text-left outline-none transition-calm hover:border-byword-blue/40 hover:bg-byword-blue-soft/20 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconTile icon={details.icon} />
                  <div className="mt-7 flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{details.name}</h3>
                    <Badge variant="secondary" className="bg-byword-blue-soft text-byword-blue">{details.badge}</Badge>
                  </div>
                  <p className="mt-3 min-h-[60px] text-sm leading-6 text-muted-foreground">{details.description}</p>
                  <span className="mt-5 inline-flex items-center text-sm font-medium text-byword-blue">
                    Connect <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </BywordCard>
      </div>

      <IntegrationSetupDialog
        provider={providerToConnect}
        integration={editing}
        onClose={() => {
          setProviderToConnect(null);
          setEditing(null);
        }}
        onSave={async (input) => {
          let result;
          try {
            result = await saveIntegration.mutateAsync(input);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save integration");
            throw error;
          }
          try {
            const test = await testIntegration.mutateAsync(result.integration.id);
            toast.success(test.message || `${providerDetails[input.provider].name} connected and tested`);
            return test.integration;
          } catch (error) {
            setProviderToConnect(null);
            setEditing(result.integration);
            const message = error instanceof Error ? error.message : "Connection test failed";
            toast.error(`${providerDetails[input.provider].name} was saved, but the test failed: ${message}`);
            throw error;
          }
        }}
        isSaving={saveIntegration.isPending || testIntegration.isPending}
      />
    </BywordPageShell>
  );
}

function IntegrationSetupDialog({
  provider,
  integration,
  onClose,
  onSave,
  isSaving,
}: {
  provider: IntegrationProvider | null;
  integration: SiteIntegration | null;
  onClose: () => void;
  onSave: (input: {
    id?: string;
    provider: IntegrationProvider;
    displayName: string;
    credentials?: Record<string, string>;
    config?: Record<string, unknown>;
  }) => Promise<SiteIntegration>;
  isSaving: boolean;
}) {
  const activeProvider = provider || integration?.provider || null;
  const details = activeProvider ? providerDetails[activeProvider] : null;
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState({
    title: "Title",
    content: "Content",
    excerpt: "Excerpt",
    coverImage: "Image",
  });
  const [ghostProfile, setGhostProfile] = useState("general");
  const [editorialOwner, setEditorialOwner] = useState("");
  const [defaultAuthorId, setDefaultAuthorId] = useState("");

  const open = Boolean(activeProvider);
  const isOrtakAlan = activeProvider === "ghost" && ghostProfile === "ortak_alan_news";
  const { authors: ghostAuthors, isLoading: authorsLoading, error: authorsError } = useGhostAuthors(integration?.id, isOrtakAlan && Boolean(integration));
  const credentialsChanged = Object.values(credentials).some(Boolean);

  useEffect(() => {
    if (integration) {
      setDisplayName(integration.displayName);
      setGhostProfile(integration.config?.profile === "ortak_alan_news" ? "ortak_alan_news" : "general");
      setEditorialOwner(typeof integration.config?.editorialOwner === "string" ? integration.config.editorialOwner : "");
      const savedAuthor = integration.config?.defaultAuthor;
      setDefaultAuthorId(savedAuthor && typeof savedAuthor === "object" && "id" in savedAuthor ? String((savedAuthor as { id?: string }).id || "") : "");
      const fieldMapping = integration.config?.fieldMapping;
      if (fieldMapping && typeof fieldMapping === "object") {
        setMapping((current) => ({ ...current, ...(fieldMapping as Record<string, string>) }));
      }
    } else if (details) {
      setDisplayName(details.name);
      setGhostProfile("general");
      setEditorialOwner("");
      setDefaultAuthorId("");
    }
  }, [details, integration]);

  const setCredential = (key: string, value: string) => setCredentials((current) => ({ ...current, [key]: value }));

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDisplayName("");
      setCredentials({});
      setGhostProfile("general");
      setEditorialOwner("");
      setDefaultAuthorId("");
      onClose();
    } else if (integration) {
      setDisplayName(integration.displayName);
    } else if (details) {
      setDisplayName(details.name);
    }
  };

  const handleSubmit = async () => {
    if (!activeProvider || !details) return;
    const savedDefaultAuthor = integration?.config?.defaultAuthor && typeof integration.config.defaultAuthor === "object"
      ? integration.config.defaultAuthor as { id?: string; email?: string; slug?: string; name?: string; status?: string }
      : null;
    const defaultAuthor = ghostAuthors.find((author) => author.id === defaultAuthorId)
      || (savedDefaultAuthor?.id === defaultAuthorId ? savedDefaultAuthor : null);
    const config = activeProvider === "framer"
      ? { fieldMapping: mapping }
      : activeProvider === "ghost" && isOrtakAlan
        ? { profile: "ortak_alan_news", editorialOwner, ...(defaultAuthor ? { defaultAuthor } : {}) }
        : {};
    try {
      await onSave({
        id: integration?.id,
        provider: activeProvider,
        displayName: displayName || details.name,
        credentials: integration && !credentialsChanged ? undefined : credentials,
        config,
      });
    } catch {
      return;
    }
    setCredentials({});
    if (shouldReloadGhostAuthors(Boolean(integration), activeProvider, ghostProfile, credentialsChanged, Boolean(defaultAuthor))) return;
    handleOpenChange(false);
  };

  if (!activeProvider || !details) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration ? "Manage" : "Connect"} {details.name}</DialogTitle>
          <DialogDescription>{details.description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}>
          <div className="space-y-2">
            <Label htmlFor={`integration-${activeProvider}-display-name`}>Display name</Label>
            <Input id={`integration-${activeProvider}-display-name`} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={details.name} />
            <p className="text-xs text-muted-foreground">Only used to identify this destination inside BlogFactory.</p>
          </div>
          <Separator />
          <div className="rounded-md border border-byword-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">How to get these details</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
              {details.guide.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <a href={details.docsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center text-xs font-semibold text-byword-blue hover:underline">
              Open official {details.name} setup guide <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </div>
          {integration && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {activeProvider === "wix"
                ? "Credentials are encrypted and cannot be shown again. Enter the Wix fields you want to change; saved values are kept for fields left blank."
                : "Credentials are encrypted and cannot be shown again. Leave credential fields blank to keep the saved values."}
            </p>
          )}
          <div className="grid gap-4">
            {details.fields.map((field) => {
              const isSecret = field.type === "password";
              const inputId = `integration-${activeProvider}-${field.key}`;
              const helpId = `${inputId}-help`;
              return (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={inputId}>
                    {field.label}
                    {!integration && <span className="ml-1 text-destructive">*</span>}
                  </Label>
                  <Input
                    id={inputId}
                    type={isSecret ? "text" : field.type || "text"}
                    name={`integration-${activeProvider}-${field.key}-value`}
                    autoComplete={isSecret ? "off" : field.key.toLowerCase().includes("url") ? "url" : "off"}
                    data-1p-ignore={isSecret ? "true" : undefined}
                    data-lpignore={isSecret ? "true" : undefined}
                    data-form-type={isSecret ? "other" : undefined}
                    className={cn(isSecret && "[-webkit-text-security:disc]")}
                    spellCheck={isSecret ? false : undefined}
                    value={credentials[field.key] || ""}
                    onChange={(event) => setCredential(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    required={!integration}
                    aria-describedby={helpId}
                  />
                  <p id={helpId} className="text-xs text-muted-foreground">{field.helper}</p>
                </div>
              );
            })}
          </div>

          {activeProvider === "ghost" && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Publishing profile</Label>
                  <Select value={ghostProfile} onValueChange={(value) => {
                    setGhostProfile(value);
                    if (!integration && value === "ortak_alan_news") setDisplayName("Ghost – Ortak Alan");
                    if (!integration && value === "general") setDisplayName("Ghost");
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Ghost</SelectItem>
                      <SelectItem value="ortak_alan_news">Ghost – Ortak Alan Haber</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Ortak Alan profili haber metadata’sını, kaynakları ve yazar eşleşmesini zorunlu yayın kontrolüne ekler.</p>
                </div>
                {isOrtakAlan && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Editöryal sorumlu</Label>
                      <Input value={editorialOwner} onChange={(event) => setEditorialOwner(event.target.value)} placeholder="Ortak Alan" />
                    </div>
                    <div className="space-y-2">
                      <Label>Varsayılan Ghost yazarı</Label>
                      {integration ? (
                        <Select value={defaultAuthorId} onValueChange={setDefaultAuthorId} disabled={authorsLoading || credentialsChanged}>
                          <SelectTrigger><SelectValue placeholder={authorsLoading ? "Yazarlar yükleniyor" : "Yazar seç"} /></SelectTrigger>
                          <SelectContent>
                            {ghostAuthors.map((author) => <SelectItem key={author.id} value={author.id}>{author.name} · {author.email}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="rounded-sm border border-dashed border-byword-border p-2 text-xs text-muted-foreground">Bağlantıyı kaydettikten sonra Manage ekranından varsayılan yazarı seçebilirsiniz.</p>
                      )}
                      {credentialsChanged && <p className="text-xs text-muted-foreground">Yeni anahtarı doğrulayıp yazarları yüklemek için bağlantıyı kaydedin.</p>}
                      {!credentialsChanged && authorsError && <p className="text-xs text-destructive">Ghost yazarları yüklenemedi. Admin API anahtarını yeniden girip bağlantıyı kaydedin.</p>}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeProvider === "framer" && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-semibold text-foreground">Field mapping</p>
                <p className="mt-1 text-xs text-muted-foreground">Match BlogFactory fields to your Framer CMS field names.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {Object.entries(mapping).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <Label className="capitalize">{key.replace("coverImage", "cover image")}</Label>
                      <Input value={value} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="rounded-md border border-byword-blue/20 bg-byword-blue-soft/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
            BlogFactory encrypts the credentials, checks access when you save, and only delivers CMS drafts.
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isSaving ? "Saving and testing" : integration ? "Save and test" : "Connect and test"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, Copy, ExternalLink, FileCheck2, Globe2, KeyRound, Loader2, SearchCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useMcpCapabilities } from "@/hooks/useMcpCapabilities";
import { useOpenRouterSetup } from "@/hooks/useOpenRouterSetup";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { cn } from "@/lib/utils";

export type WorkspaceSetupStep = "site" | "generation" | "cms" | "search-console" | "mcp" | "create";

interface WorkspaceSetupGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  digest: WorkspaceDigest;
  initialStep: WorkspaceSetupStep;
}

const stepOrder: WorkspaceSetupStep[] = ["site", "generation", "cms", "search-console", "mcp", "create"];

const stepMeta = {
  site: { label: "Site", icon: Globe2 },
  generation: { label: "AI key", icon: KeyRound },
  cms: { label: "CMS", icon: FileCheck2 },
  "search-console": { label: "Search", icon: SearchCheck },
  mcp: { label: "MCP", icon: Bot },
  create: { label: "Create", icon: Sparkles },
} satisfies Record<WorkspaceSetupStep, { label: string; icon: typeof Globe2 }>;

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Clipboard is not available");
  }
}

export function WorkspaceSetupGuide({ open, onOpenChange, digest, initialStep }: WorkspaceSetupGuideProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WorkspaceSetupStep>(initialStep);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const openRouter = useOpenRouterSetup({ siteId: digest.site.id });
  const { oauthEnabled } = useSearchConsole(digest.site.id);
  const mcpCapabilitiesQuery = useMcpCapabilities();

  useEffect(() => {
    if (open) setStep(initialStep);
  }, [initialStep, open]);

  const generationReady = digest.connections.generation.ready || openRouter.verified;
  const cmsReady = digest.connections.cms.connected > 0;
  const searchReady = digest.connections.search_console.connected;
  const mcpConfigured = digest.connections.active > 0;
  const ready = useMemo<Record<WorkspaceSetupStep, boolean>>(() => ({
    site: true,
    generation: generationReady,
    cms: cmsReady,
    "search-console": searchReady,
    mcp: mcpConfigured,
    create: generationReady,
  }), [cmsReady, generationReady, mcpConfigured, searchReady]);
  const currentIndex = stepOrder.indexOf(step);
  const callbackUrl = `${window.location.origin}/api/search-console/oauth/callback`;
  const mcpEndpoint = new URL(mcpCapabilitiesQuery.data?.endpoint || `${window.location.origin}/mcp`).toString();

  const refreshReadiness = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["control-plane-overview", digest.site.id] }),
      queryClient.invalidateQueries({ queryKey: ["search-console", digest.site.id] }),
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] }),
    ]);
    toast.success("Setup status refreshed");
  };

  const saveOpenRouter = () => openRouter.saveAndVerify.mutate(openRouterKey, {
    onSuccess: () => {
      setOpenRouterKey("");
      toast.success("OpenRouter key saved and verified");
    },
  });

  const submitOpenRouter = (event: FormEvent) => {
    event.preventDefault();
    if (!openRouterKey.trim()) return;
    saveOpenRouter();
  };

  const next = () => setStep(stepOrder[Math.min(stepOrder.length - 1, currentIndex + 1)]);
  const back = () => setStep(stepOrder[Math.max(0, currentIndex - 1)]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-byword-border px-5 pb-5 pt-6 pr-14 sm:px-6 sm:pr-14">
          <p className="type-kicker text-byword-blue">Connections &amp; setup</p>
          <DialogTitle className="mt-1 text-2xl">Add capabilities when you need them</DialogTitle>
          <DialogDescription>Your first draft comes first. CMS, Search Console, MCP, and brand settings stay optional.</DialogDescription>
          <div className="pt-3">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Step {currentIndex + 1} of {stepOrder.length}</span>
              <span>{stepMeta[step].label}</span>
            </div>
            <Progress
              value={((currentIndex + 1) / stepOrder.length) * 100}
              aria-label="Setup guide progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={((currentIndex + 1) / stepOrder.length) * 100}
              className="mt-2 h-1.5"
            />
          </div>
        </DialogHeader>

        <div className="grid min-h-[430px] lg:grid-cols-[190px_minmax(0,1fr)]">
          <nav aria-label="Setup steps" className="grid grid-cols-3 gap-px border-b border-byword-border bg-byword-border lg:block lg:border-b-0 lg:border-r">
            {stepOrder.map((item, index) => {
              const Icon = stepMeta[item].icon;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStep(item)}
                  aria-current={step === item ? "step" : undefined}
                  className={cn(
                    "flex min-w-0 items-center gap-2 bg-card px-3 py-3 text-left text-xs font-semibold outline-none transition-calm hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:w-full lg:px-4",
                    step === item && "bg-byword-blue-soft text-byword-blue",
                  )}
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-byword-border bg-background", ready[item] && "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                    {ready[item] ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="truncate"><span className="hidden text-muted-foreground lg:inline">{String(index + 1).padStart(2, "0")} · </span>{stepMeta[item].label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-col p-5 sm:p-7">
            <div className="flex-1">
              {step === "site" && (
                <SetupSection icon={Globe2} title="Your site is connected" description="This is the workspace BlogFactory will use for content and integrations.">
                  <StatusPanel ready title={digest.site.name} detail={digest.site.domain} />
                </SetupSection>
              )}

              {step === "generation" && (
                <SetupSection icon={KeyRound} title="Connect OpenRouter" description="Required for article and prompt generation. The key belongs to your user account and is stored encrypted.">
                  {generationReady ? (
                    <div className="space-y-3">
                      <StatusPanel ready title={openRouter.verified ? "OpenRouter is verified" : "OpenRouter key saved"} detail={openRouter.verified ? "The key passed a live provider check." : "Verify the saved key now, or continue if you already tested it in Article Settings."} />
                      {!openRouter.verified && <Button type="button" variant="outline" onClick={() => openRouter.verifySaved.mutate(undefined, { onSuccess: () => toast.success("Saved OpenRouter key works") })} disabled={openRouter.verifySaved.isPending}>{openRouter.verifySaved.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify saved key</Button>}
                      {openRouter.verifySaved.error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{openRouter.verifySaved.error instanceof Error ? openRouter.verifySaved.error.message : "The saved key could not be verified."}</p>}
                    </div>
                  ) : (
                    <form onSubmit={submitOpenRouter} className="space-y-4">
                      <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
                        <li><strong className="text-foreground">1.</strong> Create a key in OpenRouter.</li>
                        <li><strong className="text-foreground">2.</strong> Paste it below. BlogFactory will save and verify it before continuing.</li>
                      </ol>
                      <Button asChild variant="outline" size="sm"><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">Open OpenRouter keys <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
                      <div className="space-y-2">
                        <label htmlFor="setup-openrouter-key" className="text-sm font-medium">OpenRouter API key</label>
                        <Input id="setup-openrouter-key" type="password" value={openRouterKey} onChange={(event) => setOpenRouterKey(event.target.value)} placeholder="sk-or-…" autoComplete="off" spellCheck={false} autoFocus />
                      </div>
                      {openRouter.saveAndVerify.error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{openRouter.saveAndVerify.error instanceof Error ? openRouter.saveAndVerify.error.message : "The key could not be verified."}</p>}
                      <Button type="submit" disabled={!openRouterKey.trim() || openRouter.saveAndVerify.isPending}>
                        {openRouter.saveAndVerify.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save and verify key
                      </Button>
                    </form>
                  )}
                </SetupSection>
              )}

              {step === "cms" && (
                <SetupSection icon={FileCheck2} title="Connect a CMS destination" description="Optional. Use this when you want BlogFactory to send an approved post to WordPress, Ghost, Wix, or Framer as a draft.">
                  {cmsReady ? <StatusPanel ready title="CMS destination connected" detail={`${digest.connections.cms.connected} destination ready for draft delivery.`} /> : <InstructionList items={["Choose your CMS provider.", "Follow its credential guide and save the connection.", "Run the connection test. BlogFactory only creates drafts; it never publishes live."]} />}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!cmsReady && <Button asChild onClick={() => onOpenChange(false)}><Link to="/control/integrations?from=setup">Open CMS setup <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>}
                    <Button type="button" variant="outline" onClick={refreshReadiness}>Check connection</Button>
                  </div>
                </SetupSection>
              )}

              {step === "search-console" && (
                <SetupSection icon={SearchCheck} title="Connect Google Search Console" description="Optional. This gives BlogFactory read-only search performance evidence for the selected property.">
                  {searchReady ? <StatusPanel ready title="Search Console connected" detail="Search evidence is available for this site." /> : oauthEnabled ? (
                    <>
                      <InstructionList items={["Open the connection screen.", "Choose the Google account that can read this Search Console property.", "Approve read-only access and select the property."]} />
                      <Button asChild className="mt-5" onClick={() => onOpenChange(false)}><Link to="/overview/growth?tab=optimize&connect=search-console">Continue with Google <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
                    </>
                  ) : (
                    <div className="space-y-5">
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                        <strong>OAuth is not configured on this server.</strong> If you operate this instance, complete this one-time admin setup. Regular workspace users cannot do it from their account.
                      </div>
                      <InstructionList items={[
                        "In Google Cloud, create or select a project and enable the Search Console API.",
                        "Configure the OAuth consent screen, then create a Web application OAuth client.",
                        `Add this callback URL: ${callbackUrl}`,
                        "Set GOOGLE_SEARCH_CONSOLE_CLIENT_ID and GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET in the API environment.",
                        "Restart the API service, return here, and check the connection again.",
                      ]} />
                      <div className="rounded-md border border-byword-border bg-muted/30 p-3">
                        <p className="type-kicker text-muted-foreground">Callback URL</p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <code className="min-w-0 flex-1 break-all font-mono text-xs">{callbackUrl}</code>
                          <Button type="button" variant="outline" size="sm" onClick={() => copyText(callbackUrl, "Callback URL")}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm"><a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noreferrer">Open Google Cloud <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
                        <Button asChild variant="outline" size="sm"><a href="/docs/self-hosting" target="_blank" rel="noreferrer">Full admin guide <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground"><strong className="text-foreground">No OAuth?</strong> The connection screen also explains the service-account alternative and what its JSON file contains.</p>
                    </div>
                  )}
                  {!searchReady && <Button type="button" variant="outline" className="mt-5" onClick={refreshReadiness}>Check server setup</Button>}
                </SetupSection>
              )}

              {step === "mcp" && (
                <SetupSection icon={Bot} title="Connect an AI client with MCP" description="Optional. MCP lets a compatible client such as Codex work with BlogFactory drafts without receiving your provider or CMS credentials.">
                  {mcpConfigured ? <StatusPanel ready title="MCP access configured" detail={`${digest.connections.active} valid authorization${digest.connections.active === 1 ? "" : "s"} available. A client is active only after its first successful request.`} /> : <InstructionList items={["Open MCP Connections and create a site-scoped personal token.", `Add ${mcpEndpoint} as the server endpoint in your AI client.`, "Store the token in the client when it is shown. The token is displayed only once."]} />}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!mcpConfigured && <Button asChild onClick={() => onOpenChange(false)}><Link to="/control/connections">Open MCP setup <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>}
                    <Button asChild variant="outline"><a href="/docs/mcp" target="_blank" rel="noreferrer">MCP guide</a></Button>
                    <Button type="button" variant="outline" onClick={refreshReadiness}>Check connection</Button>
                  </div>
                </SetupSection>
              )}

              {step === "create" && (
                <SetupSection icon={Sparkles} title={generationReady ? "Create more content" : "Repair AI access"} description={generationReady ? "Your site is connected and its OpenRouter credential is readable. Use the full creator when you want advanced controls." : "BlogFactory needs a connected site and verified OpenRouter key before it can generate content."}>
                  {generationReady ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5">
                      <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                      <h3 className="mt-3 font-semibold text-emerald-950">Core access configured</h3>
                      <p className="mt-1 text-sm leading-6 text-emerald-900">Open the full creator for model, research, image, and variation controls. Every CMS delivery remains draft-only.</p>
                      <Button asChild className="mt-5" onClick={() => onOpenChange(false)}><Link to="/create">Create content <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
                    </div>
                  ) : <Button type="button" onClick={() => setStep("generation")}>Add OpenRouter key</Button>}
                </SetupSection>
              )}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-byword-border pt-5">
              <Button type="button" variant="ghost" onClick={back} disabled={currentIndex === 0}><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Button>
              {step !== "create" && (
                <Button type="button" variant={step === "generation" && !generationReady ? "outline" : "default"} onClick={next} disabled={step === "generation" && !generationReady}>
                  {step === "cms" || step === "search-console" || step === "mcp" ? "Skip for now" : "Next"}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SetupSection({ icon: Icon, title, description, children }: { icon: typeof Globe2; title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-byword-border bg-muted/40 text-byword-blue"><Icon className="h-5 w-5" /></span>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StatusPanel({ ready, title, detail }: { ready: boolean; title: string; detail: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-md border p-4", ready ? "border-emerald-200 bg-emerald-50" : "border-byword-border bg-muted/30")}>
      <CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", ready ? "text-emerald-700" : "text-muted-foreground")} />
      <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>
    </div>
  );
}

function InstructionList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => <li key={item} className="flex gap-3 text-sm leading-6"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-byword-border bg-muted/40 font-mono text-[10px] font-semibold">{index + 1}</span><span>{item}</span></li>)}
    </ol>
  );
}
